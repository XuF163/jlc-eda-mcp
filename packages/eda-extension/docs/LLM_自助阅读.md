# Docs（LLM 自助阅读）

本目录是给 LLM 自助阅读的本地文档集合（包含 skills）。

建议阅读顺序：

- 新接入/零上下文：`welcome_new_agent.md`
- 然后从 skills 开始：`skills/skills/Repo-local-skills.md`、`skills/jlceda-eda-rest/SKILL.md`

说明：

- **推荐 websocat 短驻方案**：只提供 WS（不带 HTTP），因此不会自动出现 `http://127.0.0.1:9050/docs/` 这样的静态站点入口。
- 如需 `/docs` 静态入口，只能使用 legacy `packages/mcp-server --http`（计划废弃）。
