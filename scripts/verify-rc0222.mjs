import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 双版本回归：0.2.2-rc.1 与 0.2.2-rc.2 各自使用官方 tarball、匹配补丁和独立依赖树。
// 只写入被忽略的 .cache 目录，不修改开发依赖、profile 或真实上游。
const project = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const versions = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (!versions.length) versions.push('0.2.2-rc.1', '0.2.2-rc.2');
assert.ok(
  versions.every((v) => /^0\.2\.2-rc\.[12]$/.test(v)),
  '仅支持 0.2.2-rc.1 与 0.2.2-rc.2',
);
const base = {
  '@deepseek-ai/cordis': '4.1.0',
  '@deepseek-ai/cordis-plugin-loader': '1.1.0',
  '@deepseek-ai/cordis-plugin-group': '1.1.0',
  '@deepseek-ai/cordis-plugin-include': '1.1.0',
  '@deepseek-ai/schemastery': '3.19.0',
  '@earendil-works/pi-ai': '1.3.0',
  'js-yaml': '4.3.2',
};
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, command + ' ' + args.join(' '));
}
run('npm', ['run', 'build'], project);
for (const version of versions) {
  const target = path.join(project, '.cache', 'matrix-022', version);
  await mkdir(target, { recursive: true });
  for (const file of [...manifest.files, 'test']) {
    await cp(path.join(project, file), path.join(target, file), { recursive: true });
  }
  const dependencies = { ...base };
  for (const name of ['commands', 'credentials', 'llm', 'llm-pi-ai', 'settings', 'tools']) {
    dependencies['@deepseek-ai/dsh-' + name] = version;
  }
  const patch = 'patches/@deepseek-ai__dsh-llm-pi-ai@' + version + '.patch';
  await writeFile(
    path.join(target, 'package.json'),
    JSON.stringify({ ...manifest, scripts: {}, devDependencies: {}, dependencies }, null, 2) + '\n',
  );
  await writeFile(
    path.join(target, 'pnpm-workspace.yaml'),
    'packages: []\npatchedDependencies:\n  "@deepseek-ai/dsh-llm-pi-ai@' +
      version +
      '": ' +
      patch +
      '\noverrides:\n' +
      Object.entries(base)
        .filter(([name]) => name !== 'js-yaml')
        .map(([name, v]) => '  "' + name + '": "' + v + '"')
        .join('\n') +
      '\n',
  );
  const metadata = await (
    await fetch('https://registry.npmjs.org/@deepseek-ai%2fdsh-llm-pi-ai/' + version)
  ).json();
  const tarball = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer());
  assert.equal(createHash('sha1').update(tarball).digest('hex'), metadata.dist.shasum);
  await writeFile(path.join(target, 'official.json'), JSON.stringify(metadata.dist, null, 2));
  await writeFile(path.join(target, 'official.tgz'), tarball);
  const pristine = path.join(target, 'pristine');
  await mkdir(pristine, { recursive: true });
  run('tar', ['-xf', 'official.tgz', '-C', 'pristine'], target);
  run(
    'git',
    [
      'apply',
      '--check',
      '--verbose',
      '--directory=' + path.relative(project, path.join(pristine, 'package')).replaceAll('\\', '/'),
      path.join(target, patch),
    ],
    project,
  );
  run('pnpm', ['install', '--ignore-scripts', '--registry=https://registry.npmjs.org'], target);
  run('pnpm', ['peers', 'check'], target);
  for (const [name, expected] of Object.entries(dependencies)) {
    const installed = JSON.parse(
      await readFile(path.join(target, 'node_modules', name, 'package.json'), 'utf8'),
    );
    assert.equal(installed.version, expected, name);
    assert.ok(
      (await realpath(path.join(target, 'node_modules', name))).startsWith(target),
      '依赖必须来自隔离目录',
    );
  }
  assert.deepEqual(
    await readFile(path.join(target, 'lib/index.js')),
    await readFile(path.join(project, 'lib/index.js')),
  );
  const native = await readFile(
    path.join(target, 'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'),
    'utf8',
  );
  assert.ok(native.includes('OPENROUTER_SERVICE_TIERS'), '档位补丁必须生效');
  assert.ok(
    native.indexOf('snapshot.models.streamSimple(model, context, {') <
      native.indexOf('...serviceTier === void 0 ? {} : { onPayload:'),
    '档位 hook 必须位于 streamSimple 选项内',
  );
  if (version === '0.2.2-rc.2') {
    assert.ok(
      native.indexOf('const { context, digest } = bindThinkingToPrefix(') <
        native.indexOf('...serviceTier === void 0 ? {} : { onPayload:'),
      'rc.2 的 thinking 前缀绑定必须先于档位注入',
    );
    assert.ok(
      native.includes('model.contextWindow, options.signal, model.id, digest)'),
      'rc.2 必须把 prefix digest 传给流式转换',
    );
  }
  assert.equal(
    native.includes('bindThinkingToPrefix'),
    version === '0.2.2-rc.2',
    'rc.2 必须保留 thinking 前缀绑定，rc.1 不含该函数',
  );
  const tests = (await readdir(path.join(target, 'test')))
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => 'test/' + file);
  console.log(
    '\n验证宿主 ' +
      version +
      '，pi-ai ' +
      base['@earendil-works/pi-ai'] +
      '，当前插件 ' +
      manifest.version,
  );
  run('node', ['--test', '--test-isolation=none', ...tests], target);
}
