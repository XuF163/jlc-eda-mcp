# 原理图区域性选取（Selection → BBox）

> 目标：用“用户当前已选中的图元”来近似表示“用户框选的原理图区域”，并把它转换为 `{minX,minY,maxX,maxY}`（BBox）。
>
> 传输：下文示例使用 `jlc-eda-mcp/docs/PROTOCOL.md` 的 WebSocket `request`（单行 JSON）。发送方式见 `../SKILL.md`。

## 约定

- JLCEDA Pro 暂未发现直接暴露“拖拽框选矩形坐标”的 API。
- 我们用 **已选中图元 primitiveIds → BBox** 表达“用户关注区域”。
- 注意：**切换图页 / 重新打开文档会清空选区**，所以读取/编辑要在同一页内连续完成。

## 最小流程（3 步）

1) 确认当前是原理图图页：

```json
{"type":"request","id":"1","method":"tools.call","params":{"name":"jlc.document.current","arguments":{}}}
```

2) 读取用户当前选中的图元 ID：

```json
{"type":"request","id":"2","method":"tools.call","params":{"name":"jlc.eda.invoke","arguments":{"path":"sch_SelectControl.getAllSelectedPrimitives_PrimitiveId"}}}
```

3) 计算这些图元的包围盒（BBox）：

```json
{"type":"request","id":"3","method":"tools.call","params":{"name":"jlc.eda.invoke","arguments":{"path":"sch_Primitive.getPrimitivesBBox","args":[["PRIMITIVE_ID_1","PRIMITIVE_ID_2"]]}}}
```

> 把第 2 步返回的 primitiveIds 填到 `args[0]`，返回值形如 `{minX,minY,maxX,maxY}`。

## 选区辅助能力（可选）

- 读取鼠标在画布坐标：`sch_SelectControl.getCurrentMousePosition`（`jlc.eda.invoke`）
- 缩放到“适应选中”：`dmt_EditorControl.zoomToSelectedPrimitives`（`jlc.eda.invoke`）
- 把程序生成/计算出来的 primitiveIds 重新选中并定位：`jlc.schematic.select`
- 按 nets / components / pins 快速高亮：`jlc.schematic.crossprobe_select`

## 常见坑

- 选区为空：提示用户先框选（或 Ctrl+A 全选后再缩小范围）。
- 选区包含不支持的图元：BBox 可能返回异常；建议只选常见图元（器件/导线/文本/网络端口/网络标志）。
