# Tools：全量 EDA API 透传（高级/危险）

> 目标：通过字符串路径访问 `globalThis.eda` 的任意能力（无需为每个 SDK 方法写 wrapper）。

限制/注意：

- 仅支持 **JSON 可序列化** 参数与返回（结果会做 `jsonSafe` 截断/去环）
- 无法跨桥传函数/回调：事件监听/回调型 API 不适用
- 路径只支持点号分段（不支持 `[]`），并禁止 `__proto__/prototype/constructor`

## `jlc.eda.keys`（探索：列出键名）

参数（可选）：

- `path?: string`（例如 `"sch_Document"`；缺省表示 `eda` 根）
- `jsonSafe?: { maxDepth?, maxArrayLength?, maxObjectKeys?, maxStringLength? }`
- `timeoutMs?: number`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.keys", "arguments": { "path": "sch_Document" } }'
```

## `jlc.eda.get`（读取值）

参数：

- `path: string`（必填）
- `jsonSafe?: ...`
- `timeoutMs?: number`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.get", "arguments": { "path": "sys_Environment.getEditorCurrentVersion" } }'
```

## `jlc.eda.invoke`（调用函数）

参数：

- `path: string`（必填，必须指向函数，例如 `"sch_Document.save"`）
- `args?: any[]`（位置参数）
- `arg?: any`（便捷：单参数）
- `jsonSafe?: ...`
- `timeoutMs?: number`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.invoke", "arguments": { "path": "sys_Environment.getEditorCurrentVersion" } }'
```

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.invoke", "arguments": { "path": "sch_Document.save", "args": [] } }'
```

