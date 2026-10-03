import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { assertActive, call, collect, fakeOpenRouter, finish, harness, MODEL, ROUTE } from './fixtures.mjs';

async function setup(t, config = {}) {
  const fake = await fakeOpenRouter();
  t.after(() => fake.close());
  const host = await harness();
  t.after(() => host.close());
  // 从实际 bundle YAML 取得配置；模型/thinking 仅在测试夹具中显式固定。
  const patch = yaml.load(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'));
  const row = patch[0].insert[0];
  row.id = 'tier-test';
  row.name = './lib/index.js';
  row.config = { ...row.config, models: [MODEL], reasoning: 'high', baseURL: fake.baseURL, ...config };
  await host.activate([row]);
  return { ...host, fake, config: row.config };
}

test('真实 Loader + LLM + PiAiAdapter：flex 与 high thinking、文本和 usage 共存', async (t) => {
  const { root, fake, references } = await setup(t);
  assert.deepEqual(root.llm.listProviders().map((item) => item.id), [ROUTE]);
  assert.equal((await root.llm.listModels(ROUTE))[0].id, MODEL);
  const resolved = await root.llm.resolveCallConfig({ provider: ROUTE, model: MODEL });
  assert.equal(resolved.reasoningEffort, 'high');
  const chunks = await collect(root.llm.stream(call()));
  assert.equal(finish(chunks).reason.kind, 'stop');
  assert.equal(fake.requests[0].path, '/api/v1/chat/completions');
  assert.equal(fake.requests[0].body.service_tier, 'flex');
  assert.equal(fake.requests[0].body.reasoning.effort, 'high');
  assert.equal(fake.requests[0].authorization, 'Bearer fake-offline-key');
  assert.ok(chunks.some((chunk) => chunk.type === 'reasoning-delta' && chunk.text.includes('thinking')));
  assert.ok(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === '离线回答'));
  assert.ok(chunks.some((chunk) => chunk.type === 'usage' && chunk.usage.totalTokens === 20));
  assert.ok(finish(chunks).replayState);
  assert.deepEqual(references, ['OPENROUTER_API_KEY']);
});

test('工具调用和同路由第二轮 replay 保留 thinking 与工具关联', async (t) => {
  const { root, fake } = await setup(t);
  fake.setMode('tool');
  const tools = [{ name: 'echo', description: '离线工具', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }];
  const chunks = await collect(root.llm.stream(call({ tools })));
  assert.equal(finish(chunks).reason.kind, 'tool-calls');
  const blocks = chunks.filter((chunk) => chunk.type === 'block-end').map((chunk) => chunk.block);
  const toolCall = blocks.find((block) => block.type === 'tool-call');
  assert.equal(toolCall.name, 'echo');
  assert.deepEqual(JSON.parse(toolCall.arguments), { value: 'ok' });
  fake.setMode('text');
  const history = [
    ...call().messages,
    { id: 'assistant-test', role: 'assistant', source: { kind: 'model', provider: ROUTE, model: MODEL, replayState: finish(chunks).replayState }, content: blocks },
    { id: 'tool-result-test', role: 'tool', source: { kind: 'tool', callId: toolCall.id }, toolCallId: toolCall.id, content: [{ type: 'text', text: 'ok' }] },
  ];
  const followup = await collect(root.llm.stream(call({ messages: history, tools })));
  assert.equal(finish(followup).reason.kind, 'stop');
  const body = fake.requests[1].body;
  assert.equal(body.service_tier, 'flex');
  const assistant = body.messages.find((message) => message.role === 'assistant');
  assert.equal(assistant.tool_calls[0].id, toolCall.id);
  assert.equal(body.messages.find((message) => message.role === 'tool').tool_call_id, toolCall.id);
  assert.ok(JSON.stringify(assistant).includes('离线 thinking'));
});

test('每次解析凭据；缺失/空/无效值不向 SDK 或环境账户回退', async (t) => {
  const { root, fake, setKey, references } = await setup(t);
  for (const key of [undefined, '', '假密钥']) {
    setKey(key);
    const terminal = finish(await collect(root.llm.stream(call())));
    assert.equal(terminal.reason.kind, 'error');
    assert.equal(terminal.reason.failure.code, key === '假密钥' ? 'INVALID_CREDENTIAL' : 'MISSING_CREDENTIAL');
    assert.ok(!terminal.reason.failure.message.includes('假密钥'));
  }
  assert.equal(fake.requests.length, 0);
  setKey('changed-fake-key');
  assert.equal(finish(await collect(root.llm.stream(call()))).reason.kind, 'stop');
  assert.equal(fake.requests[0].authorization, 'Bearer changed-fake-key');
  assert.equal(references.length, 4);
});

