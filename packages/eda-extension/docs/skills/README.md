# Repo-local skills

这些 skills 用来把“如何驱动嘉立创 EDA Pro（通过 `jlceda-eda-mcp` 桥接）”固化成可复用流程，方便 LLM 侧在 **不安装 Node/MCP** 的前提下，直接通过 **WebSocket RPC + websocat（短驻）** 调用 `jlc.*` 工具与 `eda.*` 透传能力。

## Skills

- `jlceda-eda-rest`：推荐走 `websocat` 作为本机 WS 服务端（短驻/按需启动），通过 `tools.call` 调用全部 `jlc.*` tools；也可直接调用扩展 RPC（`ping/getStatus/eda.invoke/...`）
