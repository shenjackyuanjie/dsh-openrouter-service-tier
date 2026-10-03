import test from 'node:test';
import assert from 'node:assert/strict';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { Config, resolveProfile, SERVICE_TIERS, tierFor } from '../lib/config.js';
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

test('按模型覆盖优先于全局，omit 表示该模型不发送，未列出的模型继承全局', () => {
  const overrides = [{ model: 'openai/a', tier: 'priority' }, { model: 'openai/b', tier: 'omit' }];
  assert.equal(tierFor('flex', overrides, 'openai/a'), 'priority');
  assert.equal(tierFor('flex', overrides, 'openai/b'), undefined);
  assert.equal(tierFor('flex', overrides, 'openai/c'), 'flex');
  assert.equal(tierFor(undefined, undefined, 'openai/a'), undefined);
  // 拒绝重复、未知模型与非法档位，避免写入永不生效的覆盖。
  assert.throws(() => resolveProfile({ models: ['openai/gpt-6-luna'], modelServiceTiers: [{ model: 'openai/a', tier: 'flex' }] }));
  assert.throws(() => resolveProfile({ models: [MODEL], modelServiceTiers: [{ model: MODEL, tier: 'flex' }, { model: MODEL, tier: 'omit' }] }));
  assert.throws(() => resolveProfile({ models: [MODEL], modelServiceTiers: [{ model: MODEL, tier: 'auto' }] }));
});

test('未配置任何档位时不包装请求；只有按模型命中时才注入', () => {
  const upstream = openrouterProvider();
  const model = upstream.getModels().find((item) => item.id === MODEL);
  const seen = [];
  const stub = { ...upstream, stream: (_m, _c, options) => { seen.push(options); return 'stream'; }, streamSimple: () => 'simple' };
  const options = { onPayload: () => ({ service_tier: 'priority' }) };
  assert.equal(wrapProvider(stub, 'openrouter-tier', [model]).stream(model, {}, options), 'stream');
  assert.equal(seen.at(-1), options, '没有任何档位时不得增加 hook');
  const resolver = (modelId) => modelId === MODEL ? 'flex' : undefined;
  wrapProvider(stub, 'openrouter-tier', [model], resolver).stream(model, {}, undefined);
  assert.notEqual(seen.at(-1), undefined);
});

test('原 payload 回调优先，可异步修改或替换；tier 最后覆盖且不修改原对象', async () => {
  const original = { reasoning: { effort: 'high' }, service_tier: 'default' };
  const options = withServiceTier({ onPayload: async (payload) => ({ ...payload, custom: true, service_tier: 'priority' }) }, () => 'flex');
  const actual = await options.onPayload(original, { id: MODEL });
  assert.deepEqual(actual, { reasoning: { effort: 'high' }, custom: true, service_tier: 'flex' });
  assert.equal(original.service_tier, 'default');
  const mutated = withServiceTier({ onPayload: (payload) => { payload.custom = 'kept'; } }, () => 'flex');
  assert.equal((await mutated.onPayload({}, { id: MODEL })).custom, 'kept');
  for (const payload of [null, [], 1, 'string']) await assert.rejects(withServiceTier(undefined, () => 'flex').onPayload(payload, { id: MODEL }));
  await assert.rejects(withServiceTier({ onPayload: () => { throw new Error('callback failed'); } }, () => 'flex').onPayload({}, { id: MODEL }), /callback failed/);
});

test('解析结果为空时原样返回 payload，不强制 default', async () => {
  const options = withServiceTier(undefined, () => undefined);
  assert.deepEqual(await options.onPayload({ keep: 1 }, { id: MODEL }), { keep: 1 });
  const byModel = withServiceTier(undefined, (modelId) => modelId === 'openai/a' ? 'flex' : undefined);
  assert.equal((await byModel.onPayload({}, { id: 'openai/a' })).service_tier, 'flex');
  assert.deepEqual(await byModel.onPayload({}, { id: 'openai/b' }), {});
});

test('stream 与 streamSimple 均覆盖；保留委托 this，不污染 upstream', async () => {
  const upstream = openrouterProvider();
  const calls = [];
  const stub = { ...upstream, stream(model, ctx, opts) { assert.equal(this, stub); calls.push(opts); return 'stream'; }, streamSimple(model, ctx, opts) { assert.equal(this, stub); calls.push(opts); return 'simple'; } };
  const originalModel = upstream.getModels().find((model) => model.id === MODEL);
  const wrapped = wrapProvider(stub, 'openrouter-tier', [originalModel], () => 'flex');
  assert.equal(wrapped.stream(originalModel, {}, {}), 'stream');
  assert.equal(wrapped.streamSimple(originalModel, {}, {}), 'simple');
  for (const options of calls) assert.equal((await options.onPayload({}, originalModel)).service_tier, 'flex');
  assert.equal(upstream.id, 'openrouter');
  assert.equal(originalModel.provider, 'openrouter');
  assert.equal(resolveProfile({}).piProvider.getModels()[0].provider, 'openrouter-tier');
});
