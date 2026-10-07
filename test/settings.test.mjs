import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Settings from '@deepseek-ai/dsh-settings';
import { Native, assertActive, call, collect, fakeOpenRouter, harness, MODEL, ROUTE } from './fixtures.mjs';
import { readTierState, mutateTier } from '../lib/tier-ops.js';

async function settingsHost(t, { patched = true, dormant = false, inheritedOverrides = [] } = {}) {
  const fake = await fakeOpenRouter(); t.after(() => fake.close());
  const host = await harness(); t.after(() => host.close());
  const dir = await mkdtemp(path.join(tmpdir(), 'native-tier-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const document = path.join(dir, 'config.json');
  const inherited = { providers: dormant ? {} : { openrouter: {
    apiKeyEnv: 'OPENROUTER_API_KEY', serviceTier: 'flex', modelServiceTiers: inheritedOverrides,
    reasoning: 'high', baseURL: fake.baseURL, headers: { 'X-Test': 'not-projected' },
  } } };
  let override = {};
  const entries = () => [...host.root.loader.entries()].filter(entry => entry.options.id === 'actual-native-owner');
  host.root.provide('profileContext', { home: dir, name: 'offline-test' });
  host.root.provide('configEditor', {
    documentPath: document, entries,
    configuration: () => entries().map(entry => ({ entry, inherited, override })),
    edit: async (entry, change) => {
      const next = change(structuredClone(entry.options.config), structuredClone(inherited));
      Native.Config(next);
      await host.root.loader.update(entry.id, { config: next });
      await assertActive(host.root, 'actual-native-owner');
      override = structuredClone(next);
      await writeFile(document, JSON.stringify(next), 'utf8');
    },
  });
  const tools = new Map();
  host.root.provide('tools', { register: definition => { tools.set(definition.name, definition); return () => tools.delete(definition.name); } });
  const commands = new Map();
  host.root.provide('commands', { register: definition => { commands.set(definition.name, definition); return () => commands.delete(definition.name); } });
  await host.root.plugin(Settings);
  await host.activate([
    { id: 'actual-native-owner', name: '@deepseek-ai/dsh-llm-pi-ai', config: inherited },
    { id: 'tier-test', name: './lib/index.js', config: {} },
  ]);
  await host.root.fiber.await();
  if (!patched) {
    // 能力缺失时只替换 descriptor 的 schema，绝不伪造模型目录或 dispatch。
    const describe = host.root.settings.describe.bind(host.root.settings);
    host.root.settings.describe = (...args) => describe(...args).map(entry => ({ ...entry,
      schema: { type: 'object', meta: {}, dict: { providers: { type: 'dict', meta: {}, inner: { type: 'object', meta: {}, dict: {} } } } },
    }));
  }
  return { ...host, fake, document, tools, commands, inherited };
}

test('工具发现动态原生 namespace，只写两个字段，保留准备快照与其他配置', async t => {
  const { root, fake, document, inherited, tools } = await settingsHost(t);
  const tool = tools.get('openrouter_service_tier');
  const initial = await tool.execute({ action: 'get' });
  assert.equal(initial.namespace, 'actual-native-owner');
  assert.equal(initial.global, 'flex');
  assert.ok(!JSON.stringify(initial).includes('not-projected'));
  const models = await root.llm.listModels(ROUTE);
  const owner = root.loader.resolve('actual-native-owner').fiber;
  const prepared = await root.llm.prepareCall({ provider: ROUTE, model: MODEL });
  const updated = await tool.execute({ action: 'set', tier: 'priority', expectedRevision: initial.revision });
  assert.equal(updated.global, 'priority');
  assert.equal(root.loader.resolve('actual-native-owner').fiber, owner);
  assert.deepEqual(await root.llm.listModels(ROUTE), models);
  await collect(prepared.stream(call(prepared.config)));
  await collect(root.llm.stream(call()));
  assert.deepEqual(fake.requests.map(request => request.body.service_tier), ['flex', 'priority']);
  assert.deepEqual(JSON.parse(await readFile(document, 'utf8')), { providers: { openrouter: { ...inherited.providers.openrouter, serviceTier: 'priority' } } });
  await assert.rejects(tool.execute({ action: 'set', tier: 'flex', expectedRevision: initial.revision }), error => error.code === 'SETTINGS_CONFLICT');
  await assert.rejects(tool.execute({ action: 'set', tier: 'auto', expectedRevision: updated.revision }));
  await assert.rejects(tool.execute({ action: 'reset' }));
  await assert.rejects(tool.execute({ action: 'set', tier: 'priority', model: 'unknown/offline', expectedRevision: updated.revision }));
});

test('全局 null、模型 omit 和 reset 继承有不同语义', async t => {
  const { root, fake, tools } = await settingsHost(t);
  const tool = tools.get('openrouter_service_tier');
  let state = await tool.execute({ action: 'get' });
  const set = async (args) => { state = await tool.execute({ ...args, expectedRevision: state.revision }); };
  await set({ action: 'set', tier: 'omit' });
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, undefined);
  await set({ action: 'set', model: MODEL, tier: 'priority' });
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, 'priority', 'null 不得屏蔽模型显式档位');
  await set({ action: 'reset' });
  assert.equal(state.global, 'flex');
  await set({ action: 'set', model: MODEL, tier: 'omit' });
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, undefined);
  await set({ action: 'reset', model: MODEL });
  assert.deepEqual(state.overrides, []);
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, 'flex');
});

