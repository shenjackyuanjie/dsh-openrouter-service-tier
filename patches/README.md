# 原生宿主补丁

包含 `0.2.2-rc.1` 至 `0.2.2-rc.5` 的五份运行补丁，以及 `0.2.3-alpha.1`、`0.2.3-alpha.2` 各一份匹配补丁。每份文件 `@deepseek-ai__dsh-llm-pi-ai@<版本>.patch` 绑定原始 npm 包的精确版本，只改 `lib/index.js` 与类型声明，不更换宿主其他包。

`0.2.2-rc.3`、`0.2.2-rc.4` 与 `0.2.2-rc.5` 的这两个原始文件逐字节相同，补丁内容一致；仍分别提供文件，是因为 pnpm 的 `patchedDependencies` 键绑定精确版本。请求 tier 使用 OpenRouter 文档支持的五个协议值；Chat Completions、Responses、Messages 均保留原生链。

## 补丁做了什么

各版本补丁功能等价，差别只在构建产物结构：

1. 在 profile schema 之前加入档位选择逻辑（`OPENROUTER_SERVICE_TIERS`、`openRouterTierFor`、`supportsOpenRouterTier`）；其中 `OPENROUTER_SERVICE_TIERS` 从包导出，供插件断言协议档位一致。
2. `profile` schema 增加 `serviceTier`（五个协议值或 null）与 `modelServiceTiers`（`[{ model, tier }]`，另允许 `omit`）。
3. `streamWithSnapshot` 在准备请求时按 profile 解析档位；显式档位遇到不支持的协议会在解析凭据或访问网络前失败。
4. `streamSimple` 选项加入 `onPayload`，只给请求 body 顶层写 `service_tier`；无有效档位时不加 hook。
5. `lib/types/config.d.ts` 只补公开接口 `PiAiProviderProfile` 与档位类型。Schemastery 推导出的内部双重类型未同步，`Config` 的深层推导类型因此不含新字段；这是有意的取舍，配置经 YAML/设置界面写入，不依赖该推导类型。

`OPENROUTER_SERVICE_TIERS` 必须声明在 `profile` schema 之前：它是 `const`，放在后面会让 schema 求值触发 TDZ 错误。补丁已按此顺序生成。

## 0.2.2-rc.1 移植核对

本次只使用公开 npm registry 的 `@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.1` 构建包，未借用任何内部源码变体。上一系列的补丁不能直接复用：rc.1 的请求上下文转换新增 `updates.systemPromptUpdate === "in-history"` 参数，旧补丁的 payload hunk 会失败。新补丁在新版产物上重新生成，保留该参数、图片请求策略、原生请求 headers 和 replay 链，只增加同等档位逻辑。

- schema 与导出仍采用唯一文本锚点；helper 在 schema 前初始化。
- 档位在捕获的 profile/model 上解析，在解析凭据前拒绝不支持的协议；无档位时不附加 payload hook。
- 新版 pi-ai 依赖为 `^1.3.0`，开发测试固定 `1.3.0`。三种协议均实测五个档位与 null 不发送，使用 loopback 假服务截获真实 SDK 请求 body。
- 新版 Cordis 为 `~4.1.0`、loader/group/include 为 `~1.1.0`、Schemastery 为 `~3.19.0`；开发依赖同步升级，避免混用旧类身份。
- `listConfigurableProviders()`、`settingsNs/settingsPath`、`settings.describe({ redactSecrets: true })` 与带 revision 的 `settings.mutate()` 在 rc.1 保持兼容，原生设置回归通过。

验证补丁时从仓库根传 `--directory=<解包目录>`，并加 `--verbose` 确认实际检查两个文件；不要只在仓库的忽略缓存子目录执行 `git -C ... apply`，因为路径过滤可能跳过文件而返回成功。示例：

```powershell
New-Item -ItemType Directory -Force .cache/rc0221/pristine | Out-Null
npm pack @deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.1 --registry=https://registry.npmjs.org --pack-destination .cache/rc0221 --ignore-scripts
tar -xf .cache/rc0221/deepseek-ai-dsh-llm-pi-ai-0.2.2-rc.1.tgz -C .cache/rc0221/pristine
git apply --check --verbose --directory=.cache/rc0221/pristine/package patches/@deepseek-ai__dsh-llm-pi-ai@0.2.2-rc.1.patch
```

## 0.2.2-rc.2 移植核对

只使用公开 npm registry 的 `@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.2` 构建包（npm shasum `c73444916c4647bd8df1292d8820cf88c87da046`），在该原始产物上重新生成补丁。

- rc.2 的 `lib/index.js` 比 rc.1 新增 Anthropic thinking 的请求前缀绑定（`bindThinkingToPrefix`、`prefixDigests`，replay 状态新增 `prefixDigest`），并改为按前导 HTTP 状态码分类 pi-ai 错误，因此 rc.1 补丁第三个 hunk 无法套用。
- 新补丁保留上述逻辑：档位从捕获的 profile 解析，请求 body 注入在 `bindThinkingToPrefix` 之后，`onPayload` 只写顶层 `service_tier`；thinking 省略与档位注入互不干扰。
- `lib/types/config.d.ts` 与 rc.1 逐字节相同，类型片段保持一致；仍单独成文件以匹配 pnpm 的精确版本键。
- 生成方式：`.cache/port-rc3-tier.mjs` 与 `.cache/port-rc3-tier-dts.mjs` 在 rc.2 原始产物上做唯一命中替换，`node --check` 通过后以 `git diff --no-index --no-prefix` 生成，`git apply --check --verbose` 在原始包上通过。

