# 晨光联盟商城 · 自动化经验与接口文档（lifemg.cn）

> 站点：https://lifemg.cn （晨光联盟商城 · B2B 订货）
> 前端：Vue3 + Element Plus + Pinia + axios 的纯 SPA，接口全在 `/v4/**`
> 本次目标：**按商品条码 → 搜到商品 → 下载主图 / 轮播图 / 详情图 → 导出商品全量信息 Excel**

实测环境：2026-10-28，账号为某**终端门店**（B2B 订货角色，仅有 1 个门店）。
仓库内账号、密码、门店名、门店/用户 ID 均已脱敏为 `<PHONE>` / `<PASSWORD>` / `<STORE_NAME>` / `<STORE_ID>` 等占位符。

---

## 📚 文档导航

| 文档 | 内容 |
|------|------|
| [00 · 概览与快速开始](docs/00-概览与快速开始.md) | 5 分钟跑通、目录说明、产物结构 |
| [01 · 鉴权与登录](docs/01-鉴权与登录.md) | 密码登录、协议勾选框、登录态复用、**9 个鉴权请求头** |
| [02 · 门店选择 shop](docs/02-门店选择-shop.md) | 🔴 **最大的坑**：不选门店搜什么都是 0 条 |
| [03 · 商品搜索 searchGoodsV2](docs/03-商品搜索-searchGoodsV2.md) | 条码搜索、`keyWords` 大小写、`secondItems` vs `firstItems` |
| [04 · 商品详情与图片](docs/04-商品详情与图片.md) | 详情路由、三接口、主图/轮播/详情图取值 |
| [05 · 导出 Excel 字段说明](docs/05-导出Excel字段说明.md) | 两张表 26 + 18 列，SKU 字段去前缀 |
| [06 · 踩坑与事故复盘](docs/06-踩坑与事故复盘.md) | 🔴 8 个真实踩坑，含"静默返回 0 条" |
| [07 · 方法论：SPA 后台逆向套路](docs/07-方法论-SPA后台逆向套路.md) | 换任何 Vue/React 后台都适用的通用打法 |
| [API_CATALOG](docs/API_CATALOG.md) | 已探明接口清单 |

---

## ⚡ 快速开始

```bash
npm install                       # playwright + xlsx
cp config.example.js config.local.js
vim config.local.js               # 填手机号 / 密码 / 门店名

node scripts/00-login-save-state.js          # 登录一次，存 profile/auth.json
node scripts/01-search-barcode.js 6944041509433     # 先查一下有没有这个条码
node scripts/02-export-item.js 6944041509433        # 下载图片 + 出 Excel
node scripts/03-verify-output.js                    # 校验产物完整性
```

批量：

```bash
node scripts/02-export-item.js 6944041509433 6944041511153 6944041509432
node scripts/02-export-item.js --file barcodes.txt   # 一行一个，或用逗号/空格分隔
```

---

## 📦 产物结构

```
output/
├── HQKP3043 晨光Linefriends系列黑0.5按动热可擦中性笔/
│   ├── 01_主图.png
│   ├── 02_轮播图.png … 08_轮播图.png              # 序号 = 页面轮播顺序
│   ├── 09_详情图.png 10_详情图.png                 # 序号 = 详情页自上而下
│   ├── 11_SKU图_<SKU货号>_<条码>.png               # 有图才有，多数商品没有
│   ├── 图片清单.csv          # 类型/序号/文件名/宽/高/字节/URL —— 哪张是哪张
│   └── 商品信息.json          # 三接口原始响应 + 分类图片 URL，便于复盘
├── 商品清单_20261028-135602.xlsx   # 商品总表 31 列 + SKU明细 18 列
└── 失败清单_<时间>.json（仅在有失败时）
```

图片**平铺在一个目录里，不建子目录**；按文件名排序就是页面从头到尾的顺序。
`01_主图.png` 与 `02_轮播图.png` 是同一张图（后台主图即轮播第一张），需要去重只留一份。

---

## 🔑 核心接口速查

```
通用：GET/POST https://lifemg.cn/v4/<域>/<资源>?<query>
鉴权：Cookie(acw_tc 等) + 9 个自定义头（pctoken / auth_storeid / shopid …）
```

| 接口 | 用途 | 关键点 |
|------|------|--------|
| `POST /v4/account/pwd_signin/pc` | 密码登录 | 密码可能带结尾句点，原样传 |
| `GET /v4/users/newShopList` | 门店列表 | 门店在 `data.items`，不是 `data.list` |
| `POST /v4/users/shop` | 选门店 | **form-data** `shop_id`，成功 code=200 |
| `GET /v4/search/searchGoodsV2` | 条码/关键词搜索 | 参数 `keyWords`（大 W），`queryType=4` |
| `GET /v4/item/{id}/newDetail` | 详情主数据 | 主图 `thum_image_url`、轮播 `cover_image_url_list`、`sku_list` |
| `GET /v4/h5/item/{id}` | 详情图文 | `detailHtml` 里是**详情图**（`<img src>`） |
| `GET /v4/item/itemArgs/{id}` | 商品参数 | 品牌 / 包装规格 / 属性 / 建议零售价 |

---

## 🎯 三条一句话经验

1. **不选门店，一切皆空**：`auth_storeid=0` 时搜索接口 `code=0` 但 `secondItems` 恒为空，**不报错**，极易误判"这个条码不存在"。
2. **搜索参数是 `keyWords`**：前端路由也是 `?keyWords=`。写成 `?keyword=` 会被静默忽略，页面显示"暂无相关商品"。
3. **详情页只有 `/goods-detail?itemId=` 能进**：搜索结果里的 `link_url`（`/items/<id>/`）在 PC 端是白屏。

---

## 🛡 安全说明

- 所有代码**只读**：只发 GET 搜索/详情请求 + 只写本地文件，不调用任何后台写接口。
- 凭证放在 `config.local.js`（已在 `.gitignore`），`profile/auth.json` 同样不提交。
- 图片走 CDN 公开直链 `qiniupic-ssl.lifemg.cn`，按 4 并发下载，对源站友好。

---

## 📁 仓库结构

```
lifemg-auto-tips/
├── README.md
├── package.json
├── config.example.js          # 配置模板（复制为 config.local.js）
├── .gitignore
├── docs/
│   ├── 00-概览与快速开始.md
│   ├── 01-鉴权与登录.md
│   ├── 02-门店选择-shop.md
│   ├── 03-商品搜索-searchGoodsV2.md
│   ├── 04-商品详情与图片.md
│   ├── 05-导出Excel字段说明.md
│   ├── 06-踩坑与事故复盘.md
│   └── API_CATALOG.md
└── scripts/
    ├── lib/common.js          # 登录 / 门店 / 鉴权 fetch / 下载
    ├── lib/exporter.js        # 详情抓取 / 图片归类 / Excel 生成
    ├── 00-login-save-state.js
    ├── 01-search-barcode.js
    ├── 02-export-item.js
    ├── 03-verify-output.js
    ├── 98-sniff-detail.js     # 详情三接口原始响应探测（排障用）
    └── 99-check-sku-img.js    # 查某个商品到底有没有 SKU 图
```
