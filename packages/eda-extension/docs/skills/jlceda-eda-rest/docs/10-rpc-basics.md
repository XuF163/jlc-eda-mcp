# RPC 基础（`ping` / `showMessage` / `getStatus`）

> 目标：按 `jlc-eda-mcp/docs/PROTOCOL.md` 发送 WebSocket `request`，直接调用 **EDA 扩展（`eda-extension`）** 对外暴露的 RPC 方法。

通用格式：

```json
{"type":"request","id":"1","method":"METHOD_NAME","params":{}}
```

## `ping`（连通性检查）

无参数：

```json
{"type":"request","id":"1","method":"ping"}
```

返回：`{ pong: true, ts }`

## `showMessage`（EDA 内 toast 提示）

参数：

- `message: string`

```json
{"type":"request","id":"2","method":"showMessage","params":{"message":"Hello from MCP"}}
```

说明：

- **尽量 toast，不弹阻塞弹窗**（不可用时会 no-op）

## `getStatus`（扩展侧桥接状态快照）

无参数：

```json
{"type":"request","id":"3","method":"getStatus"}
```

返回：`BridgeStatusSnapshot`（扩展名/版本、connected、serverUrl、lastError 等）

工具等价：`jlc.status`（`tools.call`）。
