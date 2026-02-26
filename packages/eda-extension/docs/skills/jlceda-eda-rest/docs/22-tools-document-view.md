# Tools：文档 / 视图 / 导出

> 目标：通过 `/v1/tools/call` 调用文档/导出相关工具。

## `jlc.document.current`（当前焦点文档）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.document.current", "arguments": {} }'
```

## `jlc.schematic.ensure_page`（确保原理图图页）

参数（可选）：

- `boardName?: string`
- `schematicName?: string`
- `pageName?: string`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.schematic.ensure_page", "arguments": { "schematicName": "MCP Demo", "pageName": "Sheet1" } }'
```

## `jlc.view.capture_png`（抓图 PNG）

参数（可选）：

- `tabId?: string`（默认当前 tab）
- `zoomToAll?: boolean`
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.view.capture_png", "arguments": { "zoomToAll": true, "fileName": "capture.png" } }'
```

## `jlc.document.export_epro2`（导出 `.epro2/.epro`）

参数（可选）：

- `fileType?: ".epro2" | ".epro"`（默认 `.epro2`）
- `password?: string`
- `savePath?: string`
- `fileName?: string`
- `force?: boolean`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.document.export_epro2", "arguments": { "fileType": ".epro2" } }'
```

## `jlc.document.get_source`（读取文档源码）

参数（可选）：

- `maxChars?: number`（默认 `200000`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.document.get_source", "arguments": { "maxChars": 200000 } }'
```

