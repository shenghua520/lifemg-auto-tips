# API_CATALOG · 晨光联盟商城（lifemg.cn）

> 实测 2026-10-28。全部为 `/v4/**`，GET 为主。
> 鉴权：Cookie + 9 个自定义头（见 [01 · 鉴权与登录](01-鉴权与登录.md)）。
> 标记：✅ 已验证可用 / ⚠️ 可调但需注意 / ❓ 未深入

## 账号与门店

| 方法 | 路径 | 用途 | 关键参数 | 状态 |
|------|------|------|---------|------|
| POST | `/v4/account/pwd_signin/pc` | 密码登录 | `mobile` / `password` | ✅ |
| GET | `/v4/account/scan_login/pc` | 扫码登录（轮询） | `key` | ❓ |
| GET | `/v4/users/me` | 当前用户（含 pcToken） | — | ✅ |
| GET | `/v4/user/me` | 用户简要信息 | — | ✅ |
| GET | `/v4/users/newShopList` | 门店列表 | `pageNo` / `pageSize` | ✅ |
| POST | `/v4/users/shop` | 选门店 | form-data `shop_id` | ✅ |
| GET | `/v4/users/switch/companyList` | 分公司列表 | — | ✅ |
| GET | `/v4/user/bill/info` | 账单 | `startTime` / `endTime` / `storeId` | ⚠️ |

## 搜索

| 方法 | 路径 | 用途 | 关键参数 | 状态 |
|------|------|------|---------|------|
| GET | `/v4/search/searchGoodsV2` | 商品搜索（条码/关键词） | `keyWords` / `queryType` / `sort` | ✅ |
| GET | `/v4/search/hintSearch` | 搜索提示（返回热门词） | `keyWords`（实际忽略） | ⚠️ 副作用：写历史 |
| GET | `/v4/search/searchHistory` | 搜索历史 | — | ✅ |

## 商品

| 方法 | 路径 | 用途 | 关键参数 | 状态 |
|------|------|------|---------|------|
| GET | `/v4/item/{item_id}/newDetail` | 详情主数据（主图/轮播/SKU/价格/库存） | path `item_id` | ✅ |
| GET | `/v4/h5/item/{item_id}` | 图文详情（`detailHtml` = 详情图） | path `item_id` | ✅ |
| GET | `/v4/item/itemArgs/{item_id}` | 商品参数（品牌/包装/属性/建议价） | path `item_id` | ✅ |
| GET | `/v4/filter/filterGoodList` | 分类/筛选商品列表 | `goodsTypeId` / `queryType` / `sort` | ✅ |
| GET | `/v4/filter/recommend/popularItem` | 推荐商品 | `pageNo` / `pageSize` | ✅ |
| GET | `/v4/classify/` | 全量分类树（约 146KB） | — | ✅ |
| GET | `/v4/homePage/getNew` | 首页聚合数据（约 23KB） | — | ✅ |

## 购物车 / 订单（只登记，未使用）

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| GET | `/v4/cart/count` | 购物车数量 | ✅ |
| — | `/v4/cart/**` | 加购/改数量/删除 | ❓ 本仓库**不调用** |

> 🚫 本仓库脚本只读采集，**不调用任何购物车/订单/商品写接口**。

## 前端路由（`router.getRoutes()`）

```
/                    Home
/search-list         SearchList          ?keyWords=<kw>
/goods-list          GoodsList
/goods-detail        GoodsDetail         ?itemId=<id>   ← PC 详情页
/cart                Cart
/cart/confirm        CartConfirm
/cart/confirm/result CartConfirmResult
/order               Order
/often-buy-list      OftenBuyList
/pcadmin             AdminLayout
/pcadmin/dashboard   AdminDashboard
/login               Login
```

## 图片 CDN

```
https://qiniupic-ssl.lifemg.cn/image/<32位hash>.png
```

- 公开直链，无签名、无防盗链
- 建议带 `Referer: https://lifemg.cn/`
- 格式：png 为主，偶见 jpg/webp

## 响应通用约定

```json
{ "code": 0, "message": "请求成功", "data": { … } }
```

| code | 含义 |
|------|------|
| `0` | 成功（搜索/查询接口） |
| `200` | 成功（部分写接口，如选门店） |
| `412` | 手机号或密码错误 |
| `500` | 未知错误（多半是参数名不对，如 `keyword`） |

列表型 `data` 统一是 `items` + `total` + `hasNext` + `nextPage`。

> ⚠️ `code: 0` 只代表"请求被接受"，**不代表有数据**。
> 未选门店时搜索同样返回 `code: 0` + `secondItems: []`。