test('删除最后一个继承模型覆盖写空数组；unset 数组恢复底层', async t => {
  const { root, document } = await settingsHost(t, { inheritedOverrides: [{ model: MODEL, tier: 'priority' }] });
  const state = readTierState(root);
  await mutateTier(root, { kind: 'model', model: MODEL, tier: 'inherit' }, state.revision);
  assert.deepEqual(readTierState(root).overrides, []);
  assert.deepEqual(JSON.parse(await readFile(document, 'utf8')).providers.openrouter.modelServiceTiers, []);
  await root.settings.mutate(state.namespace, [{ op: 'unset', path: ['providers', 'openrouter', 'modelServiceTiers'] }], readTierState(root).revision);
  assert.deepEqual(readTierState(root).overrides, [{ model: MODEL, tier: 'priority' }]);
});

test('原生模型目录热更新后校验新目录，允许删除失效覆盖', async t => {
  const { root, inherited } = await settingsHost(t);
  const before = readTierState(root);
  await mutateTier(root, { kind: 'model', model: MODEL, tier: 'flex' }, before.revision);
  const alt = (await root.llm.listModels(ROUTE)).find(model => model.id !== MODEL).id;
  await root.loader.update('actual-native-owner', { config: { providers: { openrouter: { ...inherited.providers.openrouter, models: [{ id: alt }], modelServiceTiers: [] } } } });
  await assertActive(root, 'actual-native-owner');
  assert.deepEqual((await root.llm.listModels(ROUTE)).map(model => model.id), [alt]);
  await assert.rejects(mutateTier(root, { kind: 'model', model: MODEL, tier: 'priority' }, readTierState(root).revision), /当前原生/);
  await mutateTier(root, { kind: 'model', model: MODEL, tier: 'inherit' }, readTierState(root).revision);
  assert.deepEqual(readTierState(root).overrides, []);
});

test('命令同源；控制贡献卸载不移除 native 模型或档位', async t => {
  const { root, tools, commands, fake } = await settingsHost(t);
  const command = commands.get('openrouter-tier');
  assert.ok(!commands.has('service-tier'));
  assert.equal((await command.handler({ rawInput: 'priority' })).kind, 'success');
  assert.equal(readTierState(root).global, 'priority');
  assert.equal((await command.handler({ rawInput: `${MODEL} omit` })).kind, 'success');
  assert.equal((await command.handler({ rawInput: `${MODEL} reset` })).kind, 'success');
  assert.equal((await command.handler({ rawInput: 'unknown invalid' })).kind, 'error');
  const before = await root.llm.listModels(ROUTE);
  const fiber = root.loader.resolve('tier-test').fiber;
  root.loader.remove('tier-test'); await fiber.dispose(); await root.fiber.await();
  assert.equal(tools.size, 0); assert.equal(commands.size, 0);
  assert.deepEqual(await root.llm.listModels(ROUTE), before);
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, 'priority');
});

for (const options of [{ patched: false }, { dormant: true }]) {
  test(`能力缺失或 dormant 明确拒绝：${JSON.stringify(options)}`, async t => {
    const { root, tools, fake } = await settingsHost(t, options);
    await assert.rejects(tools.get('openrouter_service_tier').execute({ action: 'get' }), /能力|未启用/);
    await assert.rejects(tools.get('openrouter_service_tier').execute({ action: 'set', tier: 'flex', expectedRevision: 0 }), /能力|未启用/);
    assert.equal(fake.requests.length, 0);
    assert.ok(!root.llm.listProviders().some(provider => provider.id === 'openrouter-tier'));
  });
}
