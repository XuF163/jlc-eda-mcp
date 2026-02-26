# WebSocket Protocol (EDA Extension <-> Bridge Server)

传输：WebSocket（建议仅绑定 `127.0.0.1`）。

## 1) Handshake

扩展连接后必须先发送：

```json
{
  "type": "hello",
  "app": { "name": "jlceda-mcp-bridge", "version": "0.0.12", "edaVersion": "3.x.y" }
}
```

说明：当前实现不做 token 校验（本地桥接），旧版扩展若仍发送 `token` 字段会被忽略。

## 2) RPC Request / Response

Server -> Extension：

```json
{
  "type": "request",
  "id": "uuid",
  "method": "schematic.placeDevice",
  "params": { /* ... */ },
  "closeAfterResponse": false
}
```

Extension -> Server（成功）：

```json
{ "type": "response", "id": "uuid", "result": { /* ... */ } }
```

Extension -> Server（失败）：

```json
{
  "type": "response",
  "id": "uuid",
  "error": { "code": "SOME_CODE", "message": "Human readable message", "data": { /* optional */ } }
}
```

## 3) Methods (current)

- `ping`
- `showMessage`（优先 toast，不再弹出阻塞式弹窗）
- `getStatus`
- `tools.list`（列出 `jlc.*` tools 定义）
- `tools.call`（按 `name + arguments` 调用 `jlc.*` tools）
- `getCurrentDocumentInfo`
- `ensureSchematicPage`
- `captureRenderedAreaImage`
- `exportDocumentFile`
- `getDocumentSource`
- `exportSchematicNetlistFile`
- `schematic.getNetlist`
- `library.searchDevices`
- `library.getDevice`
- `schematic.placeDevice`
- `schematic.getComponentPins`
- `schematic.connectPins`
- `schematic.createWire`
- `schematic.drc`
- `schematic.save`
- `schematic.applyIr`
- `schematic.listComponents`
- `schematic.listWires`
- `schematic.listTexts`
- `schematic.findByDesignator`
- `schematic.selectPrimitives`
- `schematic.crossProbeSelect`
- `schematic.clearSelection`
- `schematic.zoomToAll`
- `schematic.indicator.show`
- `schematic.indicator.clear`
- `eda.invoke`（高级/危险：按路径调用任意 `eda.*` 方法）
- `eda.get`（高级/危险：按路径读取任意 `eda.*` 值）
- `eda.keys`（高级/危险：按路径列出 `eda.*` 键）

## 4) Keepalive / Timing（很重要）

为了让扩展认为“链路可用”，Bridge 侧需要主动产生 **server -> extension** 的请求流量：

- **连接建立后尽快发一次 `ping`**（或任意请求），用于让扩展确认握手成功
- 后续建议 **每 ~15s 发送一次 `ping`** 作为 keepalive（否则扩展可能会认为“长时间无 server 请求”而断开并重连）

### 短驻模式（websocat / 一次性调用）

如果你不想维护常驻 Bridge（例如希望“每次调用启动一次 WS 服务端”），可以在 `request` 中设置：

- `closeAfterResponse: true`

扩展会在发送对应 `response` 后主动断开连接，便于下一次短驻启动复用同一端口。
