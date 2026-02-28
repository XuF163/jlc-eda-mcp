---
name: jlceda-eda-rest
description: Drive JLCEDA Pro from Codex via WebSocket RPC using websocat as a short-lived local WS server (no Node/MCP required). Supports listing/calling all jlc.* tools and full EDA API passthrough (eda.invoke/get/keys).
---

# JLCEDA Pro WebSocket（websocat 短驻版）

## When to use

- 你不想在用户侧安装 Node / MCP 组件，希望只装一个通用工具（`websocat`）就能把请求转成 WS RPC。
- 需要“全量调用” JLCEDA Pro API：用 `jlc.eda.keys/get/invoke`（tools）或 `eda.keys/get/invoke`（RPC）反射调用 `globalThis.eda.*`。
- 需要“原子化”调用扩展侧能力：直接发 WS `request` 调扩展 RPC 方法（见下方 RPC docs）。

## Quick start（推荐：短驻 / 按需启动）

前置：

1) 在 EDA 扩展里配置 WebSocket URL（默认）：`ws://127.0.0.1:9050`
2) 本机安装 `websocat`（安装方式见仓库根 `README.md`）

## 速度优先的 3 条规则（读图必看）

1) **大结果优先用 RPC（`schematic.* / library.* / eda.*`），少用 `tools.call`**  
   `tools.call` 会同时返回 `data` 与 `toolResult`（重复一份 payload），更容易触发消息过大/丢包/卡住。  
   例如读取原理图：优先发 `method:"schematic.listComponents"`，而不是 `method:"tools.call"` + `jlc.schematic.list_components`。

2) **`websocat` 建议显式加大 buffer**  
   大图纸/大选区时建议加：`-B 10485760`（10MB）避免默认 64KB 限制导致的异常截断/断连。

3) **尽量“一次会话多步”，避免反复触发扩展重连 backoff**  
   同一次 `websocat` 会话可以发多条 `request`（每行一条 JSON），只在最后一条加 `closeAfterResponse:true`。

### 1) 手工调试（交互式）

启动一个 WS 服务端，等待扩展连接：

```bash
websocat -B 10485760 -t ws-l:127.0.0.1:9050 -
```

扩展连上后你会看到一条 `hello`。然后把本文档/下方 docs 里的 **单行 JSON**（`type=request`）粘贴进去发送即可。

### 2) 一次性调用（LLM/脚本友好）

