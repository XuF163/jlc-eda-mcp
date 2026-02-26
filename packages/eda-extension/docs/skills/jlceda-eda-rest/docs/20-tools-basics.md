# MCP Tools 基础（`/v1/tools/call`）

> 目标：通过 HTTP 调用 MCP tools（`jlc.*`），用于“状态检查 / 基础提示”。

通用格式：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "TOOL_NAME", "arguments": {} }'
```

> 如启用了 token，按 `docs/05-http-proxy.md` 增加 `authorization` 头。

## `jlc.status`（桥接状态）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.status", "arguments": {} }'
```

## `jlc.bridge.ping`（连通性检查）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.bridge.ping", "arguments": {} }'
```

## `jlc.bridge.show_message`（EDA 内 toast）

参数：

- `message: string`（必填）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.bridge.show_message", "arguments": { "message": "Hello from MCP" } }'
```

说明：

- 这是 best-effort：toast 不可用时会 no-op（不会弹阻塞弹窗）

