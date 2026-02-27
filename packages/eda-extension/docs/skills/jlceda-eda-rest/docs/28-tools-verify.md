# Tools：连通性验证（verify）

> 目标：在不依赖 UI 的情况下，验证 “网络名 / 引脚” 是否按预期连通。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`。注意：用 `websocat` 时请发送 **单行 JSON**（见 `../SKILL.md` / `05-http-proxy.md`）。

## `jlc.schematic.verify_nets`（基于 document source 的兜底验证）

适用场景：

- `SCH_Netlist.getNetlist()` 不稳定/很慢/不可用时
- 需要验证某几个关键 pin 是否落在同一网络上

参数：

- `nets: Array<{ name, wirePrimitiveIds?, points }>`（必填）
  - `wirePrimitiveIds?: string[]`（可选：只验证这些 wire；不填则按 `name` 过滤）
  - `points: Array<Point>`（必填）
    - `Point` 二选一：
      1) `{ x:number, y:number, ref? }`
      2) `{ primitiveId:string, pinNumber?:string, pinName?:string, ref?, allowMany? }`
- `requireConnected?: boolean`（默认 `true`：会检查 points 之间可达）
- `maxChars?: number`（默认 `800000`：读取 document source 的截断上限）
- `timeoutMs?: number`（默认 `60000`）

示例（按 pinNumber 验证 VCC 把 U1.1 / U2.1 连在一起）：

```json
{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.schematic.verify_nets","arguments":{"nets":[{"name":"VCC","points":[{"ref":"U1.1","primitiveId":"U1_ID","pinNumber":"1"},{"ref":"U2.1","primitiveId":"U2_ID","pinNumber":"1"}]}]}}}
```

## `jlc.schematic.verify_netlist`（基于 Netlist 的验证，含自动兜底）

适用场景：

- 你希望按网表语义验证：`Net -> Ref.Pin` 归属关系

行为：

- 优先调用 `schematic.getNetlist`（API 取网表）
- 若遇到 `TIMEOUT/NOT_SUPPORTED`，会自动 fallback：导出网表文件并读取（通常更稳定）
  - 尝试保存到工作区 `.logs/netlist/`，失败则落到 EDA 默认路径

参数：

- `nets: Array<{ name, endpoints:[{ref,pin}] }>`（必填）
- `netlistType?: "JLCEDA"|"EasyEDA"|"Protel2"|"PADS"|"Allegro"|"DISA"`
- `timeoutMs?: number`（默认 `30000`）
- `maxChars?: number`（默认 `1000000`）

示例（验证 GND 中至少包含 U1.2 / R1.2）：

```json
{"type":"request","id":"2","method":"tools.call","params":{"name":"jlc.schematic.verify_netlist","arguments":{"netlistType":"JLCEDA","nets":[{"name":"GND","endpoints":[{"ref":"U1","pin":"2"},{"ref":"R1","pin":"2"}]}]}}}
```
