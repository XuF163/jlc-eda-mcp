# RPC：网表（Netlist）

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。

## `exportSchematicNetlistFile`（导出网表文件）

参数（可选）：

- `netlistType?: string`（默认 `JLCEDA`）
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`（默认 `true`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "exportSchematicNetlistFile", "params": { "netlistType": "JLCEDA" } }'
```

工具等价：`jlc.schematic.export_netlist`

## `schematic.getNetlist`（直接读取网表文本，不落盘）

参数（可选）：

- `netlistType?: string`（默认 `JLCEDA`）
- `maxChars?: number`（可截断超大网表）
- `timeoutMs?: number`（默认 `30000`，这是 **方法参数**；HTTP 层也可用请求体顶层 `timeoutMs`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.getNetlist", "params": { "netlistType": "JLCEDA", "maxChars": 200000, "timeoutMs": 60000 } }'
```

说明：

- 如果当前 EDA 版本没有 `eda.sch_Netlist.getNetlist`，会返回 `NOT_SUPPORTED`

工具等价：`jlc.schematic.get_netlist`