test('未知模型和不支持 stop 在发送前失败', async (t) => {
  const { root, fake } = await setup(t);
  assert.equal(finish(await collect(root.llm.stream(call({ model: 'unknown' })))).reason.failure.code, 'UNKNOWN_MODEL');
  assert.equal(finish(await collect(root.llm.stream(call({ stop: ['stop'] })))).reason.failure.code, 'UNSUPPORTED_OPTION');
  assert.equal(fake.requests.length, 0);
});

test('普通配置更新：prepareCall 绑定旧快照，新请求使用新 tier，无重复路由', async (t) => {
  const { root, fake, config } = await setup(t);
  const prepared = await root.llm.prepareCall({ provider: ROUTE, model: MODEL });
  await root.loader.update('tier-test', { config: { ...config, serviceTier: 'priority' } });
  await assertActive(root);
  assert.equal(root.llm.listProviders().length, 1);
  await collect(prepared.stream(call(prepared.config)));
  await collect(root.llm.stream(call()));
  assert.deepEqual(fake.requests.map((request) => request.body.service_tier), ['flex', 'priority']);
  await root.loader.update('tier-test', { config: { ...config, serviceTier: undefined } });
  await assertActive(root);
  await collect(root.llm.stream(call()));
  assert.equal('service_tier' in fake.requests[2].body, false);
});

test('非法配置在卸载前拒绝，运行态保留旧路由且可修复', async (t) => {
  const { root, fake, config } = await setup(t);
  const original = root.loader.resolve('tier-test').fiber;
  for (const invalid of [{ models: ['unknown/offline'] }, { baseURL: 'https://fake:secret@example.com' }, { provider: 'openrouter' }]) {
    await assert.rejects(root.loader.update('tier-test', { config: { ...config, ...invalid } }));
    assert.equal(root.loader.resolve('tier-test').fiber, original);
    assert.equal(root.llm.listProviders().length, 1);
    assert.equal(finish(await collect(root.llm.stream(call()))).reason.kind, 'stop');
  }
  assert.ok(fake.requests.every((request) => request.body.service_tier === 'flex'));
  await root.loader.update('tier-test', { config: { ...config, serviceTier: 'priority' } });
  await assertActive(root);
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, 'priority');
});

test('卸载不改变已准备请求，新调用不再拥有路由', async (t) => {
  const { root, fake } = await setup(t);
  const prepared = await root.llm.prepareCall({ provider: ROUTE, model: MODEL });
  const mounted = root.loader.resolve('tier-test').fiber;
  root.loader.remove('tier-test');
  await mounted.dispose();
  assert.equal(root.llm.listProviders().length, 0);
  assert.equal(finish(await collect(prepared.stream(call(prepared.config)))).reason.kind, 'stop');
  assert.equal(fake.requests[0].body.service_tier, 'flex');
  assert.equal(finish(await collect(root.llm.stream(call()))).reason.failure.code, 'NO_ADAPTER');
});

test('取消和 idle timeout 复用 adapter 行为', async (t) => {
  const { root, fake } = await setup(t, { streamIdleTimeoutMs: 150 });
  fake.setMode('hang');
  const controller = new AbortController();
  const aborted = collect(root.llm.stream(call({ signal: controller.signal })));
  await fake.waitForRequest();
  controller.abort('离线取消测试');
  assert.equal(finish(await aborted).reason.kind, 'aborted');
  const timedout = finish(await collect(root.llm.stream(call())));
  assert.equal(timedout.reason.kind, 'error');
  assert.equal(timedout.reason.failure.code, 'TIMEOUT');
});

test('停用、再启用、卸载都通过 Cordis 清理路由', async (t) => {
  const { root } = await setup(t);
  const fiber = root.loader.resolve('tier-test').fiber;
  await root.loader.update('tier-test', { disabled: true });
  await fiber.dispose();
  assert.equal(root.llm.listProviders().length, 0);
  await root.loader.update('tier-test', { disabled: false });
  await assertActive(root);
  assert.equal(root.llm.listProviders().length, 1);
  const mounted = root.loader.resolve('tier-test').fiber;
  root.loader.remove('tier-test');
  await mounted.dispose();
  assert.equal(root.llm.listProviders().length, 0);
});

test('路由冲突拒绝插件激活，不污染已有 adapter', async (t) => {
  const fake = await fakeOpenRouter(); t.after(() => fake.close());
  const { root, close } = await harness(); t.after(close);
  const owner = new LlmAdapter();
  root.llm.registerAdapter([ROUTE], owner);
  await root.loader.root.update([{ id: 'tier-test', name: './lib/index.js', config: { baseURL: fake.baseURL } }]);
  await root.loader.await();
  const fiber = root.loader.resolve('tier-test').fiber;
  assert.ok(fiber);
  await assert.rejects(fiber.await(), (error) => error.code === 'DUPLICATE_ADAPTER');
  assert.notEqual(fiber.state, 2);
  assert.equal(root.llm.listProviders().length, 1);
  assert.equal(fake.requests.length, 0);
});
