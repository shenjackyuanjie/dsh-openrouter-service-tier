import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 只在本项目 .compat/alpha 内构造独立依赖组合，不升级用户的 Harness。
const project = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(project, '.compat', 'alpha');
await mkdir(target, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
delete manifest.peerDependencies;
delete manifest.dsh;
delete manifest.packageManager;
manifest.name = 'openrouter-tier-alpha-offline-test';
manifest.private = true;
for (const key of Object.keys(manifest.devDependencies)) {
  if (key.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[key] = '0.2.1-alpha.1';
}
manifest.devDependencies['@deepseek-ai/cordis'] = '4.0.5-alpha.1';
manifest.devDependencies['@deepseek-ai/cordis-plugin-loader'] = '1.0.6-alpha.1';
manifest.devDependencies['@deepseek-ai/schemastery'] = '3.18.5-alpha.1';
await writeFile(path.join(target, 'pnpm-workspace.yaml'), "patchedDependencies:\n  '@deepseek-ai/dsh-llm-pi-ai@0.2.1-alpha.1': ../../patches/@deepseek-ai__dsh-llm-pi-ai@0.2.1-alpha.1.patch\n");
await writeFile(path.join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of ['src', 'test']) await cp(path.join(project, name), path.join(target, name), { recursive: true });
for (const name of ['tsconfig.json', 'cordis.patch.yml']) await cp(path.join(project, name), path.join(target, name));

function run(args) {
  const manager = args[0] === 'install' ? 'pnpm' : 'npm';
  console.log(`验证 alpha 独立组合：${manager} ${args.join(' ')}`);
  // Windows 用 cmd 执行固定的 npm 参数，路径只作为 cwd，不拼接进 shell。
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${manager} ${args.join(' ')}`], { cwd: target, stdio: 'inherit' })
    : spawnSync(manager, args, { cwd: target, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['install', '--ignore-scripts']);
run(['run', 'check']);
