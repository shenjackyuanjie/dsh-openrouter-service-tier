import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// 使用包自身的 exports 解析资源，覆盖停用时无需加载插件即可读取的显示元数据。
test('zh/en 显示元数据可通过包导出读取，并使用友好的中文标题', async () => {
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json');
  for (const locale of ['zh', 'en']) {
    const resource = new URL(import.meta.resolve(`${manifest.name}/locale/${locale}.json`));
    assert.equal(resource.href, new URL(`../locale/${locale}.json`, import.meta.url).href);
    const { meta } = JSON.parse(await readFile(resource, 'utf8'));
    assert.equal(meta.title, 'OpenRouter 服务等级');
    assert.match(meta.description, /OpenRouter.*服务等级/);
    assert.match(meta.description, /原生模型目录、凭据与 thinking/);
  }
});

test('原创 SVG 可通过包导出读取，路径和大小符合显示资源要求', async () => {
  assert.equal(manifest.exports['./icon'], './icon.svg');
  const resource = new URL(import.meta.resolve(`${manifest.name}/icon`));
  const packageRoot = await realpath(new URL('../', import.meta.url));
  assert.equal(path.relative(packageRoot, await realpath(fileURLToPath(resource))), 'icon.svg');
  const icon = await readFile(resource);
  assert.ok(icon.length > 0 && icon.length <= 256 * 1024);
  const svg = icon.toString('utf8');
  assert.match(svg, /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /<title\b[^>]*>OpenRouter 服务等级<\/title>/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.doesNotMatch(svg, /<(?:script|foreignObject|image)\b|(?:href|onload)=/i);
});

test('发布白名单包含显示资源，bundle 与组件共用包且保留原生入口', async () => {
  assert.deepEqual(manifest.exports['.'], { types: './lib/index.d.ts', default: './lib/index.js' });
  assert.equal(manifest.exports['./package.json'], './package.json');
  for (const resource of ['lib', 'cordis.patch.yml', 'locale', 'icon.svg']) {
    assert.ok(manifest.files.includes(resource), `发布白名单缺少 ${resource}`);
  }
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  const patch = yaml.load(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'));
  assert.equal(patch[0].insert[0].name, manifest.name);
  assert.equal(patch[0].insert[0].id, 'openrouter-service-tier');
});
