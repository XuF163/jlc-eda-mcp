# MCP Tools

> MCP tools 在 `packages/mcp-server/src/tools/toolRegistry.ts` 中定义。

## 基础

- `jlc.status`：桥接连接状态
- `jlc.bridge.ping`：连通性检查
- `jlc.bridge.show_message`：在 EDA 内显示提示（优先 toast；不再弹出阻塞式弹窗）

## 文档 / 导出

- `jlc.document.current`：当前焦点文档信息（documentType/uuid/tabId）
- `jlc.view.capture_png`：抓取当前渲染区域 PNG（可选先 `zoomToAll`）
- `jlc.document.export_epro2`：导出当前文档为 `.epro2/.epro`
- `jlc.document.get_source`：获取文档源码（默认截断到 `maxChars=200000`）
- `jlc.schematic.export_netlist`：导出当前原理图网表文件
- `jlc.schematic.get_netlist`：读取当前原理图网表文本（不落盘，支持 `maxChars` 截断）
- `jlc.schematic.verify_nets`：基于 `document source` 解析导线与 NET 属性做连通性验证（网表 API 不稳定时的兜底）
- `jlc.schematic.verify_netlist`：基于 `SCH_Netlist.getNetlist()` 校验“网名 -> Ref.Pin”归属（可覆盖跨线网标/端口的逻辑连接）

## 原理图绘制（MVP）

- `jlc.schematic.ensure_page`：确保已打开/聚焦原理图图页（没有则新建游离原理图）
- `jlc.schematic.apply_ir`：按 SchematicIR v1 增量更新原理图（upsert + 可选删除，见 `docs/SCHEMATIC_IR.md`）
- `jlc.library.search_devices`：搜索内置器件库（返回 deviceUuid/libraryUuid）
- `jlc.schematic.place_device`：放置器件到指定坐标
- `jlc.schematic.get_component_pins`：读取器件引脚坐标/编号/名称
- `jlc.schematic.list_components`：列出当前页元件（包含 netPorts/netFlags 等组件类图元）
- `jlc.schematic.list_wires`：列出当前页导线（可按 net 过滤）
- `jlc.schematic.list_texts`：列出当前页文本
- `jlc.schematic.find_by_designator`：按位号查找 primitiveId（R1/U2…）
- `jlc.schematic.select`：按 primitiveId 选择/可选缩放定位
- `jlc.schematic.crossprobe_select`：按 components/pins/nets 交叉选择（高亮/选中）
- `jlc.schematic.clear_selection`：清空选择
- `jlc.schematic.zoom_to_all`：缩放到适应全部图元
- `jlc.schematic.indicator.show` / `jlc.schematic.indicator.clear`：在画布上显示/清除红色定位标记（调试用）
- `jlc.schematic.snapshot`：导出结构化快照（components/wires/texts），用于“读回 -> 决策 -> 增量修改”
- `jlc.schematic.connect_pins`：按引脚编号/名称自动生成导线（Manhattan/直线）
- `jlc.schematic.netlabel.attach_pin`：在引脚处放置**网络标签（Alt+N，本质是 Wire.NET）**，不会创建网络端口
- `jlc.schematic.wire.create`：按坐标显式创建导线
- `jlc.schematic.drc`：运行 DRC
- `jlc.schematic.save`：保存

## 坐标单位（原理图）

根据 `DMT_EditorControl` 的说明：原理图/符号的画布坐标单位跨度为 `0.01 inch`。

也就是说 `x/y` 的数值并不是 mm，通常需要以网格为基准进行布局（后续会补自动布局策略）。

## 端到端示例（最小可用）

1) 确保打开原理图图页：

```json
{ "tool": "jlc.schematic.ensure_page", "arguments": { "schematicName": "MCP Demo", "pageName": "Sheet1" } }
```

2) 搜索器件（例如 “R 0603”）：

```json
{ "tool": "jlc.library.search_devices", "arguments": { "key": "R 0603", "limit": 5 } }
```

3) 放置两个器件（把上一步返回的 `uuid/libraryUuid` 填进去）：

```json
{ "tool": "jlc.schematic.place_device", "arguments": { "deviceUuid": "DEVICE_UUID", "libraryUuid": "LIB_UUID", "x": 100, "y": 100, "designator": "R1" } }
```

```json
{ "tool": "jlc.schematic.place_device", "arguments": { "deviceUuid": "DEVICE_UUID", "libraryUuid": "LIB_UUID", "x": 300, "y": 100, "designator": "R2" } }
```

4) 读取引脚坐标（用于确认 pinNumber/pinName）：

```json
{ "tool": "jlc.schematic.get_component_pins", "arguments": { "primitiveId": "PRIMITIVE_ID" } }
```

5) 连线（示例按 pinNumber 连接）：

```json
{
  "tool": "jlc.schematic.connect_pins",
  "arguments": {
    "fromPrimitiveId": "R1_PRIMITIVE_ID",
    "fromPinNumber": "1",
    "toPrimitiveId": "R2_PRIMITIVE_ID",
    "toPinNumber": "1",
    "net": "NET1"
  }
}
```

5.1) 网络标签（Alt+N）：

> 注意：网络标签 ≠ 网络端口。网络标签是导线的 `NET` 属性；网络端口是 `netPorts`（符号不同）。

```json
{
  "tool": "jlc.schematic.netlabel.attach_pin",
  "arguments": {
    "primitiveId": "R1_PRIMITIVE_ID",
    "pinNumber": "1",
    "net": "VCC",
    "direction": "left",
    "length": 40
  }
}
```

6) DRC + 保存：

```json
{ "tool": "jlc.schematic.drc", "arguments": { "strict": false, "userInterface": false } }
```

```json
{ "tool": "jlc.schematic.save", "arguments": {} }
```
