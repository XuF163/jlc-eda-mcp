# Verify Nets（连通性验证）

`jlc.schematic.verify_nets` 用于在 **不依赖 EDA 内置网表 API** 的情况下，验证原理图导线连通性是否符合预期。

它的做法是：读取 `jlc.document.get_source` 的文档源码，解析 `WIRE/LINE/ATTR(NET)`，构建端点连通图，然后检查同一网络下的关键点是否都处于同一连通域。

## 什么时候用

- 你希望在自动布线/连线后，程序化确认 “这些引脚确实连在一起”
- 某些版本的 `get_netlist/export_netlist` 行为不稳定或耗时过长时，用它作为兜底

如果你的原理图大量使用 **网标/端口**（同名网络跨导线段的逻辑连接），优先使用 `jlc.schematic.verify_netlist`（它基于 `SCH_Netlist.getNetlist()` 校验 Ref.Pin 归属），更接近“真实网表”的结果。

## 输入结构（要点）

每个 `net`：
- `name`：网名（用于核对 `ATTR.NET`）
- `points[]`：需要验证连通的关键点
  - 推荐：用 `primitiveId + (pinName|pinNumber)` 指向器件引脚（坐标由工具自动读取）
  - 也可直接给 `x/y`（原理图画布坐标）
- 可选：`wirePrimitiveIds[]`，只在给定 wire 集合里验证（适合 MCP 增量绘制，避免被页面其它导线干扰）

## 示例（用引脚引用）

```json
{
  "tool": "jlc.schematic.verify_nets",
  "arguments": {
    "nets": [
      {
        "name": "3V3",
        "points": [
          { "ref": "U_REG.OUT", "primitiveId": "PRIM_U1", "pinName": "OUT" },
          { "ref": "U_MCU.VDD", "primitiveId": "PRIM_U2", "pinName": "3V3" }
        ]
      },
      {
        "name": "GND",
        "points": [
          { "ref": "U_REG.GND", "primitiveId": "PRIM_U1", "pinName": "GND", "allowMany": true },
          { "ref": "U_MCU.GND", "primitiveId": "PRIM_U2", "pinName": "GND", "allowMany": true }
        ]
      }
    ]
  }
}
```

返回值里每个网会给出：
- `missingPoints`：关键点没有落在解析到的导线端点上（通常表示“线没接到脚上”或坐标偏离）
- `disconnected`：点存在但不在同一连通域（通常表示“看起来同网但实际上断开”）

## `verify_netlist` 示例（网名 -> Ref.Pin）

```json
{
  "tool": "jlc.schematic.verify_netlist",
  "arguments": {
    "netlistType": "JLCEDA",
    "nets": [
      {
        "name": "3V3",
        "endpoints": [
          { "ref": "U1", "pin": "2" },
          { "ref": "U2", "pin": "3V3" }
        ]
      },
      {
        "name": "GND",
        "endpoints": [
          { "ref": "U1", "pin": "1" },
          { "ref": "U2", "pin": "GND" }
        ]
      }
    ]
  }
}
```

说明：
- `pin` 是网表里的 pin 标识；不同网表格式可能是纯数字，也可能是字母数字混合（工具会做宽松解析/比对）。
- 当网表格式解析不出 Ref.Pin 时，返回会包含 `parsed.warnings` 和 `excerpt`，便于你调整 `netlistType` 或反馈样例。
