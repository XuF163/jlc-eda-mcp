# jlc-eda-mcp（JLCEDA Pro 本地桥接）

在 **嘉立创EDA 专业版本地客户端** 中通过“扩展 + 本机服务”桥接，把 EDA 能力暴露为一组 `jlc.*` 工具，供 LLM 自动化完成原理图的 **读取 / 局部编辑 / 增补绘制 / 导出** 等工作。

本仓库当前的推荐使用方式是：**HTTP REST + Skills（curl / node fetch）**。MCP（stdio）仍可用，但不再作为唯一入口。

## 已验证能力（开发联调）

- 端到端链路：EDA 扩展连接本机 WebSocket Bridge（`ws://127.0.0.1:<port>`），HTTP 侧可 `GET /v1/status` 确认连接状态。
- 工具调用：`POST /v1/tools/call` 可稳定调用全部 `jlc.*` tools（等价 MCP tools 的调用入口）。
- 原理图读：`jlc.schematic.list_components / list_wires / list_texts` + `jlc.eda.invoke(sch_SelectControl.* / sch_Primitive.getPrimitivesBBox)` 实现“选区 → BBox → 区域读回”。
- 原理图写：`jlc.schematic.apply_ir`（SchematicIR v1）支持增补/增量更新；配合分批导线写入可显著降低卡死概率。
- 器件解析：`jlc.library.search_devices` 用于把型号/关键字解析为 `deviceUuid/libraryUuid`，避免把图元 uuid 误当成器件 uuid 导致异常。
- 全量 API 透传：`jlc.eda.keys/get/invoke` 可反射调用 `globalThis.eda.*`（高级/有风险，但便于快速覆盖未封装能力）。

## 推荐工作流：Skills（HTTP-only）

- Skills 入口：`skills/jlceda-eda-rest/SKILL.md`
  - 区域选取/读取/编辑/加速拆分文档：`skills/jlceda-eda-rest/docs/`

启动（在 `jlc-eda-mcp` 目录）：

```bash
npm install
npm run build
node packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

验证：

```bash
curl -s http://127.0.0.1:9151/v1/status
```

## MCP（stdio）支持程度

- 仍提供 MCP Server（stdio）以便接入通用 MCP 客户端，但仓库的默认示例/文档会优先覆盖 **HTTP + Skills** 的调用方式。
- 若要启用 MCP（stdio），不要加 `--no-mcp`：

```bash
node packages/mcp-server/dist/cli.js --port 9050
```

（可选）npx 配置示例：

```json
{
  "command": "npx",
  "args": ["-y", "jlceda-eda-mcp", "--port", "9050"]
}
```


## 目录结构

- `packages/mcp-server`：WebSocket Bridge（供 EDA 扩展连接）+ MCP（stdio，可选）+ HTTP REST（可选）
- `packages/eda-extension`：嘉立创EDA 专业版扩展（桥接执行真实的 `eda.*` API）
- `skills/`：面向 LLM 的 Skills（推荐使用 HTTP REST 驱动）
- `docs/`：协议、工具清单、IR 规范与验证工具等

## 文档索引

- 安装与环境：`docs/SETUP.md`
- 工具清单：`docs/MCP_TOOLS.md`
- SchematicIR：`docs/SCHEMATIC_IR.md`
- 连通性验证：`docs/VERIFY_NETS.md`
- 绘图风格：`docs/SCHEMATIC_STYLE.md`
- WebSocket 协议：`docs/PROTOCOL.md`
- 卸载排障：`docs/UNINSTALL.md`

npm包仅提供有限的功能，出于灵活性考虑，建议使用codex驱动的skills，目前已确认可在gpt5.2 xhigh下实现基础的跨工程交互能力(网表模块复用)

