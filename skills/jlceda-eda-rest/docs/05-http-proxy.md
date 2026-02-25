# HTTP Proxy 端点与鉴权（`/v1/status` / `/v1/tools/*` / `/v1/rpc`）

> 目标：用 **curl** 调用本仓库启动的 `jlceda-eda-mcp --http` 本地 REST 代理。

默认监听：`http://127.0.0.1:9151`（可用 `--http-port` 或环境变量 `JLCEDA_HTTP_PORT` 修改）。

## 鉴权（可选）

如果启动时设置了 `JLCEDA_HTTP_TOKEN`（或 `--http-token`），则所有 HTTP 请求都需要带 token：

- `-H 'authorization: Bearer YOUR_TOKEN'`  
  或 `-H 'x-jlceda-token: YOUR_TOKEN'`

## GET：状态与工具列表

1) 状态（桥接是否已连接到 EDA 扩展）：

```bash
curl -s http://127.0.0.1:9151/v1/status
```

2) 列出全部工具（MCP tools 的 HTTP 版本）：

```bash
curl -s http://127.0.0.1:9151/v1/tools
```

## POST：调用工具（推荐，带 inputSchema）

统一入口：`POST /v1/tools/call`

```bash
curl -s -X POST http://127.0.0.1:9151/v1/tools/call \
  -H 'content-type: application/json' \
  -d '{ "name": "jlc.document.current", "arguments": {} }'
```

## POST：直连扩展 RPC（原子化覆盖 `eda-extension` 全部能力）

统一入口：`POST /v1/rpc`（会把 `method/params` 转发给 `jlc-eda-mcp/packages/eda-extension` 的 RPC handlers）

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "ping" }'
```

- `timeoutMs` 是 HTTP 侧超时（不是每个方法的参数）：

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{ "method": "schematic.getNetlist", "params": { "netlistType": "JLCEDA" }, "timeoutMs": 120000 }'
```

## PowerShell 的 curl 提醒

PowerShell 里 `curl` 常是 `Invoke-WebRequest` 的别名，且 `-d '{...}'` 转义容易出错。建议：

- 用 Git Bash 的 `curl`
- 或写一个 node 脚本用 `fetch()` 发 JSON

