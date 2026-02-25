# Tools：器件库（Library）

## `jlc.library.search_devices`（搜索器件）

参数：

- `key: string`（必填）
- `libraryUuid?: string`（可选）
- `page?: number`
- `limit?: number`（最大 `100`）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.library.search_devices", "arguments": { "key": "R 0603", "limit": 5 } }'
```

用法提示：

- 搜索拿到 `deviceUuid/libraryUuid` 后，再用 `jlc.schematic.place_device` 放置到图纸