把一条 WS `request`（单行 JSON）通过 stdin 喂给 `websocat`，并让扩展回包后主动断开（`closeAfterResponse:true`）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"ping","closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 多窗口 / 多工程：扩展会在 `9050-9059` 端口池里自动协商一个可用端口（每个工程窗口一个端口）。  
>
> **推荐：LLM 自动探测端口（无需用户报端口）**  
> 因为扩展是 WS 客户端，外部想“找端口”只能：在 `9050-9059` 都临时起一个 WS 服务端，等扩展连上并读 `hello`（里面带工程信息）。
>
> **更推荐：自动找到“当前有选区”的窗口端口（无需用户报端口/工程名）**  
> 在 `9050-9059` 全部起 WS 服务端，并对每个端口发一次“选区探测”（`getAllSelectedPrimitives_PrimitiveId`）。哪个端口返回的 `result.result` **非空**，通常就是用户当前正在操作的窗口。
>
> Git Bash / Linux / macOS（探测 9050-9059，输出“有选区”的端口回包）：
>
> ```bash
> dir=".jlceda-bridge-discover"
> rm -rf "$dir" && mkdir -p "$dir"
> pids=()
> for p in {9050..9059}; do
>   printf '%s\n' \
>     '{"type":"request","id":"sel","method":"eda.invoke","params":{"path":"sch_SelectControl.getAllSelectedPrimitives_PrimitiveId","jsonSafe":{"maxArrayLength":2000}},"closeAfterResponse":true}' \
>   | websocat -B 10485760 -q -t --no-close --oneshot "ws-l:127.0.0.1:$p" - >"$dir/$p.log" 2>&1 &
>   pids+=($!)
> done
> sleep 20
> for p in {9050..9059}; do
>   if [ -f "$dir/$p.log" ] && grep -q '\"id\":\"sel\"' "$dir/$p.log" 2>/dev/null && ! grep -q '\"result\":\\[\\]' "$dir/$p.log" 2>/dev/null; then
>     echo "== port $p =="; cat "$dir/$p.log"
>   fi
> done
> for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
> ```
>
> Git Bash / Linux / macOS（探测 9050-9059，输出所有 `hello`）：
>
> ```bash
> dir=".jlceda-bridge-discover"
> rm -rf "$dir" && mkdir -p "$dir"
> pids=()
> for p in {9050..9059}; do
>   websocat -B 10485760 -q -t --no-close --oneshot "ws-l:127.0.0.1:$p" "appendfile:$dir/$p.log" >/dev/null 2>&1 &
>   pids+=($!)
> done
> sleep 20
> for p in {9050..9059}; do
>   if grep -q '\"type\":\"hello\"' "$dir/$p.log" 2>/dev/null; then
>     echo "== port $p =="; cat "$dir/$p.log"
>   fi
> done
> for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
> ```
>
> Windows PowerShell（同上；探测后会自动杀掉临时进程）：
>
> ```powershell
> $dir = ".jlceda-bridge-discover"
> Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
> New-Item -ItemType Directory $dir | Out-Null
> $procs = foreach ($p in 9050..9059) {
>   Start-Process -PassThru -NoNewWindow websocat -ArgumentList @(
>     "-B","10485760","-q","-t","--no-close","--oneshot",
>     "ws-l:127.0.0.1:$p",
>     "appendfile:$dir/$p.log"
>   )
> }
> Start-Sleep -Seconds 20
> $rows = foreach ($p in 9050..9059) {
>   $path = Join-Path $dir "$p.log"
>   if (!(Test-Path $path)) { continue }
>   $helloLine = (Get-Content $path | Select-String -Pattern '"type":"hello"' | Select-Object -First 1).Line
>   if (!$helloLine) { continue }
>   $hello = $helloLine | ConvertFrom-Json
>   $proj = $hello.project
>   [PSCustomObject]@{
>     port = $p
>     project = $(if ($proj.name) { $proj.name } elseif ($proj.friendlyName) { $proj.friendlyName } else { '' })
>     projectUuid = $proj.uuid
>     appVersion = $hello.app.version
>   }
> }
> $rows | Sort-Object port | Format-Table -AutoSize
> $procs | ForEach-Object { try { $_.Kill() } catch {} }
> ```
>
> 兜底：用户也可以在 EDA 里打开 `MCP Bridge -> Status` 查看该窗口端口。
>
> 扫描结果就是各端口收到的 `hello`；拿到目标端口后，把后续示例里的 `ws-l:127.0.0.1:9050` 改成对应端口即可。
>
> 如果扫描结果全空：通常是端口被占用（上一次 websocat 未退出）。Windows 可先执行 `taskkill /IM websocat.exe /F` 再重试。
>
> 注意：如果扩展处于重连 backoff（上一次连接失败后会等几秒再重试），`printf | websocat` 这种 pipeline 可能出现“只看到 `hello` 没有 `response`”。  
> 处理方式：改用交互式模式（等 `hello` 出现后再粘贴发送），或等几秒后重试一次。

（可选）验证 `jlc.*` tools（skills 依赖；需要扩展支持 `tools.call`；若返回 `METHOD_NOT_FOUND: tools.call`，请重装最新扩展）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

## Fast path：描述“当前选中区域”（避免读图一小时）

当用户说“读取当前选中区域/介绍模块功能”，按这个最短链路做（先快读，再按需加深）：

1) **确认连接的是正确窗口**：对照 `hello.project`（工程名/uuid）与 `hello.server.port`  
2) **用 RPC 拉取三件套**（优先 RPC，不走 `tools.call`）：
   - 选中 primitiveIds：`eda.invoke` → `sch_SelectControl.getAllSelectedPrimitives_PrimitiveId`
   - 组件类图元：`schematic.listComponents`（`allSchematicPages:false`，取 `result.items`）
   - 文本：`schematic.listTexts`（取 `result.items`）
3) 本地用 `primitiveId ∈ selectedIds` 过滤 `items`，输出“短摘要”（不要把全量 JSON 贴回去）：
   - 关键器件：U*/J*/电源芯片/接口/主控/射频等
   - 关键网名：排除 `$1N*`，重点列电源轨与接口信号
   - 结论：该模块的功能、输入/输出、供电方式
