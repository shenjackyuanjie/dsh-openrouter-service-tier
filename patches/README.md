# 原生宿主补丁

只提供 `0.2.1-rc.3` 一套：`@deepseek-ai__dsh-llm-pi-ai@0.2.1-rc.3.patch`。它是原始 npm 包的固定版本 package-manager patch，只改 `lib/index.js` 与 `lib/types/config.d.ts`，不更换宿主其他包。

宿主升级后需要重新生成补丁，不保留旧版本文件。请求 tier 使用 OpenRouter 文档支持的五个协议值；Chat Completions、Responses、Messages 均保留原生链。

## 补丁做了什么

1. `lib/index.js` 在 profile schema 之前加入档位选择逻辑（`OPENROUTER_SERVICE_TIERS`、`openRouterTierFor`、`supportsOpenRouterTier`）并从包导出，供插件断言协议档位一致。
2. `profile` schema 增加 `serviceTier`（五个协议值或 null）与 `modelServiceTiers`（`[{ model, tier }]`，另允许 `omit`）。
3. `streamWithSnapshot` 在准备请求时按 profile 解析档位；显式档位遇到不支持的协议会在解析凭据或访问网络前失败。
4. `streamSimple` 选项加入 `onPayload`，只给请求 body 顶层写 `service_tier`；无有效档位时不加 hook。
5. `lib/types/config.d.ts` 只补公开接口 `PiAiProviderProfile` 与档位类型。Schemastery 推导出的内部双重类型未同步，`Config` 的深层推导类型因此不含新字段；这是有意的取舍，配置经 YAML/设置界面写入，不依赖该推导类型。

## 从构建产物移植

rc.3 的 `lib/index.js` 是打包产物，没有可用的源码级 patch。移植做法与校验步骤：

1. `npm pack @deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.3` 解包，得到原始 `lib/index.js` 与 `lib/types/config.d.ts`。
2. 用 `.cache/port-rc3-tier.mjs`、`.cache/port-rc3-tier-dts.mjs` 做四处唯一命中的文本替换，生成打补丁后的两个文件。
3. `node --check` 校验语法，`git diff --no-index --no-prefix` 生成 `a/`、`b/` 前缀的 diff 并合并成该 patch。
4. 在原始包副本上 `git apply --check` 通过后，再接入 `pnpm-workspace.yaml` 的 `patchedDependencies` 运行插件回归。

`OPENROUTER_SERVICE_TIERS` 必须声明在 `profile` schema 之前：它是 `const`，放在后面会让 schema 求值触发 TDZ 错误。补丁已按此顺序生成。

## 使用 npm 补丁

在实际负责解析原生包的 pnpm 项目中，将版本限定的补丁登记到 `pnpm-workspace.yaml` 的 `patchedDependencies`，再运行 `pnpm install` 并重启 Host：

```yaml
patchedDependencies:
  '@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.3': /absolute/path/to/patches/@deepseek-ai__dsh-llm-pi-ai@0.2.1-rc.3.patch
```

不要手改 `node_modules`；插件自身的开发依赖补丁不等于运行宿主已打补丁。替换补丁内容后，pnpm 可能复用旧的补丁结果，需要删除该包的 `node_modules` 条目或重建依赖树才会重新应用。

参见[插件 README](../README.md)的安装步骤。插件测试只有一套：`npm run check` 使用本仓库 `0.2.1-rc.3` 开发依赖与同名补丁。
