# 传输方式与安全（websocat / Legacy HTTP Proxy）

> 目标：在 **不安装 Node/MCP** 的情况下，让 LLM/脚本通过 WebSocket RPC 直连 EDA 扩展完成自动化。  
> 协议：`jlc-eda-mcp/docs/PROTOCOL.md`

## 推荐：websocat（WS 直连）

EDA 扩展是 **WebSocket 客户端**，只会连接 `ws://127.0.0.1:<port>`。因此你需要一个本机 WS 服务端让它连上；这里用通用单文件工具 `websocat` 充当该服务端。

### 1) 交互式（手工调试）

启动 WS 服务端并等待扩展连接：

```bash
websocat -t ws-l:127.0.0.1:9050 -
```

扩展连上后会先发一条 `hello`。然后你可以粘贴发送一条 `request`（单行 JSON），例如：

```json
{"type":"request","id":"1","method":"ping"}
```

### 2) 短驻/一次性（LLM/脚本友好）

把 1 条 `request` 通过 stdin 喂给 `websocat`，并让扩展回包后主动断开（`closeAfterResponse:true`），便于下一次复用端口：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"ping","closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

（可选）验证 `jlc.*` tools（skills 依赖；需要扩展支持 `tools.call`）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

### 3) 多步调用（一次启动，发多条 request）

同一次 `websocat` 会话可以发送多条 `request`（每行一条 JSON）。推荐只在最后一条加 `closeAfterResponse:true`：

```bash
printf '%s\n' \
  '{"type":"request","id":"1","method":"ping"}' \
  '{"type":"request","id":"2","method":"getStatus","closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 提示：如果你要让连接保持更久（分钟级），建议按 `jlc-eda-mcp/docs/PROTOCOL.md` 每 ~15s 发一次 `ping`（keepalive）。

## 安全建议（强烈建议）

- 只监听本机：`ws-l:127.0.0.1:9050`（不要绑定 `0.0.0.0` / 不要暴露到局域网/公网）。
- 确认端口没有被旧进程占用（尤其是 `node.exe` 的 legacy `packages/mcp-server`）：
  - PowerShell：`netstat -ano | findstr :9050` + `tasklist /fi "pid eq <PID>"`
- WS 直连默认不做鉴权；如果你需要 token/ACL，请自建 Bridge（参考 `docs/BRIDGE_QUICKSTART.md` 的建议）。

## Legacy：HTTP Proxy（已计划废弃）

如果你强依赖 `curl http://127.0.0.1:9151/v1/*` 这类 HTTP 端点（或想要 `http://127.0.0.1:9050/docs/` 静态入口），只能继续使用旧的 `packages/mcp-server`（Node）：

```bash
node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

可选：设置 HTTP token：

```bash
JLCEDA_HTTP_TOKEN=YOUR_TOKEN node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

> 注意：该 HTTP Proxy 方案链路长、效率低、维护成本高，已不再推荐作为默认工作流。
