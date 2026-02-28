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
- `savePath?: string`（保存目录；不传则默认尝试 EDA Path；不可用则触发下载）
- `returnBase64?: boolean`（默认 `false`；为 `true` 时不落盘，直接在回包里返回 PNG 的 base64）
- `fileName?: string`
- `force?: boolean`

> 想把图片“落盘到你运行 `websocat` 的当前工作目录”？有两种方式：
>
> 1) 显式传 `savePath` 为当前目录绝对路径（建议用正斜杠，避免 JSON 里反斜杠转义问题）：
>
> - Windows（Git Bash）：`$(pwd -W)/`
> - macOS/Linux：`$(pwd)/`
> - Windows（PowerShell）：`(($PWD.Path) -replace '\\','/') + '/'`
>
> 2) 传 `returnBase64:true`，由调用方解码并写入当前目录（无需扩展侧文件权限）

```json
{"type":"request","id":"3","method":"tools.call","params":{"name":"jlc.view.capture_png","arguments":{"zoomToAll":true,"savePath":"<ABS_DIR_WITH_TRAILING_SLASH>","fileName":"capture.png"}}}
```

base64 模式示例（不落盘，回包里返回 PNG base64）：

```json
{"type":"request","id":"3","method":"tools.call","params":{"name":"jlc.view.capture_png","arguments":{"zoomToAll":true,"returnBase64":true,"fileName":"capture.png"}}}
```

> 提示：`tools.call` 的回包结构会多一层，base64 通常在 `response.result.data.base64`。若要“落盘到当前工作目录”，推荐直接用 RPC `captureRenderedAreaImage`（示例见 `11-rpc-document.md`）。

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
