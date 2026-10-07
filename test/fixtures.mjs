import * as Native from '@deepseek-ai/dsh-llm-pi-ai';
export { Native };
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import assert from 'node:assert/strict';

export const MODEL = 'openai/gpt-6-luna';
export const ROUTE = 'openrouter';
export const messages = [{ role: 'user', content: [{ type: 'text', text: '离线测试' }] }];
export const call = (extra = {}) => ({ provider: ROUTE, model: MODEL, messages, ...extra });
export const collect = async (stream) => { const out = []; for await (const chunk of stream) out.push(chunk); return out; };
export const finish = (chunks) => chunks.findLast((chunk) => chunk.type === 'finish');

/** 测试只监听 loopback，永远不转发至真实 OpenRouter。 */
export async function fakeOpenRouter() {
  const requests = [];
  const sockets = new Set();
  let mode = 'text';
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    requests.push({ path: req.url, body: JSON.parse(body), authorization: req.headers.authorization });
    if (mode === 'hang') return;
    // 上游故障模式：用于核查 flex 容量不足时的错误分类与可重试性。
    if (mode === 'error429' || mode === 'error503') {
      const status = mode === 'error429' ? 429 : 503;
      const message = status === 503
        ? 'No available providers for the requested service tier'
        : 'Rate limit exceeded for flex tier';
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message, code: status, metadata: { provider_name: 'fake-upstream' } } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const emit = (delta, finish_reason = null, extra = {}) => res.write(`data: ${JSON.stringify({ id: 'fake-response', object: 'chat.completion.chunk', created: 1, model: MODEL, choices: [{ index: 0, delta, finish_reason }], ...extra })}\n\n`);
    emit({ role: 'assistant', reasoning: '离线 thinking' });
    if (mode === 'tool') {
      emit({ tool_calls: [{ index: 0, id: 'fake-call', type: 'function', function: { name: 'echo', arguments: '{"value":' } }] });
      emit({ tool_calls: [{ index: 0, function: { arguments: '"ok"}' } }] });
      emit({}, 'tool_calls');
    } else {
      emit({ content: '离线回答' });
      emit({}, 'stop');
    }
    res.write(`data: ${JSON.stringify({ id: 'fake-response', object: 'chat.completion.chunk', created: 1, model: MODEL, choices: [], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    requests,
    baseURL: `http://127.0.0.1:${server.address().port}/api/v1`,
    setMode: (value) => { mode = value; },
    waitForRequest: async (count = 1) => {
      const deadline = Date.now() + 5000;
      while (requests.length < count) {
        if (Date.now() > deadline) throw new Error('假服务未收到预期请求');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      for (const socket of sockets) socket.destroy();
      await closed;
    },
  };
}

export async function harness() {
  const root = new Context();
  let key = 'fake-offline-key';
  const references = [];
  root.provide('credentials', { resolve: async (ref) => { references.push(ref); return key === undefined ? undefined : { value: key, source: 'test' }; } });
  await root.plugin(LlmRuntime);
  await root.plugin(Loader, { baseUrl: new URL('../package.json', import.meta.url).href });
  return {
    root, references,
    setKey: (value) => { key = value; },
    close: () => root.fiber.dispose(),
    activate: async (rows) => { await root.loader.root.update(rows); await assertActive(root); },
  };
}

export async function assertActive(root, id = 'tier-test') {
  await root.loader.await();
  const fiber = root.loader.resolve(id).fiber;
  assert.ok(fiber, 'Loader 必须创建 plugin fiber');
  await fiber.await();
  assert.equal(fiber.state, 2, '插件必须 ACTIVE，而不是仅 loader.await 返回');
}


export async function setupNative(t, config = {}) {
  const fake = await fakeOpenRouter(); t.after(() => fake.close());
  const host = await harness(); t.after(() => host.close());
  const native = { providers: { openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY', baseURL: fake.baseURL, serviceTier: 'flex', reasoning: 'high', ...config } } };
  await host.activate([
    { id: 'native-test', name: '@deepseek-ai/dsh-llm-pi-ai', config: native },
    { id: 'tier-test', name: './lib/index.js', config: {} },
  ]);
  return { ...host, fake, config: native };
}
