# RPC：器件库（Library）

> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `library.searchDevices`（搜索器件）

参数：

- `key: string`（必填）
- `libraryUuid?: string`（可选，32 位 hex UUID）
- `page?: number`（默认 `1`）
- `limit?: number`（默认 `10`）

```json
{"type":"request","id":"1","method":"library.searchDevices","params":{"key":"R 0603","limit":5}}
```

返回：`{ key, page, limit, items }`

工具等价：`jlc.library.search_devices`

## `library.getDevice`（读取器件详情）

参数：

- `deviceUuid: string`（必填，32 位 hex UUID）
- `libraryUuid?: string`

```json
{"type":"request","id":"2","method":"library.getDevice","params":{"deviceUuid":"DEVICE_UUID"}}
```

找不到会报：`NOT_FOUND`

工具等价：`jlc.library.get_device`
