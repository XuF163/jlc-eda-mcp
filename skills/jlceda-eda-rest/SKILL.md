---
name: jlceda-eda-rest
description: Drive JLCEDA Pro from Codex via curl by calling a local REST proxy (jlceda-eda-mcp --http). Supports listing/calling all jlc.* tools, including full EDA API passthrough (jlc.eda.invoke/get/keys) and schematic generation (jlc.schematic.apply_ir).
---

# JLCEDA Pro REST（HTTP 调用版）

## When to use

- 你不想在 LLM 侧走 MCP tools（stdio 协议），而是希望 **skills + curl** 组织请求，把活干完。
- 需要“全量调用” JLCEDA Pro API：用 `jlc.eda.keys/get/invoke` 反射调用 `globalThis.eda.*`。
- 需要“原子化”调用扩展侧能力：用 `POST /v1/rpc` 直连 `eda-extension` 暴露的 RPC 方法（见下方 RPC docs）。

## Docs (schematic / 区域工作流)

- 区域性选取（Selection → BBox）：`docs/01-region-select.md`
- 读取选区（结构化快照）：`docs/02-region-read.md`
- 编辑选区（增补 / 增量更新）：`docs/03-region-edit.md`
- 加速与稳定性（批处理 / 避免卡死）：`docs/04-performance.md`

## Docs (RPC / 原子 API)

- HTTP 端点与鉴权（`/v1/tools/*` vs `/v1/rpc`）：`docs/05-http-proxy.md`
- 基础 / 状态：`docs/10-rpc-basics.md`
- 文档 / 视图 / 导出：`docs/11-rpc-document.md`
- 网表：`docs/12-rpc-netlist.md`
- 器件库：`docs/13-rpc-library.md`
- 原理图编辑（低阶）：`docs/14-rpc-schematic-edit.md`
- 原理图绘图（SchematicIR v1）：`docs/15-rpc-schematic-apply-ir.md`
- Inspect / 选择 / 调试：`docs/16-rpc-inspect.md`
- 全量 EDA API 透传（危险）：`docs/17-rpc-eda-passthrough.md`

## Docs (Tools / `jlc.*`)

- 基础：`docs/20-tools-basics.md`
- 全量 EDA API 透传（危险）：`docs/21-tools-eda-passthrough.md`
- 文档 / 视图 / 导出：`docs/22-tools-document-view.md`
- 网表：`docs/23-tools-netlist.md`
- 器件库：`docs/24-tools-library.md`
- Inspect / 选择 / 调试：`docs/25-tools-schematic-inspect.md`
- 原理图编辑（低阶）：`docs/26-tools-schematic-edit.md`
- 原理图绘图（SchematicIR v1）：`docs/27-tools-schematic-ir.md`
- 连通性验证（verify）：`docs/28-tools-verify.md`

## Reference

- 全部工具清单：`jlc-eda-mcp/docs/MCP_TOOLS.md`
- 扩展 RPC 方法清单：`jlc-eda-mcp/docs/EDA_EXTENSION_RPC.md`
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

5) 直连扩展 RPC（示例：`ping`）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "ping" }'
```

6) 画图推荐入口：`jlc.schematic.apply_ir`（SchematicIR v1）

- IR 规范见：`jlc-eda-mcp/docs/SCHEMATIC_IR.md`
- 扩展侧实现：`schematic.applyIr`（会维护 id->primitiveId 映射，便于增量更新）
