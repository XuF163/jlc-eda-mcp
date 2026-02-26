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

## 自建 Bridge（不依赖 MCP）

EDA 扩展本身是 **WebSocket 客户端**，不会在 EDA 进程内监听 HTTP/TCP 端口；因此无论你是否使用 MCP（stdio），都需要一个本机常驻的 **Bridge 服务**来：

- 作为 WebSocket 服务端监听 `ws://127.0.0.1:<port>`（等待 EDA 扩展连接）
- 再把外部请求（curl/LLM/脚本）转成 `docs/PROTOCOL.md` 里的 RPC `request/response`

本仓库提供的 `packages/mcp-server` 是一个参考实现（WS Bridge + 可选 HTTP + 可选 MCP）。  
如果你希望在用户侧快速“自己搭一个最小 Bridge”（例如不想启用 MCP，或不方便使用 Node），请直接看：

- `docs/BRIDGE_QUICKSTART.md`

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

## 版本发布（自动提升 + git tag）

在仓库根目录执行：

- Patch：`npm run release:patch`
- Minor：`npm run release:minor`
- Major：`npm run release:major`

以上命令会统一提升版本号（根 `package.json` 为准，同步到各 package 与扩展 `extension.json`），并自动创建 git commit + tag（形如 `v0.0.14`）。

## 目录结构

- `packages/mcp-server`：WebSocket Bridge（供 EDA 扩展连接）+ MCP（stdio，可选）+ HTTP REST（可选）
- `packages/eda-extension`：嘉立创EDA 专业版扩展（桥接执行真实的 `eda.*` API；扩展说明见 `packages/eda-extension/README.md`）
- `skills/`：面向 LLM 的 Skills（推荐使用 HTTP REST 驱动）
- `docs/`：协议、工具清单、IR 规范与验证工具等

## 文档索引

- 安装与环境：`docs/SETUP.md`
- 扩展说明（EDA Extension）：`packages/eda-extension/README.md`
- 扩展更新记录：`packages/eda-extension/CHANGELOG.md`
- 工具清单：`docs/MCP_TOOLS.md`
- SchematicIR：`docs/SCHEMATIC_IR.md`
- 连通性验证：`docs/VERIFY_NETS.md`
- 绘图风格：`docs/SCHEMATIC_STYLE.md`
- WebSocket 协议：`docs/PROTOCOL.md`
- 自建 Bridge 指南：`docs/BRIDGE_QUICKSTART.md`
- 卸载排障：`docs/UNINSTALL.md`

npm包仅提供有限的功能，出于灵活性考虑，建议使用codex驱动的skills，目前已确认可在gpt5.2 xhigh下实现基础的跨工程交互能力(网表模块复用)

