# A股资金流向项目总结

## 项目定位

这是一个独立的 A 股资金流向网页，用于查看盘中重点大类的资金净流入、净流出和分时涨跌走势。项目已经从原 `product-lsc-app` 中拆出，当前目录为：

```text
/Users/achar/Desktop/A股资金流向
```

本地可以双击桌面的启动脚本直接打开：

```text
/Users/achar/Desktop/A股资金流向.command
```

## 当前展示内容

页面默认进入「资金图」，只展示保留后的重点大类，不再展示大量无关板块。当前重点大类包括有色金属、CPO、半导体、机器人、农业、券商、华为鸿蒙、数据要素等方向，具体以 `scripts/fund-flow-proxy.mjs` 中的 `focusGroups` 配置为准。

主要功能：

- 资金图：展示真实资金分钟线；没有分钟线时只展示真实当前净额，不用估算曲线冒充全天走势。
- 分时：展示对应板块或概念的真实分时涨跌走势。
- 同屏：资金流和分时走势上下同屏查看。
- 时间回看：拖动底部时间条，查看今天某个时点之前的走势。
- 移动端适配：小屏用更紧凑的图表布局和小字号线尾标签。

## 数据来源

数据来自东方财富公开接口，由本项目的 Node 代理统一请求、缓存和归一化。

前端只请求本项目接口：

```text
/api/fund-flow/overview?scope=all&limit=60
```

关键数据说明：

- `pointSource = minute`：真实资金分钟线，可以形成全天走势。
- `pointSource = snapshot`：真实当前资金净额快照，不代表全天历史曲线。
- `pricePointSource = minute`：真实分时涨跌走势。
- 页面不会使用模拟资金曲线。

注意：这不是交易级实时行情，公开接口可能有延迟、限流、空返回或云函数超时。

## 本地运行

进入项目目录：

```bash
cd /Users/achar/Desktop/A股资金流向
npm run fund-flow
```

打开：

```text
http://127.0.0.1:5177/
```

检查接口：

```bash
curl -fsS 'http://127.0.0.1:5177/api/fund-flow/overview?scope=all&limit=60'
```

## 上线方式

项目部署在 Vercel，不需要自建服务器。只有确认要上线时执行：

```bash
cd /Users/achar/Desktop/A股资金流向
npx vercel --prod --yes
```

线上地址：

```text
https://a-share-fund-flow-sepia.vercel.app/
```

上线后建议校验：

```bash
curl -fsS 'https://a-share-fund-flow-sepia.vercel.app/api/fund-flow/overview?scope=all&limit=60'
```

## 维护注意

- 修改重点大类时，优先改 `scripts/fund-flow-proxy.mjs` 的 `focusGroups`。
- 修改页面交互和绘图时，主要改 `public/app.js`。
- 修改桌面和移动端样式时，主要改 `public/styles.css`。
- 修改后先运行 `npm run check`，确认 JS 语法正常。
- 如果微信或手机浏览器仍显示旧页面，通常是缓存导致，重新打开链接或稍等片刻再刷新。

## 前端稳定性策略

线上部署到 Vercel 后，真实数据可能因为云函数冷启动、服务器地域和东方财富公开接口响应不稳定而变慢。当前前端已经做了以下体验优化：

- 首屏优先读取浏览器本地上一帧有效数据，随后后台刷新真实源。
- 请求设置超时，超过等待时间后保留上一帧，不让页面空白。
- 连续失败时自动退避，避免接口异常时高频重试。
- 页面切到后台时暂停自动请求，回到前台立即刷新。
- 手动「更新数据」会绕过缓存请求真实源。

这些策略不能让第三方真实接口本身变快，但可以让页面表现更稳定、更快可见。
