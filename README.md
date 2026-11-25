# OpenRouter 服务等级

[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](./LICENSE)

`@shenjackyuanjie/dsh-openrouter-service-tier`：控制 DeepSeek Harness **原生 `openrouter`** provider 的 service tier（请求档位）。插件不注册独立 adapter、不新增模型目录，thinking、认证、消息、工具、附件、replay、取消、超时与重试全部走宿主原生调用链；档位通过 `/openrouter-tier` 命令、`openrouter_service_tier` Agent 工具或原生设置入口修改。

## 展示

![`/openrouter-tier` 命令与档位效果（示意图）](./docs/openrouter-tier-command.png)

> 上图为界面示意图，非真实运行截图，效果以实际插件输出为准。

## 安装

### 从 GitHub 源码安装

仓库不提交 `lib/` 构建产物，从源码安装会在本机执行构建。pnpm 默认拦截 git 包执行构建脚本，因此需要两步：

1. 先执行安装，让它打印精确的 `allowBuilds` 键：

```powershell
dsh plugin --profile web add github:shenjackyuanjie/dsh-openrouter-service-tier#main
```

这次会以 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 结束，并在 `help:` 中给出形如下面的键：

```yaml
allowBuilds:
  '@shenjackyuanjie/dsh-openrouter-service-tier@https://codeload.github.com/shenjackyuanjie/dsh-openrouter-service-tier/tar.gz/<commit>: true
```

`<commit>` 是本次解析到的提交，改分支或改版本后会变；复制 pnpm 实际打印的键，不要手写。只写包名不会生效。

2. 把该键写进 profile 的 `pnpm-workspace.yaml`（与 `packages`、`nodeLinker` 同级），再重跑同一条安装命令。构建会下载 `typescript`、`@types/node`、`prettier` 等开发依赖，首次约二十秒，网络慢时更久。

