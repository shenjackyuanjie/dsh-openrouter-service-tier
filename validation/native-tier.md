# 当前版本验证状态

验证日期：2026-10-07。插件版本：`0.3.0`。支持宿主 `0.2.0-rc.2` 与 `0.2.1-alpha.1`，须应用各自匹配的原生宿主补丁。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| 插件 `npm run check` | 类型检查、构建、19 项测试通过 |
| 插件 `node scripts/test-alpha.mjs` | alpha 独立依赖组合的类型检查、构建、19 项测试通过 |
| 两版宿主 `pnpm exec tsc -b packages/llm/llm-pi-ai` | 通过 |
| 两版宿主 config、adapter、dynamic-config、loader-composition 测试 | 各 89 项通过 |
| 两版包内 keyless 请求快照 `openrouter-tier.request.json` | 通过；原生 baseline 与 flex body 只差顶层 `service_tier` |
| 两版 source patch | 对应干净 tag 基线的应用检查、实际应用和反向校验通过 |
| 两版 npm patch | 对应原始 npm 包的应用检查通过 |
| 导出 JSDoc、相关源码 oxlint、双语 pairing、代码 diff 检查 | 通过 |

宿主相关测试命令：

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/adapter.spec.ts packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts
```

覆盖 Chat Completions、Responses、Anthropic Messages 顶层请求 body、thinking、工具调用与多轮 replay、凭据失败、取消、idle timeout、429/503 分类、prepare 快照、volatile 更新、插件停用、原生 revision 冲突、null/omit 优先级及数组继承。插件只写原生档位两字段，不注册 adapter，不读取凭据。

## Web 与真实请求

实际运行环境为 `0.2.0-rc.2`，应用对应独立 npm 包补丁并安装控制插件，没有混装 alpha 包。

- `dsh web --no-open`：HTTP 200，客户端全部 ACTIVE，无 pageerror。
- OpenRouter 仅使用原生 `llm-pi-ai` 路由，没有第二套模型目录。
- 原生设置 schema 具备 `serviceTier`、`modelServiceTiers`；安装不默认写入 flex。
- 原生 `openrouter` / `openai/gpt-6-luna`、flex、low thinking、512 输出上限、无自动重试：真实请求成功返回 **PONG**。

真实请求使用临时 headless overlay，不持久修改档位、默认模型或凭据。未查询费用或实际计费档位。本次测试 Web 进程已退出。

## Registry 安装验证

`@shenjackyuanjie/dsh-openrouter-service-tier@0.3.0` 已发布到 GitHub npm registry。认证下载后，实际 tarball 的 SHA-512 与 registry 的 `dist.integrity` 一致，manifest 和 bundle 使用相同的 scoped 包名。

使用独立临时 `DSH_HOME` 执行 `dsh plugin --profile web add @shenjackyuanjie/dsh-openrouter-service-tier@0.3.0 --ignore-scripts` 安装成功，没有修改用户实际 profile。scoped 包名适配后，两版插件的 19 项离线测试均重新通过。

## 已知验证限制

以下会话快照**未通过**：

```powershell
pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t pi-ai-replay-metadata
```

差异为已提交的默认 Bash 工具目录与 Windows 实际 Pwsh 工具目录的 header；未修改 baseline 或 normalizer。包内原生请求快照另行通过，不能代替该会话快照。未执行全量 Harness 测试；alpha 的真实 Web 启动和付费请求未实测。
