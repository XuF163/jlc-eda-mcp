---
name: jlceda-eda-rest
description: Drive JLCEDA Pro from Codex via WebSocket RPC using websocat as a short-lived local WS server (no Node/MCP required). Supports listing/calling all jlc.* tools and full EDA API passthrough (eda.invoke/get/keys).
---

# JLCEDA Pro WebSocket（websocat 短驻版）

## When to use

- 你不想在用户侧安装 Node / MCP 组件，希望只装一个通用工具（`websocat`）就能把请求转成 WS RPC。
- 需要“全量调用” JLCEDA Pro API：用 `jlc.eda.keys/get/invoke`（tools）或 `eda.keys/get/invoke`（RPC）反射调用 `globalThis.eda.*`。
- 需要“原子化”调用扩展侧能力：直接发 WS `request` 调扩展 RPC 方法（见下方 RPC docs）。

## Quick start（推荐：短驻 / 按需启动）

前置：

1) 在 EDA 扩展里配置 WebSocket URL（默认）：`ws://127.0.0.1:9050`
2) 本机安装 `websocat`（安装方式见仓库根 `README.md`）

### 1) 手工调试（交互式）

启动一个 WS 服务端，等待扩展连接：

```bash
websocat -t ws-l:127.0.0.1:9050 -
```

扩展连上后你会看到一条 `hello`。然后把本文档/下方 docs 里的 **单行 JSON**（`type=request`）粘贴进去发送即可。

### 2) 一次性调用（LLM/脚本友好）

把一条 WS `request`（单行 JSON）通过 stdin 喂给 `websocat`，并让扩展回包后主动断开（`closeAfterResponse:true`）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 注意：`websocat` 会一直等到扩展连上才会发送；若扩展在重连 backoff 中，可能需要等待几十秒。

## 验证“未使用旧 mcp-server”（重要）

短驻方案下，`9050` 端口应由 **websocat** 监听；如果被 `node.exe`（旧 `packages/mcp-server`）占用，会导致扩展连不上。

Windows（PowerShell）检查：

```powershell
netstat -ano | findstr :9050
tasklist /fi "pid eq <PID>"
```

## Docs (schematic / 区域工作流)

- 区域性选取（Selection → BBox）：`docs/01-region-select.md`
- 读取选区（结构化快照）：`docs/02-region-read.md`
- 编辑选区（增补 / 增量更新）：`docs/03-region-edit.md`
- 加速与稳定性（批处理 / 避免卡死）：`docs/04-performance.md`

## Docs (RPC / 原子 API)

- 传输方式与安全（websocat / legacy HTTP）：`docs/05-http-proxy.md`
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
- WebSocket 协议：`jlc-eda-mcp/docs/PROTOCOL.md`

## Legacy：HTTP Proxy（不推荐）

如果你强依赖 `curl http://127.0.0.1:9151/v1/*` 这类 HTTP 端点（或想要 `/docs` 静态入口），只能继续使用旧的 `packages/mcp-server`（Node），但该组件已计划废弃：

```bash
node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

> 说明：WS 侧扩展仍然是 **WebSocket 客户端**；无论你用不用 HTTP/MCP，都需要一个本机 WS 服务端让扩展连上。
