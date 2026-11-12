# 当前版本验证状态

验证日期：2026-11-08。插件版本：`0.4.4`。目标宿主：`0.2.1-rc.2` 至 `0.2.1-rc.5` 与 `0.2.2-rc.1`。兼容验证只使用 npm 官方发布产物，未混用公开源码树或内部源码变体，未部署、修改运行中 profile 或重启服务；验证通过后按项目既有 GitHub Packages 渠道发布。

## 0.4.5 验证（0.2.2-rc.1 与 rc.2 双版本）

验证日期：2026-11-12。插件版本：`0.4.5`。目标宿主：`0.2.2-rc.1` 与 `0.2.2-rc.2`，并保留 0.2.1-rc.2 至 rc.5 的既有支持。全部素材来自 `https://registry.npmjs.org` 公开 tarball。

### 产物与哈希

| 项目                                  | 值                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `dsh-llm-pi-ai@0.2.2-rc.1` npm shasum | `2e66d94e5fccb7c14be3380fef7477cb7dff04ba`                                         |
| `dsh-llm-pi-ai@0.2.2-rc.2` npm shasum | `c73444916c4647bd8df1292d8820cf88c87da046`                                         |
| rc.1 原始 `lib/index.js` SHA256       | `1a3ae58f9b4493e15459cc5000ec80f21b5d3f4a9dea6ffb6bc28e5b8817ae8a`                 |
| rc.2 原始 `lib/index.js` SHA256       | `e956da3d7300e1426e13e14f47e6f981dd1ca345633a406568ee5058ad93e9d8`                 |
| rc.2 打补丁后 `lib/index.js` SHA256   | `1f48d3f59f2fe9b184c9ac7cd2e01941e78bbb7079b76301ff9da9175791ebb8`，与本地安装一致 |

### 上游变化与适配

- rc.2 在请求准备阶段新增 Anthropic thinking 的请求前缀绑定：`bindThinkingToPrefix`、`prefixDigests`，并在 replay 状态写入 `prefixDigest`。
- rc.2 改为按前导 HTTP 状态码分类 pi-ai 错误；配额、限流等措辞规则继续读取完整信息。
- rc.1 补丁第三个 hunk 依赖 rc.1 的请求转换调用形状，在 rc.2 上不适用；rc.2 补丁基于新产物重新生成。
- 新补丁从捕获的 profile 解析档位（位于 profile/model 之后、`bindThinkingToPrefix` 之前），请求 body 注入在绑定之后，通过 `onPayload` 写入顶层 `service_tier`；不改写 thinking 与 replay 数据。插件源码无需修改。

### 检查与结果

| 检查                                                   | 结果                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `git apply --check --verbose`：rc.1 补丁 × rc.1 原始包 | 通过，两个文件命中                                                                                                 |
| `git apply --check --verbose`：rc.2 补丁 × rc.2 原始包 | 通过，两个文件命中                                                                                                 |
| `git apply --check`：rc.1 补丁 × rc.2 原始包           | 失败，符合预期：请求准备段已变化                                                                                   |
| `npm run typecheck`（rc.2 开发依赖）                   | 通过                                                                                                               |
| `npm test`（rc.2 开发依赖）                            | 26/26 通过，0 跳过                                                                                                 |
| `npm run test:matrix`（0.2.2-rc.1）                    | 26/26 通过，0 跳过                                                                                                 |
| `npm run test:matrix`（0.2.2-rc.2）                    | 26/26 通过，0 跳过                                                                                                 |
| 补丁生效断言                                           | 两版均含 `OPENROUTER_SERVICE_TIERS`；`bindThinkingToPrefix` 仅出现在 rc.2                                          |
| 顺序断言                                               | 档位 `onPayload` 位于 `streamSimple` 选项内；rc.2 中 `bindThinkingToPrefix` 先于档位注入，并把 digest 传给流式转换 |

双版本矩阵使用 `scripts/verify-rc0222.mjs`：为每个宿主版本建立独立目录，安装同版本 `commands`、`credentials`、`llm`、`llm-pi-ai`、`settings`、`tools`，固定 Cordis `4.1.0`、loader/group/include `1.1.0`、Schemastery `3.19.0`、pi-ai `1.3.0`，并用 `pnpm peers check` 核对。

### 验证边界

