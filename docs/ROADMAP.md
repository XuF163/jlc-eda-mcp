# Roadmap（绘制完整、美观、可迭代原理图所需工具规划）

本文档描述 `jlc-eda-mcp` 在“能自动画原理图”基础上，向“完整 / 美观 / 可维护（多回合增量）”演进需要补齐的通用 MCP 工具与能力。

> 原则：只做**通用能力**，不针对特定器件/板卡做特化；所有“画图结果”应可通过工具读回、验证、再增量修改。

## 现状（已具备的基础能力）

- 器件库：`jlc.library.search_devices`
- 放置/连线：`jlc.schematic.place_device`、`jlc.schematic.connect_pins`、`jlc.schematic.wire.create`
- 增量绘制：`jlc.schematic.apply_ir`（upsert + 可选删除；见 `docs/SCHEMATIC_IR.md`）
- 读回/定位（P1 基础已就绪）：
  - `jlc.schematic.list_components` / `list_wires` / `list_texts`
  - `jlc.schematic.find_by_designator` / `select` / `crossprobe_select` / `zoom_to_all`
  - `jlc.schematic.snapshot`（结构化读回，支撑 LLM 多回合增量）
- 网表/验证：
  - `jlc.schematic.get_netlist` / `jlc.schematic.export_netlist`
  - `jlc.schematic.verify_netlist`（优先 `SCH_Netlist.getNetlist`，超时/不支持时自动回退到导出网表文件再解析）
  - `jlc.schematic.verify_nets`（基于 document source 的导线兜底校验；更适合纯导线连通验证）
- 收尾：`jlc.schematic.drc`、`jlc.schematic.save`、`jlc.view.capture_png`

## 设计目标（“完整 + 美观 + 可用”）

1) **完整**：电源地/端口/网标/连接点齐全；跨区域/跨线同名网络可靠。
2) **美观**：布局规整、线条不乱、网标清晰、文本/注释规范，方便后续 PCB。
3) **可迭代**：LLM 多回合增量更新时不会“迷路”，能定位已有对象并只改动必要部分。
4) **可验证**：每一步都有可机读的验证（网表/DRC/截图），失败时能定位问题点。

## 规划（按优先级分阶段）

### P1：读回/定位/选择（增量绘制的地基）

要解决的问题：仅靠 `apply_ir` 内部 map 记录仍不足以让外部（MCP）“知道当前画布上有什么、在哪里、叫什么”。

建议新增工具：
- `jlc.schematic.list_components`：列出当前页组件（primitiveId、designator、deviceUuid、x/y/rotation 等）
- `jlc.schematic.list_wires` / `jlc.schematic.list_texts` / `jlc.schematic.list_netports` / `jlc.schematic.list_netflags`
- `jlc.schematic.find_by_designator`：通过 `R1/U2/...` 查 primitiveId
- `jlc.schematic.select` / `jlc.schematic.highlight` / `jlc.schematic.zoom_to`：定位并可视化确认
- `jlc.schematic.snapshot`：导出结构化 JSON（用于 LLM “读回 -> 决策 -> 再画”）

验收标准：
- 任意一次 `apply_ir` 后，MCP 可以“列出/定位/高亮”刚刚创建或历史存在的对象。

### P2：网标/连接点/端口（让逻辑连接稳定且可读）

要解决的问题：靠“长导线”连一切会很丑；实际工程需要网标/端口/连接点让图可读。

建议新增/补齐能力：
- 网标（NetLabel）创建/修改/删除：可指定 `net`、坐标、朝向，能贴到某根线段/某个点上
- 连接点（Junction）创建/删除：用于 T 形连接与可视化节点
- 端口（NetPort）与电源地标识（NetFlag）在 IR 中已支持，但需要补齐：
  - `snap` 能力：将导线端点精确落在网口/网标连接点上
  - 失败可视化：验证失败时自动高亮相关对象/端点

验收标准：
- 用 `verify_netlist` 能稳定验证跨线网标的同名网络连接（不依赖“连续导线”）。

### P3：编辑与布局（把“能画”变成“画得漂亮”）

要解决的问题：自动放件/连线后需要重排：对齐、等距、避免线压器件/文字。

建议新增工具：
- 基础变换：`move/rotate/mirror`（组件、文本、网标、端口、连接点）
- 批量布局：`align`（左/右/上/下/水平居中/垂直居中）、`distribute`（水平/垂直等距）
- 网格/吸附：`grid.get` / `grid.set` / `snap_to_grid`
- 简易自动布线策略：Manhattan 走线 + 可配置 `midX`/折点；尽量避免穿过器件 bbox（先做启发式）

验收标准：
- 同一组元件可以被工具一键对齐/等距；导线折线风格一致；截图肉眼可读。

### P4：属性/标注（可生产的工程信息）

要解决的问题：原理图不仅要“连对”，还要具备可生产信息（value、封装、BOM 字段）。

建议新增工具：
- `jlc.schematic.annotate`：自动编号/去重（支持作用域：当前页/整工程）
- `jlc.schematic.set_properties`：设置/读取 value、comment、BOM 字段、自定义字段（如 LCSC、MPN）
- `jlc.schematic.swap_gate` / `swap_unit`（可选）：多单元器件重排

验收标准：
- 能通过工具统一设置/读取关键器件属性，并导出 BOM（若 API 支持）。

### P5：多页与层级（可扩展的大工程）

要解决的问题：开发板/产品级电路往往多页；需要跨页网络与模块化结构。

建议新增能力：
- 页管理：创建/切换/重命名/枚举 schematic pages
- 层级块（hierarchical sheet）与跨页端口策略（若 EDA API 支持）
- `snapshot`/`diff` 跨页：支持仅更新某一页或某一模块

验收标准：
- MCP 能在指定页增量更新，不误创建新页；跨页网络可用 `verify_netlist` 验证。

### P6：更强校验与交付（回归可控）

建议新增能力：
- DRC 结果明细读取（不仅 `ok`）：错误列表 + 自动定位/高亮
- 网表 diff：期望网络（Ref.Pin）与实际 netlist 的差异报告
- 导出：PDF/SVG（若 API 支持）、工程包、截图批量输出（用于审阅）

验收标准：
- 任意一次自动绘制后能输出：截图 + 校验报告 + 可复现的结构化 snapshot。

## 推荐实现顺序（最短路径）

1) P1（读回/定位/选择）→ 2) P2（网标/连接点）→ 3) P3（布局）→ 4) 强化 `verify_netlist` 报告与高亮 → 再考虑 P4/P5/P6。

这样可以最快把工作流从“工具能跑”升级到“每次增量都能对齐审阅与回归”。 
