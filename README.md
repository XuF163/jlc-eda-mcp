# JLC-EDA-BRIDGE

在 **嘉立创EDA 专业版本地客户端** 中通过“扩展 + 本机服务”桥接，把 EDA 能力暴露为一组 `jlc.*` 工具，供 LLM 自动化完成原理图的 **读取 / 局部编辑 / 增补绘制 / 导出** 等工作。

本仓库当前的推荐使用方式是：**EDA 扩展 + websocat（短驻/ WS Server）**，用户侧无需安装 Node / MCP 包。

> 说明：EDA 扩展是 **WebSocket 客户端**，只会连接 `ws://127.0.0.1:<port>`；因此你仍需要一个“本机 WS 服务端”让扩展连上。这里选择用通用工具 `websocat` 充当该服务端，并在每次调用时短驻启动。

> [!CAUTION]
> **这是一个警告！**
> 请确保在随时可废弃的测试环境中使用本项目，并及时备份，如遇AI删库等事故，本人概不负责！
## 快速开始：使用websocat为LLM调用EDA api提供支持

### 1) 安装 websocat

macOS（Homebrew）：

```bash
brew install websocat
```

通用（需要 Rust）：

```bash
cargo install websocat
```

或直接下载二进制并添加环境变量：

- https://github.com/vi/websocat/releases

### 2) 在 EDA 扩展里配置 WS 地址（已默认配置为9050 ，如与现有业务冲突请自行修改 ）

> 多窗口/多工程：建议把端口配置在 `9050-9059` 范围内。扩展会自动协商一个可用端口（每个工程窗口一个端口，最多 10 个），并在握手 `hello`/`MCP Bridge -> Status` 中显示。

### 3) LLM调用示例&安装验证

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

## 已验证能力
详细内容请见 [extension展示页面 ](/packages/eda-extension/README.md)  
在0.0.13版本上进行测试，在windows下使用git bash作为默认终端供codex使用

## Skills（给 LLM 快速上手）

- Skills 入口：`skills/jlceda-eda-rest/SKILL.md`
  - 区域选取/读取/编辑/加速拆分文档：`skills/jlceda-eda-rest/docs/`


## ~~MCP（stdio）支持~~
<details>
<summary>点击这里展开查看详细说明（这是默认显示的标题）</summary>
- 仍提供 MCP Server（stdio）以便接入通用 MCP 客户端，但仓库的默认示例/文档会优先覆盖 **websocat + Skills** 的调用方式。
- 若要启用 MCP（stdio），不要加 `--no-mcp`：

```bash
node packages/mcp-server/dist/cli.js --port 9050
```
由于历史原因，为兼容部分老用户，相关npm包暂不删除，但不再推荐使用
（可选）npx 配置示例：

```json
{
  "command": "npx",
  "args": ["-y", "jlceda-eda-mcp", "--port", "9050"]
}
```
</details>  

## ~~packages/mcp-server~~
<details>
<summary>点击这里展开查看详细说明（这是默认显示的标题）</summary>  
`packages/mcp-server` 是仓库早期提供的参考实现（WS Bridge + HTTP + 可选 MCP）。为了降低用户侧安装成本与维护复杂度，后续会以“EDA 扩展 + websocat（短驻）”为默认工作流，并逐步废弃 `packages/mcp-server`。
</details>  

## 开源许可  
AGPLv3
