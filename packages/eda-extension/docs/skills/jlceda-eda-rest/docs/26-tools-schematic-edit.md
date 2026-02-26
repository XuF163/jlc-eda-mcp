# Tools：原理图编辑（低阶图元）

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。可先用 `jlc.schematic.ensure_page`。

## `jlc.schematic.place_device`（放置器件）

参数：

- `deviceUuid: string`（必填，32 位 hex UUID）
- `libraryUuid?: string`
- `x: number`, `y: number`（必填；单位见 `jlc-eda-mcp/docs/MCP_TOOLS.md`：`0.01 inch`）
- `subPartName?: string`
- `rotation?: number`, `mirror?: boolean`
- `addIntoBom?: boolean`, `addIntoPcb?: boolean`
- `designator?: string`, `name?: string | null`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.place_device", "arguments": { "deviceUuid": "DEVICE_UUID", "x": 100, "y": 100, "designator": "R1" } }'
```

## `jlc.schematic.get_component_pins`（读取器件引脚）

参数：

- `primitiveId: string`（必填）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.get_component_pins", "arguments": { "primitiveId": "PRIMITIVE_ID" } }'
```

## `jlc.schematic.connect_pins`（两引脚自动连线）

参数：

- `fromPrimitiveId: string`（必填）
- `fromPinNumber?: string` / `fromPinName?: string`（二选一，必填其一）
- `toPrimitiveId: string`（必填）
- `toPinNumber?: string` / `toPinName?: string`（二选一，必填其一）
- `net?: string`
- `style?: "manhattan" | "straight"`
- `midX?: number`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.connect_pins", "arguments": { "fromPrimitiveId": "R1_ID", "fromPinNumber": "1", "toPrimitiveId": "R2_ID", "toPinNumber": "1", "net": "NET1" } }'
```

## `jlc.schematic.netlabel.attach_pin`（引脚处放网络标签，类似 Alt+N）

> 网络标签本质是 `Wire.NET`（短导线 + net 属性）；**不会创建网络端口（netPorts）**。

参数：

- `primitiveId: string`（必填）
- `pinNumber?: string` / `pinName?: string`（二选一，必填其一）
- `net: string`（必填）
- `direction?: "left"|"right"|"up"|"down"`
- `length?: number`
- `id?: string`（可选：稳定 id；不填会自动生成）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.netlabel.attach_pin", "arguments": { "primitiveId": "U1_ID", "pinNumber": "1", "net": "VCC", "direction": "right", "length": 40 } }'
```

## `jlc.schematic.wire.create`（显式创建导线）

参数：

- `line: number[] | number[][]`（必填；长度必须为偶数且 `>=4`）
- `net?: string`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.wire.create", "arguments": { "line": [100,100,200,100], "net": "VCC" } }'
```

## `jlc.schematic.drc`（运行 DRC）

参数（可选）：

- `strict?: boolean`
- `userInterface?: boolean`（建议批处理时关闭 UI）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.drc", "arguments": { "strict": false, "userInterface": false } }'
```

## `jlc.schematic.save`（保存）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.save", "arguments": {} }'
```

