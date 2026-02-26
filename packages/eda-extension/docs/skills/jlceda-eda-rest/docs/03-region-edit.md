# 编辑选区（增补 / 增量更新）

> 目标：在不破坏原图的前提下，对选区进行增补绘制或局部重画；并尽量避免卡死/DRC 误报。

## 首选：`jlc.schematic.apply_ir` 做“增补”

- `apply_ir` 支持 upsert（同 id 重跑会 update/replace），适合“反复迭代修改”。
- 建议：`page.clear=false`，只增补不清空。
- 推荐流程：
  1) `读取选区`（见 `docs/02-region-read.md`）
  2) 计算一个 `DX/DY` 偏移（避免覆盖原选区）
  3) `apply_ir`：先放器件/网标/文本，再分批画导线
  4) `jlc.schematic.select` 选中新画出来的 primitiveIds 并缩放定位

## 编辑“已由 apply_ir 管理”的图元

如果某些图元是你之前用 `apply_ir` 画的（有稳定的 `id`）：

- 更新：再次 `apply_ir` 发送同一个 `id`，改坐标/内容即可
- 删除：使用 `ir.patch.delete` 按 `id` 删除（只对“已记录在 id->primitiveId map”的图元可靠）

## 编辑“非托管”的原生图元（不推荐）

对非 apply_ir 创建的图元，`apply_ir` 没有映射表，无法安全 upsert。

- 若必须改/删：用 `jlc.eda.invoke` 直接调用 `eda.sch_*` 原生 API（风险更高、也更容易卡死）
- 建议在操作前先导出/保存（`jlc.document.export_epro2` 或 `jlc.schematic.save`）

## 连接策略（减少重叠/更清晰）

- 优先打网络标签而不是把长线拉过去：
  - `jlc.schematic.netlabel.attach_pin`（本质是短导线 + Wire.NET，接近 Alt+N）
- 需要自动走线：`jlc.schematic.connect_pins`（manhattan / straight）
- 复杂连线：用多段 wire，并保持正交，避免交叉重叠

