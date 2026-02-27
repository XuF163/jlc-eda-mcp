# RPC：文档 / 视图 / 导出

> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `getCurrentDocumentInfo`（当前焦点文档）

无参数：

```json
{"type":"request","id":"1","method":"getCurrentDocumentInfo"}
```

返回：`{ documentType, uuid, tabId, ... }` 或 `undefined`

工具等价：`jlc.document.current`

## `ensureSchematicPage`（确保原理图图页）

参数（可选）：

- `boardName?: string`
- `schematicName?: string`
- `pageName?: string`

```json
{"type":"request","id":"2","method":"ensureSchematicPage","params":{"schematicName":"MCP Demo","pageName":"Sheet1"}}
```

返回：原理图图页的 `{ documentType:1, uuid, tabId }`

工具等价：`jlc.schematic.ensure_page`

## `captureRenderedAreaImage`（抓图 PNG）

参数（可选）：

- `tabId?: string`（默认当前 tab）
- `zoomToAll?: boolean`（默认 `true`）
- `savePath?: string`（默认尝试 EDA Path；不可用则触发下载）
- `fileName?: string`
- `force?: boolean`（默认 `true`）

```json
{"type":"request","id":"3","method":"captureRenderedAreaImage","params":{"zoomToAll":true,"fileName":"capture.png"}}
```

工具等价：`jlc.view.capture_png`

## `exportDocumentFile`（导出 `.epro2/.epro`）

参数（可选）：

- `fileType?: ".epro2" | ".epro"`（默认 `.epro2`）
- `password?: string`
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`（默认 `true`）

```json
{"type":"request","id":"4","method":"exportDocumentFile","params":{"fileType":".epro2"}}
```

工具等价：`jlc.document.export_epro2`

## `getDocumentSource`（读取文档源码）

参数（可选）：

- `maxChars?: number`（默认 `200000`）

```json
{"type":"request","id":"5","method":"getDocumentSource","params":{"maxChars":200000}}
```

返回：`{ source, truncated, totalChars }`

工具等价：`jlc.document.get_source`