`#main` 跟随主分支。`v0.5.0` 标签早于本次构建支持，固定到该标签会在构建阶段失败；需要固定版本时改用下面的 Release 附件或 GitHub Packages。安装完成后仍需按[宿主要求](#宿主要求)登记补丁。

### 从 GitHub Release 附件安装

Release 附件是发版时构建好的完整包，内含 `lib/`、`patches/`、`cordis.patch.yml` 与 locale 资源。安装不需要 GitHub 认证，也不会触发构建或要求批准构建脚本：

```powershell
dsh plugin --profile web add https://github.com/shenjackyuanjie/dsh-openrouter-service-tier/releases/download/v0.5.0/shenjackyuanjie-dsh-openrouter-service-tier-0.5.0.tgz --ignore-scripts
```

把 `web` 换成实际 profile。安装后仍需按[宿主要求](#宿主要求)为当前宿主版本登记 `patchedDependencies` 补丁；未打补丁时命令与工具会拒绝修改档位。

### 从 GitHub Packages 安装

包发布在 GitHub Packages，安装公开包也需要认证。准备一个具备 `read:packages` 的 classic PAT，在本机终端登录（不要提交 token）：

```powershell
npm config set '@shenjackyuanjie:registry' 'https://npm.pkg.github.com' --location=user
npm login --scope=@shenjackyuanjie --auth-type=legacy --registry=https://npm.pkg.github.com
dsh plugin --profile web add @shenjackyuanjie/dsh-openrouter-service-tier@0.5.0 --ignore-scripts
```

Username 填 GitHub 用户名，Password 填 PAT；其他 scope 的依赖仍从原 npm registry 获取，认证方法参见 [GitHub npm registry 说明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。首次安装后需在插件管理器启用该 bundle；安装 overlay 只插入配置为空的控制插件，不新增/禁用 provider，也不会默认把请求改为 flex。更换宿主或插件代码后重启 Host，之后的档位修改通过原生 volatile 热更新生效。

### 安装本地 tarball

安装本地 tarball 不需要 GitHub 认证：

```powershell
dsh plugin --profile web add D:\path\shenjackyuanjie-dsh-openrouter-service-tier-0.5.0.tgz --ignore-scripts
```

## 宿主要求

- 支持宿主 `0.2.2-rc.1`、`0.2.2-rc.2`、`0.2.2-rc.3`、`0.2.2-rc.4` 与 `0.2.2-rc.5`。每个版本都需要匹配的 `llm-pi-ai` 档位补丁；补丁随包发布，不要混用。`0.2.2-rc.3`、`0.2.2-rc.4` 与 `0.2.2-rc.5` 的产物逐字节相同，只是补丁版本键不同。未打补丁时，命令与工具会拒绝修改档位。
- 插件 `0.5.0` 移除了 DSH `0.2.1` 支持。仍使用该系列的用户可继续使用 [插件 `0.4.7`](https://github.com/shenjackyuanjie/dsh-openrouter-service-tier/releases/tag/v0.4.7) 的匹配补丁。
- `0.5.0` 另支持 DSH `0.2.3-alpha.2`，需要对应的新 Cordis 和精确版本档位补丁。官方 alpha.2 CLI 要求 Node `^24.22.3 || >=26.13.1`。`0.2.3-alpha.1` 仍附有插件级补丁，但官方 npm CLI 在装载 profile 前因 Cordis ABI 不匹配而退出，不建议使用该宿主版本。见[验证记录](./validation/native-tier.md#023-alpha2-适配)。
- 补丁登记在实际解析 `@deepseek-ai/dsh-llm-pi-ai` 的 pnpm 项目中，运行 `pnpm install` 并重启 Host：

```yaml
patchedDependencies:
  '@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.5': /absolute/path/to/patches/@deepseek-ai__dsh-llm-pi-ai@0.2.2-rc.5.patch
```

对每个受支持的宿主，键与补丁文件名都使用对应的精确版本。只登记宿主实际安装的版本（pnpm 会拒绝没有对应依赖的补丁登记），不要手改 `node_modules`。补丁内容与移植说明见 [patches/README.md](./patches/README.md)。

## 使用

先在原生模型设置中启用并配置 OpenRouter。插件通过 `ctx.llm.listConfigurableProviders()` 动态定位原生 namespace 与 profile 路径，不硬编码实例 ID、不补建 profile、不读取或修改凭据。

`/openrouter-tier` 命令：

- `/openrouter-tier`（无参数，或 `list` / `help`）：查看当前全局档位与按模型覆盖
- `/openrouter-tier flex`：设置全局档位，可用 `default` / `flex` / `priority` / `fast` / `ultrafast` / `omit`
- `/openrouter-tier openai/gpt-6-luna priority`：只覆盖该模型
- `/openrouter-tier openai/gpt-6-luna omit`：该模型不发送 `service_tier`
- `/openrouter-tier reset`：清除全局覆盖，恢复底层继承
- `/openrouter-tier openai/gpt-6-luna reset`：删除该模型的有效覆盖（写空数组，屏蔽底层覆盖数组）

`openrouter_service_tier` Agent 工具：`get` 读取当前档位；`set` 写入（`tier` 取上述档位值，可加 `model` 只覆盖某模型）；`reset` 恢复全局继承或删除模型覆盖。`set` / `reset` 必须带 `expectedRevision`，即最近一次 `get` 返回的原生 namespace revision，用于防止并发覆盖，冲突时明确失败。工具返回档位、revision 与适用说明，不投影 headers 或其他连接设置。

档位修改影响当前 profile 所有会话的新准备请求；已 prepare 或进行中的请求保持原快照。插件停用只撤回命令与工具，不清空原生档位、不移除模型。

### 档位语义

有效优先级：`精确模型覆盖 > 全局档位 > 不发送`。

- 模型 `omit` 屏蔽全局档位；全局 null（`omit`）不屏蔽模型的显式 priority。
- `reset` / `inherit` 指恢复底层继承，可能重新得到 flex；`omit` / null 才是显式不发送。
- 空数组屏蔽底层覆盖数组；清除整个 `modelServiceTiers` 字段则恢复底层数组。

协议值为 `default`、`flex`、`priority`、`fast`、`ultrafast`，`fast` 是 `priority` 的别名；费用与可用性以实际服务为准。宿主只在原生 OpenRouter 的 Chat Completions、Responses、Anthropic Messages 请求 body 顶层写 `service_tier`，无有效档位时不加 hook，也从不发送 inherit / omit / null。参见 [OpenRouter service tiers 文档](https://openrouter.ai/docs/guides/features/service-tiers)。

新增或修改模型覆盖时，模型必须在当前原生 OpenRouter 目录中（含非 Chat 模型）；失效覆盖不会被静默当作有效配置，但删除失效覆盖仍可用于修复。

### 设置入口

档位通过**原生 `llm-pi-ai` 插件设置入口**、`/openrouter-tier` 命令或 `openrouter_service_tier` 工具修改。本插件没有专用设置面板、客户端 bundle 或自己的档位 namespace，控制插件配置固定为 `{}`。

在原生 `llm-pi-ai` 设置中找到 `providers.openrouter`，档位配置如下（需要先安装对应宿主版本的补丁）：

| 设置       | 原生配置字段                             | 取值与行为                                                                                         |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 全局档位   | `providers.openrouter.serviceTier`       | `default` / `flex` / `priority` / `fast` / `ultrafast`；`null` 表示显式不发送全局档位。            |
| 按模型覆盖 | `providers.openrouter.modelServiceTiers` | 数组，每项为 `{ model, tier }`；`model` 为精确模型 ID，`tier` 还可用 `omit` 屏蔽该模型的全局档位。 |

两个字段默认均不设置，沿用底层配置；没有继承值时不发送 `service_tier`。命令或工具中的全局 `omit` 会写入 `serviceTier: null`，模型 `omit` 则写入该模型的 `tier: 'omit'`。`default` 是实际发送给 OpenRouter 的档位值，不等于恢复继承或不发送。

例如，先执行 `/openrouter-tier flex`，再执行 `/openrouter-tier openai/gpt-6-luna priority`，就会让该模型使用 priority，其他模型使用 flex。需要让某个模型完全不带档位时使用模型 `omit`；要恢复全局底层继承时使用 `/openrouter-tier reset`。保存后无需重启，只影响新准备的请求。

## 升级

### 插件 0.4.7 → 0.5.0

DSH `0.2.1` 用户请继续使用 `0.4.7`。DSH `0.2.2-rc.1` 至 `0.2.2-rc.5` 可继续使用原来的对应版本补丁。升级宿主到 `0.2.3-alpha.2` 时，先确认 Node 符合官方 CLI 要求，再把宿主的 `patchedDependencies` 键和补丁文件一起换成 `0.2.3-alpha.2`；运行 `pnpm install` 后重启 Host。

### 插件 0.4.6 → 0.4.7

1. 安装新版本 tgz（Release 附件、本地 tgz 或 GitHub Packages 均可），或按上面的命令安装 `@0.4.7`。
2. 在插件管理器中停用再启用该 bundle，让前端与命令重新加载。

### 宿主 0.2.2-rc.3 → 0.2.2-rc.4 / rc.5

1. 升级宿主后，把 pnpm 项目里 `patchedDependencies` 的键与文件从 `0.2.2-rc.3` 换成 `0.2.2-rc.4` 或 `0.2.2-rc.5`，只保留宿主实际安装的那一条。
2. 运行 `pnpm install`。`0.2.2-rc.4` 与 `0.2.2-rc.5` 的 `dsh-llm-pi-ai` 产物与 `0.2.2-rc.3` 逐字节相同，补丁内容一致，只是 pnpm 的补丁键绑定精确版本号。
3. 重启 Host，执行 `/openrouter-tier` 确认档位可读写。

rc.1 → rc.2 的补丁重生成历史见 [补丁说明](./patches/README.md)：rc.2 在请求准备阶段新增 Anthropic thinking 的请求前缀绑定；档位从捕获的 profile 解析，请求 body 注入在绑定之后，由 `streamSimple` 的 `onPayload` 写入 `service_tier`。两者互不改写对方的请求上下文。rc.3、rc.4 与 rc.5 沿用同一份补丁内容。

## 开发与验证

要求 Node `>=22.19.0`，开发使用 pnpm 11；开发依赖与离线测试固定 `0.2.2-rc.5` 及对应补丁（Cordis `4.1.0`、loader/group/include `1.1.0`、Schemastery `3.19.0`、pi-ai `1.3.0`），不改变用户宿主。

```powershell
pnpm install --frozen-lockfile --ignore-scripts
npm run check
```

`npm run check` 覆盖 rc.5；`npm run test:matrix` 用官方 tarball 在隔离目录分别跑 `0.2.2-rc.1`、`0.2.2-rc.2`、`0.2.2-rc.3`、`0.2.2-rc.4`、`0.2.2-rc.5` 与 `0.2.3-alpha.2`；`npm run test:matrix -- 0.2.3-alpha.1` 单独检查 alpha.1（目前会复现上游启动失败）。`npm run check` 依次执行 `format:check`（Prettier 格式检查）、`typecheck`（类型检查）与离线测试（构建后 `node --test`，覆盖 Loader / LLM / Settings 回归与 zh/en locale、图标等显示资源）。改写格式运行 `npm run format`。真实宿主与请求的验收记录见 [validation/native-tier.md](./validation/native-tier.md)。

## 发布

当前为手动发版，不依赖 CI：

1. `pnpm install --frozen-lockfile --ignore-scripts`，再执行 `npm run check`。
2. `pnpm pack --pack-destination <目录>` 生成 tgz（`prepack` 会先运行 `npm run build`，产物含 `lib/`）；解包确认 `lib/`、`patches/`、`cordis.patch.yml` 与 locale 资源齐全，记录 SHA-256。
3. `pnpm publish --registry=https://npm.pkg.github.com --access public --ignore-scripts` 发布到 GitHub Packages。
4. 打 tag，创建 GitHub Release，再用 `gh release upload <tag> <tgz>` 把同一份归档上传为附件（不加 `--clobber`）。
5. 用 `gh release view <tag> --json assets` 核对附件名称、大小与 SHA-256，然后把 README 安装段的附件 URL 指向该 tag。

## 许可证

本项目以 [GNU GPL-3.0-or-later 许可证](./LICENSE)发布，Copyright (c) 2026 shenjackyuanjie。
