import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('撤掉绑定旧 namespace 的面板，不宣称跨 namespace UI 已迁移', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dsh?.client, undefined);
  assert.equal(manifest.exports['./client'], undefined);
  assert.ok(!manifest.files.includes('client.js'));
});
