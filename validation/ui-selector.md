# 插件管理页 tier 选择器验证报告

## 实现范围

版本 `0.2.1`，位置为「插件 → OpenRouter 服务档位 → 组件行的配置」。使用公开 `plugins.row.config` slot，不修改 Harness、不导入其 Client UI 模块、不替换管理页面。

- 提供六个选项：不发送参数、default、flex、priority、fast、ultrafast。
- 各档位中文说明涵盖价格、延迟、容量和回退风险；明确请求档位不等于实际计费保证。
- 草稿只在保存时提交。成功、拒绝、网络错误、加载、不可用、只读和 memory 模式均有中文反馈。
- 带读取时 revision 的字段级 `form.mutate`；不更改 key、models、thinking。恢复默认与显式省略参数区分。
- volatile tier 保持 adapter，新请求使用新 provider 快照，已准备请求继续使用旧快照。
- Agent 工具与 UI 共用 Host `settings.mutate`，没有第二套持久化路径。
- 默认模型由 pi-ai OpenRouter Chat Completions 目录计算，bundle 与业务源码均不固定 Luna，也不统一 high。Luna 仅作为测试/历史验证对象。

## 已完成验证

| 配套公开组件 | 类型检查/构建 | 离线测试 |
| --- | --- | --- |
| DSH `0.2.0-rc.2` / Cordis `4.0.4` / Loader `1.0.5` / Schemastery `3.18.4` | 通过 | 32/32 |
| DSH `0.2.1-alpha.1` / Cordis `4.0.5-alpha.1` / Loader `1.0.6-alpha.1` / Schemastery `3.18.5-alpha.1` | 通过 | 32/32 |

两者均固定 pi-ai `0.87.1`。测试包含原协议回归、真实 React 的组件行为、真实 Settings + Loader 的字段热更新/版本冲突与配置工具卸载。配置写入边界使用本项目独立测试文件替身，不触碰真实 profile。

验证了保存前不写、保存只写 tier、错误不显示成功、并发版本不被覆盖、重复提交锁、只读不写、null 在请求中真正省略、不固定默认模型。一次验证发现的 null 被透传与嵌套依赖清理问题已修正，并有回归断言。

Client 只引用宿主 React，所有颜色使用已 inspect 的主题 tokens；中文与英文词条键集一致。`react-test-renderer` 的弃用警告属于测试依赖，不打包进浏览器。

## 安装与实时验证边界

升级初次返回 `restart-required`，用户随后已重启 Harness 并重新连接。已完成实时核验：

- 已安装 manifest 版本为 `0.2.1`。
- Host Inspect 确认 `serviceTier` 的 `x-cordis.volatile: true`，模型默认值为 provider 目录计算得到的列表，不再仅固定 Luna。
- Client Inspect 确认 `plugins.row.config` 中的 `dsh-openrouter-service-tier#openrouter-service-tier` 注册为 `active: true`。
- Agent 工具目录包含 `openrouter_service_tier`，实际 `get` 返回 namespace `openrouter-service-tier`、tier `flex`、revision 0；没有改动设置。
- 尝试通过当前 Session 的 subagent 模型发现入口读取 Luna 元数据，被 Session 的 provider 许可策略拒绝；没有绕过策略或扩展许可，不把该入口当作模型运行验证。

没有浏览器控制，未验证实际布局、console、明暗主题，也未通过真实页面点击保存来验证 profile YAML 端到端写入。不得把实时 slot 注册或 React 组件单元测试当作浏览器截图验证。

本次 UI 开发没有新增真实 OpenRouter 请求。此前真实 flex 的用户核验继续以 [真实请求报告](./live-smoke.md) 为准。

## 0.2.2：按模型覆盖、命令与冲突核查

在原有全局档位之外增加三件事，均验证过：

1. **按模型覆盖**。`modelServiceTiers` 是按模型覆盖的数组，优先级为 `该模型覆盖 > 全局档位 > 不发送`。覆盖里的 `omit` 让该模型即使有全局档位也不带 `service_tier`。覆盖表为空时清除字段而不是写空数组。测试用两个真实模型走完整请求流程，确认覆盖只影响目标模型、另一模型仍用全局值。
2. **`/openrouter-tier` 命令**。与 UI、Agent 工具共用宿主 `settings.mutate` 和 revision fence，支持查看、设置全局、设置单模型、`reset` 全局、`reset <模型>`。测试拒绝未知档位、未知模型与多余参数，并断言命令在卸载后移除。
3. **上游失败的可重试性核查**。宿主只重试适配器分类为可重试码的失败，分类依据是错误文本。本插件的 `retryPolicy` 显式声明 `EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT`，与宿主默认一致。假服务分别以 503 与 429 拒绝 flex 请求，实测失败落在 `SERVER` 与 `RATE_LIMIT`，两者都在可重试集合内，且失败请求同样携带所选档位。

已知限制：若上游只返回不含状态码的纯文本错误，会被分类为 `PI_AI_ERROR`，不属于默认可重试码，flex 容量恢复后不会自动重试。本插件不改写上游错误文本以伪造可重试性。

### 命名冲突核查

调查发现 `sagmans/dsh-provider-extra` 注册的命令名也是 `service-tier`。宿主命令注册表在重名时**抛错**而不是覆盖，因此若两边同名，后加载的插件会注册失败——装一个会弄坏另一个，且谁先加载取决于是 bundle 顺序，用户无法预期。

处理方式：本插件命令名改为带路由前缀的 `openrouter-tier`，把厂商中立的 `service-tier` 留给通用档位插件。测试中有一条断言专门禁止重新占用 `service-tier`。

同时确认了其余命名面未被占用：工具名 `openrouter_service_tier`、路由名 `openrouter-tier`、配置行 id、Client slot key 与 settings 命名空间在本仓库之外无 DSH 插件命中。路由重名会由 LLM 以 `DUPLICATE_ADAPTER` 显式拒绝，不会静默替换。
