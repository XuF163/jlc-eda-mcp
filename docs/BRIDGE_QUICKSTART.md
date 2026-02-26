# 自建 Bridge 快速指南（给 curl / LLM 用）

这份文档用于指导你在 **不依赖 MCP（stdio）** 的情况下，快速搭建一个“常驻本机”的 Bridge 服务，让 LLM 可以用 `curl`/HTTP 调用 EDA 扩展，从而实现对 `globalThis.eda.*` 的高权限自动化操作。

> 背景：EDA 扩展自身是 **WebSocket 客户端**，只会主动连接一个 `ws://127.0.0.1:<port>` 的服务端；扩展并不会在 EDA 进程内监听 HTTP/TCP 端口给 `curl` 直接访问。

## 你需要实现什么（最小闭环）

一套最小可用链路如下：

```
LLM / curl / scripts
        |
        | HTTP (optional but recommended)
        v
  Bridge service (your implementation)
        |
        | WebSocket RPC (docs/PROTOCOL.md)
        v
 JLCEDA Pro Extension (packages/eda-extension)
        |
        v
  globalThis.eda.*
```

Bridge 服务至少需要：

1) **WebSocket 服务端**（必须）
- 监听 `ws://127.0.0.1:<port>`（默认可用 9050）
- 接受来自扩展的连接与 `hello`
- 能发送 `request` 并等待对应 `response`（按 `id` 匹配）
- 做 keepalive（`ping`）

2) **HTTP 入口**（强烈建议，方便 LLM 用 curl）
- `GET /v1/status`：返回是否已连接扩展 + 连接信息
- `POST /v1/rpc`：把 `{ method, params?, timeoutMs? }` 转成 WS `request` 并返回结果

> 参考实现：本仓库的 `packages/mcp-server` 就是一个 Bridge（WS + HTTP + 可选 MCP）。  
> 可直接参考 `packages/mcp-server/src/bridge/wsBridge.ts` 与 `packages/mcp-server/src/httpServer.ts`。

## WebSocket 协议与 keepalive

协议格式见 `docs/PROTOCOL.md`。注意两点：

- 扩展连上后会先发 `hello`
- Bridge 侧需要主动发送请求流量：**连接后尽快发一次 `ping`**，并建议后续 **每 ~15s 发一次 `ping`** 作为 keepalive

最小 RPC 示例（server -> extension）：

```json
{ "type": "request", "id": "1", "method": "ping" }
```

全权限（反射）调用示例（server -> extension）：

```json
{
  "type": "request",
  "id": "2",
  "method": "eda.invoke",
  "params": {
    "path": "sch_SelectControl.getAllSelectedPrimitives_PrimitiveId",
    "args": []
  }
}
```

## 快速手工验证（可选：websocat）

如果你只是想“先验证扩展能连上 / 能收发 RPC”，可以用单文件工具 `websocat` 临时充当 WS 服务端（更适合手工调试，不适合作为长期 Bridge）：

```bash
websocat -t ws-l:127.0.0.1:9050 -
```

扩展连上后你会看到 `hello`。然后可直接粘贴发送一行 JSON：

```json
{ "type": "request", "id": "1", "method": "ping" }
```

## 建议的 HTTP API（给 LLM / curl）

### 1) `GET /v1/status`

返回示例（自由发挥，建议至少包含 `connected` 与 `listenPort`）：

```json
{ "ok": true, "bridge": { "listenPort": 9050, "connected": true } }
```

### 2) `POST /v1/rpc`

请求体：

```json
{ "method": "eda.invoke", "params": { "path": "sch_Document.save" }, "timeoutMs": 60000 }
```

返回体：

```json
{ "ok": true, "result": { /* extension response */ } }
```

curl 示例：

```bash
curl -s http://127.0.0.1:9151/v1/status

curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H "content-type: application/json" \
  -d '{"method":"ping"}'

curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H "content-type: application/json" \
  -d '{"method":"eda.invoke","params":{"path":"sch_SelectControl.getAllSelectedPrimitives_PrimitiveId"}}'
```

## Bridge 侧实现要点（LLM 写代码时可直接照抄）

下面这份 checklist 基本覆盖“能跑起来”的关键点：

- 只绑定本机：WebSocket 与 HTTP 都建议监听 `127.0.0.1`（不要暴露到公网/局域网）
- 单连接模型（最简单）：只允许 1 个扩展连接；新连接进来就踢掉旧连接
- `call()` 语义：
  - 生成 `id`（uuid 或自增）
  - 发送 `{type:'request', id, method, params}`
  - 在 Map 里记录 `pending[id] = resolve/reject + timeout`
  - 收到 `{type:'response', id, result|error}` 后 resolve/reject
- keepalive：定时 `call('ping')`，并在断开后清理所有 pending（让 HTTP 侧快速失败）
- 超时：每次 call 应该有 timeoutMs（例如 30~60s）
- 负载控制：
  - 仅允许 JSON 可序列化的参数/返回
  - `eda.invoke/get/keys` 建议支持 `jsonSafe` 限制（见 `docs/EDA_EXTENSION_RPC.md` 说明）

## 安全提醒（强烈建议）

`eda.invoke` 等价于远程反射调用 `globalThis.eda.*`，权限很高。建议：

- 默认仅绑定 `127.0.0.1`
- HTTP 加 bearer token（例如 `Authorization: Bearer <token>`），并把 token 存在本机环境变量里
- 不要把 Bridge 的 HTTP/WS 端口直接映射到公网/局域网
