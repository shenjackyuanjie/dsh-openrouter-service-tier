# dsh-openrouter-service-tier

为 DeepSeek Harness（DSH）的 OpenRouter 请求提供 `service_tier` 配置的独立插件项目。

**当前仅有方案文档，尚未开始实现。** 仓库暂不包含插件代码、依赖清单、构建配置或安装入口，下面的设计不代表已经可用的功能。

## 目标

在不修改 DSH 源码、不启动本地代理、不复制协议适配器的前提下，为 OpenRouter 请求增加 service tier 选择，首先满足 `flex` 与 thinking 同时使用的需求。

复用 DSH credentials 服务中名为 `OPENROUTER_API_KEY` 的凭据引用；该名称是引用，不是 API key 本身。计划使用的验证模型为 `openai/gpt-6-luna`，模型可用性及 tier 支持需要在真实验证时重新确认。

## 推荐设计

插件注册独立 provider 路由（暂定 `openrouter-tier`），复用 `@deepseek-ai/dsh-llm-pi-ai` 公开导出的 `PiAiAdapter`，并包装 pi-ai 的 OpenRouter provider，通过其 `onPayload` 请求回调在最终 JSON 顶层注入 `service_tier`。

```text
DSH llm 服务
  └─ 插件拥有的 OpenRouter 路由
      └─ PiAiAdapter
          └─ 包装的 pi-ai OpenRouter provider
              └─ 现有协议实现
                  └─ onPayload 添加 service_tier
                      └─ OpenRouter
```

消息转换、流式协议解析、thinking、工具调用、replay、超时和取消尽量由现有实现负责。插件负责自己的配置解析、provider 包装、凭据接入、路由注册与卸载，以及相应测试。

此方案不是向已加载的 `llm-pi-ai` 实例直接安装请求体扩展：原 `openrouter` 路由可以继续存在，用户需要选择新路由。自动继承原 Models 设置、替换原路由以及扩展原 Models 编辑器均不属于第一版范围。

## 已核对的版本

已比较 npm 发布的 DSH `0.2.0-rc.2` 与 `0.2.1-alpha.1`：`dsh-llm-pi-ai` 的运行时入口和公开入口、adapter、config 类型声明在两版中逐字节相同；两版都没有现成的 `serviceTier` 配置字段，也都公开支持上述 adapter 复用方式。

两版均声明 pi-ai 依赖范围 `^0.87.1`。本次检查和离线验证使用实际安装的 pi-ai `0.87.1`；相同依赖范围不保证未来安装解析到相同版本。插件发布前仍需验证两套完整依赖组合，不能据此宣称跨版本集成测试已经通过。

## 验证状态

已用 pi-ai `0.87.1` 的真实 OpenRouter provider 和假 `fetch` 完成离线概念验证：`openai/gpt-6-luna` 请求中同时包含 `service_tier: "flex"` 与 `reasoning.effort: "high"`，模拟响应中的 thinking 和文本流正常解析并结束。

该验证不是本仓库测试，没有启动完整 DSH，也没有证明真实服务、多轮 replay、图片或工具调用已经全部兼容。详细证据范围、待验证问题及后续步骤见 [handoff.md](./handoff.md)。

## 限制与暂缓事项

- 暂不自动复用原 OpenRouter 的完整 provider 配置；凭据引用可以复用，模型与必要参数计划由插件显式配置。
- 暂不提供 Models 页面内的 service tier 下拉框，也不增加会话级选择、按模型覆盖或自动 tier 降级。
- 第一版只承诺发送所配置的 tier 参数，不承诺服务一定按该 tier 执行或计费。OpenRouter 在模型没有 flex endpoints 时可能按标准 tier 路由，实际结果应以响应报告为准。
- `PiAiAdapter` 是公开导出，但 profile resolver 与 auth 装配助手不是公开包根接口；插件需要有限范围的自行装配，不应依赖未发布源码或私有方法。

## 参考

- [DSH 两个版本的源码比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1)
- [OpenRouter service tiers 文档](https://openrouter.ai/docs/guides/features/service-tiers)
- [pi-ai 项目](https://github.com/earendil-works/pi)
