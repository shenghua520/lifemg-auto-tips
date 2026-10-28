# 05 · 导出 Excel 字段说明

产物：`output/商品清单_<YYYYMMDD-HHmmss>.xlsx`，两个 Sheet。

## Sheet 1 · 商品总表（31 列，一行 = 一个商品）

| 列 | 来源 | 示例 |
|----|------|------|
| 条码 | 用户输入（搜索用） | `6944041509433` |
| 商品名称 | `newDetail.item_name` | `HQKP3043 晨光Linefriends系列黑0.5按动热可擦中性笔` |
| 商品编码 | `newDetail.itemNo` | `HQKP3043` |
| 商品ID | `newDetail.item_id` | `66496` |
| 品牌 | `newDetail.brand` | `晨光` |
| 一级分类 | `firstCate` | `晨光系列` |
| 二级分类 | `secondCate` | `书写工具` |
| 三级分类 | `thirdCate` | `中性笔` |
| 四级分类 | `fourthCate` | `热可擦中性笔` |
| 本店价 | `newDetail.minPrice` | `¥3.10` |
| 建议零售价 | `itemArgs.suggestPrice` | `¥5.00` |
| 包装规格 | `itemArgs.itemPacket` | `1/20/900` |
| 属性 | `itemArgs.attributes` | `黑0.5；晶蓝0.5；墨蓝0.5` |
| 库存 | `newDetail.stockString` | `库存: 大仓 有` |
| 上架状态 | `newDetail.onSale` | `在售` / `下架` |
| 是否新品 | `newDetail.ifNew` | `是` |
| SKU数 | `sku_list.length` | `3` |
| 主图数 | 实下载成功数 | `1` |
| 轮播图数 | 实下载成功数 | `7` |
| 详情图数 | 实下载成功数 | `2` |
| SKU图数 | 实下载成功数（多数商品为 0） | `0` |
| 主图文件 | 文件名 | `01_主图.png` |
| 轮播图文件 | 多张用 ` \| ` 分隔，顺序 = 页面轮播顺序 | `02_轮播图.png \| 03_轮播图.png \| …` |
| 详情图文件 | 多张用 ` \| ` 分隔，顺序 = 详情页自上而下 | `09_详情图.png \| 10_详情图.png` |
| SKU图文件 | 命名带 SKU 货号 + 条码 | `11_SKU图_HQKP3043A_6944041509433.png` |
| 主图URL | 去重后的主图直链 | `https://qiniupic-ssl…png` |
| 轮播图URL | 多张用 ` \| ` 分隔 | `…png \| …png \| …` |
| 详情图URL | 同上 | `…png \| …png` |
| 详情页 | 拼出来的 PC 详情地址 | `https://lifemg.cn/goods-detail?itemId=66496` |
| 图片文件夹 | 本地目录名 | `HQKP3043 晨光Linefriends…中性笔` |
| 抓取时间 | 本地时间 | `2026/10/28 13:56:02` |

> 图片数记的是**实际落盘成功**的张数，下载失败不计。失败明细见控制台与 `失败清单_*.json`。

### 关于"主图文件 / 轮播图文件"这两列

这两个列是为了一眼看出**顺序**：`02_轮播图.png` 就是详情页轮播的第一张，
文件名序号与接口数组下标、页面展示顺序三者一致；序号是**全目录连续**的两位数。

> 注意：`01_主图.png` 与 `02_轮播图.png` 实测是**同一张图**（URL 与字节数都相同）。
> 需要去重就只留轮播那份，Excel 里 `主图数` 减 1。

完整映射（含宽高、字节数、原始 URL）见每个商品目录下的 `图片清单.csv`。

## Sheet 2 · SKU明细（18 列，一行 = 一个条码）

| 列 | 来源 | 示例 |
|----|------|------|
| 商品名称 | `item_name` | 同总表 |
| 商品编码 | `itemNo` | `HQKP3043` |
| 条码 | `sku.barCode` **去 `条码:` 前缀** | `6944041509433` |
| SKU货号 | `sku.goodNo` | `HQKP3043A` |
| SKU编码 | `sku.skuCode` **去 `编码:` 前缀** | `60096547` |
| SKU_ID | `sku.sku_id` | `85371` |
| mdm编码 | `sku.mdm_code` | `60096547` |
| 规格 | `sku.prop_value` | `黑0.5` |
| 本店价 | `sku.show_price` | `¥3.10` |
| 零售价数字 | `sku.sale_price` | `3.1` |
| 建议零售价 | `sku.suggestPrice` | `¥5.00` |
| 起订量 | `sku.moq` | `1` |
| 包装单位 | `sku.skuUnit` 拼装 | `1PCS/20小盒/900箱` |
| 大仓库存 | `sku.company_stock` | `有` / `0` |
| 配送库存 | `sku.deliver_stock` | `0` |
| 库存描述 | `sku.stocksString` | `库存: 大仓 有` |
| 在售 | `sku.isSale` | `是` / `否` |
| 序号 | 列表顺序 | `1` |

## 为什么保留价格字符串 + 数字两列

`show_price` 是 `¥3.10`（带符号，给人看），`sale_price` 是 `3.1`（浮点，可参与计算）。
Excel 里要排序/求和就用数字列，要贴到别处展示就用字符串列。

## 一个商品的多个条码怎么处理

一个 `item_id` 下通常有多个 SKU，每个 SKU 一个条码。

- 传 3 个不同 SKU 的条码 → 只导出 **1 个文件夹 + 1 行总表**
- 但 SKU明细有 3 行，条码各不相同
- 商品信息.json 里 `barcode` 记录的是**第一条触发导出的条码**

这是刻意的：图片/详情是商品级的，没必要按条码重复下三份。

## 排序与列宽

- 列宽已按内容预设（URL 列 40，商品名称 46）
- 没做冻结首行、筛选器；需要的话在 Excel 里自己加，或者改 `exporter.js` 的 `!cols`
