# 03 · 商品搜索 searchGoodsV2

## 接口

```
GET /v4/search/searchGoodsV2
    ?pageNo=1
    &pageSize=30
    &queryType=4
    &keyWords=<条码或关键词>
    &activityId=
    &sort=1
    &filterList=
    &noSaleSelectFlag=false
    &isFromCategroy=false
    &openSearchRequestId=
```

| 参数 | 说明 |
|------|------|
| `keyWords` | 🔴 **大写 W**。条码 / 商品编码 / 中文关键词都塞这里 |
| `queryType` | `1` 综合，`4` 也是综合（首页搜索框发的是 4），对结果影响不大 |
| `openSearchRequestId` | 上一次搜索返回的会话 ID，可不传 |
| `sort` | 1 综合 / 2 销量 / 3 新品 / 4 价格 |
| `noSaleSelectFlag` | `true` = 不显示已下架；默认 `false` |

## 返回结构（重要）

```json
{
  "code": 0,
  "message": "请求成功",
  "data": {
    "secondItems": [ ... ],   // 🔴 精确命中（条码搜索的结果在这里）
    "firstItems":  [ ... ],   // 模糊命中 / 推荐相关商品
    "postCount": 1,
    "categoryList": [],
    "guessWords": [],
    "openSearchRequestId": "..."
  }
}
```

**条码搜索命中在 `secondItems`，不在 `firstItems`，也不在 `items`。**

我第一次只看 `items`（不存在）和 `firstItems`（空），于是判定"搜不到"。
实际商品一直在 `secondItems[0]`。

`items` 这个 key 永远为空数组，看着像主字段，其实是坑。

## 商品字段（搜索页）

```json
{
  "item_id": 66496,
  "item_no": "HQKP3043",
  "item_name": "HQKP3043 晨光Linefriends系列黑0.5按动热可擦中性笔",
  "name": "HQKP3043 晨光Linefriends系列黑0.5按动热可擦中性笔",
  "brand": "晨光",
  "price": "¥3.10",
  "company_stock": "有",
  "deliver_stock": "暂无库存",
  "stocksString": "库存: 大仓 有",
  "onSale": true,
  "firstCate": "晨光系列",
  "secondCate": "书写工具",
  "thirdCate": "中性笔",
  "fourthCate": "热可擦中性笔",
  "cover_image_url": "https://qiniupic-ssl.lifemg.cn/image/749253f7….png",
  "link_url": "https://lifemg.cn/items/66496/?from=0",
  "itemSkuList": [
    {
      "skuNo": "HQKP304311",
      "goodNo": "HQKP3043A",
      "goodsBarcode": "6944041509433",
      "skuName": "晨光按动热可擦中性笔Linefriends系列HQKP3043黑0.5",
      "prop1Value": "黑0.5",
      "customPrice": 3.1,
      "mdmCode": "60096547",
      "status": 1
    }
  ]
}
```

- 一个 `item_id` 下有多个 SKU，**一个 SKU 一个条码**
- 用条码搜到的是"商品"，`itemSkuList[].goodsBarcode` 才是精确匹配到的那支
- `cover_image_url` 只是封面（= 主图 = 轮播第 1 张），完整图片要去详情接口拿

## 前端路由参数：keyWords，不是 keyword

```
✅ https://lifemg.cn/search-list?keyWords=6944041509433
❌ https://lifemg.cn/search-list?keyword=6944041509433
```

写成 `keyword` 不会报错，页面照常打开，但搜索框是空的、搜索请求 `keyWords=` 为空、显示"暂无相关商品"。
**静默失效**，非常容易误判。

## 三种可用的触发方式

| 方式 | 可靠性 | 说明 |
|------|--------|------|
| 直接调接口 `lib/common.js → searchByBarcode()` | ✅ 最稳 | 推荐。自己拼头，不依赖 UI |
| 打开 `/search-list?keyWords=<条码>` | ✅ 可用 | 路由参数名必须对 |
| UI 输入框 + 回车/点搜索 | ⚠️ 不稳 | 首页搜索框无 placeholder，且回车/点按钮有时不触发 |

第 3 种在实践中经常点不动：首页搜索框是 `input.el-input__inner` 无 placeholder，
按钮被 `.footer` 之类覆盖；搜索结果页的搜索框才是有 placeholder 的那个
（`请输入搜索内容`），只在那个框里输入才稳定。

## 顺带一个副作用

`GET /v4/search/hintSearch?keyWords=xxx` 会把关键词写进"历史搜索"。
它返回的永远是热门词列表（`圆规/修正带/中性笔…`），**跟传入的 keyword 无关**，
返回里的 `requestId` 可以喂给 `searchGoodsV2` 的 `openSearchRequestId`，但不是必需的。

想确认"到底哪个词被搜过、有没有进历史"，可以看：
`GET /v4/search/searchHistory`。
