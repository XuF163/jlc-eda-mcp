# 加速与稳定性（避免卡死 / 批处理）

> 目标：让“读取/编辑原理图”既快又稳，减少 EDA 卡死与 DRC 的噪音报错。

## 调用侧（WS）加速

- 大结果优先用 RPC，少用 `tools.call`：
  - `tools.call` 会同时返回 `data` 与 `toolResult`（重复一份 payload），大图纸更容易超限/丢包
  - 例如：读原理图优先 `schematic.listComponents/listWires/listTexts`，而不是 `tools.call` + `jlc.schematic.*`
- `websocat` 建议加大 buffer：`-B 10485760`（10MB），避免默认 64KB 导致的大消息异常
- 能并行就并行：
  - `schematic.listComponents` + `schematic.listWires` + `schematic.listTexts` 可并行请求（或对应 `jlc.schematic.*` tools）
- 短驻建议“单次会话多步”：一次 `websocat` 会话发送多条 `request`，避免每一步都触发扩展重连 backoff（见 `05-http-proxy.md`）。
- 只读当前页：`schematic.listComponents { allSchematicPages:false }`（工具等价：`jlc.schematic.list_components`）
- 避免一次性拉太大对象：`jlc.eda.invoke` 建议配 `jsonSafe` 限制深度/数组长度

## 读取选区：最快的两轮策略（推荐）

> 适用：用户说“读取当前选中区域/介绍模块功能”，尤其是多工程/多窗口时。

（可选，更快更小）：如果当前页图元很多、你只关心选区，可直接用  
`eda.invoke sch_SelectControl.getAllSelectedPrimitives`（单次调用返回选区 mixed primitives；见 `docs/02-region-read.md`）。

1) 第 1 轮（快读，够用就停）：
   - `eda.invoke sch_SelectControl.getAllSelectedPrimitives_PrimitiveId`
   - `schematic.listComponents { allSchematicPages:false }`
   - `schematic.listTexts`
   - 本地用 `primitiveId ∈ selectedIds` 过滤，先产出 **短摘要**（关键器件/网名/电源/接口）
2) 第 2 轮（按需补连通性）：
   - 从第 1 轮筛出的网名里挑“关键 nets”
   - `schematic.listWires { nets:[...] }`（只拉关键 nets 的导线，避免全量 wires）

多窗口建议（节省时间）：优先按 `../SKILL.md` 的“LLM 自动探测端口”脚本扫描 `9050-9059`，拿到每个窗口的 `hello.project` 后再逐个端口读取；不要长期挂后台（或反复起多轮扫端口），避免残留进程拖慢后续调用。

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
