import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
let module;
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: (entry) => { module = entry; } } } });
assert.equal(module.id, 'dsh-openrouter-service-tier');
const plugin = module.factory((name) => { assert.equal(name, 'react', '浏览器只能引用宿主 React，不能导入 Harness Client 包'); return React; });
let registration, Component, dictionaries;
plugin.apply({
  effect: (fn) => fn(), locale: { register: (_ns, dicts) => { dictionaries = dicts; return () => {}; } },
  slots: { inject: (name, fn) => { assert.equal(name, 'plugins.row.config'); return fn(); }, register: (options, component) => { registration = options; Component = component; return () => {}; } },
});
const t = (key, params = {}) => dictionaries.zh[key]?.replace(/\{(\w+)\}/g, (_, name) => params[name]) ?? key;
const state = (extra = {}) => ({ status: 'ready', writable: true, mode: 'host', value: { serviceTier: 'flex' }, user: { serviceTier: 'flex' }, revision: 7, ...extra });
async function render(form) {
  let view;
  await act(async () => { view = create(React.createElement(Component, { view: 'page', form, t })); });
  return view;
}
const buttons = (view) => view.root.findAllByType('button');
const button = (view, label) => {
  const found = buttons(view).find((node) => node.props.children === label);
  assert.ok(found, `必须渲染出「${label}」按钮`);
  return found;
};
const textOf = (view) => JSON.stringify(view.toJSON());

// 用真实 React 测试组件行为，不是浏览器视觉验证或 mock 预览页面。
test('管理页注册、中文档位解释、费用风险和主题 token', async (tctx) => {
  assert.equal(registration.key, 'dsh-openrouter-service-tier#openrouter-service-tier');
  assert.equal(registration.locale, 'openrouterServiceTier');
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort());
  const view = await render({ state: state(), mutate: async () => true });
  tctx.after(async () => { await act(async () => view.unmount()); });
  assert.equal(view.root.findAllByType('option').length, 6);
  assert.ok(textOf(view).includes('延迟更高'));
  assert.ok(textOf(view).includes('实际服务档位与费用'));
  assert.ok(textOf(view).includes('不改 API key、模型或 thinking'));
  assert.ok(textOf(view).includes('按模型覆盖'));
  const css = view.root.findByType('style').props.children;
  const used = [...css.matchAll(/var\((--[^)]+)\)/g)].map((match) => match[1]);
  assert.ok(used.every((token) => token.startsWith('--dsw-alias-')));
});

test('只有点击保存才写入，字段级修改并携带读取 revision', async (tctx) => {
  const calls = [];
  const form = { state: state(), mutate: async (...args) => { calls.push(args); return true; } };
  const view = await render(form); tctx.after(async () => { await act(async () => view.unmount()); });
  assert.equal(button(view, t('save')).props.disabled, true);
  await act(async () => view.root.findByType('select').props.onChange({ target: { value: 'priority' } }));
  assert.equal(calls.length, 0);
  assert.ok(textOf(view).includes('价格可能更高'));
  await act(async () => { await button(view, t('save')).props.onClick(); });
  assert.equal(JSON.stringify(calls[0]), JSON.stringify([[
    { op: 'set', path: ['serviceTier'], value: 'priority' },
    { op: 'unset', path: ['modelServiceTiers'] },
  ], 7]));
  assert.ok(textOf(view).includes('已保存'));
});

test('不发送 tier 使用 null，恢复默认使用 unset，不混淆两者', async (tctx) => {
  const calls = [];
  const view = await render({ state: state(), mutate: async (...args) => { calls.push(args); return true; } });
  tctx.after(async () => { await act(async () => view.unmount()); });
  await act(async () => view.root.findByType('select').props.onChange({ target: { value: 'omit' } }));
  await act(async () => { await button(view, t('save')).props.onClick(); });
  assert.equal(calls[0][0][0].value, null);
  await act(async () => { await button(view, t('reset')).props.onClick(); });
  assert.equal(JSON.stringify(calls[1][0]), JSON.stringify([{ op: 'unset', path: ['serviceTier'] }]));
});

