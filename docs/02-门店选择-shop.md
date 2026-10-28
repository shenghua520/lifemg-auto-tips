# 02 · 门店选择 shop 🔴 最大的坑

## 结论先行

**不选门店时，搜索接口会返回 `code: 0`（"请求成功"）但 `secondItems` 恒为空。**
不报错、不提示，页面显示"暂无相关商品~"。

于是你会得出错误结论："这个条码不存在" / "接口参数写错了"。

实际上这时任何关键词（连"中性笔""圆规"这种必然有货的词）都是 0 条。

## 怎么判断自己踩了这个坑

看请求头：

```
auth_storeid: 0
shopid: 0
auth_org_code: 未绑定终端
```

页面顶栏显示：`未绑定终端`。

> 注意：登录接口返回的 `has_shop_selected: true` 和
> `shop_selected.store = <STORE_NAME>` **不能**作为已选门店的依据。
> 账号层面"最后一次选过的门店"记着，但新会话的 `localStorage.storeId` 还是 `0`。

## 门店列表

```
GET /v4/users/newShopList?companyCode=&deliverCode=&storeName=&storeCode=&pageNo=1&pageSize=50
```

```json
{
  "code": 0,
  "data": {
    "total": 1,
    "items": [
      {
        "shop": "<SHOP_CODE>-<STORE_NAME>",
        "shop_code": "<SHOP_CODE>",
        "store": "<STORE_NAME>",
        "store_id": <STORE_ID>,
        "shop_type": 2,
        "company_code": "013",
        "company_name": "<公司名>",
        "deliver": "<DELIVER_CODE>-<DELIVER_NAME>",
        "deliver_code": "<DELIVER_CODE>",
        "mobile": "<MOBILE>"
      }
    ]
  }
}
```

> ⚠️ 门店在 `data.items`，**不是** `data.list` / `data.records`。
> 我第一次按 `data.list` 解析，拿到"没有可选门店"，白绕一圈。

## 选门店

```
POST /v4/users/shop
Content-Type: multipart/form-data

shop_id=<STORE_ID>
```

```json
{ "code": 200, "message": "ok" }
```

**必须是 form-data**。用 JSON body 会失败。

接口成功后，前端还要把 `storeId` 写进 localStorage，并刷新页面让 axios 拦截器重新读：

```js
await page.evaluate(async (id) => {
  const fd = new FormData();
  fd.append('shop_id', String(id));
  await fetch('/v4/users/shop', { method: 'POST', body: fd, credentials: 'include' });
  localStorage.setItem('storeId', String(id));
}, shop.store_id);
await page.goto('https://lifemg.cn/');
```

## UI 路径（不推荐，但要知道）

登录后如果没选门店，页面会**自动弹出**门店选择对话框（`.lm-select-store`）：

- 表格里一行门店，点行（或行内 `.el-radio`）
- 点"确认选择"（`.confirm-button`）

这条路能通，但很脆：

- 弹窗是 Element Plus 的多个 `.el-overlay` 叠加，`display:none` 的隐藏层也在 DOM 里，
  `locator('.lm-select-store .el-table__row').first()` 可能取到隐藏的那份
- 顶部还有个"快速切换门店"文字入口，弹窗已经打开时点它会超时
- 按钮 `.first()` 可能命中隐藏层的同名按钮

所以 `lib/common.js` 直接走**接口切店 + 写 localStorage**，稳定得多。

## 校验是否真的选上了

```js
const sid = await page.evaluate(() => localStorage.getItem('storeId'));   // 应为 <STORE_ID>
const head = await page.evaluate(() => document.body.innerText.slice(0, 60));
// 不能包含 "未绑定终端"
```

实测通过后：顶栏变成 `<STORE_NAME>`，购物车数变成 4，首页"为你推荐"出现带价格的商品。
