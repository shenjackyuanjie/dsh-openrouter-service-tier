import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfile } from '../lib/config.js';
import { call, collect, fakeOpenRouter, finish, harness, MODEL } from './fixtures.mjs';

/**
 * flex 的可用性低于标准档，因此失败后的重试行为必须可验证。
 * harness 只重试适配器分类为可重试码的失败，而分类来自错误文本。
 */

const setup = async (t) => {
  const fake = await fakeOpenRouter(); t.after(() => fake.close());
  const host = await harness(); t.after(() => host.close());
  await host.activate([{
    id: 'tier-test', name: './lib/index.js',
    config: { provider: 'openrouter-tier', apiKeyEnv: 'OPENROUTER_API_KEY', serviceTier: 'flex', models: [MODEL], baseURL: fake.baseURL },
  }]);
  return { fake, host };
};

test('本插件声明的可重试码与宿主默认一致，供热更新保留', () => {
  const policy = resolveProfile({}).retryPolicy;
  assert.equal(policy.mode, 'normal');
  assert.deepEqual([...policy.retryableCodes].sort(), ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'].sort());
});

test('上游以 5xx 拒绝 flex 请求时，失败落在可重试的 SERVER 码上', async (t) => {
  const { fake, host } = await setup(t);
  const retryable = new Set(resolveProfile({}).retryPolicy.retryableCodes);
  fake.setMode('error503');
  const terminal = finish(await collect(host.root.llm.stream(call())));
  assert.equal(terminal.reason.kind, 'error');
  assert.equal(terminal.reason.failure.code, 'SERVER');
  assert.ok(retryable.has(terminal.reason.failure.code), 'SERVER 必须可重试，否则 flex 容量恢复后不会自动重试');
  assert.equal(fake.requests.at(-1).body.service_tier, 'flex', '失败请求同样携带所选档位');
});

test('上游以 429 拒绝 flex 请求时，失败落在可重试的 RATE_LIMIT 码上', async (t) => {
  const { fake, host } = await setup(t);
  const retryable = new Set(resolveProfile({}).retryPolicy.retryableCodes);
  fake.setMode('error429');
  const terminal = finish(await collect(host.root.llm.stream(call())));
  assert.equal(terminal.reason.failure.code, 'RATE_LIMIT');
  assert.ok(retryable.has(terminal.reason.failure.code));
  assert.equal(fake.requests.at(-1).body.service_tier, 'flex');
});
