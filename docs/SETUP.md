# Setup

本项目由两部分组成：

- `packages/mcp-server`：MCP Server（通过 `stdio` 提供 tools），同时在本机开启 WebSocket 等待 EDA 扩展连接
- `packages/eda-extension`：嘉立创EDA 专业版扩展（桥接 WebSocket，执行真实的 EDA 自动化 API）

## 1) 安装依赖

在 `jlc-eda-mcp` 目录执行：

```bash
npm install
```

## 2) 构建 MCP Server

```bash
npm -w packages/mcp-server run build
```

## 3) 启动 MCP Server（WebSocket Bridge）

```bash
node packages/mcp-server/dist/cli.js --port 9050 --token YOUR_TOKEN
```

记下 `YOUR_TOKEN`，下一步扩展需要配置相同 token。

说明：**监听端口的是 MCP Server（本仓库的 `packages/mcp-server`）**，EDA 扩展自身只是 WebSocket 客户端，无法在 EDA 进程内直接打开一个本地 TCP 端口进行监听。

## 自测（推荐）

如果你暂时没有 MCP 客户端（例如只是在本地开发/调试），可以用自测模式验证端到端链路（需要你在 EDA 里点一次 `MCP Bridge -> Connect`）：

```bash
node packages/mcp-server/dist/cli.js --port 9050 --token YOUR_TOKEN --self-test
```

自测会创建/打开一个原理图页并画一段测试导线，尽量尝试放置 0603 电阻并连线，然后执行 DRC + 保存，最后在终端输出 JSON 结果。

## 4) 构建并安装 EDA 扩展

构建：

```bash
npm -w packages/eda-extension run build
```

生成的扩展包在：

- `packages/eda-extension/build/dist/jlceda-mcp-bridge_v0.0.3.eext`

在嘉立创EDA 专业版客户端中安装该 `.eext`。

## 5) 在 EDA 内连接 MCP

安装后，在 EDA 顶部菜单：

- `MCP Bridge` -> `Configure...`：填写
  - WebSocket URL：`ws://127.0.0.1:9050`
  - Token：`YOUR_TOKEN`
- `MCP Bridge` -> `Connect`

若顶部菜单没有出现 `MCP Bridge`，请检查：

- 扩展管理器中是否已启用该扩展，并勾选“显示在顶部菜单”
- 重启 EDA 客户端（部分版本需要重启才会刷新顶部菜单）
- 正常情况下，扩展启动时会弹出一条 `MCP Bridge loaded` 的提示，用于确认扩展已运行

## 6) 权限提示（重要）

部分能力需要在 EDA 客户端里为扩展开启权限（否则会 `throw Error`）：

- WebSocket 连接（桥接到本机 MCP Server）：`SYS_WebSocket.register/send/close`（需要“外部交互”权限）
- 写文件到本地：`SYS_FileSystem.saveFileToFileSystem` / `SYS_FileSystem.getEdaPath`
- 文档导出：`SYS_FileManager.getDocumentFile`

如果遇到 `EXPORT_FAILED` / `SAVE_FILE_FAILED` 等错误，请优先检查扩展权限是否已开启。
