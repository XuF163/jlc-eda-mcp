# 读取选区内容（结构化快照）

> 目标：把“用户已选中”的原理图区域读成结构化数据，供 LLM 做决策/重绘/增补。

## Fast path（先快读，再按需补全）

1) 读出选区 primitiveIds：`eda.invoke sch_SelectControl.getAllSelectedPrimitives_PrimitiveId`
2) 读出当前页结构化列表（优先 RPC）：
   - `schematic.listComponents { allSchematicPages:false }`
   - `schematic.listTexts`
3) 本地用 `primitiveId ∈ selectedIds` 过滤 `result.items`，然后输出 **短摘要**（关键器件/关键网名/电源/接口）
4) 只有当你需要“连通性/走线细节”时，再按关键网名精确拉 wires：
   - `schematic.listWires { nets:[...] }`

> 性能提示：同样功能用 `tools.call` 也能做（`jlc.eda.invoke / jlc.schematic.list_*`），但 `tools.call` 会返回重复 payload（`data` + `toolResult`），大图纸更容易超限。大结果优先 RPC。

## 返回结构（很重要，避免反复试探浪费时间）

`schematic.listComponents` / `schematic.listTexts` 的返回通常是“分页式包装”，不是直接数组：

- `schematic.listComponents` → `{ allSchematicPages, total, items }`
- `schematic.listWires` → `{ nets, total, items }`
- `schematic.listTexts` → `{ total, items }`

其中 `items` 才是图元列表；每个 item 一般都包含 `primitiveId`，并可能包含嵌套对象。

典型的 component item（`schematic.listComponents`）结构：

- `primitiveId`：用于与 `selectedIds` 对齐过滤
- `componentType`：器件/端口/网络标志等类型
- `component`：更“像人类读得懂”的字段通常在这里（例如 `designator / value / name / package/libName`）
- `x,y,rotation,mirror`：布局信息
- `net`：有些端口/标志会在 item 级别带网名（例如 `3V3/3V8/GND`）
- `subPartName`：多分部件子单元（如 A/B/C）

典型的 text item（`schematic.listTexts`）结构：

- `primitiveId`
- `text/value/content/str`（不同版本字段名可能不同，按实际取）
- `x,y,rotation`

## 更快：直接读“选中图元对象”（单次调用）

如果当前页图元很多、`schematic.list*` 返回很大，但你只关心 **选区**：可以直接调用 EDA 原生 API 拿“已选中图元对象”（只返回选区，不用再按 primitiveId 过滤）。

```json
{"type":"request","id":"sel","method":"eda.invoke","params":{"path":"sch_SelectControl.getAllSelectedPrimitives","jsonSafe":{"maxDepth":10,"maxArrayLength":400,"maxObjectKeys":200,"maxStringLength":400}}}
```

说明：

- 返回是一个 mixed list（不同 `primitiveType` 混在一起）
- 其中 `primitiveType=Component` 的项通常会直接带 `designator/componentType/net/...`（比 `listComponents + 过滤` 更快）
- 如果你需要“完整且更结构化”的 components/texts/wires 结果（或需要按 nets 精确拉线），仍然建议走上面的 `schematic.list*` + `result.items` 过滤策略

## 推荐策略：按选中 primitiveId 过滤

1) 先拿到选区 primitiveIds（见 `docs/01-region-select.md`）。

2) 拉取当前页的可读图元列表（并行更快）：

- `schematic.listComponents`（包含 part / netflag / netport 等组件类；工具等价：`jlc.schematic.list_components`）
- `schematic.listWires`（工具等价：`jlc.schematic.list_wires`）
- `schematic.listTexts`（工具等价：`jlc.schematic.list_texts`）

3) 用 `primitiveId ∈ selectedIds` 过滤出选区内的 items，并整理成：

- 器件（part）：优先从 `item.component.*` 提取 `designator / value / name / package(libName)`；再补 `subPartName / x,y / rotation / mirror`
- 网络：显式网名（如 `VIN_5V/GND/INL/INR`）、网络标志/端口、导线 `net`
- 导线：`line` 坐标（必要时做去重/归并）
- 文本：优先从 `item.text/value/content/str` 里找可读文本，再补 `x,y / rotation`

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
