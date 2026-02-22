---
name: jlceda-eda-rest
description: Drive JLCEDA Pro from Codex via curl by calling a local REST proxy (jlceda-eda-mcp --http). Supports listing/calling all jlc.* tools, including full EDA API passthrough (jlc.eda.invoke/get/keys) and schematic generation (jlc.schematic.apply_ir).
---

# JLCEDA Pro REST（HTTP 调用版）

## When to use

- 你不想在 LLM 侧走 MCP tools（stdio 协议），而是希望 **skills + curl** 组织请求，把活干完。
- 需要“全量调用” JLCEDA Pro API：用 `jlc.eda.keys/get/invoke` 反射调用 `globalThis.eda.*`。

## Docs (schematic / 区域工作流)

- 区域性选取（Selection → BBox）：`docs/01-region-select.md`
- 读取选区（结构化快照）：`docs/02-region-read.md`
- 编辑选区（增补 / 增量更新）：`docs/03-region-edit.md`
- 加速与稳定性（批处理 / 避免卡死）：`docs/04-performance.md`

## Reference

- 全部工具清单：`jlc-eda-mcp/docs/MCP_TOOLS.md`
- 原理图 IR 规范：`jlc-eda-mcp/docs/SCHEMATIC_IR.md`

## Start the local proxy

在仓库根目录运行（会监听 WS 端口给 EDA 扩展连；同时开放 HTTP 给 curl 调）：

```bash
node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

可选：设置 HTTP token（避免本机其它进程乱调）：

```bash
JLCEDA_HTTP_TOKEN=YOUR_TOKEN node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

## Quick examples (curl)

1) 查看桥接状态：

```bash
curl -s http://127.0.0.1:9151/v1/status
```

2) 列出可用工具（等价于 MCP 的 list tools）：

```bash
curl -s http://127.0.0.1:9151/v1/tools
```

3) 调用工具（通用入口）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_TOKEN' \
  -d '{ "name": "jlc.document.current", "arguments": {} }'
```

4) 探索 / 透传任意 EDA API（示例：取版本号）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.invoke", "arguments": { "path": "sys_Environment.getEditorCurrentVersion" } }'
```

5) 画图推荐入口：`jlc.schematic.apply_ir`（SchematicIR v1）

- IR 规范见：`jlc-eda-mcp/docs/SCHEMATIC_IR.md`
- 扩展侧实现：`schematic.applyIr`（会维护 id->primitiveId 映射，便于增量更新）
