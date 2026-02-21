---
name: jlceda-eda-rest
description: Drive JLCEDA Pro from Codex via curl by calling a local REST proxy (jlceda-eda-mcp --http). Supports listing/calling all jlc.* tools, including full EDA API passthrough (jlc.eda.invoke/get/keys) and schematic generation (jlc.schematic.apply_ir).
---

# JLCEDA Pro REST（curl 调用版）

## When to use

- 你不想在 LLM 侧走 MCP tools（stdio 协议），而是希望 **skills + curl** 组织请求，把活干完。
- 需要“全量调用” JLCEDA Pro API：用 `jlc.eda.keys/get/invoke` 反射调用 `globalThis.eda.*`。

## Start the local proxy

在仓库根目录运行（会监听 WS 端口给 EDA 扩展连；同时开放 HTTP 给 curl 调）：

```bash
node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

可选：设置 HTTP token（避免本机其它进程乱调）：

```bash
JLCEDA_HTTP_TOKEN=YOUR_TOKEN node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

## Quick curl examples

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

## 识别用户“选区”（原理图）

EDA Pro 的 API 没看到直接暴露“拖拽框选矩形”的坐标，但可以用 **已选中图元 → BBox** 来表示用户选区。

1) 读取用户当前选中的图元 ID：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.invoke", "arguments": { "path": "sch_SelectControl.getAllSelectedPrimitives_PrimitiveId" } }'
```

2) 计算这些图元的包围盒（BBox）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.eda.invoke", "arguments": { "path": "sch_Primitive.getPrimitivesBBox", "args": [ ["PRIMITIVE_ID_1","PRIMITIVE_ID_2"] ] } }'
```

> 把上一步返回的 primitiveIds 填到 `args[0]` 里即可，返回值形如 `{minX,minY,maxX,maxY}`。

补充能力：

- 读取鼠标在画布坐标：`sch_SelectControl.getCurrentMousePosition`
- 获取“适应选中”的区域（会缩放视图）：`dmt_EditorControl.zoomToSelectedPrimitives`
