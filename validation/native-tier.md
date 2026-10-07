# 原生 OpenRouter 档位验收

日期：2026-10-07。插件版本：0.3.0。相邻公开 alpha 源码和独立 rc.2 tag worktree 均实现同一窄补丁；用户运行宿主仍为 0.2.0-rc.2，没有混装 alpha 包。

## 离线检查

实际运行：

- 插件 `npm run check`：类型检查、构建与 19 项离线用例通过。
- `node scripts/test-alpha.mjs`：独立 alpha 依赖组合的类型检查、构建与相同 19 项用例通过。
- 两版源码分别执行 `pnpm exec tsc -b packages/llm/llm-pi-ai`。
- 两版源码分别执行 `pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/adapter.spec.ts packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts`：各 89 项通过。
- 两版新增 keyless 原生请求快照 `tests/fixtures/openrouter-tier.request.json`，固定同一原生 baseline 与 flex body；只增加顶层 tier，不记录认证值。
- 两版 source patch 在对应干净 tag 的独立解包目录中均通过 `git apply --check`、实际应用及反向校验；npm patch 在对应原始 npm 包中通过应用检查。
- `pnpm exec tsx scripts/verify-export-jsdoc.ts packages/llm/llm-pi-ai/src/service-tier.ts`、相关源文件 `pnpm exec oxlint`、双语 pairing 记录及 `git diff --check` 通过。

覆盖原生模型目录、Chat/Responses/Messages 顶层 body、thinking、工具关联与多轮 replay、凭据失败、取消与 idle timeout、429/503 分类、prepare 快照、volatile 更新不换 owner、控制贡献撤销、native revision 冲突、null/omit 优先级及空数组/底层继承。工具与命令只写原生档位两字段，不回传 headers。不存在 shadow adapter、全局 fetch 或 monkey patch。

## keyless 会话快照限制

执行 `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t pi-ai-replay-metadata`。补齐所需生成的 Host Typert artifacts 后，测试停在已提交的默认 Bash 工具目录与 Windows 实际 Pwsh 工具目录的 header 差异。未改其跨平台 baseline 或 normalizer，未把该会话快照算作通过；原生请求的包内 keyless 快照另行通过。没有跑全量 Harness 测试。

## 本机安装与启动

使用 pnpm package-manager patch 修改实际加载的 **独立 rc.2 llm-pi-ai 包**，再通过 `dsh plugin --profile web add <0.3.0 tarball> --ignore-scripts` 升级原已选中的控制插件。没有手改 node_modules 或共享 store，没有改其他提供商、原生连接、凭据、默认模型或用户会话历史。

实际执行 `dsh web --no-open`，用隔离的 headless Edge 浏览器验证：HTTP 200，客户端全部 ACTIVE，没有 pageerror；提供商列表没有 openrouter-tier；openrouter 只指向原生 llm-pi-ai namespace 的 providers/openrouter。原生 schema 同时具备 serviceTier 与 modelServiceTiers，原生全局档位仍未设置、revision 0，升级没有把旧插件默认 flex 自动写过去。

最终安装包使用独立文件名 `.cache/dsh-openrouter-service-tier-0.3.0-native-final.tgz`，避免同名本地 tarball 被包管理器复用旧缓存。复核后退出本次测试 Web 进程，用户可直接执行 `dsh web`。

## 真实请求

经用户授权，使用实际 rc.2 `dsh --profile headless --patch <临时测试 overlay>`，原生 `openrouter` / `openai/gpt-6-luna`、`serviceTier: flex`、low thinking、512 输出上限、禁止自动重试，要求不使用工具并只回复 PONG。实际成功返回 **PONG**。overlay 只包含凭据引用，不含凭据值；没有持久修改原生档位。费用或上游实际计费档位未查询，不作保证。

旧 live-smoke.md 与 ui-selector.md 仍是独立路由 0.2.x 历史记录，不能用作新架构证据。
