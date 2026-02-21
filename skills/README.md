# Repo-local skills

这些 skills 用来把“如何驱动嘉立创 EDA Pro（通过 `jlceda-eda-mcp` 桥接）”固化成可复用流程，方便 LLM 侧绕过 MCP 工具，直接用 `curl` 调本地 REST API。

## Skills

- `jlceda-eda-rest`：启动本地 HTTP 代理 + 用 curl 调用 `jlc.*` 工具（含 `jlc.eda.invoke/get/keys` 全量透传）

