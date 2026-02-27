# jlc-eda-mcp（JLCEDA Pro 本地桥接）

在 **嘉立创EDA 专业版本地客户端** 中通过“扩展 + 本机服务”桥接，把 EDA 能力暴露为一组 `jlc.*` 工具，供 LLM 自动化完成原理图的 **读取 / 局部编辑 / 增补绘制 / 导出** 等工作。

本仓库当前的推荐使用方式是：**EDA 扩展 + websocat（短驻/一次性 WS Server）**，用户侧无需安装 Node / MCP 包。

> 说明：EDA 扩展是 **WebSocket 客户端**，只会连接 `ws://127.0.0.1:<port>`；因此你仍需要一个“本机 WS 服务端”让扩展连上。这里选择用通用工具 `websocat` 充当该服务端，并在每次调用时短驻启动。

## 快速开始：websocat（无需 Node / MCP）

### 1) 安装 websocat（通用 WebSocket 工具）

macOS（Homebrew）：

```bash
brew install websocat
```

跨平台兜底（需要 Rust）：

```bash
cargo install websocat
```

或直接从 GitHub Releases 下载对应平台的单文件二进制（推荐，最轻量）：

- https://github.com/vi/websocat/releases

### 2) 在 EDA 扩展里配置 WS 地址

在嘉立创EDA 专业版客户端中安装扩展后，配置 WebSocket URL 为：

- `ws://127.0.0.1:9050`

### 3) 一次性调用示例（LLM/脚本友好）

下面命令会临时启动一个 WS 服务端，等待扩展连接后发送 1 次请求，并要求扩展回包后主动断开（便于下一次调用复用端口）。

```bash
printf '%s\n' '{"type":"request","id":"1","method":"ping","closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 输出会包含扩展的 `hello` 与本次 `response`。建议仅监听 `127.0.0.1`，不要暴露到局域网/公网。

（可选）验证 `jlc.*` tools（需要扩展支持 `tools.list/tools.call`；若返回 `METHOD_NOT_FOUND: tools.call`，请重装最新扩展）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

## 已验证能力（开发联调）

- 端到端链路：EDA 扩展连接本机 WebSocket Server（`ws://127.0.0.1:<port>`）；短驻模式可用 `websocat` 监听并收发 RPC。
- 工具调用：WS RPC 的 `tools.call` 可直接调用全部 `jlc.*` tools（`websocat` 可直接用）；legacy Node Bridge 可选提供 HTTP `POST /v1/tools/call`。
- 原理图读：`jlc.schematic.list_components / list_wires / list_texts` + `jlc.eda.invoke(sch_SelectControl.* / sch_Primitive.getPrimitivesBBox)` 实现“选区 → BBox → 区域读回”。
- 原理图写：`jlc.schematic.apply_ir`（SchematicIR v1）支持增补/增量更新；配合分批导线写入可显著降低卡死概率。
- 器件解析：`jlc.library.search_devices` 用于把型号/关键字解析为 `deviceUuid/libraryUuid`，避免把图元 uuid 误当成器件 uuid 导致异常。
- 全量 API 透传：`jlc.eda.keys/get/invoke` 可反射调用 `globalThis.eda.*`（高级/有风险，但便于快速覆盖未封装能力）。

## Skills（给 LLM 快速上手）

- Skills 入口：`skills/jlceda-eda-rest/SKILL.md`
  - 区域选取/读取/编辑/加速拆分文档：`skills/jlceda-eda-rest/docs/`

这些文档以 **WebSocket request JSON** 为主，不依赖 HTTP/Node：

- 手工：`websocat -t ws-l:127.0.0.1:9050 -`（看到 `hello` 后粘贴发送 JSON）
- 自动化：参考上面的 `--oneshot` 示例（`closeAfterResponse:true`）

## Legacy：Node Bridge（HTTP REST + MCP + /docs，计划废弃）

如果你强依赖 `curl http://127.0.0.1:9151/v1/*`（或想要 `/docs` 静态入口），只能继续使用旧的 `packages/mcp-server`（Node）：

```bash
npm install
npm run build
node packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

验证（HTTP）：

```bash
curl -s http://127.0.0.1:9151/v1/status
```

文档（给 LLM 自助阅读 skills）：

- `http://127.0.0.1:9050/docs/`

## （弃用）自建 Bridge（不依赖 MCP）

EDA 扩展本身是 **WebSocket 客户端**，不会在 EDA 进程内监听 HTTP/TCP 端口；因此无论你是否使用 MCP（stdio），都需要一个本机 **WS 服务端**（可常驻，也可像 `websocat` 一样短驻/按需启动）来：

- 作为 WebSocket 服务端监听 `ws://127.0.0.1:<port>`（等待 EDA 扩展连接）
- 再把外部请求（curl/LLM/脚本）转成 `docs/PROTOCOL.md` 里的 RPC `request/response`

本仓库提供的 `packages/mcp-server` 是一个参考实现（WS Bridge + 可选 HTTP + 可选 MCP）。  
如果你希望在用户侧快速“自己搭一个最小 Bridge”（例如不想启用 MCP，或不方便使用 Node），请直接看：

- `docs/BRIDGE_QUICKSTART.md`

## MCP（stdio）支持程度

- 仍提供 MCP Server（stdio）以便接入通用 MCP 客户端，但仓库的默认示例/文档会优先覆盖 **websocat + Skills** 的调用方式。
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

## packages/mcp-server（计划废弃）

`packages/mcp-server` 是仓库早期提供的参考实现（WS Bridge + HTTP + 可选 MCP）。为了降低用户侧安装成本与维护复杂度，后续会以“EDA 扩展 + websocat（短驻）”为默认工作流，并逐步废弃 `packages/mcp-server`。

## 版本发布（自动提升 + git tag）

在仓库根目录执行：

- Patch：`npm run release:patch`
- Minor：`npm run release:minor`
- Major：`npm run release:major`

以上命令会统一提升版本号（根 `package.json` 为准，同步到各 package 与扩展 `extension.json`），并自动创建 git commit + tag（形如 `v0.0.14`）。

## 目录结构

- `packages/mcp-server`：WebSocket Bridge（供 EDA 扩展连接）+ MCP（stdio，可选）+ HTTP REST（可选）
- `packages/eda-extension`：嘉立创EDA 专业版扩展（桥接执行真实的 `eda.*` API；扩展说明见 `packages/eda-extension/README.md`）
- `skills/`：面向 LLM 的 Skills（推荐使用 WS/websocat 驱动）
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

