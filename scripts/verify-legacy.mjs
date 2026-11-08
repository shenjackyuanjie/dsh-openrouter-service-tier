import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 仅写入被忽略的隔离项目，不修改开发依赖、profile 或真实上游。
const project = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const sdkArg = process.argv.slice(2).find((arg) => arg.startsWith('--pi-ai='));
const sdk = sdkArg ? sdkArg.slice('--pi-ai='.length) : '1.1.0';
assert.ok(['1.1.0', '1.4.0'].includes(sdk), 'SDK 仅验证官方下界与旧锁原生实际版本');
const versions = process.argv.slice(2).filter((arg) => arg !== sdkArg);
if (!versions.length) versions.push(...[2, 3, 4, 5].map((rc) => '0.2.1-rc.' + rc));
assert.ok(
  versions.every((v) => /^0\.2\.1-rc\.[2-5]$/.test(v)),
  '仅支持 rc.2 至 rc.5',
);
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
  const target = path.join(project, '.cache', 'legacy-matrix', version + '-pi-' + sdk);
  await mkdir(target, { recursive: true });
  // 使用实际发布白名单与当前构建，测试文件不属于发布包，单独复用。
  for (const file of [...manifest.files, 'test']) {
    await cp(path.join(project, file), path.join(target, file), { recursive: true });
  }
  const dependencies = {
    '@deepseek-ai/cordis': '4.0.5',
    '@deepseek-ai/cordis-plugin-loader': '1.0.6',
    '@deepseek-ai/cordis-plugin-group': '1.0.5',
    '@deepseek-ai/cordis-plugin-include': '1.0.10',
    '@deepseek-ai/schemastery': '3.18.5',
    '@earendil-works/pi-ai': sdk,
    'js-yaml': '4.3.2',
  };
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
      Object.entries(dependencies)
        .filter(([name]) => !name.startsWith('@deepseek-ai/dsh-') && name !== 'js-yaml')
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
  const tests = (await readdir(path.join(target, 'test')))
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => 'test/' + file);
  console.log('\n验证宿主 ' + version + '，pi-ai ' + sdk + '，当前插件 ' + manifest.version);
  run('node', ['--test', '--test-isolation=none', ...tests], target);
}