test('按模型覆盖可增删改，并与全局档位在同一次写入中提交', async (tctx) => {
  const calls = [];
  const form = {
    state: state({ value: { serviceTier: 'flex', modelServiceTiers: [{ model: 'vendor/one', tier: 'priority' }] } }),
    mutate: async (...args) => { calls.push(args); return true; },
  };
  const view = await render(form); tctx.after(async () => { await act(async () => view.unmount()); });
  assert.ok(textOf(view).includes('vendor/one'));
  // 空输入不得产生一行覆盖。
  await act(async () => { await button(view, t('overrideAdd')).props.onClick(); });
  assert.ok(view.root.findByProps({ role: 'alert' }));
  await act(async () => view.root.findByType('input').props.onChange({ target: { value: 'vendor/two' } }));
  await act(async () => { await button(view, t('overrideAdd')).props.onClick(); });
  await act(async () => view.root.findAllByType('select')[1].props.onChange({ target: { value: 'omit' } }));
  await act(async () => { await button(view, t('save')).props.onClick(); });
  assert.equal(JSON.stringify(calls[0][0][1]), JSON.stringify({
    op: 'set', path: ['modelServiceTiers'],
    value: [{ model: 'vendor/one', tier: 'omit' }, { model: 'vendor/two', tier: 'flex' }],
  }));
  // 删除唯一一行后，覆盖表必须清除而不是写入空数组。
  await act(async () => { await button(view, t('overrideRemove')).props.onClick(); });
  await act(async () => { await button(view, t('save')).props.onClick(); });
  assert.equal(JSON.stringify(calls[1][0][1]), JSON.stringify({ op: 'unset', path: ['modelServiceTiers'] }));
});

test('保存拒绝或网络异常显示错误，不报虚假成功，保留草稿', async (tctx) => {
  for (const mutate of [async () => false, async () => { throw new Error('测试连接失败'); }]) {
    const view = await render({ state: state(), mutate });
    await act(async () => view.root.findByType('select').props.onChange({ target: { value: 'ultrafast' } }));
    await act(async () => { await button(view, t('save')).props.onClick(); });
    assert.ok(view.root.findByProps({ role: 'alert' }));
    assert.ok(!textOf(view).includes('已保存'));
    assert.equal(view.root.findByType('select').props.value, 'ultrafast');
    await act(async () => view.unmount());
  }
});

test('草稿保留原版本 fence，重复点击不产生重复写入', async (tctx) => {
  let release;
  const calls = [];
  const mutate = (...args) => { calls.push(args); return new Promise((resolve) => { release = resolve; }); };
  const view = await render({ state: state(), mutate }); tctx.after(async () => { await act(async () => view.unmount()); });
  await act(async () => view.root.findByType('select').props.onChange({ target: { value: 'default' } }));
  await act(async () => view.update(React.createElement(Component, { view: 'page', t, form: { state: state({ revision: 8 }), mutate } })));
  assert.ok(textOf(view).includes('不会静默覆盖'));
  let pending;
  await act(async () => { const click = button(view, t('save')).props.onClick; pending = click(); void click(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 7);
  assert.equal(view.root.findByType('select').props.disabled, true);
  await act(async () => { release(false); await pending; });
});

test('加载、不可用、只读及 memory 页面不会写 Host', async () => {
  for (const variant of [{ status: 'loading' }, { status: 'unavailable' }, { writable: false }, { mode: 'memory' }]) {
    let writes = 0;
    const view = await render({ state: state(variant), mutate: async () => { writes++; return true; } });
    for (const item of buttons(view)) {
      assert.equal(item.props.disabled, true);
      await act(async () => { await item.props.onClick(); });
    }
    assert.equal(writes, 0);
    await act(async () => view.unmount());
  }
});