4) **只有在需要连通性时**，再按 nets 精准拉导线：`schematic.listWires { nets:[...] }`

> 可选更快：只要“选区摘要”时，可直接 `eda.invoke sch_SelectControl.getAllSelectedPrimitives`（单次调用返回选区 mixed primitives；见 `docs/02-region-read.md`），避免 `list* + 过滤`。

示例（第 1 轮：先拿选区 + 组件 + 文本）：

```bash
printf '%s\n' \
  '{"type":"request","id":"1","method":"ensureSchematicPage"}' \
  '{"type":"request","id":"2","method":"eda.invoke","params":{"path":"sch_SelectControl.getAllSelectedPrimitives_PrimitiveId","jsonSafe":{"maxArrayLength":2000}}}' \
  '{"type":"request","id":"3","method":"schematic.listComponents","params":{"allSchematicPages":false}}' \
  '{"type":"request","id":"4","method":"schematic.listTexts","closeAfterResponse":true}' \
  | websocat -B 10485760 -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

> 为什么这一段不用 `tools.call`：`tools.call` 会回 `data` + `toolResult`（重复），大图纸更容易超限；RPC 返回更小、更稳。

## 验证“未使用旧 mcp-server”（重要）

短驻方案下，`9050` 端口应由 **websocat** 监听；如果被 `node.exe`（旧 `packages/mcp-server`）占用，会导致扩展连不上。

Windows（PowerShell）检查：

```powershell
netstat -ano | findstr :9050
tasklist /fi "pid eq <PID>"
```

（可选）快速清理残留 websocat（Windows）：

```powershell
taskkill /IM websocat.exe /F
```

## Docs (schematic / 区域工作流)

- 区域性选取（Selection → BBox）：`docs/01-region-select.md`
- 读取选区（结构化快照）：`docs/02-region-read.md`
- 编辑选区（增补 / 增量更新）：`docs/03-region-edit.md`
- 加速与稳定性（批处理 / 避免卡死）：`docs/04-performance.md`

## Docs (RPC / 原子 API)

- 传输方式与安全（websocat / legacy HTTP）：`docs/05-http-proxy.md`
- 基础 / 状态：`docs/10-rpc-basics.md`
- 文档 / 视图 / 导出：`docs/11-rpc-document.md`
- 网表：`docs/12-rpc-netlist.md`
- 器件库：`docs/13-rpc-library.md`
- 原理图编辑（低阶）：`docs/14-rpc-schematic-edit.md`
- 原理图绘图（SchematicIR v1）：`docs/15-rpc-schematic-apply-ir.md`
- Inspect / 选择 / 调试：`docs/16-rpc-inspect.md`
- 全量 EDA API 透传（危险）：`docs/17-rpc-eda-passthrough.md`

## Docs (Tools / `jlc.*`)

- 基础：`docs/20-tools-basics.md`
- 全量 EDA API 透传（危险）：`docs/21-tools-eda-passthrough.md`
- 文档 / 视图 / 导出：`docs/22-tools-document-view.md`
- 网表：`docs/23-tools-netlist.md`
- 器件库：`docs/24-tools-library.md`
- Inspect / 选择 / 调试：`docs/25-tools-schematic-inspect.md`
- 原理图编辑（低阶）：`docs/26-tools-schematic-edit.md`
- 原理图绘图（SchematicIR v1）：`docs/27-tools-schematic-ir.md`
- 连通性验证（verify）：`docs/28-tools-verify.md`

## Reference

- 全部工具清单：`jlc-eda-mcp/docs/MCP_TOOLS.md`
- 扩展 RPC 方法清单：`jlc-eda-mcp/docs/EDA_EXTENSION_RPC.md`
- 原理图 IR 规范：`jlc-eda-mcp/docs/SCHEMATIC_IR.md`
- WebSocket 协议：`jlc-eda-mcp/docs/PROTOCOL.md`

## Legacy：HTTP Proxy（不推荐）

如果你强依赖 `curl http://127.0.0.1:9151/v1/*` 这类 HTTP 端点（或想要 `/docs` 静态入口），只能继续使用旧的 `packages/mcp-server`（Node），但该组件已计划废弃：

```bash
node jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --no-mcp
```

> 说明：WS 侧扩展仍然是 **WebSocket 客户端**；无论你用不用 HTTP/MCP，都需要一个本机 WS 服务端让扩展连上。
