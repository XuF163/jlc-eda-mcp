# Tools：Inspect / 选择 / 调试

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。

## `jlc.schematic.list_components`（列出器件/符号类图元）

参数（可选）：

- `componentType?: string`（常见：`part/netflag/netport/...`；非法类型会报错）
- `allSchematicPages?: boolean`
- `limit?: number`

支持的 `componentType`（当前实现）：

- `part`, `sheet`, `netflag`, `netport`, `nonElectrical_symbol`, `short_symbol`, `netlabel`, `offPageConnector`, `diffPairsFlag`, `block_symbol`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.list_components", "arguments": { "componentType": "part", "limit": 50 } }'
```

## `jlc.schematic.list_wires`（列出导线）

参数（可选，二选一）：

- `net?: string`
- `nets?: string[]`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.list_wires", "arguments": { "net": "GND" } }'
```

## `jlc.schematic.list_texts`（列出文本）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.list_texts", "arguments": {} }'
```

## `jlc.schematic.find_by_designator`（按位号查找）

参数：

- `designator: string`（R1/U2…）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.find_by_designator", "arguments": { "designator": "R1" } }'
```

## `jlc.schematic.select`（按 primitiveId 选择/可选缩放）

参数：

- `primitiveIds: string[]`（必填）
- `clearFirst?: boolean`（默认 `true`）
- `zoom?: boolean`（默认 `false`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.select", "arguments": { "primitiveIds": ["ID1","ID2"], "zoom": true } }'
```

## `jlc.schematic.crossprobe_select`（按 components/pins/nets 交叉选择）

参数（可选）：

- `components?: string[]`
- `pins?: string[]`
- `nets?: string[]`
- `highlight?: boolean`
- `select?: boolean`
- `zoom?: boolean`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.crossprobe_select", "arguments": { "nets": ["VCC"], "highlight": true, "select": true, "zoom": true } }'
```

## `jlc.schematic.clear_selection`（清空选择）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.clear_selection", "arguments": {} }'
```

## `jlc.schematic.zoom_to_all`（缩放到适应全部图元）

参数（可选）：

- `tabId?: string`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.zoom_to_all", "arguments": {} }'
```

## `jlc.schematic.indicator.show` / `jlc.schematic.indicator.clear`（红色定位标记）

1) 显示（参数：`x/y` 必填；`shape?: "point"|"circle"`；`r?: number`）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.indicator.show", "arguments": { "x": 100, "y": 100, "shape": "circle", "r": 20 } }'
```

2) 清除（参数：`tabId?: string`）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.indicator.clear", "arguments": {} }'
```

## `jlc.schematic.snapshot`（结构化快照）

参数（可选）：

- `includeComponents?: boolean`（默认 `true`）
- `includeWires?: boolean`（默认 `true`）
- `includeTexts?: boolean`（默认 `true`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.snapshot", "arguments": { "includeTexts": true } }'
```

说明：

- 返回包含 `doc`（当前文档信息）与 `snapshot`（components/wires/texts）的结构化对象，适合 “读回 → 决策 → 增量修改”

