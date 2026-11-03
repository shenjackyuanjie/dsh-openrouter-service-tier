# 原生宿主补丁

同时提供 `0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.4` 与 `0.2.1-rc.5` 四套，各自对应一个宿主版本，不混用：

- `@deepseek-ai__dsh-llm-pi-ai@<版本>.patch`：原始 npm 包的固定版本 package-manager patch，只改 `lib/index.js` 与类型声明，不更换宿主其他包。
- `llm-pi-ai-0.2.1-rc.2.source.patch`：rc.2 对应的公开源码改法（配置、原生 adapter、双语 README 与离线回归用例）。rc.3 及之后的版本没有可用的源码级 patch，改法记录在下文。

宿主升级到新版本后需要重新生成对应补丁，不要用旧版本的补丁去 patch 新版本。`0.2.1-rc.5` 的 `lib/index.js` 与 `lib/types/config.d.ts` 与 `rc.4` 逐字节相同，因此 `rc.5` 补丁内容与 `rc.4` 一致；仍单独成文件，是因为 pnpm 的 `patchedDependencies` 键绑定精确版本，混用会命中不上。请求 tier 使用 OpenRouter 文档支持的五个协议值；Chat Completions、Responses、Messages 均保留原生链。

## 补丁做了什么

四套补丁内容等价，差别只在构建产物结构：

1. 在 profile schema 之前加入档位选择逻辑（`OPENROUTER_SERVICE_TIERS`、`openRouterTierFor`、`supportsOpenRouterTier`），并从包导出，供插件断言协议档位一致。
2. `profile` schema 增加 `serviceTier`（五个协议值或 null）与 `modelServiceTiers`（`[{ model, tier }]`，另允许 `omit`）。
3. `streamWithSnapshot` 在准备请求时按 profile 解析档位；显式档位遇到不支持的协议会在解析凭据或访问网络前失败。
4. `streamSimple` 选项加入 `onPayload`，只给请求 body 顶层写 `service_tier`；无有效档位时不加 hook。
5. `lib/types/config.d.ts` 只补公开接口 `PiAiProviderProfile` 与档位类型。Schemastery 推导出的内部双重类型未同步，`Config` 的深层推导类型因此不含新字段；这是有意的取舍，配置经 YAML/设置界面写入，不依赖该推导类型。

## 从构建产物移植

rc.3、rc.4 与 rc.5 的 `lib/index.js` 是打包产物，没有可用的源码级 patch。移植做法与校验步骤相同（下例以 rc.3 为准，rc.4 与 rc.5 把版本号与缓存脚本名换成对应值；rc.5 的原始产物与 rc.4 相同，可直接复用已有替换结果）：

1. `npm pack @deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.3` 解包，得到原始 `lib/index.js` 与 `lib/types/config.d.ts`。
2. 用 `.cache/port-rc3-tier.mjs`、`.cache/port-rc3-tier-dts.mjs` 做四处唯一命中的文本替换，生成打补丁后的两个文件。
3. `node --check` 校验语法，`git diff --no-index --no-prefix` 生成 `a/`、`b/` 前缀的 diff 并合并成该 patch。
4. 在原始包副本上 `git apply --check` 通过后，再接入 `pnpm-workspace.yaml` 的 `patchedDependencies` 运行插件回归。

`OPENROUTER_SERVICE_TIERS` 必须声明在 `profile` schema 之前：它是 `const`，放在后面会让 schema 求值触发 TDZ 错误。补丁已按此顺序生成。

## 使用 npm 补丁

在实际负责解析原生包的 pnpm 项目中，将版本限定的补丁登记到 `pnpm-workspace.yaml` 的 `patchedDependencies`，再运行 `pnpm install` 并重启 Host：

```yaml
patchedDependencies:
  '@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.5': /absolute/path/to/patches/@deepseek-ai__dsh-llm-pi-ai@0.2.1-rc.5.patch
```

宿主是 `0.2.1-rc.2` / `0.2.1-rc.3` / `0.2.1-rc.4` 时，把键与文件都换成对应版本。pnpm 会把「登记了补丁却没有对应依赖版本」当作错误（`ERR_PNPM_UNUSED_PATCH`），所以只登记宿主实际安装的版本；本仓库因此只启用 rc.5 一条，rc.2 至 rc.4 补丁仍随包发布。

不要手改 `node_modules`；插件自身的开发依赖补丁不等于运行宿主已打补丁。替换补丁内容后，pnpm 可能复用旧的补丁结果，需要删除该包的 `node_modules` 条目或重建依赖树才会重新应用。

参见[插件 README](../README.md)的安装步骤。本仓库的 `npm run check` 使用 `0.2.1-rc.5` 开发依赖与对应补丁；rc.2 至 rc.4 补丁结构与它等价，随包发布供对应版本宿主使用。
