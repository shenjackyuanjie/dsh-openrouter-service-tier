import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { assertActive, call, collect, fakeOpenRouter, finish, harness, MODEL, ROUTE, setupNative, Native } from './fixtures.mjs';

const setup = setupNative;

test('真实 Loader + LLM + PiAiAdapter：flex 与 high thinking、文本和 usage 共存', async (t) => {
  const { root, fake, references } = await setup(t);
  assert.deepEqual(root.llm.listProviders().map((item) => item.id), [ROUTE]);
  assert.ok((await root.llm.listModels(ROUTE)).some(model => model.id === MODEL));
  assert.ok((await root.llm.listModels(ROUTE)).length > 1);
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

test('原生 volatile 更新保持 owner，已准备请求保留旧档位', async (t) => {
  const { root, fake, config } = await setup(t);
  const prepared = await root.llm.prepareCall({ provider: ROUTE, model: MODEL });
  const owner = root.loader.resolve('native-test').fiber;
  await root.loader.update('native-test', { config: { providers: { openrouter: { ...config.providers.openrouter, serviceTier: 'priority' } } } });
  await assertActive(root, 'native-test');
  assert.equal(root.loader.resolve('native-test').fiber, owner);
  await collect(prepared.stream(call(prepared.config)));
  await collect(root.llm.stream(call()));
  assert.deepEqual(fake.requests.map(request => request.body.service_tier), ['flex', 'priority']);
});

test('控制插件停用不删模型、不清档位，不中断已准备或新的请求', async (t) => {
  const { root, fake } = await setup(t);
  const before = await root.llm.listModels(ROUTE);
  const owner = root.loader.resolve('native-test').fiber;
  const prepared = await root.llm.prepareCall({ provider: ROUTE, model: MODEL });
  const mounted = root.loader.resolve('tier-test').fiber;
  root.loader.remove('tier-test'); await mounted.dispose();
  assert.equal(root.loader.resolve('native-test').fiber, owner);
  assert.deepEqual(await root.llm.listModels(ROUTE), before);
  await collect(prepared.stream(call(prepared.config)));
  await collect(root.llm.stream(call()));
  assert.deepEqual(fake.requests.map(request => request.body.service_tier), ['flex', 'flex']);
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

test('bundle 仅插控制器，不提供档位默认值或第二套路由', async () => {
  const patch = yaml.load(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'));
  assert.deepEqual(patch, [{ insert: [{ id: 'openrouter-service-tier', name: 'dsh-openrouter-service-tier', config: {} }] }]);
});
