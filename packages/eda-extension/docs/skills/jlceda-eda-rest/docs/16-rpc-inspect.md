# RPC：Inspect / 选择 / 调试

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `schematic.listComponents`（列出器件/符号类图元）

参数（可选）：

- `componentType?: string`（支持：`part/sheet/netflag/netport/...`，非法会报错）
- `allSchematicPages?: boolean`（默认 `false`）
- `limit?: number`

```json
{"type":"request","id":"1","method":"schematic.listComponents","params":{"componentType":"part","limit":50}}
```

工具等价：`jlc.schematic.list_components`

## `schematic.listWires`（列出导线）

参数（可选，二选一）：

- `net?: string`
- `nets?: string[]`

```json
{"type":"request","id":"2","method":"schematic.listWires","params":{"net":"GND"}}
```

工具等价：`jlc.schematic.list_wires`

## `schematic.listTexts`（列出文本）

无参数：

```json
{"type":"request","id":"3","method":"schematic.listTexts"}
```

工具等价：`jlc.schematic.list_texts`

## `schematic.findByDesignator`（按位号查找）

参数：

- `designator: string`（R1/U2…）

```json
{"type":"request","id":"4","method":"schematic.findByDesignator","params":{"designator":"R1"}}
```

工具等价：`jlc.schematic.find_by_designator`

## `schematic.selectPrimitives`（按 primitiveId 选择/可选缩放）

参数：

- `primitiveIds: string[]`
- `clearFirst?: boolean`（默认 `true`）
- `zoom?: boolean`（默认 `false`）

```json
{"type":"request","id":"5","method":"schematic.selectPrimitives","params":{"primitiveIds":["ID1","ID2"],"zoom":true}}
```

工具等价：`jlc.schematic.select`

## `schematic.crossProbeSelect`（按 components/pins/nets 交叉选择）

参数（可选）：

- `components?: string[]`
- `pins?: string[]`
- `nets?: string[]`
- `highlight?: boolean`
- `select?: boolean`
- `zoom?: boolean`（默认 `false`）

```json
{"type":"request","id":"6","method":"schematic.crossProbeSelect","params":{"nets":["VCC"],"highlight":true,"select":true,"zoom":true}}
```

工具等价：`jlc.schematic.crossprobe_select`

## `schematic.clearSelection`（清空选择）

```json
{"type":"request","id":"7","method":"schematic.clearSelection"}
```

工具等价：`jlc.schematic.clear_selection`

## `schematic.zoomToAll`（缩放到适应全部图元）

参数（可选）：

- `tabId?: string`

```json
{"type":"request","id":"8","method":"schematic.zoomToAll","params":{}}
```

工具等价：`jlc.schematic.zoom_to_all`

## `schematic.indicator.show` / `schematic.indicator.clear`（红色定位标记）

1) 显示：

```json
{"type":"request","id":"9","method":"schematic.indicator.show","params":{"x":100,"y":100,"shape":"circle","r":20}}
```

2) 清除：

```json
{"type":"request","id":"10","method":"schematic.indicator.clear","params":{}}
```

工具等价：`jlc.schematic.indicator.show` / `jlc.schematic.indicator.clear`
