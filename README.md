# OpenRouter 服务等级

[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](./LICENSE)

`@shenjackyuanjie/dsh-openrouter-service-tier`：控制 DeepSeek Harness **原生 `openrouter`** provider 的 service tier（请求档位）。插件不注册独立 adapter、不新增模型目录，thinking、认证、消息、工具、附件、replay、取消、超时与重试全部走宿主原生调用链；档位通过 `/openrouter-tier` 命令、`openrouter_service_tier` Agent 工具或原生设置入口修改。

## 展示

![`/openrouter-tier` 命令与档位效果（示意图）](./docs/openrouter-tier-command.png)

> 上图为界面示意图，非真实运行截图，效果以实际插件输出为准。

## 宿主要求

- 支持宿主 `0.2.1-rc.2`、`0.2.1-rc.3` 与 `0.2.1-rc.4`，每个版本都需要匹配版本的 `llm-pi-ai` 档位补丁；补丁随包发布，不要混用。未打补丁时命令与工具会明确拒绝，不会假报配置成功。
- 补丁登记在实际解析 `@deepseek-ai/dsh-llm-pi-ai` 的 pnpm 项目中，运行 `pnpm install` 并重启 Host：

```yaml
patchedDependencies:
  '@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.3': /absolute/path/to/patches/@deepseek-ai__dsh-llm-pi-ai@0.2.1-rc.3.patch
```

宿主是 `0.2.1-rc.2` 或 `0.2.1-rc.4` 时，键与文件都换成对应版本。只登记宿主实际安装的版本（pnpm 会把没有对应依赖的补丁登记报错），不要手改 `node_modules`。补丁内容与移植说明见 [patches/README.md](./patches/README.md)。

## 安装

包发布在 GitHub Packages，安装公开包也需要认证。准备一个具备 `read:packages` 的 classic PAT，在本机终端登录（不要提交 token）：

```powershell
npm config set '@shenjackyuanjie:registry' 'https://npm.pkg.github.com' --location=user
npm login --scope=@shenjackyuanjie --auth-type=legacy --registry=https://npm.pkg.github.com
dsh plugin --profile web add @shenjackyuanjie/dsh-openrouter-service-tier@0.4.1 --ignore-scripts
```

Username 填 GitHub 用户名，Password 填 PAT；其他 scope 的依赖仍从原 npm registry 获取，认证方法参见 [GitHub npm registry 说明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。首次安装后需在插件管理器启用该 bundle；安装 overlay 只插入配置为空的控制插件，不新增/禁用 provider，也不会默认把请求改为 flex。更换宿主或插件代码后重启 Host，之后的档位修改通过原生 volatile 热更新生效。

本地 tarball 安装不需要 GitHub 认证（先 `npm run build` 产出 `lib/`，再打包得到 tarball）：

```powershell
dsh plugin --profile web add D:\path\shenjackyuanjie-dsh-openrouter-service-tier-0.4.1.tgz --ignore-scripts
```

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

## 开发与验证

要求 Node `>=22.19.0`，开发使用 pnpm 11；开发依赖与离线测试固定 `0.2.1-rc.3` 及对应补丁，不改变用户宿主。

```powershell
pnpm install --frozen-lockfile --ignore-scripts
npm run check
```

`npm run check` 依次执行 `format:check`（Prettier 格式检查）、`typecheck`（类型检查）与离线测试（构建后 `node --test`，覆盖 Loader / LLM / Settings 回归与 zh/en locale、图标等显示资源）。改写格式运行 `npm run format`。真实宿主与请求的验收记录见 [validation/native-tier.md](./validation/native-tier.md)。

## 许可证

本项目以 [GNU GPL-3.0-or-later 许可证](./LICENSE)发布，Copyright (c) 2026 shenjackyuanjie。
