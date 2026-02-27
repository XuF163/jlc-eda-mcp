# RPC：原理图编辑（低阶图元）

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `schematic.placeDevice`（放置器件）

参数：

- `deviceUuid: string`（必填，32 位 hex UUID）
- `libraryUuid?: string`
- `x: number`, `y: number`（必填；单位见 `jlc-eda-mcp/docs/MCP_TOOLS.md` 的说明：`0.01 inch`）
- `subPartName?: string`
- `rotation?: number`, `mirror?: boolean`
- `addIntoBom?: boolean`, `addIntoPcb?: boolean`
- `designator?: string`, `name?: string | null`

```json
{"type":"request","id":"1","method":"schematic.placeDevice","params":{"deviceUuid":"DEVICE_UUID","x":100,"y":100,"designator":"R1"}}
```

返回：`{ primitiveId }`

工具等价：`jlc.schematic.place_device`

## `schematic.getComponentPins`（读取器件引脚）

参数：

- `primitiveId: string`

```json
{"type":"request","id":"2","method":"schematic.getComponentPins","params":{"primitiveId":"PRIMITIVE_ID"}}
```

返回：`{ primitiveId, pins:[{ pinNumber/pinName/x/y/... }] }`

工具等价：`jlc.schematic.get_component_pins`

## `schematic.connectPins`（两引脚自动连线）

参数：

- `fromPrimitiveId: string`
- `fromPinNumber?: string` / `fromPinName?: string`（二选一）
- `toPrimitiveId: string`
- `toPinNumber?: string` / `toPinName?: string`（二选一）
- `net?: string`
- `style?: "manhattan" | "straight"`（默认 `manhattan`）
- `midX?: number`（Manhattan 中间转折 x）

```json
{"type":"request","id":"3","method":"schematic.connectPins","params":{"fromPrimitiveId":"R1_ID","fromPinNumber":"1","toPrimitiveId":"R2_ID","toPinNumber":"1","net":"NET1"}}
```

返回：`{ wirePrimitiveId, line }`

工具等价：`jlc.schematic.connect_pins`

## `schematic.createWire`（显式创建导线）

参数：

- `line: number[] | number[][]`（长度必须为偶数且 `>=4`）
- `net?: string`

```json
{"type":"request","id":"4","method":"schematic.createWire","params":{"line":[100,100,200,100],"net":"VCC"}}
```

工具等价：`jlc.schematic.wire.create`

## `schematic.drc`（运行 DRC）

参数（可选）：

- `strict?: boolean`（默认 `false`）
- `userInterface?: boolean`（默认 `false`，建议批处理时关闭 UI）

```json
{"type":"request","id":"5","method":"schematic.drc","params":{"strict":false,"userInterface":false}}
```

## `schematic.save`（保存）

无参数：

```json
{"type":"request","id":"6","method":"schematic.save"}
```
