# WebSocket Protocol (EDA Extension <-> MCP Server)

传输：WebSocket（建议仅绑定 `127.0.0.1`）。

## 1) Handshake

扩展连接后必须先发送：

```json
{
  "type": "hello",
  "app": { "name": "jlceda-mcp-bridge", "version": "0.0.1" }
}
```

说明：当前实现不做 token 校验（本地桥接），旧版扩展若仍发送 `token` 字段会被忽略。

## 2) RPC Request / Response

Server -> Extension：

```json
{ "type": "request", "id": "uuid", "method": "schematic.placeDevice", "params": { /* ... */ } }
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
- `getCurrentDocumentInfo`
- `ensureSchematicPage`
- `captureRenderedAreaImage`
- `exportDocumentFile`
- `getDocumentSource`
- `exportSchematicNetlistFile`
- `library.searchDevices`
- `library.getDevice`
- `schematic.placeDevice`
- `schematic.getComponentPins`
- `schematic.connectPins`
- `schematic.createWire`
- `schematic.drc`
- `schematic.save`
- `schematic.applyIr`
- `eda.invoke`（高级/危险：按路径调用任意 `eda.*` 方法）
- `eda.get`（高级/危险：按路径读取任意 `eda.*` 值）
- `eda.keys`（高级/危险：按路径列出 `eda.*` 键）
