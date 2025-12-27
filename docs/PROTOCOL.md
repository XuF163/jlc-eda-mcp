# WebSocket Protocol (EDA Extension <-> MCP Server)

传输：WebSocket（建议仅绑定 `127.0.0.1`）。

## 1) Handshake

扩展连接后必须先发送：

```json
{
  "type": "hello",
  "token": "YOUR_TOKEN",
  "app": { "name": "jlceda-mcp-bridge", "version": "0.0.1" }
}
```

MCP Server 会校验 token（默认要求），不匹配会断开连接。

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
- `showMessage`
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
