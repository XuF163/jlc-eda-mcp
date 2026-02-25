# RPC 基础（`ping` / `showMessage` / `getStatus`）

> 目标：用 `POST /v1/rpc` 直接调用 **EDA 扩展（`eda-extension`）** 对外暴露的 RPC 方法。

通用格式：

```json
{ "method": "METHOD_NAME", "params": { } }
```

## `ping`（连通性检查）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "ping" }'
```

返回：`{ pong: true, ts }`

## `showMessage`（EDA 内 toast 提示）

参数：

- `message: string`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "showMessage", "params": { "message": "Hello from MCP" } }'
```

说明：

- **尽量 toast，不弹阻塞弹窗**（不可用时会 no-op）

## `getStatus`（扩展侧桥接状态快照）

无参数：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "getStatus" }'
```

返回：`BridgeStatusSnapshot`（扩展名/版本、connected、serverUrl、lastError 等）

> 也可以直接用 `GET /v1/status`（更轻量）。

