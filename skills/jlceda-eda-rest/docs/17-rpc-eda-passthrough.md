# RPC：全量 EDA API 透传（`eda.keys/get/invoke`，高级/危险）

> 目标：通过字符串路径访问 `globalThis.eda` 的任意能力（避免为每个 SDK 方法写 wrapper）。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

限制/注意：

- 仅支持 **JSON 可序列化** 参数与返回（结果会做 `jsonSafe` 截断/去环）
- 无法跨桥传函数/回调：事件监听/回调型 API 不适用
- 路径只支持点号分段（不支持 `[]`），并禁止 `__proto__/prototype/constructor`

## `eda.keys`（探索：列出键名）

参数（可选）：

- `path?: string`（例如 `"sch_Document"` 或 `"eda.sch_Document"`；默认 `"eda"`）
- `jsonSafe?: { maxDepth?, maxArrayLength?, maxObjectKeys?, maxStringLength? }`

```json
{"type":"request","id":"1","method":"eda.keys","params":{"path":"sch_Document"}}
```

## `eda.get`（读取值）

参数：

- `path: string`
- `jsonSafe?: ...`

```json
{"type":"request","id":"2","method":"eda.get","params":{"path":"sys_Environment.getEditorCurrentVersion"}}
```

## `eda.invoke`（调用函数）

参数：

- `path: string`（必须指向函数，例如 `"sch_Document.save"`）
- `args?: any[]`（位置参数）
- `arg?: any`（便捷：单参数）
- `jsonSafe?: ...`

```json
{"type":"request","id":"3","method":"eda.invoke","params":{"path":"sys_Environment.getEditorCurrentVersion"}}
```

```json
{"type":"request","id":"4","method":"eda.invoke","params":{"path":"sch_Document.save","args":[]}}
```

工具等价：`jlc.eda.keys` / `jlc.eda.get` / `jlc.eda.invoke`
