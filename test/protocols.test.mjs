import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nativeVersion = JSON.parse(
  await readFile(new URL(import.meta.resolve('@deepseek-ai/dsh-llm-pi-ai/package.json')), 'utf8'),
).version;
import { setupNative, call, collect, finish, MODEL, harness, fakeOpenRouter } from './fixtures.mjs';

// 用真实 npm adapter 与 pi-ai 发送请求；上游固定 503，验证 body 而不依赖响应协议。
for (const [api, path] of [
  ['openai-completions', '/api/v1/chat/completions'],
  ['openai-responses', '/api/v1/responses'],
  ['anthropic-messages', '/api/v1/messages?beta=true'],
]) {
  test(api + '：五个协议档位与 omit 均经过原生 payload 链', async (t) => {
    const { root, fake } = await setupNative(t, {
      api,
      models: [{ id: MODEL }],
      reasoning: 'off',
    });
    const baseURL = api === 'anthropic-messages' ? fake.baseURL.replace(/\/v1$/, '') : fake.baseURL;
    fake.setMode('error503');
    for (const tier of ['default', 'flex', 'priority', 'fast', 'ultrafast', null]) {
      await root.loader.update('native-test', {
        config: {
          providers: {
            openrouter: {
              api,
              models: [{ id: MODEL }],
              reasoning: 'off',
              apiKeyEnv: 'OPENROUTER_API_KEY',
              baseURL,
              serviceTier: tier,
            },
          },
        },
      });
      const result = finish(await collect(root.llm.stream(call())));
      assert.equal(result.reason.failure.code, 'SERVER');
      const request = fake.requests.at(-1);
      assert.equal(request.path, path);
      assert.equal(request.body.service_tier, tier ?? undefined);
      assert.equal(Object.hasOwn(request.body, 'service_tier'), tier !== null);
    }
    assert.equal(fake.requests.length, 6);
  });
}

test('其他 provider 的档位按原生版本拒绝或忽略，永不注入 service_tier', async (t) => {
  const fake = await fakeOpenRouter();
  t.after(() => fake.close());
  const host = await harness();
  t.after(() => host.close());
  const activate = () =>
    host.activate([
      {
        id: 'tier-test',
        name: '@deepseek-ai/dsh-llm-pi-ai',
        config: {
          providers: {
            other: {
              api: 'openai-completions',
              models: [{ id: MODEL }],
              reasoning: 'off',
              apiKeyEnv: 'OPENROUTER_API_KEY',
              baseURL: fake.baseURL,
              serviceTier: 'flex',
            },
          },
        },
      },
    ]);
  if (nativeVersion === '0.2.1-rc.2') {
    t.diagnostic('旧版原生补丁在配置阶段明确拒绝非 openrouter 档位：' + nativeVersion);
    await assert.rejects(
      activate,
      /serviceTier and modelServiceTiers require the native openrouter route/,
    );
    assert.equal(fake.requests.length, 0);
    return;
  }
  await activate();
  await collect(host.root.llm.stream(call({ provider: 'other' })));
  assert.equal(fake.requests.length, 1);
  assert.equal(Object.hasOwn(fake.requests[0].body, 'service_tier'), false);
});
