# Tools：器件库（Library）

> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## `jlc.library.search_devices`（搜索器件）

参数：

- `key: string`（必填）
- `libraryUuid?: string`（可选）
- `page?: number`
- `limit?: number`（最大 `100`）

```json
{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.library.search_devices","arguments":{"key":"R 0603","limit":5}}}
```

用法提示：

- 搜索拿到 `deviceUuid/libraryUuid` 后，再用 `jlc.schematic.place_device` 放置到图纸
