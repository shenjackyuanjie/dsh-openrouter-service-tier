# 当前版本验证状态

验证日期：2026-11-01。插件版本：`0.4.3`。本版跟随宿主新增 `0.2.1-rc.5` 支持：`rc.5` 的 `dsh-llm-pi-ai` 构建产物与 `rc.4` 逐字节相同，补丁内容直接复用，只把 peer 与开发依赖升到 rc.5 并单独成文件。插件运行逻辑、包名与 row id 未改变。

## 0.4.3 离线验证

| 检查            | 结果                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` | 格式检查、类型检查、构建与 22 项离线测试全部通过                                                                                                      |
| 支持范围        | peer 接受 `0.2.1-rc.2` 至 `0.2.1-rc.5`；开发依赖与测试使用 rc.5                                                                                       |
| 宿主补丁        | `patches/` 提供 rc.2 至 rc.5 四套 npm 补丁与 rc.2 源码补丁，rc.5 补丁在 rc.5 原始包上 `git apply --check` 通过                                        |
| 补丁生效        | 安装后 `node_modules/@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.5/lib/index.js` 中可见档位逻辑（`OPENROUTER_SERVICE_TIERS` 命中 4 处）与 `service_tier` 注入 |
| zh/en locale    | `meta.title` 均为“OpenRouter 服务等级”，中文说明可通过 `./locale/*.json` 导出读取                                                                     |
| 共享包与资源    | bundle 和组件使用同一包名，保留原生运行入口；发布白名单包含 locale 与 `./icon` 的 SVG                                                                 |
| 原创图标        | XML 解析通过，64×64，包内资源，小于 256 KiB，无外部实体或外部图像引用                                                                                 |

[显示资源测试](../test/metadata.test.mjs) 使用包自身的 exports 解析资源，不激活插件。打包后还应核对实际文件清单，确认 [包清单](../package.json) 中的运行入口、[bundle patch](../cordis.patch.yml)、[中文 locale](../locale/zh.json)、[英文 locale](../locale/en.json)、[图标](../icon.svg) 与 [LICENSE](../LICENSE) 均包含在发布包内。

## 补丁移植要点

rc.3 的 `llm-pi-ai` 从 2220 行增到 2968 行（合入 replay 模块），rc.2 的补丁无法复用，因此按构建产物为 rc.3 单独移植；rc.4 与 rc.5 的构建产物与 rc.3 结构一致，按同样步骤处理。细节见 [补丁说明](../patches/README.md)：

- `OPENROUTER_SERVICE_TIERS` 必须声明在 `profile` schema 之前，否则 schema 求值会触发 TDZ 错误；这一顺序已在补丁中固定。
- 首次生成时曾漏掉该常量的导出，插件「协议档位与宿主一致」的断言因此失败；补上导出后测试通过。
- rc.4 与 rc.5 的 `lib/index.js`、`lib/types/config.d.ts` 逐字节相同，`rc.4` 的补丁可直接应用到 `rc.5` 原始包上；补丁仍按版本键分别发布，因为 pnpm 的 `patchedDependencies` 键绑定精确版本。
- 替换补丁内容后 pnpm 会复用旧的补丁结果，需要重建依赖树才会重新应用。

## 已知验证限制

- 22 项离线测试在 rc.5 依赖与补丁上通过，但**没有**在真实的 rc.5 宿主进程里跑过一次实际 OpenRouter 请求；档位注入路径由离线集成测试覆盖。
- 用户 web profile 目前仍是 `0.2.1-rc.4` 宿主，本轮未安装、启用或卸载该插件的新版本；升级到 rc.5 后需要把 `pnpm-workspace.yaml` 的 `patchedDependencies` 换成 rc.5 补丁并重启 Host。
- `lib/types/config.d.ts` 只补了公开接口 `PiAiProviderProfile`，Schemastery 推导出的 `Config` 深层类型不含新字段。这是有意的取舍，详见补丁说明。
- 以下会话快照**未通过**，与宿主默认工具目录差异有关，本轮未修改 baseline：

```powershell
pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t pi-ai-replay-metadata
```

未执行全量 Harness 测试；真实 Web 启动与付费请求仍未实测。
