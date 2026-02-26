# EDA Extension RPC（`jlceda-mcp-bridge`）

> 入口实现：`jlc-eda-mcp/packages/eda-extension/src/handlers/index.ts`

这是 EDA 扩展（在嘉立创 EDA Pro 内运行）对外提供的 **WebSocket RPC 方法**清单。  
LLM 侧如果想“全量调用 EDA 的任意 API”，优先用 `eda.keys / eda.get / eda.invoke`（字符串路径反射调用）。

> 提示：在 `request` 上可选支持 `closeAfterResponse: true`，用于短驻调用（扩展回包后主动断开，方便下一次调用复用端口）。

## 1) 基础 / 状态

- `ping` → `{ pong: true, ts }`
- `showMessage`：`{ message: string }`（尽量用 toast，不弹阻塞弹窗）
- `getStatus` → `BridgeStatusSnapshot`（扩展侧连接状态快照）

## 1.1) Tools（兼容 jlc.*）

> 这些方法用于在“只有 WebSocket（无 MCP / 无 HTTP Bridge）”的场景下，依然以 `jlc.*` tools 的方式调用能力。

- `tools.list`：列出可用 `jlc.*` tools（name/description/inputSchema）
- `tools.call`：`{ name: string, arguments?: any }` → 返回结构与 `HTTP /v1/tools/call` 类似

## 2) 文档 / 视图 / 导出

- `getCurrentDocumentInfo` → `dmt_SelectControl.getCurrentDocumentInfo()` 的结果（可能为 `undefined`）
- `ensureSchematicPage`：`{ boardName?, schematicName?, pageName? }`  
  若当前不在原理图页：创建 schematic + page 并打开/激活，返回 `{ documentType:1, uuid, tabId }`
- `captureRenderedAreaImage`：`{ tabId?, zoomToAll?, savePath?, fileName?, force? }` → 保存 PNG（或触发下载）
- `exportDocumentFile`：`{ fileType?:'.epro2'|'.epro', password?, savePath?, fileName?, force? }` → 导出当前文档文件
- `getDocumentSource`：`{ maxChars? }` → `{ source, truncated, totalChars }`
- `exportSchematicNetlistFile`：`{ netlistType?, savePath?, fileName?, force? }` → 导出网表文件
- `schematic.getNetlist`：`{ netlistType?, maxChars?, timeoutMs? }` → 直接读取网表文本（不落盘）

## 3) 器件库

- `library.searchDevices`：`{ key, libraryUuid?, page?, limit? }`
- `library.getDevice`：`{ deviceUuid, libraryUuid? }`

## 4) 原理图编辑（低阶图元）

- `schematic.placeDevice`：放置器件  
  `{ deviceUuid, libraryUuid?, x, y, subPartName?, rotation?, mirror?, addIntoBom?, addIntoPcb?, designator?, name? }`
- `schematic.getComponentPins`：`{ primitiveId }` → 引脚坐标/编号/名称等
- `schematic.connectPins`：两引脚自动连线（默认 Manhattan）  
  `{ fromPrimitiveId, fromPinNumber?|fromPinName?, toPrimitiveId, toPinNumber?|toPinName?, net?, style?, midX? }`
- `schematic.createWire`：`{ line, net? }`（`line` 支持 `[x1,y1,...]` 或 `[[...],[...]]`）
- `schematic.drc`：`{ strict?, userInterface? }` → `{ ok }`
- `schematic.save` → `{ ok }`

## 5) 原理图 IR（高阶：适合 LLM 绘图）

- `schematic.applyIr`：接收 `SchematicIR v1`，做 **增量 upsert**（可选 clear / delete patch），并在 EDA 的扩展存储里维护 “id → primitiveId” 映射（便于后续稳定更新）。  
  规范见：`jlc-eda-mcp/docs/SCHEMATIC_IR.md`

## 6) Inspect / 选择 / 调试

- `schematic.listComponents`：`{ componentType?, allSchematicPages?, limit? }`
- `schematic.listWires`：`{ net?, nets? }`
- `schematic.listTexts`：无参数
- `schematic.findByDesignator`：`{ designator }`（R1/U2…）
- `schematic.selectPrimitives`：`{ primitiveIds, clearFirst?, zoom? }`
- `schematic.crossProbeSelect`：`{ components?, pins?, nets?, highlight?, select?, zoom? }`
- `schematic.clearSelection`：无参数
- `schematic.zoomToAll`：`{ tabId? }`
- `schematic.indicator.show`：`{ x, y, shape?:'point'|'circle', r? }`
- `schematic.indicator.clear`：`{ tabId? }`

## 7) 全量 EDA API 透传（高级/危险）

> 通过字符串路径动态访问 `globalThis.eda`。用于探索/透传全部能力，避免为每个 SDK 方法写 wrapper。

- `eda.keys`：`{ path?: string, jsonSafe?, timeoutMs? }` → 列出键名（`Object.keys + getOwnPropertyNames`）
- `eda.get`：`{ path: string, jsonSafe?, timeoutMs? }` → 读取值
- `eda.invoke`：`{ path: string, args?: any[], arg?: any, jsonSafe?, timeoutMs? }` → 调用函数并返回 JSON-safe 结果

限制/注意：

- 仅支持 **JSON 可序列化** 参数与返回（结果会做 `jsonSafe` 截断/去环）
- 不能跨桥传函数/回调，因此“注册事件监听”类 API 不适用
- 路径禁止 `__proto__/prototype/constructor`，且仅允许标识符段（不支持 `[]`）

## 8) 快速例子

1) 读取 EDA 版本（扩展内）：

```json
{ "method": "eda.invoke", "params": { "path": "sys_Environment.getEditorCurrentVersion" } }
```

2) 保存原理图：

```json
{ "method": "eda.invoke", "params": { "path": "sch_Document.save" } }
```
