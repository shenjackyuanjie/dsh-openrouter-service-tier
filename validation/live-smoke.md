# OpenRouter GPT-6 Luna 真实请求验证

验证时间：2026-10-03。用户明确授权使用当前 DSH 已配置的 OpenRouter key。宿主为当前 `web` profile，公开 DSH `0.2.0-rc.2`。

## 方法与安全边界

- 在当前 Host 中用一次性插件调用 `ctx.llm.prepareCall()` 与 prepared stream，经已安装的 `openrouter-tier` adapter 发出请求，而非另写协议请求绕过插件。
- 模型 `openai/gpt-6-luna`，插件配置 `serviceTier: flex`，请求 `reasoningEffort: high`，`maxTokens: 1024`。
- 使用 credentials 服务已有的 `OPENROUTER_API_KEY` 引用；没有读取本地凭据文件、打印密钥、保存密钥或改动其值。
- 总计两条真实生成请求，不自动重试。没有切换用户会话模型。
- 第二条请求结束后，只读查询本次生成的 OpenRouter `/api/v1/generation` 元数据；HTTP 404，未获取实际 tier 或费用。不为查询失败重复生成。
- 没有保存原始响应、headers、账号数据或生成 ID；缓存结果仅保存白名单统计和本次固定测试答案。

## 结果

| 项目 | 连通性测试 | 推理题测试 |
| --- | --- | --- |
| 回复 | `已收到测试请求` | `423` |
| 正常结束 | `stop` | `stop` |
| 请求耗时 | 2874 ms | 9117 ms |
| 输入 tokens | 32 | 56 |
| 输出 tokens（DSH 汇总） | 22 | 204 |
| 总 tokens | 54 | 260 |
| 可见 reasoning 字符数 | 0 | 0 |
| replay state | 有 | 有 |

推理题：求最小正整数 n，满足除以 7 余 3、除以 11 余 5、除以 13 余 7。答案 `423` 已用离线枚举核对。合计用量 314 tokens。

## OpenRouter 日志人工核验

真实测试后，用户自行查看 OpenRouter logs，并明确确认这些测试请求实际为 **flex**。该结论的证据来源是用户的控制台人工核验，不是本插件返回的 DSH chunk 或成功的 generation API 查询；本报告没有抓取、保存控制台截图或账号日志。

因此，本次 GPT-6 Luna 测试可以记录为：**插件真实请求成功，实际服务 tier 经用户核验为 flex。** generation API 返回 404 的事实仍保留，但不再把实际 tier 标记为未确认。具体美元费用没有在本次验证中取得，不据此补写费用金额或折扣比例。

## 可以与不能证明的事项

- **已证明：** 当前 Host 的插件路由存在、现有凭据可用、GPT-6 Luna 可实际调用、配置 flex 与 high 时请求正常完成，DSH 文本流、usage 与 replay metadata 正常。
- **用户核验已确认：** 本次测试请求在 OpenRouter 日志中显示实际为 flex。插件自身尚不透出实际 `service_tier`，具体费用金额未记录；单次成功不代表所有未来请求都会按 flex 服务。
- **未证明：** 可见 thinking 在真实 Luna 响应中正常返回。两个请求都未产生 `reasoning-delta`；不能据此说 reasoning 被关闭，也不能把较多的输出 tokens 当作已核实的 reasoning tokens。
- 没有验证真实工具调用、多轮 replay、图片或 alpha.1 的真实服务请求；这些仍分别依赖离线证据或后续授权测试。

测试用临时 bundle 在完成后移除，正式 `dsh-openrouter-service-tier` bundle 保持安装。
