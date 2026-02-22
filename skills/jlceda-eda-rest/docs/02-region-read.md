# 读取选区内容（结构化快照）

> 目标：把“用户已选中”的原理图区域读成结构化数据，供 LLM 做决策/重绘/增补。

## 推荐策略：按选中 primitiveId 过滤

1) 先拿到选区 primitiveIds（见 `docs/01-region-select.md`）。

2) 拉取当前页的可读图元列表（并行更快）：

- `jlc.schematic.list_components`（包含 part / netflag / netport 等组件类）
- `jlc.schematic.list_wires`
- `jlc.schematic.list_texts`

3) 用 `primitiveId ∈ selectedIds` 过滤出选区内的 items，并整理成：

- 器件（part）：`designator / name / subPartName / x,y / rotation / mirror`，以及 `mcp.deviceUuid/libraryUuid`（如果有）
- 网络：显式网名（如 `VIN_5V/GND/INL/INR`）、网络标志/端口、导线 `net`
- 导线：`line` 坐标（必要时做去重/归并）
- 文本：`content / x,y / rotation`

## 注意：内部网名（$1N*）

- 以 `$` 开头的网名通常是 EDA 内部自动网名（例如 `$1N36`）。
- 读取时可以保留用于理解，但 **编辑/重绘时建议不要原样写回 `net`**：
  - 跨页/跨区域复用可能引发“同名短接”或 DRC 报错
  - 有些会出现 `$1Nundefined` 导致非法网络名

## 兜底：用 EDA 原生 API 查“未知图元”

当 selectedIds 里出现 `list_*` 没覆盖的 primitiveId（例如某些图形/标注）：

- 可用 `jlc.eda.invoke` 调 `sch_Primitive.getPrimitiveByPrimitiveId`（或相关查询方法）做进一步探索
- 建议配合 `jsonSafe` 限制返回深度/长度，避免超大对象导致响应慢

## 结果要“短”

为了让后续编辑更快、更稳定，读回时优先输出：

- 器件清单（10~50 行以内）
- 显式网名与关键连接
- 选区 bbox（用于布局/偏移）

