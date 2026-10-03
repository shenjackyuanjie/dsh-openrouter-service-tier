# dsh-openrouter-service-tier

为 DeepSeek Harness（DSH）提供独立 OpenRouter 服务档位路由，以及插件管理页面中的中文 tier 选择器。

**当前版本 `0.2.1`。** 不修改 DSH、不启动代理、不复制协议适配器。默认 bundle 注册 `openrouter-tier`，请求 `flex`；模型来自 pi-ai 的 OpenRouter Chat Completions 目录，**不固定 Luna、不统一强设 high thinking**。原 `openrouter` 路由不受影响，使用本插件需要选择独立路由。

## 插件管理页面

入口：**左侧「插件」→「OpenRouter 服务档位」→组件行的「配置」**。

选择器由 `plugins.row.config` 公开 slot 提供，不替换插件管理器或原 Models 编辑器。页面包含中文档位名称、成本/延迟说明、作用范围、保存结果与错误反馈；也提供对应英文翻译，随宿主语言切换。

| 选择 | 请求行为 | 主要取舍 |
| --- | --- | --- |
| 不发送 tier 参数 | 不携带 `service_tier` | 由 OpenRouter 的模型、路由与账户规则决定 |
| 标准（`default`） | 请求标准档位 | 标准容量和价格 |
| 弹性（`flex`） | 请求 flex | 通常更便宜，但延迟和容量风险更高 |
| 优先（`priority`） | 请求优先档位 | 可能更快、更可靠，也可能更贵 |
| 快速（`fast`） | priority 的别名 | 与 priority 相同的取舍 |
| 极速（`ultrafast`） | 请求极速档位 | 仅部分模型支持，费用可能是标准档的数倍 |

### 保存和恢复默认

- 下拉选择只改变本页草稿，**点击「保存」才会持久化**。离开页面不保存则丢弃草稿。
- 保存只写 `serviceTier`，不改 key、模型列表、thinking 或其他连接配置。
- 修改影响**当前 profile 所有会话的后续请求**，不是单个会话偏好。正在进行或已经 prepare 的请求保留原档位。
- 「不发送 tier 参数」保存为显式 `serviceTier: null`，覆盖 bundle 的 flex 默认值。
- 「恢复默认」清除该字段的用户覆盖，重新继承 bundle/上层配置；默认 bundle 为 flex，**不等同于不发送参数**。
- 保存期间禁止重复操作；并发修改会按读取时的 revision 检查，不静默覆盖他人配置。拒绝或网络失败显示中文错误，保留草稿供重试，不显示虚假成功。
- 配置不可用、只读连接或浏览器 memory 模式不能写入 Host，页面会明确提示。
- tier 是请求选择，不是实际计费保证。请以 OpenRouter 日志中的实际档位与费用为准。

第一版未增加会话级按钮、原 Models 页 tier 控件、实际 tier/费用展示或原 provider 配置继承。

## 工作方式

```text
DSH llm 服务
  └─ openrouter-tier（插件独立路由）
      └─ 公开 PiAiAdapter
          └─ 包装 pi-ai OpenRouter provider
              └─ 现有 Chat Completions 协议实现
                  └─ onPayload 添加顶层 service_tier
```

消息转换、thinking、工具调用、流式解析、replay、取消、超时和附件转换由现有 `@deepseek-ai/dsh-llm-pi-ai` 与 pi-ai 负责。插件仅装配公开 profile、按请求解析凭据、包装 provider，并用 Cordis effect 注册与卸载贡献。

`stream`、`streamSimple` 两个入口都包装。原 `onPayload` 先执行，可异步、原地修改或返回替换对象；最后注入插件拥有的 tier。未设置 tier 或显式设置为 null 时，不添加 hook，不强制 default。

## 构建与安装

要求 Node `>=22.19.0`，开发使用 pnpm 11。本项目独立于 Harness workspace，不会自动升级宿主。

```powershell
cd D:\githubs\deepseek\dsh-openrouter-service-tier
npx --yes pnpm@11.0.0 install --frozen-lockfile --ignore-scripts
npm run check
```

构建产生 `lib/`。没有自动执行的 install/build 脚本，安装前必须构建。首次可以通过 Harness Plugin Manager 安装该目录的绝对路径。

已安装本地链接再使用相同路径时，管理器可能返回 `ambiguous-install`；升级建议安装新版本 tarball：

```powershell
npm pack --ignore-scripts --pack-destination .cache
```

