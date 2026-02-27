# Tools：文档 / 视图 / 导出

> 目标：通过 `tools.call` 调用文档/导出相关工具。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `jlc.document.current`（当前焦点文档）

无参数：

```json
{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.document.current","arguments":{}}}
```

## `jlc.schematic.ensure_page`（确保原理图图页）

参数（可选）：

- `boardName?: string`
- `schematicName?: string`
- `pageName?: string`

```json
{"type":"request","id":"2","method":"tools.call","params":{"name":"jlc.schematic.ensure_page","arguments":{"schematicName":"MCP Demo","pageName":"Sheet1"}}}
```

## `jlc.view.capture_png`（抓图 PNG）

参数（可选）：

- `tabId?: string`（默认当前 tab）
- `zoomToAll?: boolean`
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`

```json
{"type":"request","id":"3","method":"tools.call","params":{"name":"jlc.view.capture_png","arguments":{"zoomToAll":true,"fileName":"capture.png"}}}
```

## `jlc.document.export_epro2`（导出 `.epro2/.epro`）

参数（可选）：

- `fileType?: ".epro2" | ".epro"`（默认 `.epro2`）
- `password?: string`
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`

```json
{"type":"request","id":"4","method":"tools.call","params":{"name":"jlc.document.export_epro2","arguments":{"fileType":".epro2"}}}
```

## `jlc.document.get_source`（读取文档源码）

参数（可选）：

- `maxChars?: number`（默认 `200000`）

```json
{"type":"request","id":"5","method":"tools.call","params":{"name":"jlc.document.get_source","arguments":{"maxChars":200000}}}
```
