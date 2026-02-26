# 加速与稳定性（避免卡死 / 批处理）

> 目标：让“读取/编辑原理图”既快又稳，减少 EDA 卡死与 DRC 的噪音报错。

## 调用侧（HTTP）加速

- 能并行就并行：
  - `list_components` + `list_wires` + `list_texts` 可并行请求
- 只读当前页：`jlc.schematic.list_components { allSchematicPages:false }`
- 避免一次性拉太大对象：`jlc.eda.invoke` 建议配 `jsonSafe` 限制深度/数组长度

## 绘制侧（apply_ir）稳定性

- **批处理导线**：先放器件/网标/文本，再把 wires 分批（例如每批 5~20 条）`apply_ir`
- **过滤 0 长度导线**：`line=[x,y,x,y]` 这类会导致 create 失败
- **不要写回内部网名**：遇到 `$1N*`（或 `$1Nundefined`）建议省略 `net`，让 EDA 自动分配
- **校验 UUID**：
  - `deviceUuid/libraryUuid` 必须是 32 位 hex（不要把 primitive uuid/短 uuid 当 deviceUuid 用）
  - 不确定就 `jlc.library.search_devices` 反查

## 连接自检

- 状态：`curl -s http://127.0.0.1:9151/v1/status`
- 连通：`jlc.bridge.ping`
- 不连：通常是 EDA 扩展未连上 WS（需要检查扩展配置页是否已启用/已自动连接）

## Windows/PowerShell 的 curl 提醒

- PowerShell 的 `curl` 可能是 `Invoke-WebRequest` 的别名，且 `-d '{...}'` 容易转义炸。
- 建议：
  - 使用 Git Bash 的 `curl`
  - 或用 node fetch 写一个小脚本来发 JSON（避免手写转义）
- 如果 HTTP proxy 启用了 token，记得为 `POST /v1/tools/call` 加 `authorization: Bearer ...` 头。
