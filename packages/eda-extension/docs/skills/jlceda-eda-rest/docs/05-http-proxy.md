# 传输方式与安全（websocat / Legacy HTTP Proxy）

> 目标：在 **不安装 Node/MCP** 的情况下，让 LLM/脚本通过 WebSocket RPC 直连 EDA 扩展完成自动化。  
> 协议：`jlc-eda-mcp/docs/PROTOCOL.md`

## 推荐：websocat（WS 直连）

EDA 扩展是 **WebSocket 客户端**，只会连接 `ws://127.0.0.1:<port>`。因此你需要一个本机 WS 服务端让它连上；这里用通用单文件工具 `websocat` 充当该服务端。

### 1) 交互式（手工调试）

启动 WS 服务端并等待扩展连接：

```bash
websocat -B 10485760 -t ws-l:127.0.0.1:9050 -
```

> 多窗口/多工程：端口可能不是 `9050`（扩展会在 `9050-9059` 池里自动分配）。  
> 推荐：按 `../SKILL.md` 的“LLM 自动探测端口”脚本扫描 `9050-9059`，抓到 `hello` 后再连接对应端口（无需用户报端口）；并对照 `hello.project` 校验连的是不是目标窗口。  
> 兜底：用户也可以在 EDA 里打开 `MCP Bridge -> Status` 查看该窗口端口。

扩展连上后会先发一条 `hello`。然后你可以粘贴发送一条 `request`（单行 JSON），例如：

```json
{"type":"request","id":"1","method":"ping"}
```

### 2) 短驻/一次性（LLM/脚本友好）

把 1 条 `request` 通过 stdin 喂给 `websocat`，并让扩展回包后主动断开（`closeAfterResponse:true`），便于下一次复用端口：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"ping","closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 注意：当扩展处于 reconnect backoff（上一次连接失败后会等几秒再重试）时，`printf | websocat` 这种 pipeline 可能出现“只看到 `hello` 没有 `response`”。  
> 处理方式：改用交互式模式（等 `hello` 出现后再发送），或等几秒后重试一次。

（可选）验证 `jlc.*` tools（skills 依赖；需要扩展支持 `tools.call`）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 性能提示：`tools.call` 会同时返回 `data` 与 `toolResult`（重复一份 payload），大图纸更容易超限。大结果优先直接调用 RPC（例如 `schematic.listComponents/listWires/listTexts`）。

### 3) 多步调用（一次启动，发多条 request）

同一次 `websocat` 会话可以发送多条 `request`（每行一条 JSON）。推荐只在最后一条加 `closeAfterResponse:true`：

```bash
printf '%s\n' \
  '{"type":"request","id":"1","method":"ping"}' \
  '{"type":"request","id":"2","method":"getStatus","closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 -
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
