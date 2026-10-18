# 当前版本验证状态

验证日期：2026-10-18。插件版本：`0.3.1`。支持宿主 `0.2.0-rc.2`、`0.2.1-alpha.1` 与 `0.2.1-rc.2`，须应用各自匹配的原生宿主补丁。

## 兼容性检查

对比 `0.2.0-rc.2` 与 `0.2.1-rc.2` 的 `dsh-commands`、`dsh-llm`、`dsh-settings`、`dsh-tools`、`cordis`、`schemastery`：类型声明为新增或注释变化，未出现插件所用 API 的破坏性变更。

- `dsh-llm`：新增 `ConfigureCall`/`LlmCallControls`、`imageRequestTarget`、`LlmNativeAuth` 等；`listProviders`、`listConfigurableProviders`、`listModels` 与 `prepareCall` 旧调用形态仍成立。
- `dsh-tools`：`ToolDefinition`/`ToolOutputDefinition` 未变；仅 `ToolPresentationMode` 去掉 `both`（插件不设置该模式），`meta` 语义扩展到嵌套调用。
- `dsh-settings`、`cordis`、`schemastery`：插件使用的类型无变化；rc.2 运行时使用 `cordis 4.0.5` 与 `schemastery 3.18.5`。
- 插件 `src/` 直接用 rc.2 类型声明 `tsc --noEmit` 通过（用 rc.2 独有的 `ConfigureCall` 反证解析来源）。

peerDependencies 已包含三个宿主版本；peer 闸门用 semver（`includePrerelease: true`）对 `0.2.0-rc.2` 与 `0.2.1-rc.2` 两套运行时逐一校验通过。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| 插件 `npm run check`（0.2.0-rc.2 开发依赖） | 类型检查、构建、19 项测试通过 |
| 插件 `node scripts/test-alpha.mjs`（alpha 组合） | 19 项测试通过 |
| 插件 `node scripts/test-alpha.mjs 0.2.1-rc.2`（rc.2 组合） | 19 项测试通过 |
| 宿主 `0.2.1-rc.2` `pnpm exec tsc -b packages/llm/llm-pi-ai` | 通过 |
| 宿主 `0.2.1-rc.2` config、adapter、dynamic-config、loader-composition 测试 | 92 项通过 |
| 宿主 `0.2.1-rc.2` 包内 keyless 请求快照 `openrouter-tier.request.json` | 用 rc.2 目录重新记录后通过 |
| `0.2.1-rc.2` npm 补丁 | 原始 npm 包 `git apply --check` 通过 |
| `0.2.1-rc.2` source patch | 干净 tag `dsh-v0.2.1-rc.2` 上正向应用与反向校验通过 |
| `0.2.1-rc.2` 双语文档配对 | `verify-translation-pairing` 1014 对全部一致 |

宿主相关测试命令：

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/adapter.spec.ts packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts
```

覆盖 Chat Completions、Responses、Anthropic Messages 顶层请求 body、thinking、工具调用与多轮 replay、凭据失败、取消、idle timeout、429/503 分类、prepare 快照、volatile 更新、插件停用、原生 revision 冲突、null/omit 优先级及数组继承。插件只写原生档位两字段，不注册 adapter，不读取凭据。

rc.2 起宿主每次请求会多次解析凭据，集成测试不再断言具体解析次数，只校验解析到的引用始终是原生环境变量引用。

## 启动验证

- 用户 web profile（宿主 `0.2.0-rc.2`，未升级）：安装 `0.3.1` 后 `dsh web --no-open --port 0` 打印 `dsh web: http://127.0.0.1:<port>/?token=...`，随后关闭，进程退出。
- 隔离 `DSH_HOME` + 隔离安装的 `@deepseek-ai/dsh@0.2.1-rc.2`：`dsh plugin --profile web add file:...0.3.1-native-final.tgz` 通过 peer 闸门，`dsh web --no-open --port 0` 打印同样的启动行，随后关闭。用户实际 `dsh` 安装保持 `0.2.0-rc.2`。

真实 OpenRouter 付费请求本轮未重跑；档位注入路径由 rc.2 组合与宿主 92 项测试覆盖。

## 已知验证限制

- 未在 `0.2.1-rc.2` 上执行完整 web profile 启动（需要把用户 profile 整体升级，本轮明确不改），只做了隔离 `DSH_HOME` 启动与离线组合加载。
- 以下会话快照**未通过**，与宿主默认工具目录差异有关，本轮未修改 baseline：

```powershell
pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t pi-ai-replay-metadata
```

未执行全量 Harness 测试；alpha 的真实 Web 启动和付费请求仍未实测。
