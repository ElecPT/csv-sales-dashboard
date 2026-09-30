# 数览 BI · CSV 销售看板

上传 CSV 即可展示销售额、订单量、毛利额、毛利率和客单价，并查看销售趋势、渠道及商品类别分析。支持筛选和图表轮播，适合 16:9 屏幕演示。

## 本地运行

需要 Node.js 22.13 或以上版本。

```sh
npm ci
npm run dev -- --port 3101
```

打开 http://localhost:3101 。可使用 `public/demo-data.csv` 中的演示数据，也可以上传自己的 CSV。

```sh
npm run build
```

## 项目说明

使用 React、TypeScript、Vite / Vinext。保留原项目的 Cloudflare Worker 和 Sites 配置；发布到自己的云端需要单独配置部署环境。GitHub 仓库保存代码，不会自动将网站上线。

CSV 看板入口为 `app/page.tsx` 和 `app/dashboard.tsx`。该历史项目还保留课堂页面及后端模板文件。

本仓库不包含依赖目录、运行缓存、环境密钥或用户上传文件。