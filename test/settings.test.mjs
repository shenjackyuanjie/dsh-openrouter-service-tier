import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Settings from '@deepseek-ai/dsh-settings';
import { Config, resolveProfile } from '../lib/config.js';
import { assertActive, call, collect, fakeOpenRouter, harness, MODEL } from './fixtures.mjs';

async function settingsHost(t) {
  const fake = await fakeOpenRouter(); t.after(() => fake.close());
  const host = await harness(); t.after(() => host.close());
  const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(path.join(cache, 'settings-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const document = path.join(dir, 'config.json');
  const inherited = { provider: 'openrouter-tier', apiKeyEnv: 'OPENROUTER_API_KEY', serviceTier: 'flex', models: [MODEL], reasoning: 'high', baseURL: fake.baseURL };
  let override = {};
  const entries = () => [...host.root.loader.entries()].filter((entry) => entry.options.id === 'tier-test');
  // 真实 Settings + Loader，持久化边界采用独立测试文件，绝不写用户 profile。
  host.root.provide('profileContext', { home: dir, name: 'offline-test' });
  host.root.provide('configEditor', {
    documentPath: document, entries,
    configuration: () => entries().map((entry) => ({ entry, inherited, override })),
    edit: async (entry, change) => {
      const next = change(structuredClone(entry.options.config), structuredClone(inherited));
      Config(next); // 写入之前验证；无效候选不得写文件。
      await host.root.loader.update(entry.id, { config: next });
      await assertActive(host.root);
      override = JSON.stringify(next) === JSON.stringify(inherited) ? {} : structuredClone(next);
      await writeFile(document, JSON.stringify(next), 'utf8');
    },
  });
  const tools = new Map();
  host.root.provide('tools', { register: (definition) => { tools.set(definition.name, definition); return () => tools.delete(definition.name); } });
  await host.root.plugin(Settings);
  await host.activate([{ id: 'tier-test', name: './lib/index.js', config: inherited }]);
  await host.root.fiber.await();
  return { ...host, fake, document, tools, inherited };
}

test('默认模型来自 OpenRouter 目录，不固定 Luna 或统一 thinking', async () => {
  const profile = resolveProfile({});
  assert.ok(profile.piProvider.getModels().length > 1);
  assert.ok(profile.piProvider.getModels().every((model) => model.api === 'openai-completions'));
  assert.equal(profile.reasoning, undefined);
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.ok(!patch.includes('gpt-6-luna'));
  assert.ok(!patch.includes('reasoning:'));
});

test('真实 settings.mutate 热更新并持久化 tier，旧请求和其他配置不变', async (t) => {
  const { root, fake, inherited, document } = await settingsHost(t);
  const before = root.settings.describe()[0];
  assert.deepEqual(before.value, { serviceTier: 'flex' });
  assert.equal(before.autoGenerate, false);
  const original = root.loader.resolve('tier-test').fiber;
  const prepared = await root.llm.prepareCall({ provider: 'openrouter-tier', model: MODEL });
  await root.settings.mutate('tier-test', [{ op: 'set', path: ['serviceTier'], value: 'priority' }], before.revision);
  assert.equal(root.loader.resolve('tier-test').fiber, original, '只改 tier 不应重建 adapter');
  await collect(prepared.stream(call(prepared.config)));
  await collect(root.llm.stream(call()));
  assert.deepEqual(fake.requests.map((request) => request.body.service_tier), ['flex', 'priority']);
  const persisted = JSON.parse(await readFile(document, 'utf8'));
  assert.deepEqual(persisted, { ...inherited, serviceTier: 'priority' });
  const revision = root.settings.describe()[0].revision;
  await root.settings.mutate('tier-test', [{ op: 'set', path: ['serviceTier'], value: null }], revision);
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, undefined);
  await root.settings.mutate('tier-test', [{ op: 'unset', path: ['serviceTier'] }], root.settings.describe()[0].revision);
  await collect(root.llm.stream(call()));
  assert.equal(fake.requests.at(-1).body.service_tier, 'flex', '恢复默认与不发送 tier 必须区分');
});

test('设置工具与 UI 的同源操作一致，拒绝过期 revision 和无效档位', async (t) => {
  const { root, tools, document } = await settingsHost(t);
  const tool = tools.get('openrouter_service_tier');
  assert.ok(tool);
  const initial = await tool.execute({ action: 'get' });
  const updated = await tool.execute({ action: 'set', tier: 'fast', expectedRevision: initial.revision });
  assert.equal(updated.tier, 'fast');
  assert.equal(root.settings.describe()[0].value.serviceTier, 'fast');
  const beforeFile = await readFile(document, 'utf8');
  await assert.rejects(tool.execute({ action: 'set', tier: 'flex', expectedRevision: initial.revision }), (error) => error.code === 'SETTINGS_CONFLICT');
  await assert.rejects(tool.execute({ action: 'set', tier: 'auto', expectedRevision: updated.revision }));
  await assert.rejects(tool.execute({ action: 'reset' }));
  await assert.rejects(root.settings.mutate('tier-test', [{ op: 'set', path: ['models'], value: [] }], updated.revision));
  assert.equal(await readFile(document, 'utf8'), beforeFile);
  assert.equal((await tool.execute({ action: 'set', tier: 'omit', expectedRevision: updated.revision })).tier, 'omit');
  assert.equal((await tool.execute({ action: 'reset', expectedRevision: root.settings.describe()[0].revision })).tier, 'flex');
  const fiber = root.loader.resolve('tier-test').fiber;
  root.loader.remove('tier-test'); await fiber.dispose(); await root.fiber.await();
  assert.equal(tools.size, 0, '卸载必须移除 Agent 配置工具');
});
