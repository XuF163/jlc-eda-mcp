# RPC：`schematic.applyIr`（SchematicIR v1，高阶绘图）

> 目标：用一个结构化 IR 做“增量 upsert”，更适合 LLM 批量绘图与迭代修改。

参考：

- IR 规范：`jlc-eda-mcp/docs/SCHEMATIC_IR.md`
- 扩展侧实现：`jlc-eda-mcp/packages/eda-extension/src/handlers/applyIr.ts`

## 调用方式

注意：`schematic.applyIr` 的 `params` **就是 IR 本体**（不是 `{ ir: ... }` 包一层）。

```bash
curl -s -X POST http://127.0.0.1:9151/v1/rpc \
  -H 'content-type: application/json' \
  -d '{
    "method": "schematic.applyIr",
    "params": {
      "version": 1,
      "units": "sch",
      "page": { "ensure": true, "schematicName": "MCP Demo", "pageName": "Sheet1" },
      "texts": [
        { "id": "t1", "x": 100, "y": 100, "content": "Hello" }
      ],
      "wires": [
        { "id": "w1", "net": "VCC", "line": [100, 120, 200, 120] }
      ],
      "post": { "save": true }
    }
  }'
```

常用要点：

- `page.ensure` 默认 `true`：不在原理图页会自动创建并打开
- `page.clear` / `page.clearMode`：清空本页（慎用 `all`）
- `patch.delete.*`：按 id 删除托管图元（组件/导线/文本/连接…）
- `units: "mm"`：会自动换算到原理图坐标单位（`0.01 inch`）

工具等价：`jlc.schematic.apply_ir`（工具层会用 `{ ir: ... }` 包一层）

