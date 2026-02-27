# Welcome New Agent（给“刚接入、啥也不懂”的 AI）

这份文档的目标：让你在 **不安装 Node / MCP 的前提下**，只靠 **嘉立创 EDA Pro 客户端 + 本扩展 + websocat**，就能稳定地完成：

- 读取原理图（选区/网表/结构化快照）
- 增量编辑/补画原理图（放器件/连线/加网标/导出）
- 必要时“全权限”透传调用 `globalThis.eda.*`（危险，但能兜底）

如果你只想最快上手：直接从 `skills/README.md` 和 `skills/jlceda-eda-rest/SKILL.md` 开始。

---

## 0) 你需要先理解的 3 件事

1) **扩展是 WebSocket 客户端**  
   它不会在本机开一个 HTTP/WS 端口让你 `curl` 连接；相反，它会主动连接你提供的地址（默认 `ws://127.0.0.1:9050`）。

2) **所以你必须提供一个“本机 WS 服务端”**  
   推荐用通用工具 `websocat` 临时充当 WS 服务端（短驻/按需启动）。

3) **你通过 WS RPC 发 JSON 请求**  
   典型消息结构：
   - 请求：`{ type:'request', id:'1', method:'ping', params?: {...} }`
   - 响应：`{ type:'response', id:'1', result?:..., error?:... }`
   - 连接后扩展会先发一条 `hello`（包含扩展版本号）

参考协议：`../../../docs/PROTOCOL.md`

---

## 1) 最小闭环（先跑通再谈高级）

### 1.1 安装 websocat

macOS（Homebrew）：

```bash
brew install websocat
```

通用（需要 Rust）：

```bash
cargo install websocat
```

或下载二进制：

- `https://github.com/vi/websocat/releases`

安装后确认：

```bash
websocat --version
```

### 1.2 在 EDA 扩展里配置 WS 地址

在嘉立创 EDA Pro：

- 打开扩展管理器，启用本扩展（`jlceda-mcp-bridge`）
- 在扩展配置里确认 WebSocket URL 为：`ws://127.0.0.1:9050`
- **务必打开“外部交互能力/权限”**（否则导出/文件写入/部分 API 会失败）

### 1.3 一次性 ping（推荐：短驻）

Git Bash / Linux / macOS（最简单）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"ping","closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

Windows PowerShell（更稳，避免引号转义问题）：

```powershell
$req = @{ type='request'; id='1'; method='ping'; closeAfterResponse=$true } | ConvertTo-Json -Compress
$req | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

预期输出包含两段：

- `hello`：例如 `{"type":"hello","app":{"name":"jlceda-mcp-bridge","version":"0.0.xx",...}}`
- `response`：例如 `{"type":"response","id":"1","result":{"pong":true,...}}`

如果你连 `ping` 都跑不通：先别做别的，去看 `skills/jlceda-eda-rest/SKILL.md` 的“排错/验证未使用旧 mcp-server”部分。

---

## 2) 你应该怎么“调用能力”

扩展提供两套入口（你任选其一，也可以混用）：

### A) 直接调用 RPC（method = 扩展方法名）

例如：

- `ping`
- `ensureSchematicPage`
- `library.searchDevices`
- `schematic.placeDevice`
- `schematic.applyIr`
- `eda.invoke / eda.get / eda.keys`（全量透传，危险）

完整清单：`../../../docs/EDA_EXTENSION_RPC.md`

### B) 用 `tools.call` 调用 `jlc.*` tools（推荐给 AI）

原因：`tools.list` 会返回带 `inputSchema` 的工具列表，更适合“啥也不懂的 AI”自助发现能力并避免参数写错。

1) 列出可用工具：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.list","closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

2) 调用一个工具（示例：`jlc.bridge.ping`）：

```bash
printf '%s\n' '{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.bridge.ping","arguments":{}},"closeAfterResponse":true}' \
  | websocat -t --no-close --oneshot ws-l:127.0.0.1:9050 -
