# A股资金流向

基于 [CareerCompass](https://github.com/arsh342/careercompass) 应用框架改造的 A 股资金工作台。项目使用 Next.js App Router、CareerCompass 动画侧栏、Tailwind 主题、shadcn 组件约定、Lucide 图标与 Recharts，不包含登录、注册、Firebase 或鉴权跳转。

## 项目结构

- `src/app/(app)`：站内业务路由。
- `src/components/app-sidebar.tsx`：CareerCompass 应用壳、侧栏导航和全局刷新。
- `src/components/market`：行情、两融、机构、央行和个股页面组件。
- `src/hooks/use-market-data.ts`：统一数据请求、刷新、错误和轮询状态。
- `scripts/fund-flow-proxy.mjs`：公开数据源代理与口径处理。

CareerCompass 上游基线：`arsh342/careercompass@fade6f4a83ebc8ca3790ae56d06f1fcd9a43b1f1`。

## 站内路由

| 路由 | 页面 |
| --- | --- |
| `/` | 资金总览 |
| `/intraday` | 分时走势 |
| `/multi-chart` | 多图同屏 |
| `/margin` | 融资融券 |
| `/after-hours` | 资金暗盘 |
| `/strategy` | 自动选股、模拟交易与绩效统计 |
| `/sectors` | 板块排行 |
| `/leaders` | 细分龙头 |
| `/institutions` | 机构多空 |
| `/liquidity` | 央行逆回购投放与到期 |
| `/security?code=002463` | 个股研判 |

旧地址 `/index.html`、`/segment-leaders.html` 和 `/security-analysis.html` 仅做兼容跳转，不再保留旧 HTML、CSS 或页面脚本。

## 本地启动

```bash
npm install
npm run dev
```

打开 [http://127.0.0.1:5177/](http://127.0.0.1:5177/)。可通过 `PORT=5190 npm run dev` 指定端口。

## 检查与构建

```bash
npm run check
npm run build
npm run start
```

开发缓存使用 `.next-dev`，生产构建使用 `.next`，可以在开发服务运行时执行生产构建。

## 数据口径

页面仅展示公开数据源返回的真实数据。主要数据包括东方财富资金流与行情、中金所席位排名、中国人民银行公开市场业务公告。资金暗盘是收盘主力资金极值样本，不代表 A 股存在独立的盘后连续交易市场。

所有数据与技术研判仅用于辅助观察，不构成投资建议或收益承诺。
