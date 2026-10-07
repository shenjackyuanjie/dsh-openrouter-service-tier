# dsh-openrouter-service-tier

`0.3.0`：控制 DeepSeek Harness **原生 `openrouter`** 请求档位，不注册独立 adapter 或第二套模型目录。thinking、认证、消息、工具、附件、replay、取消、超时与重试走宿主原生调用链。

## 宿主要求

支持 `0.2.0-rc.2` 与 `0.2.1-alpha.1`，两版均需对应的 `llm-pi-ai` 原生档位补丁。插件不是宿主升级器；未打补丁时工具和命令明确拒绝，不会假报配置成功。不能把 alpha 整包装进 rc.2。

[`patches/`](./patches/) 提供固定版本的 package-manager 补丁。实际加载独立 npm 包的宿主可在所属 pnpm 项目的 `patchedDependencies` 中配置对应补丁，再运行 `pnpm install` 并重启。宿主若内联该包，必须修改对应版本源码并重新构建宿主；单独 patch 一个未加载的依赖无效。禁止手改 `node_modules` 或共享 store。

```yaml
patchedDependencies:
  '@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.2': /absolute/path/to/patches/@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch
```

使用 alpha 时改为 `0.2.1-alpha.1` 和对应文件。源码补丁及构建说明见 [补丁说明](./patches/README.md)，本机验收见 [原生方案验证](./validation/native-tier.md)。

## 使用

先在原生模型设置启用 OpenRouter。本插件通过 `ctx.llm.listConfigurableProviders()` 动态定位其 namespace 和 profile 路径，不硬编码实例 ID，不补建 profile，不读取或修改凭据。

- `/openrouter-tier`：查看原生档位。
- `/openrouter-tier flex`：全局 flex。
- `/openrouter-tier openai/gpt-6-luna priority`：只覆盖该模型。
- `/openrouter-tier openai/gpt-6-luna omit`：该模型不发送 tier。
- `/openrouter-tier omit`：全局不发送（保存为 null）。
- `/openrouter-tier reset`：清除全局用户覆盖，恢复底层继承。
- `/openrouter-tier openai/gpt-6-luna reset`：删除该模型的有效覆盖；最后一项删除后写空数组，屏蔽底层覆盖数组。

Agent 工具名为 `openrouter_service_tier`，支持 `get`、`set`、`reset`。修改前先 `get`，携带返回的 **原生 namespace revision** 作为 `expectedRevision`；并发冲突明确失败。结果只包含档位和 revision，不投影 headers 或其他连接设置。

修改影响当前 profile 所有会话的**新准备请求**；已 prepare 或进行中的请求保持原快照。插件停用只撤回命令与工具，不清空原生档位、不移除模型。

### 档位语义

有效优先级是 `精确模型覆盖 > 全局档位 > 不发送`。模型 `omit` 屏蔽全局档位；全局 null 不屏蔽模型显式 priority。`unset` 是恢复底层继承，可能重新得到 flex；null/omit 才是显式不发送。空数组屏蔽继承数组，清除整个数组字段则恢复底层数组。

协议值为 `default`、`flex`、`priority`、`fast`、`ultrafast`。`fast` 是 priority 别名；费用与可用性以实际服务为准，不保证按请求档位计费。宿主只在原生 OpenRouter 的 Chat Completions、Responses、Anthropic Messages 请求 body 顶层设置 `service_tier`，无有效档位不加 hook，不发 inherit/omit/null。参见 [OpenRouter 文档](https://openrouter.ai/docs/guides/features/service-tiers)。

模型覆盖按当前原生目录及用户配置动态校验，包括非 Chat 模型；失效覆盖不会静默当作有效配置，删除失效覆盖仍可用于修复。

### 设置入口

通过**原生 `llm-pi-ai` 插件设置入口**、命令或工具修改。本插件没有专用设置面板、客户端 bundle 或自己的档位 namespace，控制插件配置固定为 `{}`。

## 安装

包名：`@shenjackyuanjie/dsh-openrouter-service-tier`，registry：GitHub Packages。先按上文为宿主应用对应补丁。

GitHub npm registry 安装公开包也需要认证，使用具备 `read:packages` 的 classic PAT，在本机终端登录（不要提交 token）：

```powershell
npm config set '@shenjackyuanjie:registry' 'https://npm.pkg.github.com' --location=user
npm login --scope=@shenjackyuanjie --auth-type=legacy --registry=https://npm.pkg.github.com
dsh plugin --profile web add @shenjackyuanjie/dsh-openrouter-service-tier@0.3.0 --ignore-scripts
```

登录时 Username 填 GitHub 用户名，Password 填 PAT。其他 scope 的依赖继续从原 npm registry 获取。参见 [GitHub npm registry 认证说明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。

首次安装需在插件管理器启用该 bundle。安装 overlay 只插入配置为空的控制插件，不新增/禁用 provider，也不默认把原生请求改为 flex。更换宿主或插件代码后重启 Host；之后档位设置通过原生 volatile 热更新生效。

## 本地构建与打包

要求 Node `>=22.19.0`，开发使用 pnpm 11。开发依赖用 rc.2，并通过本仓库固定补丁进行离线测试；这不改变用户宿主。

```powershell
pnpm install --frozen-lockfile --ignore-scripts
npm run check
npm pack --ignore-scripts --pack-destination .cache
```

构建产生 `lib/`，安装前必须构建。将 tarball 安装到原 profile，例如：

```powershell
dsh plugin --profile web add D:\path\shenjackyuanjie-dsh-openrouter-service-tier-0.3.0.tgz --ignore-scripts
```

本地 tarball 安装不需要 GitHub registry 认证。

## 发布

包通过 `publishConfig` 限定发布到 GitHub Packages，并关联本仓库。使用具备 `write:packages` 的 classic PAT 认证后：

```powershell
npm run check
node scripts/test-alpha.mjs
npm publish
```

`prepack` 自动构建 `lib/`。首次发布后，在 GitHub Package settings 中确认包可见性为 Public；包的可见性不自动继承公开仓库。后续发布必须先更新版本号。

## 验证

`npm run check` 执行类型检查与离线 Loader、LLM、Settings 回归。`node scripts/test-alpha.mjs` 在 `.compat/alpha` 构造独立 alpha 组合并应用对应宿主补丁，不安装用户 profile。宿主相关测试、keyless snapshot、启动和真实请求的实际执行结果记录在 [原生方案验证](./validation/native-tier.md)。
