import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, SERVICE_TIERS } from '../lib/config.js';
import { Native } from './fixtures.mjs';

test('插件拒绝旧独立路由配置，协议档位与宿主一致', () => {
  assert.deepEqual(Config({}), {});
  for (const config of [{ provider: 'openrouter-tier' }, { serviceTier: 'flex' }, { apiKeyEnv: 'OPENROUTER_API_KEY' }]) {
    assert.throws(() => Config(config), /原生 OpenRouter 控制器/);
  }
  assert.deepEqual(SERVICE_TIERS, Native.OPENROUTER_SERVICE_TIERS);
});
