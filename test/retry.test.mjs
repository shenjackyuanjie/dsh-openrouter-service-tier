import test from 'node:test';
import assert from 'node:assert/strict';
import { call, collect, fakeOpenRouter, finish, harness, MODEL, setupNative } from './fixtures.mjs';

/**
 * flex 的可用性低于标准档，因此失败后的重试行为必须可验证。
 * harness 只重试适配器分类为可重试码的失败，而分类来自错误文本。
 */

const setup = async (t) => { const host = await setupNative(t); return { fake: host.fake, host }; };

test('上游以 5xx 拒绝 flex 请求时，失败落在可重试的 SERVER 码上', async (t) => {
  const { fake, host } = await setup(t);
  fake.setMode('error503');
  const terminal = finish(await collect(host.root.llm.stream(call())));
  assert.equal(terminal.reason.kind, 'error');
  assert.equal(terminal.reason.failure.code, 'SERVER');
  assert.equal(fake.requests.at(-1).body.service_tier, 'flex', '失败请求同样携带所选档位');
});

test('上游以 429 拒绝 flex 请求时，失败落在可重试的 RATE_LIMIT 码上', async (t) => {
  const { fake, host } = await setup(t);
  fake.setMode('error429');
  const terminal = finish(await collect(host.root.llm.stream(call())));
  assert.equal(terminal.reason.failure.code, 'RATE_LIMIT');
  assert.equal(fake.requests.at(-1).body.service_tier, 'flex');
});
