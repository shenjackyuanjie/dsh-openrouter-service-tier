import { createRequire } from 'node:module';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 只在 .cache 构建候选并生成补丁，不安装、不修改 node_modules 或用户 profile。
const [sourceArg, pristineArg, version] = process.argv.slice(2);
if (!sourceArg || !pristineArg || !['0.2.0-rc.2', '0.2.1-alpha.1'].includes(version)) {
  throw new Error('用法：node scripts/build-host-patch.mjs <对应源码根目录> <已解包的原始 npm package 目录> <版本>');
}
const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(sourceArg);
const pristine = path.resolve(pristineArg);
const owner = path.join(source, 'packages/llm/llm-pi-ai');
for (const root of [owner, pristine]) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.name !== '@deepseek-ai/dsh-llm-pi-ai' || manifest.version !== version) throw new Error('源码与原始 npm 包必须匹配指定版本');
}
const require = createRequire(path.join(source, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));
const candidate = path.join(project, '.cache', `package-candidate-${version}`);
await mkdir(candidate, { recursive: true });
await cp(pristine, candidate, { recursive: true });
const result = await build({
  absWorkingDir: source,
  entryPoints: [path.join(owner, 'src/index.ts')],
  outfile: path.join(candidate, 'lib/index.js'),
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22',
  // 禁止 workspace paths 把其他 DSH 包内联，保持原生服务与 adapter 类型身份。
  tsconfigRaw: { compilerOptions: { target: 'ES2024' } },
  metafile: true,
});
for (const input of Object.keys(result.metafile.inputs)) {
  const relative = path.relative(path.join(owner, 'src'), path.resolve(source, input));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`意外内联跨包依赖：${input}`);
}
for (const file of ['index.d.ts', 'config.d.ts', 'service-tier.d.ts']) {
  await cp(path.join(owner, 'lib/types', file), path.join(candidate, 'lib/types', file));
}
const a = pristine.replaceAll('\\', '/');
const b = candidate.replaceAll('\\', '/');
const diff = spawnSync('git', ['diff', '--no-index', '--no-renames', '--', a, b], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (diff.status !== 1) throw new Error(`生成补丁失败：${diff.stderr}`);
const patch = diff.stdout.replaceAll(`a/${a}/`, 'a/').replaceAll(`b/${b}/`, 'b/').replaceAll(`a/${b}/`, 'a/');
await mkdir(path.join(project, 'patches'), { recursive: true });
await writeFile(path.join(project, 'patches', `@deepseek-ai__dsh-llm-pi-ai@${version}.patch`), patch);
console.log(`已生成 ${version} 固定版本补丁；跨包依赖均为 external`);