再通过 `plugin_manager` 工具调用：

```json
{
  "action": "install_bundle",
  "target": "D:\\githubs\\deepseek\\dsh-openrouter-service-tier\\.cache\\dsh-openrouter-service-tier-0.2.1.tgz"
}
```

上面是工具参数，不是 PowerShell 命令。也可在插件管理器安装界面输入 tarball 的实际绝对路径。以返回的 `application` 与 `warnings` 为准：`applied` 为热生效，**`restart-required` 需要重启 Harness**。刷新网页不等于重启 Host；更换已加载包代码通常需要重启。

安装影响当前 profile 的所有会话，插件行 id 为 `openrouter-service-tier`。宿主依赖声明为 peers，不将宿主代码打包进产物；pi-ai 固定为 `0.87.1`。本地目录可能使用开发依赖，不保证自动继承 Harness 的 pi-ai 补丁；tarball 安装由宿主解析 peers。处理多 MB 工具参数时，应确认实际 pi-ai 带有 Harness 的工具参数解析性能补丁。

### 当前安装状态

`0.2.1` 已安装到当前 `web` profile，用户已重启并重新连接。重启后的 Host Inspect 确认 `serviceTier` 为 volatile 字段，Client Inspect 确认 `plugins.row.config` 中本插件的选择器注册为 active。配置工具实际执行 `get` 返回当前 `flex`、revision 0；核验过程没有修改档位或发送模型请求。

没有浏览器控制，尚未验证实际页面布局、console、明暗主题或通过页面点击保存的 profile YAML 端到端写入。实时 slot 注册是已加载的证据，不替代视觉验证。

## 模型与配置

在 Harness credentials 服务中配置名为 `OPENROUTER_API_KEY` 的凭据引用，使用模型选择机制选择 `openrouter-tier` 与其目录中的模型。它是引用名，不是 key 本身。

默认 bundle 不再硬编码模型或 thinking：

```yaml
- insert:
    - id: openrouter-service-tier
      name: dsh-openrouter-service-tier
      config:
        provider: openrouter-tier
        apiKeyEnv: OPENROUTER_API_KEY
        serviceTier: flex
```

用户覆盖使用同一行 id；下面只展示最小配置，不指定模型：

```yaml
- id: openrouter-service-tier
  config:
    provider: openrouter-tier
    apiKeyEnv: OPENROUTER_API_KEY
    serviceTier: flex
```

手工替换整个 `config` 不做字段深合并；UI 保存使用字段级 mutation，会保留所有未编辑字段。

| 字段 | schema 默认值 | 说明 |
| --- | --- | --- |
| `provider` | `openrouter-tier` | 小写连字符独立路由；禁止 `openrouter`，重复路由由 LLM 拒绝 |
| `apiKeyEnv` | `OPENROUTER_API_KEY` | credentials 服务的 POSIX identifier 引用，不可填实际密钥 |
| `serviceTier` | 不设置 | 可热更新；支持上述五个协议值，null 表示不发送。默认 bundle 显式为 flex |
| `models` | 当前固定 pi-ai OpenRouter 目录中的所有 Chat Completions 模型 | 可用非空、不重复的显式 ID 列表缩小范围。未知或非 Chat Completions 模型拒绝，不虚构能力 |
| `reasoning` | 不设置 | `off/minimal/low/medium/high/xhigh/max`，由模型能力约束；优先使用请求中的档位 |
| `baseURL` | 模型目录中的 OpenRouter URL | 可选可信 HTTP(S) API 根地址，禁止 userinfo、查询参数与片段。自定义地址会收到引用的凭据 |
| `timeoutMs` | SDK 默认 | 非负整数，请求级 SDK 超时；0 的语义由上游决定 |
| `streamIdleTimeoutMs` | `300000` | 有限正数，最大 `2147483647`，等待下一个事件的 idle 上限 |

只有 `serviceTier` 是 UI 可编辑 volatile 字段；连接、模型与其他配置仍通过普通配置管理。默认模型列表从 provider 目录计算，不是手写 ID 清单。Luna 只出现在测试与历史真实验证记录中。

### 凭据与生命周期