```

常用工具（建议优先用它们）：

- `jlc.document.current`：当前文档信息（documentType/uuid/tabId）
- `jlc.schematic.ensure_page`：确保焦点在原理图页（否则很多 API 会报错）
- `jlc.schematic.snapshot`：结构化快照（components/wires/texts），给 LLM “读图”
- `jlc.library.search_devices`：器件库搜索（可用于选型/放置）
- `jlc.schematic.apply_ir`：用 SchematicIR 批量/增量绘图（最适合 LLM）
- `jlc.eda.keys/get/invoke`：全量透传（最后手段）

如果返回 `METHOD_NOT_FOUND: tools.call`：通常是扩展版本过旧或未更新，请重装最新 `.eext` 并重启 EDA。

---

## 3) 典型工作流（照抄即可）

### 3.1 读取当前原理图（推荐“快照”）

1) 确保在原理图页：
   - tool：`jlc.schematic.ensure_page`
2) 获取结构化快照（LLM 友好）：
   - tool：`jlc.schematic.snapshot`

优点：你不用解析巨大源文件，也不用猜图元结构。

### 3.2 增量补画/改画（推荐 SchematicIR）

用 tool：`jlc.schematic.apply_ir`（底层调用 `schematic.applyIr`）

规范：`../../../docs/SCHEMATIC_IR.md`

建议策略（非常重要）：

1) **分步提交**：先放置器件（固定 `components[].id`），再连线/网标/文本，最后才 DRC+保存  
2) **永远用稳定 id**：例如 `U1/J1/R1/...`，后续更新同 id 就是“增量修改”  
3) **不要一上来 clear all**：除非你明确要重画；默认增量 upsert 更安全

### 3.3 器件选型 + 放置 + 连线（低阶编辑）

流程通常是：

1) `jlc.library.search_devices` 搜索 → 拿到 `deviceUuid/libraryUuid`
2) `jlc.schematic.place_device` 放器件 → 得到 `primitiveId`
3) `schematic.getComponentPins` 读引脚信息（pinNumber/pinName/x/y）
4) `jlc.schematic.connect_pins` 连线（或用 `jlc.schematic.netlabel.attach_pin` 直接打网标）

### 3.4 导出 / 抓图

常用：

- `jlc.document.export_epro2`：导出工程
- `jlc.view.capture_png`：抓取当前视图 PNG

如果导出失败，优先排查扩展权限与保存路径可写。

---

## 4) 常见坑（你遇到就按这里排）

### 4.1 `websocat: ... (os error 10048)`（端口被占用）

说明：`9050` 已被某个进程占用（常见是上一次 `websocat` 没退出）。

Windows（PowerShell）：

```powershell
netstat -ano | findstr :9050
tasklist /fi "pid eq <PID>"
Stop-Process -Id <PID> -Force
```

### 4.2 只看到 `hello`，没有 `response`

通常原因：

- 你没有真正发出请求（JSON 不是单行 / 引号被终端吃掉）
- 扩展处于重连 backoff，需要等几十秒才会连上一次
- 当前不是原理图页，某些方法会直接报错（先 `ensure_page`）

### 4.3 `NOT_IN_SCHEMATIC_PAGE`

先调用：

- RPC：`ensureSchematicPage`
- tool：`jlc.schematic.ensure_page`

### 4.4 `eda.invoke` 很强但很危险

它等价于“远程反射调用 `globalThis.eda.*`”。你可以做到几乎任何事，也可以轻易把工程搞坏。除非你非常确定，否则优先用 `jlc.*` tools 和 `schematic.applyIr`。

---

## 5) 推荐阅读顺序（给 AI）

1) `skills/jlceda-eda-rest/SKILL.md`（最重要：如何通过 websocat 稳定驱动）
2) `skills/jlceda-eda-rest/docs/`（按场景拆好的操作手册）
3) `../../../docs/EDA_EXTENSION_RPC.md`（RPC 方法清单）
4) `../../../docs/SCHEMATIC_IR.md`（画图 IR 规范）
5) `../../README.md`（扩展安装与常见问题）

