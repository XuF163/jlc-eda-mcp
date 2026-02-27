# Tools 基础（`tools.call`）

> 目标：通过扩展侧的 `tools.call` 调用 `jlc.*` tools，用于“状态检查 / 基础提示”。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

通用格式：

```json
{"type":"request","id":"1","method":"tools.call","params":{"name":"TOOL_NAME","arguments":{}}}
```

> 如需短驻/一次性调用，可在 `request` 顶层增加 `closeAfterResponse:true`（见 `../SKILL.md`）。

## `jlc.status`（桥接状态）

无参数：

```json
{"type":"request","id":"2","method":"tools.call","params":{"name":"jlc.status","arguments":{}}}
```

## `jlc.bridge.ping`（连通性检查）

无参数：

```json
{"type":"request","id":"3","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}}}
```

## `jlc.bridge.show_message`（EDA 内 toast）

参数：

- `message: string`（必填）

```json
{"type":"request","id":"4","method":"tools.call","params":{"name":"jlc.bridge.show_message","arguments":{"message":"Hello from MCP"}}}
```

说明：

- 这是 best-effort：toast 不可用时会 no-op（不会弹阻塞弹窗）
