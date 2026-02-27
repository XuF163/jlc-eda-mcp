# Changelog（jlceda-mcp-bridge）

本文件记录 `packages/eda-extension`（JLCEDA Pro 扩展：`jlceda-mcp-bridge`）的更新情况。  
版本号与扩展清单一致：`extension.json` / `package.json`。

## 0.0.14 - 2026-02-27

- 弃用本地 `mcp-server`（Node），改用 `websocat` 作为短驻/一次性 WS Server 与扩展交互；优势：安装轻量、跨平台、无需 Node、调试更直观、维护成本更低

## 0.0.13 - 2026-02-22

- 参数校验增强：新增 `deviceUuid/libraryUuid` 的 UUID32 校验，减少“把 primitiveId 当 deviceUuid”导致的异常
- IR/几何校验增强：增加 wire line 校验，避免非法坐标/几何导致绘制失败

## 0.0.12 - 2026-02-21

- 自动连接：增加 `onStartupFinished/onEditorSchematic` activationEvents（扩展启动后自动尝试连接 bridge）
- 顶部菜单调整：移除 Connect/Disconnect 菜单项，改为默认自动连接（仍保留 Status/Diagnostics/Configure）
- 稳定性优化：`schematic.applyIr` 节流进度条更新，减少大批量绘制时 UI 卡顿；仅更新已定义字段，避免用 `undefined` 覆盖属性

## 0.0.11 - 2026-01-26

- 新增高级能力：`eda.keys / eda.get / eda.invoke`（按路径透传访问 `globalThis.eda.*`，并做 JSON-safe 截断/去环）

## 0.0.7 - 2025-12-27

- 扩展版本整理（存档）

## 0.0.3 - 2025-12-27

- 初始版本：提供基础的 WebSocket 桥接能力与顶部菜单入口
