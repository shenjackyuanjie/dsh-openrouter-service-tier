# 当前版本验证状态

验证日期：2026-10-24。插件版本：`0.4.1`。本版跟随宿主新增 `0.2.1-rc.3` 支持：重新移植 `llm-pi-ai` 档位补丁、把 peer 与开发依赖升到 rc.3，并保留 rc.2 的补丁与 peer 范围；同时改用 MIT 许可。插件运行逻辑、包名与 row id 未改变。

## 0.4.1 离线验证

| 检查            | 结果                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `npm run check` | 格式检查、类型检查、构建与 22 项离线测试全部通过                                         |
| 支持范围        | peer 接受 `0.2.1-rc.2` 与 `0.2.1-rc.3`；开发依赖与测试使用 rc.3                          |
| 宿主补丁        | `patches/` 同时提供 rc.2（npm + source）与 rc.3（npm）两套，rc.3 补丁应用与语法校验通过  |
| 补丁生效        | 安装后在 `node_modules` 的 `lib/index.js` 中可见档位逻辑与 `service_tier` 注入           |
| zh/en locale    | `meta.title` 均为“OpenRouter 服务等级”，中文说明可通过 `./locale/*.json` 导出读取        |
| 共享包与资源    | bundle 和组件使用同一包名，保留原生运行入口；发布白名单包含 locale 与 `./icon` 的 SVG    |
| 原创图标        | XML 解析通过，64×64，包内资源，小于 256 KiB，无外部实体或外部图像引用，随包使用 MIT 许可 |

[显示资源测试](../test/metadata.test.mjs) 使用包自身的 exports 解析资源，不激活插件。打包后还应核对实际文件清单，确认 [包清单](../package.json) 中的运行入口、[bundle patch](../cordis.patch.yml)、[中文 locale](../locale/zh.json)、[英文 locale](../locale/en.json)、[图标](../icon.svg) 与 [LICENSE](../LICENSE) 均包含在发布包内。

## 补丁移植要点

rc.3 的 `llm-pi-ai` 从 2220 行增到 2968 行（合入 replay 模块），rc.2 的补丁无法复用，因此按构建产物为 rc.3 单独移植；rc.2 的补丁原样保留。细节见 [补丁说明](../patches/README.md)：

- `OPENROUTER_SERVICE_TIERS` 必须声明在 `profile` schema 之前，否则 schema 求值会触发 TDZ 错误；这一顺序已在补丁中固定。
- 首次生成时曾漏掉该常量的导出，插件「协议档位与宿主一致」的断言因此失败；补上导出后 22 项测试通过。
- 替换补丁内容后 pnpm 会复用旧的补丁结果，需要重建依赖树才会重新应用。

## 已知验证限制

- 22 项离线测试在 rc.3 依赖与补丁上通过，但**没有**在真实的 rc.3 宿主进程里跑过一次实际 OpenRouter 请求；档位注入路径由离线集成测试覆盖。
- 用户 web profile 本轮未安装、启用或卸载该插件，bundle 保持停用；未做管理页渲染验证。
- `lib/types/config.d.ts` 只补了公开接口 `PiAiProviderProfile`，Schemastery 推导出的 `Config` 深层类型不含新字段。这是有意的取舍，详见补丁说明。
- 以下会话快照**未通过**，与宿主默认工具目录差异有关，本轮未修改 baseline：

```powershell
pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t pi-ai-replay-metadata
```

未执行全量 Harness 测试；真实 Web 启动与付费请求仍未实测。
