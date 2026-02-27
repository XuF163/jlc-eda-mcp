# Tools：网表（Netlist）

> 前置：当前必须在 **原理图图页**（否则会报 `NOT_IN_SCHEMATIC_PAGE`）。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `jlc.schematic.export_netlist`（导出网表文件）

参数（可选）：

- `netlistType?: string`（默认 `JLCEDA`）
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`

```json
{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.schematic.export_netlist","arguments":{"netlistType":"JLCEDA"}}}
```

## `jlc.schematic.get_netlist`（直接读取网表文本，不落盘）

参数（可选）：

- `netlistType?: string`（默认 `JLCEDA`）
- `maxChars?: number`
- `timeoutMs?: number`（方法内部超时）

```json
{"type":"request","id":"2","method":"tools.call","params":{"name":"jlc.schematic.get_netlist","arguments":{"netlistType":"JLCEDA","maxChars":200000,"timeoutMs":60000}}}
```

说明：

- 如果当前 EDA 版本没有 `eda.sch_Netlist.getNetlist`，会返回 `NOT_SUPPORTED`
