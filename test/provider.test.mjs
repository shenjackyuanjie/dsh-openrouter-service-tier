import test from 'node:test';
import assert from 'node:assert/strict';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { Config, resolveProfile, SERVICE_TIERS } from '../lib/config.js';
import { withServiceTier, wrapProvider } from '../lib/provider.js';
import { MODEL } from './fixtures.mjs';

// 独立配置测试不会读取真实环境凭据。
test('tier 枚举、默认值和未设置 tier', () => {
  for (const serviceTier of SERVICE_TIERS) assert.equal(Config({ serviceTier }).serviceTier.get(), serviceTier);
  for (const serviceTier of ['auto', 'standard', 'FLEX', '']) assert.throws(() => Config({ serviceTier }));
  assert.equal(Config({}).serviceTier.get(), undefined);
  assert.equal(resolveProfile({}).apiKeyEnv, 'OPENROUTER_API_KEY');
  assert.equal(resolveProfile({}).provider, 'openrouter-tier');
});

test('拒绝未知、重复、空、非 Chat Completions 模型与无效配置', () => {
  for (const models of [[], [MODEL, MODEL], ['unknown/offline']]) assert.throws(() => resolveProfile({ models }));
  assert.throws(() => resolveProfile({ provider: 'openrouter' }));
  assert.throws(() => resolveProfile({ provider: 'Not Valid' }));
  assert.throws(() => resolveProfile({ apiKeyEnv: 'not-a-reference' }));
  assert.throws(() => resolveProfile({ streamIdleTimeoutMs: 0 }));
  assert.throws(() => resolveProfile({ timeoutMs: -1 }));
  for (const baseURL of ['ftp://example.com', 'https://fake:secret@example.com', 'https://example.com/?key=fake']) assert.throws(() => resolveProfile({ baseURL }));
  const foreignApi = openrouterProvider().getModels().find((model) => model.api !== 'openai-completions');
  if (foreignApi) assert.throws(() => resolveProfile({ models: [foreignApi.id] }));
});

test('原 payload 回调优先，可异步修改或替换；tier 最后覆盖且不修改原对象', async () => {
  const original = { reasoning: { effort: 'high' }, service_tier: 'default' };
  const options = withServiceTier({ onPayload: async (payload) => ({ ...payload, custom: true, service_tier: 'priority' }) }, 'flex');
  const actual = await options.onPayload(original, {});
  assert.deepEqual(actual, { reasoning: { effort: 'high' }, custom: true, service_tier: 'flex' });
  assert.equal(original.service_tier, 'default');
  const mutated = withServiceTier({ onPayload: (payload) => { payload.custom = 'kept'; } }, 'flex');
  assert.equal((await mutated.onPayload({}, {})).custom, 'kept');
  for (const payload of [null, [], 1, 'string']) await assert.rejects(withServiceTier(undefined, 'flex').onPayload(payload, {}));
  await assert.rejects(withServiceTier({ onPayload: () => { throw new Error('callback failed'); } }, 'flex').onPayload({}, {}), /callback failed/);
});

test('未设置 tier 时不增加 hook、不强制 default', () => {
  const options = { onPayload: () => ({ service_tier: 'priority' }) };
  assert.equal(withServiceTier(options, undefined), options);
  assert.equal(withServiceTier(undefined, undefined), undefined);
});

test('stream 与 streamSimple 均覆盖；保留委托 this，不污染 upstream', async () => {
  const upstream = openrouterProvider();
  const calls = [];
  const stub = { ...upstream, stream(model, ctx, opts) { assert.equal(this, stub); calls.push(opts); return 'stream'; }, streamSimple(model, ctx, opts) { assert.equal(this, stub); calls.push(opts); return 'simple'; } };
  const originalModel = upstream.getModels().find((model) => model.id === MODEL);
  const wrapped = wrapProvider(stub, 'openrouter-tier', [originalModel], 'flex');
  assert.equal(wrapped.stream(originalModel, {}, {}), 'stream');
  assert.equal(wrapped.streamSimple(originalModel, {}, {}), 'simple');
  for (const options of calls) assert.equal((await options.onPayload({}, originalModel)).service_tier, 'flex');
  assert.equal(upstream.id, 'openrouter');
  assert.equal(originalModel.provider, 'openrouter');
  assert.equal(resolveProfile({}).piProvider.getModels()[0].provider, 'openrouter-tier');
});