- 核心依赖 `llm`、`credentials`。缺服务时等待依赖，不自行回退。
- 每次请求 `credentials.resolve(ref)`；缺失或空值为 `MISSING_CREDENTIAL`，无效值为 `INVALID_CREDENTIAL`。不使用 pi-ai OAuth、其他账户环境或文件发现，不写授权记录。
- credentials 服务可按宿主规则解析同名环境/文件引用；插件不直接读取本地凭据、不缓存 key、不输出 key。
- tier 热更新保持同一 adapter，按下一次操作构造新 profile/provider 快照，旧请求继续使用旧快照。
- 普通字段变化由 Loader 重建；字段校验在卸载前拒绝非法候选。Loader raw entry 可能保留失败候选，应修正后重新保存，不承诺原始配置自动回滚。
- 仅 tier 更新不更换 adapter，可保留同 adapter replay 语义；普通字段重建后的跨实例历史可能由 Harness 降级为 provider-neutral 内容。
- 停用或卸载释放路由、Client slot 与配置工具，不主动取消已经准备的请求；调用者通过 signal 取消。

## Agent 配置工具

宿主同时提供 `settings` 和 `tools` 时，注册 `openrouter_service_tier`。它和 UI 都调用 **宿主 `settings.mutate`**，不另建配置文件或持久化实现。

- `get`：读取当前 tier 与 revision，不读取 key、不发送模型请求。
- `set`：指定 tier 和最近读取的 `expectedRevision`；`omit` 表示不发送参数。修改影响当前 profile 所有会话，优先/极速档位可能增加费用。
- `reset`：提供 `expectedRevision`，恢复继承默认值。
- 没有这些可选服务时，核心路由仍可运行，不额外装配业务依赖。

## 验证

```powershell
npm run check
node scripts/test-alpha.mjs
node --check client.js
npm pack --dry-run --ignore-scripts
```

主依赖由 [pnpm-lock.yaml](./pnpm-lock.yaml) 固定。alpha 脚本只在本项目 `.compat/alpha/` 构造隔离组合，不升级宿主或修改 profile。

| DSH 组件版本 | Cordis | Schemastery | Loader | pi-ai | 离线测试 |
| --- | --- | --- | --- | --- | --- |
| `0.2.0-rc.2` | `4.0.4` | `3.18.4` | `1.0.5` | `0.87.1` | 24/24 通过 |
| `0.2.1-alpha.1` | `4.0.5-alpha.1` | `3.18.5-alpha.1` | `1.0.6-alpha.1` | `0.87.1` | 24/24 通过 |

覆盖真实 Loader/LLM/adapter 及本地假 HTTP/SSE 的 flex + high、thinking/文本/usage、工具与 replay；凭据失败、配置错误、取消/超时、冲突和卸载；默认目录不固定模型；真实 Settings 的 tier 热更新、revision 冲突、旧请求快照与工具清理。

UI 行为测试使用真实 React，验证中文说明、主题 token、草稿、保存/重置、null 省略语义、拒绝/网络错误、只读/memory、并发版本与重复提交。持久化边界使用独立测试文件的 configEditor 替身，**不是用户 profile 的端到端 YAML 写入测试**。测试不访问真实 API 或凭据。`react-test-renderer` 会报告弃用警告，但只在开发测试中使用，不打包进浏览器。

本次 UI 开发的证据与未完成的页面核验见 [选择器验证报告](./validation/ui-selector.md)。

### 真实请求记录

旧版路由经用户授权完成两条 `openai/gpt-6-luna` 请求，flex + high，合计 314 tokens。用户随后在 OpenRouter logs 确认实际为 flex；自动 generation 查询为 404，未取得具体费用。两个响应没有可见 reasoning delta，不能宣称真实 thinking 展示通过。完整记录见 [真实请求验证](./validation/live-smoke.md)。本次 UI 开发没有新增付费请求。

## 限制

- 只请求所选 tier，不保证每次实际服务/价格。模型完全没有 flex 节点时仍可能标准路由；UI 中有明确说明，不实施严格 flex 模式。
- 当前仅支持 Chat Completions，不提供 Responses/Anthropic Messages、按模型覆盖、自动 tier 降级或原 provider 接管。
- 附件转换委托给 PiAiAdapter，但真实图片/附件未覆盖；上游限制例如 `GenerateOptions.stop` 不支持仍保留。
- 已验证匹配公开组件的离线组合，不等于两版完整 Web/CLI、明暗主题视觉或真实工具/多轮/图片全部端到端通过。

## 参考

- [OpenRouter service tiers](https://openrouter.ai/docs/guides/features/service-tiers)
- [DSH 两版比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1)
- [pi-ai](https://github.com/earendil-works/pi)
