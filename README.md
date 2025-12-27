# JLCEDA Local MCP

本项目用于在 **嘉立创EDA 专业版本地客户端** 中，通过“扩展桥接”的方式提供一个可被 LLM 调用的 **MCP Server**，从而实现原理图自动化（器件库搜索/放置/连线/导出等）。

## 目录结构

- `packages/mcp-server`：MCP Server（`stdio`）+ 本机 WebSocket Bridge（供 EDA 扩展连接）
- `packages/eda-extension`：嘉立创EDA 专业版扩展（基于 `pro-api-sdk` 的构建方式）

## 文档

- 环境与安装：`docs/SETUP.md`
- MCP tools 清单：`docs/MCP_TOOLS.md`
- SchematicIR（带坐标布局）：`docs/SCHEMATIC_IR.md`
- Verify Nets（连通性验证）：`docs/VERIFY_NETS.md`
- 绘图偏好（美观/可审查/便于采购）：`docs/SCHEMATIC_STYLE.md`
- Roadmap（后续工具规划）：`docs/ROADMAP.md`
- WebSocket 协议：`docs/PROTOCOL.md`
- 删除/卸载扩展排障：`docs/UNINSTALL.md`

## 快速开始

在 `jlc-eda-mcp` 目录：

```bash
npm install
npm run build
node packages/mcp-server/dist/cli.js --port 9050
```

然后在 EDA 内安装扩展并连接（见 `docs/SETUP.md`）。

## MCP 客户端配置（npx）

发布到 npm 后，可用如下方式启动（示例）：

```json
{
  "command": "npx",
  "args": ["-y", "jlceda-eda-mcp", "--port", "9050"]
}
```
