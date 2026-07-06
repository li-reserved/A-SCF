# A股资金流向上线部署流程

这个项目部署在 Vercel，不需要自己买服务器。注意：不要随手执行生产部署，等确认要上线时再操作。

## 1. 本地预览

```bash
npm run fund-flow
```

打开：

```text
http://127.0.0.1:5177/
```

## 2. 本地检查

```bash
node --check public/app.js
node --check scripts/fund-flow-proxy.mjs
curl -fsS 'http://127.0.0.1:5177/api/fund-flow/overview?scope=all&limit=60'
```

重点确认：

- 页面能打开。
- 移动端图表不溢出。
- 日期选择、时间拖动和自动回溯播放正常。
- Canvas 录制只包含图表画布，能开始/停止并下载视频。
- 接口返回 `sourceStatus.text` 为 `真实数据`。
- 默认 `series.length` 不超过 31；解除限制并传 `focusLimit=all` 时可以返回更多大类。
- `/api/fund-flow/focus-groups` 能返回可选择的大类列表。

## 3. 上线到 Vercel

只有在明确要上线时再执行：

```bash
npx vercel --prod --yes
```

固定线上地址：

```text
https://a-share-fund-flow-sepia.vercel.app
```

页面入口是根路径，接口是：

```text
/api/fund-flow/overview?scope=all&limit=60
/api/fund-flow/focus-groups
```

## 4. 上线后校验

```bash
curl -fsS 'https://a-share-fund-flow-sepia.vercel.app/app.js' | rg 'setScrubMinuteFast|selectEvenLabels'

curl -fsS 'https://a-share-fund-flow-sepia.vercel.app/api/fund-flow/overview?scope=all&limit=60'

curl -fsS 'https://a-share-fund-flow-sepia.vercel.app/api/fund-flow/focus-groups'
```

如果手机微信里还是旧样式，先刷新页面或重新打开链接，微信内置浏览器可能有缓存。

## 5. 桌面启动

桌面脚本：

```text
~/Desktop/A股资金流向.command
```

双击后会启动本地服务并打开：

```text
http://127.0.0.1:5177/
```

如果项目目录移动了，需要同步修改脚本里的 `APP_DIR`。

## 数据说明

- 页面和线上 API 都使用东方财富公开资金流接口。
- 线上没有使用模拟资金数据。
- 云函数有执行时间限制，分钟线可能比本地版本更容易降级为当前真实净额。
- 本地走势存档写入 `data/fund-flow-trends.json`，该文件不提交；线上环境不依赖本地存档文件持久化。
- 这不是交易级实时行情，真实数据受东方财富接口延迟、限流和稳定性影响。
