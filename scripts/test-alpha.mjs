import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 只在本项目 .compat/<组合> 内构造独立依赖组合，不升级用户的 Harness。
// 默认验证 0.2.1-alpha.1；传入宿主版本可验证其他预发布组合，例如 0.2.1-rc.2。
const versions = {
  '0.2.1-alpha.1': { dir: 'alpha', cordis: '4.0.5-alpha.1', loader: '1.0.6-alpha.1', schemastery: '3.18.5-alpha.1' },
  '0.2.1-rc.2': { dir: 'rc2', cordis: '4.0.5', loader: '1.0.6', schemastery: '3.18.5' },
};
const version = process.argv[2] ?? '0.2.1-alpha.1';
const combo = versions[version];
if (!combo) throw new Error(`不支持的宿主版本 ${version}；可用：${Object.keys(versions).join(', ')}`);
const project = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(project, '.compat', combo.dir);
await mkdir(target, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
delete manifest.peerDependencies;
delete manifest.dsh;
delete manifest.packageManager;
manifest.name = `openrouter-tier-${combo.dir}-offline-test`;
manifest.private = true;
for (const key of Object.keys(manifest.devDependencies)) {
  if (key.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[key] = version;
}
manifest.devDependencies['@deepseek-ai/cordis'] = combo.cordis;
manifest.devDependencies['@deepseek-ai/cordis-plugin-loader'] = combo.loader;
manifest.devDependencies['@deepseek-ai/schemastery'] = combo.schemastery;
await writeFile(path.join(target, 'pnpm-workspace.yaml'), `patchedDependencies:\n  '@deepseek-ai/dsh-llm-pi-ai@${version}': ../../patches/@deepseek-ai__dsh-llm-pi-ai@${version}.patch\n`);
await writeFile(path.join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of ['src', 'test']) await cp(path.join(project, name), path.join(target, name), { recursive: true });
for (const name of ['tsconfig.json', 'cordis.patch.yml']) await cp(path.join(project, name), path.join(target, name));

function run(args) {
  const manager = args[0] === 'install' ? 'pnpm' : 'npm';
  console.log(`验证 ${version} 独立组合：${manager} ${args.join(' ')}`);
  // Windows 用 cmd 执行固定的 npm 参数，路径只作为 cwd，不拼接进 shell。
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${manager} ${args.join(' ')}`], { cwd: target, stdio: 'inherit' })
    : spawnSync(manager, args, { cwd: target, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// 新预发布版本默认被 pnpm 的 minimumReleaseAge 挡住；只在这次隔离安装里放开。
run(['install', '--ignore-scripts', '--config.minimum-release-age=0']);
run(['run', 'check']);