- 未连接真实 OpenRouter，未发送付费请求；三协议测试使用 loopback 假服务截获真实 SDK 请求 body。
- 未在真实 Web 宿主进程启用插件，未部署或重启服务。
- 0.2.1-rc.2 至 rc.5 的旧补丁与旧矩阵未在本次重跑。

## 官方 API 与补丁移植

- 官方 `@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.1` tarball 来自 `https://registry.npmjs.org`，npm shasum 为 `2e66d94e5fccb7c14be3380fef7477cb7dff04ba`。
- 官方基础依赖变化：Cordis `~4.1.0`、loader/group/include `~1.1.0`、Schemastery `~3.19.0`、pi-ai `^1.3.0`；开发环境按对应最低发行版锁定。显式加入 group/include 开发依赖，消除旧锁残留的 1.0.x peers。
- 已核对 `dsh-llm` 的 `listConfigurableProviders()`、`settingsNs/settingsPath`、`prepareCall()`，`dsh-settings` 的 descriptor/revision 与 `mutate(ns, ops, expectedRevision)`，以及 commands/tools 的注册类型；现有控制流程无需更换 API。
- rc.5 补丁的 payload hunk 不适用于 rc.1：新版 `toPiContext` 增加 system prompt 原位更新参数。新补丁基于 rc.1 原始构建重新生成，仅修改 `lib/index.js`、`lib/types/config.d.ts`，保留该参数及 headers、图片、replay 原生逻辑。移植与使用步骤见[补丁说明](../patches/README.md)。
- 能力缺失报错改为要求匹配当前宿主版本的补丁，不再误指向早期 alpha。保留旧宿主 peer 范围及四份旧补丁。

## 0.4.4 验证