## 0.2.2-rc.3 移植核对

只使用公开 npm registry 的 `@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.3` 构建包（npm shasum `ce694ea7f2c42849c177635e92adda82d9e9d799`）。

- rc.3 的 `lib/index.js` 与 `lib/types/config.d.ts` 与 rc.2 逐字节相同（`lib/index.js` SHA-256 `e956da3d7300e1426e13e14f47e6f981dd1ca345633a406568ee5058ad93e9d8`，137008 字节），rc.3 是纯版本号发布，没有请求准备、thinking 前缀绑定或错误分类上的改动。
- rc.2 补丁在 rc.3 原始产物上 `git apply --check --verbose` 直接通过（两个文件命中），因此 `@0.2.2-rc.3.patch` 与 `@0.2.2-rc.2.patch` 内容完全相同，只是为精确版本键单独成文件，与 rc.4／rc.5 的处理一致。
- 插件源码不需要修改；peer 范围与开发依赖同步扩展到 rc.3。

验证 rc.3 补丁：

```powershell
New-Item -ItemType Directory -Force .cache/rc0223/0.2.2-rc.3/pristine | Out-Null
npm pack @deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.3 --registry=https://registry.npmjs.org --pack-destination .cache/rc0223/0.2.2-rc.3 --ignore-scripts
tar -xf .cache/rc0223/0.2.2-rc.3/deepseek-ai-dsh-llm-pi-ai-0.2.2-rc.3.tgz -C .cache/rc0223/0.2.2-rc.3/pristine
git apply --check --verbose --directory=.cache/rc0223/0.2.2-rc.3/pristine/package patches/@deepseek-ai__dsh-llm-pi-ai@0.2.2-rc.3.patch
```

## 0.2.2-rc.2 补丁验证

验证补丁：

```powershell
New-Item -ItemType Directory -Force .cache/rc0222/0.2.2-rc.2/pristine | Out-Null
npm pack @deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.2 --registry=https://registry.npmjs.org --pack-destination .cache/rc0222/0.2.2-rc.2 --ignore-scripts
tar -xf .cache/rc0222/0.2.2-rc.2/deepseek-ai-dsh-llm-pi-ai-0.2.2-rc.2.tgz -C .cache/rc0222/0.2.2-rc.2/pristine
git apply --check --verbose --directory=.cache/rc0222/0.2.2-rc.2/pristine/package patches/@deepseek-ai__dsh-llm-pi-ai@0.2.2-rc.2.patch
```

## 0.2.3-alpha.1 适配候选

`0.2.3-alpha.1` 的官方 `lib/index.js` 与 `lib/types/config.d.ts` 均已变化。RC5 补丁的档位逻辑和类型片段仍能匹配，但最后一个 hunk 依赖已移除的上游 `recordKeyFor` 导出。新补丁基于 alpha.1 的原始产物生成，只额外导出 `OPENROUTER_SERVICE_TIERS`，不恢复 `recordKeyFor`，保留上游图片处理和 thinking 请求前缀绑定。

原始 tarball 按 npm SHA-1 / SHA-512 校验；`git apply --check --verbose` 命中两个目标文件。此补丁不修复宿主的 Cordis / Loader 启动错误；未修改宿主官方依赖时仍无法完成 alpha.1 端到端验证，详见[验证记录](../validation/native-tier.md#未发布023-alpha1-适配候选)。

## 0.2.3-alpha.2 适配

官方 alpha.2 的 `lib/index.js`、`lib/types/config.d.ts` 与 alpha.1 逐字节相同，两版补丁内容相同，文件名和 pnpm 的 `patchedDependencies` 键仍必须绑定各自版本。alpha.2 的官方 Cordis / Loader 更新已解决 alpha.1 发行的初始化 ABI 错误；补丁无需更改 Cordis 或 Typert。见[验证记录](../validation/native-tier.md#023-alpha2-适配)。

## 使用 npm 补丁

在实际负责解析原生包的 pnpm 项目中，将版本限定的补丁登记到 `pnpm-workspace.yaml` 的 `patchedDependencies`，再运行 `pnpm install` 并重启 Host：

```yaml
patchedDependencies:
  '@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.1': /absolute/path/to/patches/@deepseek-ai__dsh-llm-pi-ai@0.2.2-rc.1.patch
```

`0.2.2-rc.1` 至 `0.2.2-rc.5`、`0.2.3-alpha.2` 分别使用对应版本的键与文件；alpha.1 补丁仅作为兼容候选提供。pnpm 会因登记了补丁却没有对应依赖版本而报 `ERR_PNPM_UNUSED_PATCH`，所以只登记宿主实际安装的版本。本仓库的开发验证使用 `0.2.2-rc.5`。

不要手改 `node_modules`；插件自身的开发依赖补丁不等于运行宿主已打补丁。替换补丁内容后，pnpm 可能复用旧的补丁结果，需要删除该包的 `node_modules` 条目或重建依赖树才会重新应用。

参见[插件 README](../README.md)的安装步骤。本仓库的 `npm run check` 使用 `0.2.2-rc.5` 开发依赖与对应补丁；`npm run test:matrix` 覆盖 `0.2.2-rc.1` 至 `0.2.2-rc.5` 和 `0.2.3-alpha.2`。rc.4 与 rc.5 使用基于相同官方产物生成的独立版本键补丁；其余版本补丁功能等价，随包发布供对应版本宿主使用。
