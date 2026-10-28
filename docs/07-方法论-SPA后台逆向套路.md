# 07 · 方法论：陌生 SPA 后台的逆向套路

这篇不绑定 lifemg，换任何一个 Vue/React 后台都适用。按顺序做，基本不会绕远路。

---

## 第 0 步：先判断"这是哪种站"

| 特征 | 结论 | 做法 |
|------|------|------|
| `curl` 拿到 `<div id="app"></div>` 就没了 | 纯客户端渲染 SPA | 必须跑浏览器，别浪费时间调 curl |
| HTML 里有真实内容 | 服务端渲染 | 可以直接抓 HTML/接口 |
| 有很多 `static/js/*.js` 分包 | 路由/接口都在 chunk 里 | 抓包比读源码快 |

判断命令：

```bash
curl -s https://site/ | grep -c 'id="app"'
```

---

## 第 1 步：抓包，不要猜

**先让页面自己跑一遍，把请求录下来。** 这一步能省掉 80% 的试错。

```js
page.on('request', r => {
  if (r.resourceType() === 'xhr' || r.resourceType() === 'fetch') {
    console.log(r.method(), r.url());
  }
});
```

拿到请求后，重点看三样：

1. **URL 里的参数名**（`keyWords` 还是 `keyword`？大小写敏感）
2. **请求头**（有没有自定义鉴权头，裸 fetch 会不会缺）
3. **响应体里哪个字段真有数据**（`items` 还是 `secondItems`？空数组的字段最容易骗人）

---

## 第 2 步：接口"成功但为空"，先查上下文

这是本次最大教训，也是最通用的：

```
code: 0 / success: true / 列表空
```

**不要先怀疑参数名**，先查"当前上下文"：

- 选了门店 / 仓库 / 组织吗？
- 有权限看这个数据吗？
- 时间范围、状态筛选是不是把数据过滤掉了？

判断依据看**请求头**，不看页面文案：`auth_storeid: 0`、`auth_org_code: 未绑定终端`——一眼就知道是上下文没设置。

> 经验：**"空"比"报错"难查**。报错会告诉你哪里错了，空只会让你怀疑自己。
> 所以遇到空，第一反应应该是"我缺了什么前置条件"，而不是"我参数写错了"。

---

## 第 3 步：路由表直接问框架要

不要靠猜 URL。SPA 的路由表就在内存里：

```js
const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
router.getRoutes().map(r => r.path);
// 或者 React：从 fiber 里找，或直接读 bundle
```

本次就是靠这句发现详情页是 `/goods-detail?itemId=`，
而不是接口里给的 `link_url`（那是 H5 链接，PC 打开白屏）。

> **接口返回的 `link_url` / `share_url` / `detail_url` 不一定是当前端能用的地址。**
> 多端系统里同一个商品有 PC / H5 / 小程序三套路由，别照抄。

---

## 第 4 步：能调接口就别点 UI

UI 自动化的坑是无穷的：遮罩、懒加载、hydration、虚拟列表、`force` 点错层。

优先级：

```
直连接口（自己拼头）  >  路由参数直达  >  点 UI
```

只有在"接口拿不到、只能靠页面渲染"时才点 UI。

例外：**有些接口必须要页面上的临时态**（比如加密签名、一次性 token），这时才退回 UI。

---

## 第 5 步：能解析接口就别解析 DOM

详情图这类"富文本里的图"，DOM 是渲染结果，接口才是数据源。

- DOM：懒加载、虚拟列表、滚动速度都会影响 → 时多时少
- 接口：`detailHtml` 里 `<img>` 完整且稳定

同理，价格、库存、SKU 都从接口拿，别从页面文字里正则抠。

---

## 第 6 步：鉴权头从 localStorage 重建

前端用 axios 拦截器注入的头，裸 `fetch` 是没有的。做法：

```js
const H = {
  pctoken: localStorage.getItem('pcToken'),
  auth_userid: JSON.parse(localStorage.user).userInfo.id,
  auth_storeid: localStorage.getItem('storeId'),
  // …按真实请求头逐项对齐
};
await fetch(url, { headers: H, credentials: 'include' });
```

**排查口诀**：浏览器里能出数据、脚本里出不来 → 十有八九是头缺了。
用 `page.on('request')` 打一次真实 headers，逐项对比。

---

## 第 7 步：登录/表单，防 hydration 竞态

凡是"第一次不行、第二次行"的，都是竞态。两个兜底手段：

1. `waitForLoadState('networkidle')`，别只等 `domcontentloaded`
2. **填完回读 `input.value`**，不等于目标值就重填
3. 勾选框改完确认 class 变了（Element Plus / Ant Design 的 `is-checked` / `ant-checkbox-checked`）

---

## 第 8 步：产物设计——让别人一眼看懂

本次改了三版才定下来，教训是：

| 做法 | 评价 |
|------|------|
| `主图/01.png`（按类型分三层目录） | ❌ 文件夹太多，找图要点进去 |
| `主图/主图_01.png`（目录名 + 文件前缀） | ❌ 目录名和文件名重复，冗余 |
| `01_主图.png`（平铺 + 全局连续序号） | ✅ 一个目录看完，按文件名排序即页面顺序 |

配套：**一定要有清单文件**（`图片清单.csv`），记录 类型/序号/文件名/尺寸/URL。
否则下游拿到一堆图，还是不知道哪张是哪张。

---

## 一句话总结

> **先抓包再动手；空结果先查上下文；路由问框架要；能调接口不点 UI；能读接口不扒 DOM；头缺了用真请求对齐；命名平铺带序号配清单。**
