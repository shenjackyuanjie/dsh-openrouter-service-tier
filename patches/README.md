# 原生宿主补丁

两种交付相互对应：

- `@deepseek-ai__dsh-llm-pi-ai@<版本>.patch`：原始 npm 包的固定版本 package-manager patch，仅改 `lib/index.js` 和三个类型声明文件，不更换宿主其他包。
- `llm-pi-ai-<版本>.source.patch`：对应公开源码的配置、原生 adapter、双语 README 和离线回归用例。

rc.2 的源码基线为公开 tag `dsh-v0.2.0-rc.2`；alpha 的基线为 `dsh-v0.2.1-alpha.1`。不要混用内部变体。请求 tier 使用 OpenRouter 文档支持的五个协议值；Chat Completions、Responses、Messages 均保留原生链。

## 源码实施

在匹配版本、干净的公开源码树中应用 source patch，安装其开发依赖，运行相关测试与 `pnpm exec tsc -b packages/llm/llm-pi-ai`。本仓库的 `.compat/host-rc2` 是独立 detached worktree，不是用户运行宿主。

```powershell
git apply D:\path\patches\llm-pi-ai-0.2.0-rc.2.source.patch
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc -b packages/llm/llm-pi-ai
pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/adapter.spec.ts packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts
```

宿主若内联 llm-pi-ai，使用其正常构建与交付流程；不能只替换外部依赖。

## 重新生成 npm 补丁

先取得同版本原始 npm tarball，解包到独立缓存目录。类型声明必须由对应版本源码的 tsc 生成。执行：

```powershell
node scripts/build-host-patch.mjs <对应版本源码根目录> <原始解包的 package 目录> 0.2.0-rc.2
```

脚本只在本仓库 `.cache` 构建候选和输出 `.patch`。所有跨包依赖保持 external，并通过 bundler metafile 拒绝意外内联；避免 workspace paths 带来第二份 llm/Cordis 服务。脚本不安装、不修改用户 profile 或共享 store。

## 使用 npm 补丁

在实际负责解析原生包的 pnpm 项目中，将版本限定的补丁登记到 `pnpm-workspace.yaml` 的 `patchedDependencies`，再运行 `pnpm install` 并重启 Host。不要手改 node_modules；插件开发依赖补丁并不等于运行宿主已打补丁。

参见[插件 README](../README.md)的安装与迁移步骤。两版插件测试分别为 `npm run check` 和 `node scripts/test-alpha.mjs`；前者使用本仓库 rc.2 patch，后者在独立目录使用 alpha patch。
