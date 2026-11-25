# 变更记录

## 0.5.1 — 2026-11-25

- 支持从 GitHub 源码安装：pnpm 从 git 安装时执行 `prepare` 构建；首次安装需把 pnpm 打印的精确 `allowBuilds` 键写进 profile 的 `pnpm-workspace.yaml` 后重跑同一条命令。`v0.5.0` 标签不含该构建支持，固定到该标签会在构建阶段失败。
- 新增 GitHub Release 附件安装方式：发版归档已含 `lib/`，不需要 GitHub 认证，也不会构建或要求批准构建脚本。
- README 安装方式顺序改为 源码 → Release 附件 → GitHub Packages → 本地 tarball，并补充构建放行步骤。

## 0.5.0 — 2026-11-22

- 适配 DSH `0.2.3-alpha.2` 的 Cordis、Loader 和原生 `dsh-llm-pi-ai`。为 alpha.1 和 alpha.2 提供独立的精确版本补丁，不匹配后续 Alpha 或尚未发布的 0.2.2 版本。
- 停止支持 DSH `0.2.1`，移除其旧 peer 范围、补丁和回归入口。保留全部 `0.2.2-rc.1` 至 `0.2.2-rc.5` 及相应补丁。
- 隔离验证新增官方 tarball SHA-512 校验和宿主自身的兼容性门槛检查。
- `0.2.3-alpha.1` 的官方 npm CLI 无法启动；带诊断垫片的插件测试不等于正式宿主支持。上游问题和复验方法见[验证记录](./validation/native-tier.md#未发布023-alpha1-适配候选)。

## 0.4.7

- 支持 DSH `0.2.2-rc.4` 和 `0.2.2-rc.5`：为两版新增独立的精确版本补丁，既有支持版本保持不变。
