# SchematicIR v1（带坐标布局）

`jlc.schematic.apply_ir` 使用该格式一次性完成原理图（放置器件/电源标识/端口/文本/导线），以便更快进入 PCB 布线阶段。

## 坐标与单位

- `units: "sch"`（默认）：使用嘉立创EDA 原理图画布坐标单位（跨度为 `0.01 inch`）
- `units: "mm"`：以毫米输入，扩展内部会自动换算为原理图单位

## 顶层结构

```json
{
  "version": 1,
  "units": "sch",
  "page": { "ensure": true, "schematicName": "Demo", "pageName": "Sheet1" },
  "patch": { "delete": { "wires": ["W1"] } },
  "components": [],
  "netFlags": [],
  "netPorts": [],
  "texts": [],
  "wires": [],
  "connections": [],
  "post": { "zoomToAll": true, "drc": { "strict": false }, "save": true }
}
```

## page

- `ensure`：是否确保当前处于原理图图页；若不是则创建“游离原理图 + 图页”并打开
- `schematicName` / `pageName` / `boardName`：创建时使用的名称
- `clear`：执行前清空（默认仅清除 MCP 管理的图元）
- `clearMode`
  - `"mcp"`（默认）：只删除 MCP 通过 `apply_ir` 创建并记录的图元
  - `"all"`：删除当前图页上的导线/文本/器件等（高风险，谨慎使用）

## patch（增量更新/删除）

默认行为是 **增量 upsert**：同一个 `id` 会更新对应图元；不在本次 IR 里出现的图元不会被删除。

如需删除指定对象，使用：

```json
{
  "patch": {
    "delete": {
      "components": ["R1", "U1"],
      "texts": ["T1"],
      "wires": ["W1"],
      "connections": ["C1"]
    }
  }
}
```

## 分步生成建议（适配 LLM 多回合）

建议把一次“完整原理图”拆成多次 `apply_ir` 调用：

1) 第一步：只放置器件（并固定 `components[].id`，后续保持一致）
2) 中间步骤：补充 `texts` / `netFlags` / `netPorts` / `wires` / `connections`
3) 最后一步：再执行 `post.drc/save/capturePng`

为了避免“当前不在原理图页时误创建新图页”，后续增量步骤可以显式设置：

```json
{ "page": { "ensure": false } }
```

## components（器件放置）

每个器件必须有唯一 `id`，并提供库器件 UUID：

```json
{
  "id": "U1",
  "deviceUuid": "xxxx",
  "libraryUuid": "yyyy",
  "x": 100,
  "y": 80,
  "rotation": 0,
  "designator": "U1",
  "name": "CH340C"
}
```

## netFlags（电源/地标识）

```json
{ "id": "GND1", "identification": "Ground", "net": "GND", "x": 120, "y": 160 }
```

## netPorts（输入/输出端口）

```json
{ "id": "VIN1", "direction": "IN", "net": "VIN", "x": 20, "y": 80 }
```

## wires（显式导线）

`line` 支持两种形式：

1) 单段折线：`[x1, y1, x2, y2, x3, y3]`
2) 多段折线数组：`[[...], [...]]`

```json
{ "id": "W1", "net": "VIN", "line": [20, 80, 60, 80, 60, 100] }
```

## connections（自动连线）

如果你不想手写 `wires` 坐标，可以用 `connections` 让扩展按器件引脚坐标自动生成导线（Manhattan 或直线）：

```json
{
  "id": "C1",
  "from": { "componentId": "U1", "pinNumber": "1" },
  "to": { "componentId": "R1", "pinNumber": "2" },
  "net": "RXD",
  "style": "manhattan"
}
```

> `connections` 会在 `components` 放置完成后执行；`componentId` 必须引用 `components[].id`。

## post（收尾动作）

- `zoomToAll`：缩放到适应全部（建议仅在最后一步启用）
- `drc`：运行原理图 DRC
- `save`：保存原理图
- `capturePng`：可选抓图导出（见 `jlc.view.capture_png` 的同类参数）
