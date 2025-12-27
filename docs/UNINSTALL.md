# Uninstall / 删除扩展（排障）

如果你遇到“扩展管理器里删不掉 / 删了还在 / 用不了”的情况，通常是以下两类原因：

1) **版本范围不匹配**：`extension.json.engines.eda` 不满足你当前的 EDA 版本，导致扩展被判定为不兼容（表现为菜单不出现或功能无法使用）。
2) **客户端文件占用/缓存**：Windows 下 EDA 进程仍持有扩展文件句柄，导致扩展管理器无法删除目录。

## 推荐步骤

1. 在 EDA 内点 `MCP Bridge -> Disconnect`
2. **彻底退出 EDA**（确保任务管理器里 `lceda-pro.exe` 不存在）
3. 重新打开 EDA，进入扩展管理器尝试删除

## 仍然删不掉：强制定位与清理

仓库提供脚本用于定位“扩展安装目录”并输出可能的删除路径：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/find-installed-extension.ps1 -Uuid eee9f29013dd4ca48309a1e78447f79b
```

如果脚本找到了扩展目录：

1. 确保 EDA 已退出
2. 手动删除该目录（或用 PowerShell `Remove-Item -Recurse -Force <path>`）
3. 再打开 EDA 检查扩展是否消失

## 反馈信息（方便继续定位）

请把以下信息贴给我：

- `MCP Bridge -> Diagnostics` 里输出的 `eda.editorVersion`
- 扩展管理器删除时的提示文字（完整复制）
- `scripts/find-installed-extension.ps1` 的输出（如果有）

