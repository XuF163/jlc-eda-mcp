# RPC：Inspect / 选择 / 调试

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。

## `schematic.listComponents`（列出器件/符号类图元）

参数（可选）：

- `componentType?: string`（支持：`part/sheet/netflag/netport/...`，非法会报错）
- `allSchematicPages?: boolean`（默认 `false`）
- `limit?: number`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.listComponents", "params": { "componentType": "part", "limit": 50 } }'
```

工具等价：`jlc.schematic.list_components`

## `schematic.listWires`（列出导线）

参数（可选，二选一）：

- `net?: string`
- `nets?: string[]`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.listWires", "params": { "net": "GND" } }'
```

工具等价：`jlc.schematic.list_wires`

## `schematic.listTexts`（列出文本）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.listTexts" }'
```

工具等价：`jlc.schematic.list_texts`

## `schematic.findByDesignator`（按位号查找）

参数：

- `designator: string`（R1/U2…）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.findByDesignator", "params": { "designator": "R1" } }'
```

工具等价：`jlc.schematic.find_by_designator`

## `schematic.selectPrimitives`（按 primitiveId 选择/可选缩放）

参数：

- `primitiveIds: string[]`
- `clearFirst?: boolean`（默认 `true`）
- `zoom?: boolean`（默认 `false`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.selectPrimitives", "params": { "primitiveIds": ["ID1","ID2"], "zoom": true } }'
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

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.crossProbeSelect", "params": { "nets": ["VCC"], "highlight": true, "select": true, "zoom": true } }'
```

工具等价：`jlc.schematic.crossprobe_select`

## `schematic.clearSelection`（清空选择）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.clearSelection" }'
```

工具等价：`jlc.schematic.clear_selection`

## `schematic.zoomToAll`（缩放到适应全部图元）

参数（可选）：

- `tabId?: string`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.zoomToAll", "params": {} }'
```

工具等价：`jlc.schematic.zoom_to_all`

## `schematic.indicator.show` / `schematic.indicator.clear`（红色定位标记）

1) 显示：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.indicator.show", "params": { "x": 100, "y": 100, "shape": "circle", "r": 20 } }'
```

2) 清除：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.indicator.clear", "params": {} }'
```

工具等价：`jlc.schematic.indicator.show` / `jlc.schematic.indicator.clear`

