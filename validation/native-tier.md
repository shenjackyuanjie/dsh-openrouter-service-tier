# 当前版本验证状态

验证日期：2026-10-24。插件版本：`0.4.0`。本版把支持范围收敛到宿主 `0.2.1-rc.2`，删除旧宿主版本的补丁、隔离组合脚本与兼容分支，并引入 Prettier。运行逻辑、包名与插件 row id 未改变。

## 0.4.0 离线验证

| 检查            | 结果                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `npm run check` | 格式检查、类型检查、构建与离线测试全部通过                                               |
| 支持范围        | peer 与开发依赖只用 `0.2.1-rc.2`、`cordis 4.0.5`、`schemastery 3.18.5`                   |
| 宿主补丁        | `patches/` 只保留 `0.2.1-rc.2` 的 npm 补丁与 source patch                                |
| zh/en locale    | `meta.title` 均为“OpenRouter 服务等级”，中文说明可通过 `./locale/*.json` 导出读取        |
| 共享包与资源    | bundle 和组件使用同一包名，保留原生运行入口；发布白名单包含 locale 与 `./icon` 的 SVG    |
| 原创图标        | XML 解析通过，64×64，包内资源，小于 256 KiB，无外部实体或外部图像引用，随包使用 MIT 许可 |

[显示资源测试](../test/metadata.test.mjs) 使用包自身的 exports 解析资源，不激活插件。打包后还应核对实际文件清单，确认 [包清单](../package.json) 中的运行入口、[bundle patch](../cordis.patch.yml)、[中文 locale](../locale/zh.json)、[英文 locale](../locale/en.json) 和 [图标](../icon.svg) 均包含在发布包内。

本轮未安装、启用、卸载 DSH 插件或修改 profile，当前 bundle 保持停用。未进行管理页渲染验证，也未重跑真实 OpenRouter 请求。

## 历史验证（0.2.1-rc.2 组合）

以下结果来自 rc.2 组合验证，宿主侧检查仍然有效；多项与旧宿主版本对比的记录已随支持范围收敛一并移除。

| 检查                                                                       | 结果                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------- |
| 宿主 `0.2.1-rc.2` `pnpm exec tsc -b packages/llm/llm-pi-ai`                | 通过                                                |
| 宿主 `0.2.1-rc.2` config、adapter、dynamic-config、loader-composition 测试 | 92 项通过                                           |
| 宿主 `0.2.1-rc.2` 包内 keyless 请求快照 `openrouter-tier.request.json`     | 用 rc.2 目录重新记录后通过                          |
| `0.2.1-rc.2` npm 补丁                                                      | 原始 npm 包 `git apply --check` 通过                |
| `0.2.1-rc.2` source patch                                                  | 干净 tag `dsh-v0.2.1-rc.2` 上正向应用与反向校验通过 |
| `0.2.1-rc.2` 双语文档配对                                                  | `verify-translation-pairing` 1014 对全部一致        |

宿主相关测试命令：

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/adapter.spec.ts packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts
```

覆盖 Chat Completions、Responses、Anthropic Messages 顶层请求 body、thinking、工具调用与多轮 replay、凭据失败、取消、idle timeout、429/503 分类、prepare 快照、volatile 更新、插件停用、原生 revision 冲突、null/omit 优先级及数组继承。插件只写原生档位两字段，不注册 adapter，不读取凭据。

rc.2 起宿主每次请求会多次解析凭据，集成测试不再断言具体解析次数，只校验解析到的引用始终是原生环境变量引用。

## 启动验证

- 隔离 `DSH_HOME` + 隔离安装的 `@deepseek-ai/dsh@0.2.1-rc.2`：`dsh plugin --profile web add file:...tgz` 通过 peer 闸门，`dsh web --no-open --port 0` 打印 `dsh web: http://127.0.0.1:<port>/?token=...`，随后关闭。

真实 OpenRouter 付费请求本轮未重跑；档位注入路径由 rc.2 组合与宿主 92 项测试覆盖。

## 已知验证限制

- 未在用户 web profile 上执行完整启动验证（需要把 profile 整体升级，本轮明确不改），只做了隔离 `DSH_HOME` 启动与离线组合加载。
- 以下会话快照**未通过**，与宿主默认工具目录差异有关，本轮未修改 baseline：

```powershell
pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t pi-ai-replay-metadata
```

未执行全量 Harness 测试；真实 Web 启动与付费请求仍未实测。
