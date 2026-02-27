# 加速与稳定性（避免卡死 / 批处理）

> 目标：让“读取/编辑原理图”既快又稳，减少 EDA 卡死与 DRC 的噪音报错。

## 调用侧（WS）加速

- 能并行就并行：
  - `list_components` + `list_wires` + `list_texts` 可并行请求
- 短驻建议“单次会话多步”：一次 `websocat` 会话发送多条 `request`，避免每一步都触发扩展重连 backoff（见 `05-http-proxy.md`）。
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

- 状态（tools）：`{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.status","arguments":{}}}`
- 连通（tools）：`{"type":"request","id":"2","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}}}`
- 不连：通常是 EDA 扩展未连上 WS（检查扩展 `Configure...` 的 URL、权限，以及本机 `9050` 是否被旧进程占用）
