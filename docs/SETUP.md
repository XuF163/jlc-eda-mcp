# Setup（推荐：EDA 扩展 + websocat）

本项目由两部分组成：

- **EDA 扩展**：`packages/eda-extension`（运行在嘉立创 EDA Pro 内，执行真实的 `globalThis.eda.*` API；它是 **WebSocket 客户端**）
- **本机 Bridge / WS 服务端**：监听 `ws://127.0.0.1:<port>`（默认 `9050`），等待扩展连接，并向扩展发送 `docs/PROTOCOL.md` 定义的 `request`

> 重要：EDA 扩展不会在 EDA 进程内监听 HTTP/TCP 端口；因此无论你是否使用 MCP（stdio）或 HTTP，都必须有一个本机 **WS 服务端** 让扩展连上。

## A) 推荐：websocat（无需 Node / MCP）

### 1) 安装 websocat（通用 WebSocket 工具）

安装方式见仓库根 `README.md` 的 “安装 websocat” 小节。

### 2) 安装 EDA 扩展

如果你已经有 `.eext`，直接在 EDA 扩展管理器里安装即可。

如果你在本仓库内从源码构建扩展：

```bash
npm install
npm -w packages/eda-extension run build
```

生成的扩展包在：

- `packages/eda-extension/build/dist/`

在嘉立创EDA 专业版客户端中安装该 `.eext`。

### 3) 在 EDA 内配置 WS 地址

安装后在 EDA 顶部菜单：

- `MCP Bridge` -> `Configure...`：填写 WebSocket URL：`ws://127.0.0.1:9050`

新版扩展默认 **自动连接**（必要时仍可用 `Connect/Disconnect` 强制触发）。

### 4) 端到端验证（短驻 / 一次性调用）

临时启动一个 WS 服务端，等待扩展连接，发 1 次请求并要求回包后断开：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"ping","closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

输出会包含扩展的 `hello` 与本次 `response`。

（可选）验证 `jlc.*` tools（需要扩展支持 `tools.call`）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

### 5) 避免“误用旧 mcp-server”占用端口（重要）

短驻方案下，`9050` 端口应由 **websocat** 监听；如果被 `node.exe`（legacy `packages/mcp-server`）占用，会导致扩展无法连接。

Windows（PowerShell）检查：

```powershell
netstat -ano | findstr :9050
tasklist /fi "pid eq <PID>"
```

## B) Legacy：`packages/mcp-server`（Node，计划废弃）

如果你需要 MCP（stdio）或 legacy HTTP `/v1/*`（以及 `/docs` 静态入口），可以继续使用旧的 `packages/mcp-server`（不推荐作为默认工作流）。

构建：

```bash
npm install
npm -w packages/mcp-server run build
```

启动（MCP stdio + WS Bridge）：

```bash
node packages/mcp-server/dist/cli.js --port 9050
```

启动（HTTP Proxy + WS Bridge；不给 MCP）：

```bash
node packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

默认 HTTP：`http://127.0.0.1:9151`（`GET /v1/status`、`GET /v1/tools`、`POST /v1/tools/call`、`POST /v1/rpc`）。

（可选）Skills 文档静态入口（仅 legacy Node 方案提供）：

- `http://127.0.0.1:9050/docs/`

### 自测（legacy Node 方案）

```bash
node packages/mcp-server/dist/cli.js --port 9050 --self-test
```

自测会创建/打开一个原理图页并画一段测试导线，尽量尝试放置 0603 电阻并连线，然后执行 DRC + 保存，最后在终端输出 JSON 结果。

## 自动化结果校验（推荐）

自动绘制/连线后，建议用以下工具做关键网络的连通性校验（见 `docs/VERIFY_NETS.md`）：

- `jlc.schematic.verify_netlist`：优先（更接近真实网表，可覆盖跨网标/端口的逻辑连接）
- `jlc.schematic.verify_nets`：兜底（基于 `document source` 导线解析，不依赖网表 API）

## 权限提示（重要）

部分能力需要在 EDA 客户端里为扩展开启权限（否则会 `throw Error`）：

- WebSocket 连接（桥接到本机 WS 服务端：websocat 或 legacy mcp-server）：`SYS_WebSocket.register/send/close`（需要“外部交互”权限）
- 写文件到本地：`SYS_FileSystem.saveFileToFileSystem` / `SYS_FileSystem.getEdaPath`
- 文档导出：`SYS_FileManager.getDocumentFile`

如果遇到 `EXPORT_FAILED` / `SAVE_FILE_FAILED` 等错误，请优先检查扩展权限是否已开启。

## 自建最小 Bridge（可选）

如果你不想使用 legacy `packages/mcp-server`（例如用户侧不方便使用 Node / 不需要 MCP），可以按 `docs/BRIDGE_QUICKSTART.md` 自建一个最小 Bridge：

- WebSocket 服务端：给 EDA 扩展连接（实现 `docs/PROTOCOL.md` 的 RPC）
- （可选）HTTP 入口：方便用 `curl` 调用