| 检查                                                                                                                          | 结果                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org`                                       | 锁文件可复现安装，应用 rc.1 专用补丁                                                                                                                                                |
| `pnpm peers check`                                                                                                            | 无 peer 依赖冲突                                                                                                                                                                    |
| `npm run check`                                                                                                               | 格式、类型、构建与 26 项离线测试通过                                                                                                                                                |
| 原有 22 项回归                                                                                                                | 真实 Loader/LLM/PiAiAdapter/Settings，覆盖命令与工具的 revision 冲突、热更新、快照、thinking、工具 replay、凭据边界、取消与超时、429/503 分类、元数据资源                           |
| 新增三协议测试                                                                                                                | 真实 pi-ai `1.3.0` SDK 向 loopback 假服务发送 Chat Completions、Responses、Anthropic Messages；每种协议分别验证五个档位与 null 不发送，共 18 次请求；另验证其他 provider 不注入档位 |
| `git apply --check --verbose --directory=.cache/rc0221/pristine/package patches/@deepseek-ai__dsh-llm-pi-ai@0.2.2-rc.1.patch` | 在全新官方原始包上明确检查两个文件，通过                                                                                                                                            |
| `node --check .cache/rc0221/patched/lib/index.js`                                                                             | 补丁后构建语法通过                                                                                                                                                                  |
| SHA256 比对                                                                                                                   | 缓存候选与 pnpm 安装后的 `lib/index.js` 逐字节一致                                                                                                                                  |
| 本地 `npm pack`                                                                                                               | 包含运行入口、bundle、locale、图标、LICENSE 和 rc.1 补丁；解包入口可导入，真实 rc.1 Loader 激活与 loopback flex 请求通过（`node .cache/rc0221/verify-packed.mjs`）                  |

官方原始 `lib/index.js` SHA256：`1a3ae58f9b4493e15459cc5000ec80f21b5d3f4a9dea6ffb6bc28e5b8817ae8a`。补丁后及实际安装文件：`c085260ea11146fbf591114da95dec183f0f8879c15b3e71320aaec8f3e7ef75`。

## 旧版兼容隔离矩阵

当前 `0.4.4` 构建在四个官方旧宿主版本上均通过完整 26 项回归，没有运行时兼容修复。原有 peer 支持范围及四份旧补丁保持不变；Cordis 仍包含 `4.0.5`，Schemastery 仍包含 `3.18.5`。

复验命令（在项目根运行，需要 Node.js、pnpm 11、git 和 tar；安装只访问官方 npm registry，测试只访问 loopback）：

```powershell
node scripts/verify-legacy.mjs
node scripts/verify-legacy.mjs --pi-ai=1.4.0
# 可只复验指定版本
node scripts/verify-legacy.mjs 0.2.1-rc.2 --pi-ai=1.4.0
```

[复验脚本](../scripts/verify-legacy.mjs)在忽略目录 `.cache/legacy-matrix/<宿主版本>-pi-<SDK版本>/` 建立各自独立的 manifest、workspace、锁文件与 node_modules；复用完整 [测试夹具](../test/fixtures.mjs) 和全部测试文件。使用当前 build 的发布白名单文件，并校验隔离入口与根构建逐字节一致；不替换现用开发依赖。本次没有重新打 tarball，最终统一打包仍由发布代理执行。

每格都以同版本 commands/credentials/llm/llm-pi-ai/settings/tools 及配套 DSH peers 安装；基础库固定为 Cordis `4.0.5`、loader `1.0.6`、group `1.0.5`、include `1.0.10`、Schemastery `3.18.5`。全部八格 `pnpm peers check` 无冲突。官方原始 tarball 的 SHA1 与 npm shasum 一致，并逐版本执行 `git apply --check --verbose`，再由 pnpm 应用对应版本补丁。

| 官方宿主   | 匹配补丁版本 | pi-ai 1.1.0（官方下界） | pi-ai 1.4.0（旧锁原生实际版本） |
| ---------- | ------------ | ----------------------- | ------------------------------- |
| 0.2.1-rc.2 | 0.2.1-rc.2   | 26/26，0 跳过           | 26/26，0 跳过                   |
| 0.2.1-rc.3 | 0.2.1-rc.3   | 26/26，0 跳过           | 26/26，0 跳过                   |
| 0.2.1-rc.4 | 0.2.1-rc.4   | 26/26，0 跳过           | 26/26，0 跳过                   |
| 0.2.1-rc.5 | 0.2.1-rc.5   | 26/26，0 跳过           | 26/26，0 跳过                   |

旧版官方 llm-pi-ai 的 npm shasum：

| 版本       | shasum                                   |
| ---------- | ---------------------------------------- |
| 0.2.1-rc.2 | 14aa2d66ea8b02dc15670faea79e1d292251cd9b |
| 0.2.1-rc.3 | e388d4e1526270fde796cd1953957e30c98a2e10 |
| 0.2.1-rc.4 | df3bd2fdd193d6c8a1b415fdc5450ab5db4036c9 |
| 0.2.1-rc.5 | ba113dcf2ce622b2445be0098fdf50dfee08541b |

三种协议均发送五档位及 null/omit，共每格 18 次假服务请求，没有协议跳过。唯一版本化边界是非 OpenRouter provider 的错误档位配置：rc.2 补丁在配置阶段明确拒绝，rc.3/rc.4/rc.5/0.2.2-rc.1 忽略该字段；[协议回归](../test/protocols.test.mjs)读取实际原生版本，分别断言拒绝且零请求或成功发送且不带 service_tier，并输出 rc.2 诊断，不把错误吞掉或静默跳过。

历史版本取自适配前提交 `b3945e8` 的 `git show b3945e8:package.json` 与 `git show b3945e8:pnpm-lock.yaml`：旧根 devDependency 虽为 pi-ai `0.87.1`，adapter 的锁定依赖实际为嵌套 `1.4.0`，不要把两者混淆。官方四个旧 adapter 均要求 `^1.1.0`；额外强制把 adapter 降到 `0.87.1` 的诊断在导入阶段缺少 `getAllBuiltinModels`，该组合不属于官方范围，不作为兼容承诺。没有为此改动旧补丁。

本地证据保留于 `.cache/legacy-matrix-official.log`、`.cache/legacy-matrix-locked-native.log` 及各隔离目录的 `official.json`、`pnpm-lock.yaml`；不纳入提交。修改协议断言后，当前 rc.1 开发环境的 `npm run check` 再次通过，仍为 26/26、0 跳过。

## 验证边界

- 未连接真实 OpenRouter、未发送付费请求、未在真实 Web 宿主进程启用。三协议测试以固定 503 响应检查真实发送 body；Responses/Messages 的成功流解析、计价和服务档位可用性仍需实际服务验收。
- 当前开发环境固定 pi-ai `1.3.0`；旧宿主已复验 `1.1.0` 与旧锁原生实际 `1.4.0`。其余符合宿主 semver 范围的 SDK 版本未逐一运行。
- 延续既有声明取舍：补丁只扩展公开 `PiAiProviderProfile` 接口，Schemastery 推导的 `Config` 深层类型不含新字段；配置经原生设置/YAML 写入。
- 未执行全量 Harness 测试或会话快照；没有改动任何其他项目。
