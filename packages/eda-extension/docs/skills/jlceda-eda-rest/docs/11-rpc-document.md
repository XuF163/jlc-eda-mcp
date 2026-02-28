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
- `savePath?: string`（保存目录；不传则默认尝试 EDA Path；不可用则触发下载）
- `returnBase64?: boolean`（默认 `false`；为 `true` 时不落盘，直接在回包里返回 PNG 的 base64）
- `fileName?: string`
- `force?: boolean`（默认 `true`）

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
{"type":"request","id":"3","method":"captureRenderedAreaImage","params":{"zoomToAll":true,"savePath":"<ABS_DIR_WITH_TRAILING_SLASH>","fileName":"capture.png"}}
```

base64 模式示例：

```json
{"type":"request","id":"3","method":"captureRenderedAreaImage","params":{"zoomToAll":true,"returnBase64":true,"fileName":"capture.png"}}
```

落盘示例（把回包里的 `base64` 写成 PNG 文件到**当前工作目录**）：

Git Bash / macOS / Linux（需要 Python）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"captureRenderedAreaImage","params":{"zoomToAll":true,"returnBase64":true,"fileName":"capture.png"},"closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 - \
  | tail -n 1 \
  | python - <<'PY'
import sys, json, base64
resp = json.loads(sys.stdin.read())
if "error" in resp:
  raise SystemExit(resp["error"].get("message", "Unknown error"))
name = resp.get("result", {}).get("fileName") or "capture.png"
b64 = resp.get("result", {}).get("base64") or ""
open(name, "wb").write(base64.b64decode(b64))
print("saved:", name)
PY
```

Windows（PowerShell）：

```powershell
$req = '{"type":"request","id":"1","method":"captureRenderedAreaImage","params":{"zoomToAll":true,"returnBase64":true,"fileName":"capture.png"},"closeAfterResponse":true}'
$json = ($req | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 - | Select-Object -Last 1)
$resp = $json | ConvertFrom-Json
if ($resp.error) { throw $resp.error.message }
$name = if ($resp.result.fileName) { $resp.result.fileName } else { 'capture.png' }
[IO.File]::WriteAllBytes($name, [Convert]::FromBase64String($resp.result.base64))
Write-Host "saved: $name"
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
