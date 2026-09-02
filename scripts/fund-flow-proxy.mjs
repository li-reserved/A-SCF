#!/usr/bin/env node
import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { handleNewsAlerts, handleNewsStream } from './news-service.mjs';
import { analyzeSecuritySnapshot } from './security-analysis.mjs';
import { isStrategyMainBoardCode, simulateAutoStrategy } from './auto-strategy.mjs';
import { handleUsMarketOverview, handleUsMarketTrend } from './us-market-service.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const execFileAsync = promisify(execFile);
const rootDir = resolve(__dirname, '..');
const pageDir = join(rootDir, 'public');
const port = Number(process.env.FUND_FLOW_PORT || process.env.PORT || 5177);
const aktoolsBase = process.env.AKTOOLS_BASE_URL || 'http://127.0.0.1:8080';
const trendStorePath = process.env.FUND_FLOW_TREND_DB_PATH || join(rootDir, 'data', 'fund-flow-trends.json');
const trendStoreEnabled = process.env.FUND_FLOW_TREND_STORE !== '0';
const refreshAfterMs = Number(process.env.FUND_FLOW_REFRESH_MS || 8000);
const cacheTtlMs = Number(process.env.FUND_FLOW_CACHE_MS || 8000);
const focusSourceCacheTtlMs = Number(process.env.FUND_FLOW_FOCUS_SOURCE_CACHE_MS || 60000);
const minuteCacheTtlMs = Number(process.env.FUND_FLOW_MINUTE_CACHE_MS || 15000);
const historicalDayCacheTtlMs = Number(process.env.FUND_FLOW_HISTORY_DAY_CACHE_MS || 6 * 60 * 60 * 1000);
const tradeDatesCacheTtlMs = Number(process.env.FUND_FLOW_TRADE_DATES_CACHE_MS || 5 * 60 * 1000);
const marketSummaryCacheTtlMs = Number(process.env.FUND_FLOW_MARKET_SUMMARY_CACHE_MS || 30000);
const allAMedianTimeoutMs = Number(process.env.FUND_FLOW_ALL_A_MEDIAN_TIMEOUT_MS || 6000);
const marginCacheTtlMs = Number(process.env.FUND_FLOW_MARGIN_CACHE_MS || 10 * 60 * 1000);
const reverseRepoCacheTtlMs = Number(process.env.FUND_FLOW_REVERSE_REPO_CACHE_MS || 15 * 60 * 1000);
const reverseRepoTimeoutMs = Number(process.env.FUND_FLOW_REVERSE_REPO_TIMEOUT_MS || 10000);
const securityAdviceBaseCacheTtlMs = Number(process.env.SECURITY_ADVICE_BASE_CACHE_MS || 20000);
const strategySimulationCacheTtlMs = Number(process.env.STRATEGY_SIMULATION_CACHE_MS || 20000);
const strategyHistoryCacheTtlMs = Number(process.env.STRATEGY_HISTORY_CACHE_MS || 6 * 60 * 60 * 1000);
const strategyUniverseSize = Math.trunc(clamp(Number(process.env.STRATEGY_UNIVERSE_SIZE || 240), 60, 400));
const strategyUniverseSampleSize = Math.min(1600, Math.max(1200, strategyUniverseSize * 5));
const strategyHistoryDays = Math.trunc(clamp(Number(process.env.STRATEGY_HISTORY_DAYS || 130), 90, 180));
const strategyStartDate = '2026-08-31';
const strategyCashFlows = [
  { date: '2026-09-01', amount: 42_000, source: '银行卡转入' }
];
const strategySyncedAccount = {
  snapshotDate: '2026-08-28',
  syncedAt: '2026-08-28T17:21:00+08:00',
  equity: 192_030.05,
  marketValue: 191_949,
  cash: 81.05,
  withdrawableCash: 42_044.63,
  positionPct: 99.9,
  totalPnl: -25_630.02,
  totalReturnPct: -28.74,
  todayPnl: -748.4,
  todayReturnPct: -0.39,
  realizedPnl: 313.9,
  pendingDeposit: 0,
  positions: [
    {
      code: '588170',
      market: 1,
      name: '科创半导体ETF华夏',
      shares: 98_100,
      availableShares: 85_200,
      latest: 1,
      marketValue: 98_100,
      cost: 120_647.01,
      entryPrice: 1.229837,
      pnl: -22_547.01,
      returnPct: -18.69
    },
    {
      code: '600522',
      market: 1,
      name: '中天科技',
      shares: 600,
      availableShares: 600,
      latest: 35.04,
      marketValue: 21_024,
      cost: 27_156.69,
      entryPrice: 45.26115,
      pnl: -6_132.69,
      returnPct: -22.58
    },
    {
      code: '600183',
      market: 1,
      name: '生益科技',
      shares: 500,
      availableShares: 500,
      latest: 145.65,
      marketValue: 72_825,
      cost: 70_089.22,
      entryPrice: 140.17844,
      pnl: 2_735.78,
      returnPct: 3.9
    }
  ]
};
const darkTradeBaseUrl = 'https://quotederivates.eastmoney.com/datacenter/darktrade';
const darkTradePageSize = 100;
const darkTradeIndexConcurrency = 5;
const darkTradePageCacheTtlMs = 15000;
const darkTradeRequestTimeoutMs = 5000;
const nationalTeamTech50CacheTtlMs = Number(process.env.FUND_FLOW_TECH50_HOLDING_CACHE_MS || 6 * 60 * 60 * 1000);
const nationalTeamTech50TimeoutMs = Number(process.env.FUND_FLOW_TECH50_HOLDING_TIMEOUT_MS || 8000);
const segmentLeaderCacheTtlMs = Number(process.env.FUND_FLOW_SEGMENT_LEADERS_CACHE_MS || 8000);
const limitUpCacheTtlMs = Number(process.env.FUND_FLOW_LIMIT_UP_CACHE_MS || 5000);
const policyFlowProxyTimeoutMs = Number(process.env.FUND_FLOW_POLICY_PROXY_TIMEOUT_MS || 4200);
const prefetchIntervalMs = Number(process.env.FUND_FLOW_PREFETCH_MS || 12000);
const minuteFetchLimit = Number(process.env.FUND_FLOW_KLINE_LIMIT || 72);
const minuteFetchPerGroup = Number(process.env.FUND_FLOW_KLINE_PER_GROUP || 4);
const priceFetchLimit = Number(process.env.FUND_FLOW_PRICE_LIMIT || 60);
const historyTrendDays = Number(process.env.FUND_FLOW_HISTORY_TREND_DAYS || 5);
const overviewFetchTimeoutMs = Number(process.env.FUND_FLOW_OVERVIEW_TIMEOUT_MS || 5600);
const responseHydrateWaitMs = Number(process.env.FUND_FLOW_RESPONSE_HYDRATE_MS || 450);
const eastmoneyTaskTimeoutMs = Number(process.env.FUND_FLOW_EASTMONEY_TASK_TIMEOUT_MS || 4200);
const akTaskTimeoutMs = Number(process.env.FUND_FLOW_AK_TASK_TIMEOUT_MS || 2600);
const emJsonTimeoutMs = Number(process.env.FUND_FLOW_EM_JSON_TIMEOUT_MS || 2800);
const eastmoneyResolveIps = (process.env.EASTMONEY_RESOLVE_IP || '120.79.191.232')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const rankFetchTimeoutMs = Number(process.env.FUND_FLOW_RANK_TIMEOUT_MS || 3600);
const rankPageSize = Number(process.env.FUND_FLOW_RANK_PAGE_SIZE || 60);
const afterHoursRankPerSide = Math.trunc(clamp(Number(process.env.FUND_FLOW_AFTER_HOURS_RANK_SIZE || 360), 100, 360));
const afterHoursStockLimit = 720;
const afterHoursPageSize = 100;
const afterHoursPreviewCacheTtlMs = Number(process.env.FUND_FLOW_AFTER_HOURS_PREVIEW_CACHE_MS || 30000);
const afterHoursFinalCacheTtlMs = Number(process.env.FUND_FLOW_AFTER_HOURS_FINAL_CACHE_MS || 6 * 60 * 60 * 1000);
const institutionPositionCacheTtlMs = Number(process.env.FUND_FLOW_INSTITUTION_POSITION_CACHE_MS || 10 * 60 * 1000);
const institutionPositionTimeoutMs = Number(process.env.FUND_FLOW_INSTITUTION_POSITION_TIMEOUT_MS || 8000);
const etfTurnoverTimeoutMs = Number(process.env.FUND_FLOW_ETF_TURNOVER_TIMEOUT_MS || 7500);
const etfAnnouncementTimeoutMs = Number(process.env.FUND_FLOW_ETF_ANNOUNCEMENT_TIMEOUT_MS || 4500);
const etfTurnoverPageSize = Number(process.env.FUND_FLOW_ETF_PAGE_SIZE || 100);
const auctionMinutes = 15;
const regularTradingDayMinutes = 240;
const closingAuctionMinutes = 0;
const morningSessionMinutes = 120;
const continuousOpenMinute = auctionMinutes;
const morningCloseMinute = continuousOpenMinute + morningSessionMinutes;
const regularCloseMinute = auctionMinutes + regularTradingDayMinutes;
const tradingDayMinutes = regularCloseMinute + closingAuctionMinutes;
const snapshotLimit = 96;
const focusGroupLimit = 32;
const pbcReverseRepoBaseUrl = 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475';
const pbcOutrightReverseRepoBaseUrl = 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/5492845';
const pbcMlfBaseUrl = 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125437/125446/125873';
const rankFetchSize = {
  industry: 360,
  concept: 420,
  region: 80,
  stock: 80
};
const policyFlowProxyEtfs = [
  { code: '510300', market: 1, name: '沪深300ETF华泰柏瑞' },
  { code: '510310', market: 1, name: '沪深300ETF易方达' },
  { code: '159919', market: 0, name: '沪深300ETF嘉实' },
  { code: '510050', market: 1, name: '上证50ETF华夏' },
  { code: '510500', market: 1, name: '中证500ETF南方' },
  { code: '512100', market: 1, name: '中证1000ETF南方' },
  { code: '159845', market: 0, name: '中证1000ETF华夏' },
  { code: '159915', market: 0, name: '创业板ETF易方达' },
  { code: '588000', market: 1, name: '科创50ETF华夏' }
];
const etfTurnoverGroups = [
  { key: 'stock', name: '股票型ETF', fs: 'b:MK0021', source: '东方财富股票型ETF' },
  { key: 'bond', name: '债券型ETF', fs: 'm:0+t:10', source: '东方财富场内ETF名称筛选', match: /债/ },
  { key: 'money', name: '货币型ETF', fs: 'b:MK0022', source: '东方财富货币型ETF' },
  { key: 'commodity', name: '商品型ETF', fs: 'b:MK0024', source: '东方财富商品型ETF' },
  { key: 'qdii', name: 'QDII型ETF', fs: 'b:MK0023', source: '东方财富跨境/QDII型ETF' }
];
const etfAnnouncementCategories = [
  { key: 'stock', name: '股票型ETF', label: '股票型ETF' },
  { key: 'bond', name: '债券型ETF', label: '债券型ETF' },
  { key: 'money', name: '货币型ETF', label: '货币型ETF' },
  { key: 'commodity', name: '商品型ETF', label: '商品型ETF' },
  { key: 'qdii', name: 'QDII型ETF', label: 'QDII型ETF' }
];
const marketIndexItems = [
  { key: 'sh', secid: '1.000001', code: '000001', name: '上证指数' },
  { key: 'sz', secid: '0.399001', code: '399001', name: '深证成指' },
  { key: 'cyb', secid: '0.399006', code: '399006', name: '创业板指' },
  { key: 'kc50', secid: '1.000688', code: '000688', name: '科创50' }
];
const allAMedianMarketDataUrl = 'https://880009.com/api/market-data';
const institutionPositionVarieties = {
  IF: '沪深300股指期货',
  IH: '上证50股指期货',
  IC: '中证500股指期货',
  IM: '中证1000股指期货'
};
const institutionPositionVarietyCodes = Object.keys(institutionPositionVarieties);
const nationalTeamTech50Holding = {
  fundCode: '515750',
  fundName: '科技50ETF富国',
  reportName: '富国中证科技50策略ETF 2025年年度报告',
  source: '上交所基金公告',
  sourceUrl: 'https://www.sse.com.cn/disclosure/fund/announcement/c/new/2026-03-31/515750_20260331_SFDC.pdf',
  disclosureDate: '2025-12-31',
  publishedDate: '2026-03-31',
  amountUnit: '亿元',
  status: '未进前十大',
  confirmedShares: 0,
  confirmedAmount: 0,
  disclosureLimitShares: 1689300,
  disclosureLimitPct: 0.41,
  disclosureNav: 1.8081,
  nationalTeamSubjects: ['中央汇金', '中央汇金资产管理', '中国证券金融', '证金公司', '汇金资管'],
  detail: '科技50ETF富国最新年报前十大上市持有人未出现中央汇金、证金、汇金资管等常见国家队主体；公开可确认持有金额按0展示，低于前十大披露门槛的持仓无法确认。'
};
const segmentLeaderGroups = [
  {
    key: 'pcb',
    name: 'PCB',
    stocks: [
      { code: '002463', market: 0, name: '沪电股份' },
      { code: '002916', market: 0, name: '深南电路' },
      { code: '300476', market: 0, name: '胜宏科技' },
      { code: '603228', market: 1, name: '景旺电子' },
      { code: '688183', market: 1, name: '生益电子' }
    ]
  },
  {
    key: 'ccl',
    name: '覆铜板',
    stocks: [
      { code: '600183', market: 1, name: '生益科技' },
      { code: '688519', market: 1, name: '南亚新材' },
      { code: '603186', market: 1, name: '华正新材' },
      { code: '002636', market: 0, name: '金安国纪' }
    ]
  },
  {
    key: 'cpo',
    name: 'CPO/光模块',
    stocks: [
      { code: '300308', market: 0, name: '中际旭创' },
      { code: '300502', market: 0, name: '新易盛' },
      { code: '300394', market: 0, name: '天孚通信' },
      { code: '002281', market: 0, name: '光迅科技' }
    ]
  },
  {
    key: 'semiconductor-equipment',
    name: '半导体设备',
    stocks: [
      { code: '002371', market: 0, name: '北方华创' },
      { code: '688012', market: 1, name: '中微公司' },
      { code: '688072', market: 1, name: '拓荆科技' },
      { code: '688037', market: 1, name: '芯源微' }
    ]
  },
  {
    key: 'semiconductor-materials',
    name: '半导体材料',
    stocks: [
      { code: '002409', market: 0, name: '雅克科技' },
      { code: '688126', market: 1, name: '沪硅产业' },
      { code: '688019', market: 1, name: '安集科技' },
      { code: '300666', market: 0, name: '江丰电子' }
    ]
  },
  {
    key: 'foundry',
    name: '晶圆制造',
    stocks: [
      { code: '688981', market: 1, name: '中芯国际' },
      { code: '688347', market: 1, name: '华虹公司' },
      { code: '600460', market: 1, name: '士兰微' }
    ]
  },
  {
    key: 'memory-chip',
    name: '存储芯片',
    stocks: [
      { code: '603986', market: 1, name: '兆易创新' },
      { code: '300223', market: 0, name: '北京君正' },
      { code: '301308', market: 0, name: '江波龙' },
      { code: '688766', market: 1, name: '普冉股份' }
    ]
  },
  {
    key: 'ai-chip',
    name: 'AI芯片',
    stocks: [
      { code: '688256', market: 1, name: '寒武纪' },
      { code: '688041', market: 1, name: '海光信息' },
      { code: '688047', market: 1, name: '龙芯中科' },
      { code: '300474', market: 0, name: '景嘉微' }
    ]
  },
  {
    key: 'advanced-packaging',
    name: '先进封装',
    stocks: [
      { code: '600584', market: 1, name: '长电科技' },
      { code: '002156', market: 0, name: '通富微电' },
      { code: '002185', market: 0, name: '华天科技' },
      { code: '688362', market: 1, name: '甬矽电子' }
    ]
  },
  {
    key: 'consumer-electronics',
    name: '消费电子',
    stocks: [
      { code: '002475', market: 0, name: '立讯精密' },
      { code: '002241', market: 0, name: '歌尔股份' },
      { code: '300433', market: 0, name: '蓝思科技' },
      { code: '002600', market: 0, name: '领益智造' }
    ]
  },
  {
    key: 'mlcc',
    name: 'MLCC/被动元件',
    stocks: [
      { code: '300408', market: 0, name: '三环集团' },
      { code: '000636', market: 0, name: '风华高科' },
      { code: '603678', market: 1, name: '火炬电子' },
      { code: '002859', market: 0, name: '洁美科技' }
    ]
  },
  {
    key: 'liquid-cooling-server',
    name: '液冷服务器',
    stocks: [
      { code: '002837', market: 0, name: '英维克' },
      { code: '300499', market: 0, name: '高澜股份' },
      { code: '301018', market: 0, name: '申菱环境' }
    ]
  },
  {
    key: 'computing-data-center',
    name: '算力租赁/数据中心',
    stocks: [
      { code: '300442', market: 0, name: '润泽科技' },
      { code: '300738', market: 0, name: '奥飞数据' },
      { code: '603881', market: 1, name: '数据港' },
      { code: '300383', market: 0, name: '光环新网' }
    ]
  },
  {
    key: 'humanoid-robot',
    name: '人形机器人',
    stocks: [
      { code: '688017', market: 1, name: '绿的谐波' },
      { code: '002896', market: 0, name: '中大力德' },
      { code: '601689', market: 1, name: '拓普集团' },
      { code: '603728', market: 1, name: '鸣志电器' }
    ]
  },
  {
    key: 'low-altitude',
    name: '低空经济',
    stocks: [
      { code: '000099', market: 0, name: '中信海直' },
      { code: '002085', market: 0, name: '万丰奥威' },
      { code: '001696', market: 0, name: '宗申动力' },
      { code: '002625', market: 0, name: '光启技术' }
    ]
  },
  {
    key: 'battery',
    name: '锂电池',
    stocks: [
      { code: '300750', market: 0, name: '宁德时代' },
      { code: '300014', market: 0, name: '亿纬锂能' },
      { code: '002074', market: 0, name: '国轩高科' },
      { code: '300769', market: 0, name: '德方纳米' }
    ]
  },
  {
    key: 'energy-storage',
    name: '储能',
    stocks: [
      { code: '300274', market: 0, name: '阳光电源' },
      { code: '688063', market: 1, name: '派能科技' },
      { code: '002335', market: 0, name: '科华数据' },
      { code: '300068', market: 0, name: '南都电源' }
    ]
  },
  {
    key: 'innovative-drug-cro',
    name: '创新药/CRO',
    stocks: [
      { code: '600276', market: 1, name: '恒瑞医药' },
      { code: '688235', market: 1, name: '百济神州' },
      { code: '603259', market: 1, name: '药明康德' },
      { code: '300759', market: 0, name: '康龙化成' }
    ]
  },
  {
    key: 'gas-turbine',
    name: '燃气轮机',
    stocks: [
      { code: '002353', market: 0, name: '杰瑞股份' },
      { code: '603308', market: 1, name: '应流股份' },
      { code: '600893', market: 1, name: '航发动力' },
      { code: '600765', market: 1, name: '中航重机' },
      { code: '300034', market: 0, name: '钢研高纳' }
    ]
  }
];
const emHosts = [
  'push2.eastmoney.com',
  'push2his.eastmoney.com',
  '80.push2.eastmoney.com',
  '81.push2.eastmoney.com',
  '83.push2.eastmoney.com',
  '84.push2.eastmoney.com',
  '85.push2.eastmoney.com',
  '86.push2.eastmoney.com',
  '87.push2.eastmoney.com',
  '88.push2.eastmoney.com',
  '89.push2.eastmoney.com'
];
const emFlowMinuteHosts = [
  '80.push2.eastmoney.com',
  '81.push2.eastmoney.com',
  '83.push2.eastmoney.com',
  '84.push2.eastmoney.com',
  '85.push2.eastmoney.com',
  '86.push2.eastmoney.com',
  '87.push2.eastmoney.com',
  '88.push2.eastmoney.com',
  '89.push2.eastmoney.com',
  'push2his.eastmoney.com',
  'push2.eastmoney.com'
];
const defaultFocusGroups = [
  { key: 'nonferrous', name: '有色金属', preferred: ['有色金属'], match: ['有色金属', '工业金属', '小金属', '贵金属'] },
  { key: 'humanoid-robot', name: '人形机器人', preferred: ['人形机器人'], match: ['人形机器人', '机器人概念', '机器人'] },
  { key: 'power', name: '电力', preferred: ['电力', '公用事业'], match: ['电力', '公用事业', '火力发电', '水力发电'] },
  { key: 'lithium-mine', name: '锂矿', preferred: ['锂矿', '盐湖提锂'], match: ['锂矿', '盐湖提锂', '锂电原料', '能源金属'] },
  { key: 'online-game', name: '网络游戏', preferred: ['网络游戏', '游戏'], match: ['网络游戏', '游戏', '云游戏', '手游'] },
  { key: 'coal', name: '煤炭', preferred: ['煤炭'], match: ['煤炭'] },
  { key: 'innovative-drug', name: '创新药', preferred: ['创新药'], match: ['创新药', 'CRO', '医药'] },
  { key: 'bank', name: '银行', preferred: ['银行'], match: ['银行'] },
  { key: 'grid-equipment', name: '电网设备', preferred: ['电网设备'], match: ['电网设备', '智能电网', '特高压'] },
  { key: 'baijiu', name: '白酒', preferred: ['白酒'], match: ['白酒', '酿酒'] },
  { key: 'ai-application', name: 'AI应用', preferred: ['AI应用', 'AIGC概念'], match: ['AI应用', 'AIGC', '多模态AI', 'ChatGPT', 'Sora'] },
  { key: 'chemical', name: '化工', preferred: ['化工', '基础化工'], match: ['化工', '化学制品', '基础化工'] },
  { key: 'optical-electronics', name: '光学光电子', preferred: ['光学光电子'], match: ['光学光电子', '光学元件', 'OLED', 'MiniLED', 'MicroLED'] },
  { key: 'power-equipment', name: '电力设备', preferred: ['电力设备'], match: ['电力设备', '电源设备', '输变电设备'] },
  { key: 'battery', name: '锂电池', preferred: ['锂电池'], match: ['锂电池', '固态电池', '动力电池', '电池'] },
  { key: 'securities', name: '证券', preferred: ['证券Ⅱ', '证券Ⅲ', '证券'], match: ['证券', '券商'] },
  { key: 'semiconductor-materials-equipment', name: '半导体材料设备', codes: ['931743'], preferred: ['半导体材料设备', '半导体设备', '半导体材料'], match: ['半导体材料设备', '半导体设备', '半导体材料', '电子化学品', '光刻胶', '硅片'] },
  { key: 'mlcc', name: 'MLCC', preferred: ['MLCC'], match: ['MLCC', '被动元件'] },
  { key: 'commercial-space', name: '商业航天', preferred: ['商业航天'], match: ['商业航天', '航天', '卫星导航'] },
  { key: 'storage', name: '储能', preferred: ['储能'], match: ['储能', '抽水蓄能'] },
  { key: 'consumer-electronics', name: '消费电子', preferred: ['消费电子'], match: ['消费电子', '苹果概念', '智能穿戴'] },
  { key: 'glass-substrate', name: '玻璃基板', preferred: ['玻璃基板'], match: ['玻璃基板', '玻璃纤维', '玻璃玻纤'] },
  { key: 'liquid-cooling-server', name: '液冷服务器', preferred: ['液冷服务器'], match: ['液冷服务器', '液冷概念', '服务器'] },
  { key: 'optical-fiber', name: '光纤', preferred: ['光纤概念', '光纤'], match: ['光纤', '光通信', '光模块'] },
  { key: 'pcb', name: 'PCB', preferred: ['PCB', '印制电路板'], match: ['PCB', '印制电路板', '覆铜板'] },
  { key: 'computing-rental', name: '算力租赁', preferred: ['算力租赁'], match: ['算力租赁', '算力概念', '数据中心'] },
  { key: 'artificial-intelligence', name: '人工智能', preferred: ['人工智能'], match: ['人工智能', 'AI', '多模态AI'] },
  { key: 'cpo', name: 'CPO', preferred: ['CPO概念', 'CPO'], match: ['CPO', 'CPO概念', '光通信模块', '光模块'] },
  { key: 'semiconductor', name: '半导体', preferred: ['半导体', '半导体概念'], match: ['半导体', '芯片', '集成电路'] },
  { key: 'memory-chip', name: '存储芯片', preferred: ['存储芯片'], match: ['存储芯片', '存储器', 'HBM'] },
  { key: 'communication-tech', name: '通信技术', preferred: ['通信技术'], match: ['通信技术', '通信设备', '通信', '5G', '6G'] }
];

const extraFocusGroups = [
  { key: 'medical', name: '医疗', preferred: ['医疗器械概念', '医疗服务', '医药医疗风格'], match: ['医疗', '医药', '医疗器械', '医疗服务', '互联医疗'] },
  { key: 'medicine', name: '医药', preferred: ['医药商业', '化学制药', '生物制品'], match: ['医药', '制药', '生物医药', '创新药', '中药'] },
  { key: 'traditional-medicine', name: '中药', preferred: ['中药'], match: ['中药', '中成药'] },
  { key: 'medical-equipment', name: '医疗器械', preferred: ['医疗器械概念', '医疗设备'], match: ['医疗器械', '医疗设备'] },
  { key: 'medical-beauty', name: '医美', preferred: ['医美概念'], match: ['医美', '美容护理'] },
  { key: 'cro', name: 'CRO', preferred: ['CRO', '医疗研发外包'], match: ['CRO', '医疗研发外包', 'CXO'] },
  { key: 'breeding', name: '养殖', preferred: ['养殖业', '生猪养殖', '水产养殖'], match: ['养殖', '生猪', '肉鸡', '水产', '猪肉', '鸡肉'] },
  { key: 'agriculture', name: '农业', preferred: ['农牧饲渔', '种植业', '农业种植'], match: ['农业', '农牧', '种植', '种业', '粮食'] },
  { key: 'seed', name: '种业', preferred: ['种业'], match: ['种业', '转基因', '粮食'] },
  { key: 'animal-feed', name: '饲料', preferred: ['饲料'], match: ['饲料', '农牧'] },
  { key: 'food-beverage', name: '食品饮料', preferred: ['食品饮料', '食品加工制造'], match: ['食品', '饮料', '乳业', '预制菜'] },
  { key: 'retail', name: '零售', preferred: ['零售', '商业百货'], match: ['零售', '商业百货', '新零售'] },
  { key: 'tourism', name: '旅游酒店', preferred: ['旅游酒店', '酒店餐饮'], match: ['旅游', '酒店', '景点'] },
  { key: 'textile-apparel', name: '纺织服装', preferred: ['纺织服装'], match: ['纺织', '服装', '纺织服饰'] },
  { key: 'home-appliance', name: '家电', preferred: ['家电行业', '白色家电'], match: ['家电', '白色家电', '黑色家电', '小家电'] },
  { key: 'home-furnishing', name: '家居', preferred: ['家居用品', '装修建材'], match: ['家居', '家具', '装修建材'] },
  { key: 'automobile', name: '汽车', preferred: ['汽车整车', '汽车零部件'], match: ['汽车', '整车', '汽车零部件'] },
  { key: 'new-energy-vehicle', name: '新能源车', preferred: ['新能源汽车', '新能源车'], match: ['新能源汽车', '新能源车', '汽车热管理'] },
  { key: 'auto-parts', name: '汽车零部件', preferred: ['汽车零部件'], match: ['汽车零部件', '减速器', '一体化压铸'] },
  { key: 'photovoltaic', name: '光伏', preferred: ['光伏设备', '太阳能'], match: ['光伏', '太阳能', 'HJT电池', 'TOPCon'] },
  { key: 'wind-power', name: '风电', preferred: ['风电设备', '风能'], match: ['风电', '风能'] },
  { key: 'nuclear-power', name: '核电', preferred: ['核电', '核能核电'], match: ['核电', '核能'] },
  { key: 'hydrogen-energy', name: '氢能', preferred: ['氢能源'], match: ['氢能', '氢能源', '燃料电池'] },
  { key: 'low-altitude', name: '低空经济', preferred: ['低空经济', '飞行汽车'], match: ['低空经济', '飞行汽车', '无人机', 'eVTOL'] },
  { key: 'military', name: '军工', preferred: ['军工', '航天军工', '军工电子'], match: ['军工', '国防', '航天', '军工电子'] },
  { key: 'software', name: '软件', preferred: ['软件开发', '软件服务'], match: ['软件', '信创', '国产软件', '操作系统'] },
  { key: 'internet-service', name: '互联网服务', preferred: ['互联网服务'], match: ['互联网服务', '互联金融', '电子商务'] },
  { key: 'cloud-computing', name: '云计算', preferred: ['云计算', '东数西算'], match: ['云计算', '东数西算', '数据中心', '服务器'] },
  { key: 'data-center', name: '数据中心', preferred: ['数据中心', '东数西算'], match: ['数据中心', 'IDC', '东数西算', '服务器'] },
  { key: 'cyber-security', name: '网络安全', preferred: ['网络安全'], match: ['网络安全', '数据安全', '信息安全'] },
  { key: 'media', name: '传媒', preferred: ['文化传媒', '传媒'], match: ['传媒', '文化传媒', '影视', '短剧'] },
  { key: 'education', name: '教育', preferred: ['教育'], match: ['教育', '职业教育', '在线教育'] },
  { key: 'real-estate', name: '房地产', preferred: ['房地产开发', '房地产'], match: ['房地产', '地产', '租售同权'] },
  { key: 'construction', name: '建筑', preferred: ['工程建设', '建筑装饰'], match: ['建筑', '工程建设', '建筑装饰'] },
  { key: 'building-materials', name: '建材', preferred: ['装修建材', '水泥建材'], match: ['建材', '水泥', '玻璃玻纤'] },
  { key: 'steel', name: '钢铁', preferred: ['钢铁行业'], match: ['钢铁', '特钢'] },
  { key: 'rare-earth', name: '稀土', preferred: ['稀土永磁', '小金属'], match: ['稀土', '稀土永磁', '小金属'] },
  { key: 'gold', name: '黄金', preferred: ['黄金概念', '贵金属'], match: ['黄金', '贵金属'] },
  { key: 'oil-gas', name: '油气', preferred: ['石油行业', '油气设服'], match: ['石油', '油气', '天然气', '可燃冰'] },
  { key: 'environmental', name: '环保', preferred: ['环保行业', '环境保护'], match: ['环保', '环境保护', '节能环保'] },
  { key: 'water-affairs', name: '水务', preferred: ['公用事业', '水务'], match: ['水务', '供水', '污水处理'] },
  { key: 'logistics', name: '物流', preferred: ['物流行业', '快递概念'], match: ['物流', '快递', '仓储物流'] },
  { key: 'shipping-port', name: '航运港口', preferred: ['航运港口', '港口水运'], match: ['航运', '港口', '海运'] },
  { key: 'airport-aviation', name: '机场航空', preferred: ['机场航空'], match: ['机场', '航空', '航空机场'] },
  { key: 'rail-transit', name: '轨交设备', preferred: ['交运设备', '轨道交通'], match: ['轨交', '轨道交通', '高铁'] },
  { key: 'insurance', name: '保险', preferred: ['保险'], match: ['保险'] },
  { key: 'diversified-finance', name: '多元金融', preferred: ['多元金融'], match: ['多元金融', '期货', '租赁'] },
  { key: 'industrial-machine', name: '工业母机', preferred: ['工业母机', '机床制造'], match: ['工业母机', '机床', '数控机床'] },
  { key: 'machine-vision', name: '机器视觉', preferred: ['机器视觉'], match: ['机器视觉', '工业视觉'] },
  { key: 'smart-manufacturing', name: '智能制造', preferred: ['智能制造', '工业4.0'], match: ['智能制造', '工业4.0', '工业互联网'] }
];

const availableFocusGroups = uniqueFocusGroups([...extraFocusGroups, ...defaultFocusGroups]);

const memory = {
  cachedByScope: new Map(),
  snapshots: new Map(),
  minuteCached: new Map(),
  flowDailyCached: new Map(),
  priceCached: new Map(),
  auctionIndexCached: new Map(),
  auctionCategorySnapshots: new Map(),
  marketSummaryCached: new Map(),
  marketSummaryLoading: new Map(),
  marginCached: new Map(),
  afterHoursCached: new Map(),
  institutionPositionCached: new Map(),
  reverseRepoCached: null,
  nationalTeamTech50Cached: null,
  segmentLeaderCached: null,
  limitUpCached: null,
  limitUpAuctionCached: new Map(),
  limitUpIntradayCached: new Map(),
  tradeDatesCached: null,
  securityAdviceBaseCached: new Map(),
  strategyHistoryCached: new Map(),
  strategyUniverseCached: null,
  strategySimulationCached: null,
  darkTradeIndexCached: null,
  darkTradeIndexLoading: null,
  darkTradePageCached: new Map(),
  securitySignalLedgers: new Map(),
  trendStore: new Map(),
  trendStoreLoaded: false,
  focusLastByKey: new Map(),
  loadingByScope: new Map(),
  minuteHydrating: false,
  priceHydrating: false
};

let trendStoreWriteQueue = Promise.resolve();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function createFundFlowServer() {
  return http.createServer(async (req, res) => {
    await handleRequest(req, res);
  });
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/fund-flow/overview') {
      await handleOverview(url, res);
      return;
    }
    if (url.pathname === '/api/us-market/overview') {
      await handleUsMarketOverview(url, res);
      return;
    }
    if (url.pathname === '/api/us-market/trend') {
      await handleUsMarketTrend(url, res);
      return;
    }
    if (url.pathname === '/api/security/advice') {
      await handleSecurityAdvice(url, res);
      return;
    }
    if (url.pathname === '/api/strategy/simulation') {
      await handleStrategySimulation(url, res);
      return;
    }
    if (url.pathname === '/api/strategy/live-quote') {
      await handleStrategyLiveQuote(url, req, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/after-hours') {
      await handleAfterHours(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/institution-positions') {
      await handleInstitutionPositions(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/margin') {
      await handleMargin(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/reverse-repo') {
      await handleReverseRepo(url, res);
      return;
    }
    if (url.pathname === '/api/news/alerts') {
      await handleNewsAlerts(url, res);
      return;
    }
    if (url.pathname === '/api/news/stream') {
      handleNewsStream(req, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/national-team-tech50') {
      await handleNationalTeamTech50(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/segment-leaders') {
      await handleSegmentLeaders(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/limit-up') {
      await handleLimitUp(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/limit-up-auction') {
      await handleLimitUpAuction(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/limit-up-intraday') {
      await handleLimitUpIntraday(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/trade-dates') {
      await handleTradeDates(url, res);
      return;
    }
    if (url.pathname === '/api/fund-flow/focus-groups') {
      sendJson(res, 200, {
        updatedAt: new Date().toISOString(),
        limit: focusGroupLimit,
        defaultFocusNames: defaultFocusGroups.map(group => group.name),
        focusCandidates: buildFocusCandidates([])
      });
      return;
    }
    await handleStatic(url.pathname, res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'server error' });
  }
}

async function handleNationalTeamTech50(url, res) {
  const force = url.searchParams.get('force') === '1';
  const requestedDate = normalizeTradeDate(url.searchParams.get('date'));
  const holding = await loadNationalTeamTech50Holding({
    force,
    requestedDate,
    timeoutMs: force ? Math.max(12000, nationalTeamTech50TimeoutMs) : nationalTeamTech50TimeoutMs
  });
  sendJson(res, 200, {
    updatedAt: new Date().toISOString(),
    nationalTeamTech50: holding
  });
}

async function handleSegmentLeaders(url, res) {
  const force = url.searchParams.get('force') === '1';
  const tradeDate = formatShanghaiDate(new Date());
  const cached = memory.segmentLeaderCached;
  if (!force && cached && cached.tradeDate === tradeDate && Date.now() - cached.cachedAt < segmentLeaderCacheTtlMs) {
    sendJson(res, 200, cached.payload);
    return;
  }

  try {
    const payload = await loadSegmentLeaderPayload(tradeDate);
    memory.segmentLeaderCached = { cachedAt: Date.now(), tradeDate, payload };
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 502, { error: `细分龙头行情暂不可用：${err?.message || err}` });
  }
}

async function handleLimitUp(url, res) {
  const force = url.searchParams.get('force') === '1';
  const cached = memory.limitUpCached;
  if (!force && cached && Date.now() - cached.cachedAt < limitUpCacheTtlMs) {
    sendJson(res, 200, cached.data);
    return;
  }

  const tradeDate = formatShanghaiDate(new Date());
  const payload = await emJson('/getTopicZTPool', {
    ut: '7eea3edcaed734bea9cbfc24409ed989',
    dpt: 'wz.ztzt',
    Pageindex: '0',
    pagesize: '500',
    sort: 'fbt:asc',
    date: tradeDate.replaceAll('-', '')
  }, 'push2ex.eastmoney.com');
  const rows = payload?.data?.pool;
  if (!Array.isArray(rows)) throw new Error('东方财富涨停池未返回有效数据');
  const total = toNumber(payload?.data?.tc);
  if (Number.isFinite(total) && total > rows.length) throw new Error(`涨停池返回不完整（${rows.length}/${total}）`);

  const stocks = rows.map(limitUpPoolItem).filter(Boolean);
  const categories = buildLimitUpCategories(stocks);
  const topCategoryCount = categories[0]?.count || 0;
  const leadingCategories = categories
    .filter(category => category.count === topCategoryCount)
    .map(category => category.name);
  const data = {
    updatedAt: new Date().toISOString(),
    tradeDate: topicTradeDate(payload?.data?.qdate) || tradeDate,
    source: '东方财富涨停池',
    summary: {
      limitUpCount: stocks.length,
      auctionCount: stocks.filter(stock => stock.isAuctionLimitUp).length,
      openedCount: stocks.filter(stock => stock.breakCount > 0).length,
      categoryCount: categories.length,
      topCategoryCount,
      leadingCategories
    },
    categories,
    stocks
  };
  memory.limitUpCached = { cachedAt: Date.now(), data };
  sendJson(res, 200, data);
}

async function handleLimitUpAuction(url, res) {
  const code = String(url.searchParams.get('code') || '').trim();
  const market = Number(url.searchParams.get('market'));
  if (!/^\d{6}$/.test(code) || ![0, 1].includes(market)) {
    sendJson(res, 400, { error: '股票代码或市场参数无效' });
    return;
  }

  const tradeDate = formatShanghaiDate(new Date());
  const cacheKey = `${tradeDate}:${market}.${code}`;
  const force = url.searchParams.get('force') === '1';
  const cached = memory.limitUpAuctionCached.get(cacheKey);
  let points = cached?.points;
  if (force || !cached || Date.now() - cached.cachedAt >= limitUpCacheTtlMs) {
    points = await emAuctionTrendPoints({ code, market }, tradeDate);
    memory.limitUpAuctionCached.set(cacheKey, { cachedAt: Date.now(), points });
  }
  sendJson(res, 200, {
    updatedAt: new Date().toISOString(),
    tradeDate,
    code,
    market,
    points
  });
}

async function handleLimitUpIntraday(url, res) {
  const code = String(url.searchParams.get('code') || '').trim();
  const market = Number(url.searchParams.get('market'));
  if (!/^\d{6}$/.test(code) || ![0, 1].includes(market)) {
    sendJson(res, 400, { error: '股票代码或市场参数无效' });
    return;
  }

  const tradeDate = formatShanghaiDate(new Date());
  const cacheKey = `${tradeDate}:${market}.${code}`;
  const force = url.searchParams.get('force') === '1';
  const cached = memory.limitUpIntradayCached.get(cacheKey);
  let points = cached?.points;
  if (force || !cached || Date.now() - cached.cachedAt >= limitUpCacheTtlMs) {
    const sourcePoints = await emSecurityIntradayPoints({ code, market }, tradeDate);
    points = sourcePoints.filter(point => Number.isFinite(point.value) && Number.isFinite(point.price));
    memory.limitUpIntradayCached.set(cacheKey, { cachedAt: Date.now(), points });
  }
  sendJson(res, 200, {
    updatedAt: new Date().toISOString(),
    tradeDate,
    code,
    market,
    points
  });
}

function limitUpPoolItem(row) {
  const code = String(row?.c || '').padStart(6, '0');
  const market = Number(row?.m);
  if (!/^\d{6}$/.test(code) || ![0, 1].includes(market)) return null;
  const firstSealValue = Math.trunc(toNumber(row.fbt));
  return {
    code,
    market,
    name: decodeName(row.n),
    category: decodeName(row.hybk || '未分类'),
    price: round(toNumber(row.p) / 1000),
    changePct: round(toNumber(row.zdp)),
    turnoverAmount: toEastmoneyYi(row.amount),
    turnoverRate: round(toNumber(row.hs)),
    floatMarketCap: toEastmoneyYi(row.ltsz),
    sealAmount: toEastmoneyYi(row.fund),
    firstSealTime: topicTime(firstSealValue),
    lastSealTime: topicTime(row.lbt),
    breakCount: Math.max(0, Math.trunc(toNumber(row.zbc))),
    streak: Math.max(1, Math.trunc(toNumber(row.lbc))),
    statisticDays: Math.max(1, Math.trunc(toNumber(row.zttj?.days))),
    statisticCount: Math.max(1, Math.trunc(toNumber(row.zttj?.ct))),
    isAuctionLimitUp: firstSealValue >= 91500 && firstSealValue <= 92559
  };
}

function buildLimitUpCategories(stocks) {
  const grouped = new Map();
  stocks.forEach(stock => {
    const category = grouped.get(stock.category) || {
      name: stock.category,
      count: 0,
      auctionCount: 0,
      maxStreak: 0
    };
    category.count += 1;
    category.auctionCount += stock.isAuctionLimitUp ? 1 : 0;
    category.maxStreak = Math.max(category.maxStreak, stock.streak);
    grouped.set(stock.category, category);
  });
  const categories = [...grouped.values()]
    .sort((a, b) => b.count - a.count || b.auctionCount - a.auctionCount || a.name.localeCompare(b.name, 'zh-CN'));
  const topCount = categories[0]?.count || 0;
  return categories.map(category => ({
    ...category,
    sharePct: stocks.length ? round(category.count / stocks.length * 100) : 0,
    isLeader: topCount > 0 && category.count === topCount
  }));
}

function topicTradeDate(value) {
  const digits = String(value || '');
  if (!/^\d{8}$/.test(digits)) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function topicTime(value) {
  const digits = String(Math.trunc(toNumber(value))).padStart(6, '0');
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

async function loadSegmentLeaderPayload(tradeDate) {
  const uniqueStocks = uniqueSegmentLeaderStocks();
  const quoteRows = await loadSegmentLeaderQuoteRows(uniqueStocks);
  const rowBySecid = new Map(quoteRows.map(row => [`${row.f13}.${row.f12}`, row]));
  const segments = segmentLeaderGroups.map(group => {
    const stocks = group.stocks.map(stock => {
      const row = rowBySecid.get(`${stock.market}.${stock.code}`);
      return row ? segmentLeaderQuoteItem(row, stock) : unavailableSegmentLeaderStock(stock);
    });
    return segmentLeaderGroupView(group, stocks);
  });

  return {
    updatedAt: new Date().toISOString(),
    tradeDate,
    source: '东方财富实时行情与主力资金',
    amountUnit: '亿元',
    segmentCount: segments.length,
    stockCount: uniqueStocks.length,
    quotedCount: segments.reduce((sum, segment) => sum + segment.quotedCount, 0),
    segments
  };
}

function uniqueSegmentLeaderStocks() {
  const bySecid = new Map();
  segmentLeaderGroups.forEach(group => {
    group.stocks.forEach(stock => {
      bySecid.set(`${stock.market}.${stock.code}`, stock);
    });
  });
  return [...bySecid.values()];
}

async function loadSegmentLeaderQuoteRows(stocks) {
  const tasks = chunk(stocks, 80).map(stockChunk => (
    emPolicyQuoteJson('/api/qt/ulist.np/get', {
      fltt: '2',
      invt: '2',
      fields: 'f2,f3,f4,f5,f6,f8,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f62,f66,f72,f78,f84,f124',
      secids: stockChunk.map(stock => `${stock.market}.${stock.code}`).join(','),
      ut: 'b2884a393a59ad64002292a3e90d46a5'
    })
  ));
  const settled = await Promise.allSettled(tasks);
  const rows = settled
    .filter(item => item.status === 'fulfilled')
    .flatMap(item => item.value?.data?.diff || []);
  if (!rows.length) {
    const err = settled.find(item => item.status === 'rejected')?.reason;
    throw err || new Error('empty segment leader quotes');
  }
  return rows;
}

function segmentLeaderGroupView(group, stocks) {
  const quotedStocks = stocks.filter(stock => stock.hasQuote);
  const averageChangePct = quotedStocks.length
    ? round(quotedStocks.reduce((sum, stock) => sum + (Number(stock.changePct) || 0), 0) / quotedStocks.length)
    : null;
  return {
    key: group.key,
    name: group.name,
    leader: stocks[0] || null,
    stockCount: stocks.length,
    quotedCount: quotedStocks.length,
    positiveCount: quotedStocks.filter(stock => Number(stock.changePct) > 0).length,
    negativeCount: quotedStocks.filter(stock => Number(stock.changePct) < 0).length,
    averageChangePct,
    netMainFlow: safeSum(quotedStocks.map(stock => Number(stock.mainNet)).filter(Number.isFinite)),
    turnoverAmount: safeSum(quotedStocks.map(stock => Number(stock.turnoverAmount)).filter(Number.isFinite)),
    stocks
  };
}

function segmentLeaderQuoteItem(row, fallback) {
  const latest = toNumber(row?.f2);
  const updatedAt = Number.isFinite(Number(row?.f124))
    ? new Date(Number(row.f124) * 1000).toISOString()
    : null;
  return {
    code: String(row?.f12 || fallback.code),
    market: Number(row?.f13 ?? fallback.market),
    name: decodeName(row?.f14 || fallback.name),
    latest: finiteOrNull(latest),
    changePct: finiteOrNull(toNumber(row?.f3)),
    change: finiteOrNull(toNumber(row?.f4)),
    volume: finiteOrNull(toNumber(row?.f5)),
    turnoverAmount: finiteOrNull(toAmountYi(row?.f6)),
    turnoverRate: finiteOrNull(toNumber(row?.f8)),
    volumeRatio: finiteOrNull(toNumber(row?.f10)),
    high: finiteOrNull(toNumber(row?.f15)),
    low: finiteOrNull(toNumber(row?.f16)),
    open: finiteOrNull(toNumber(row?.f17)),
    preClose: finiteOrNull(toNumber(row?.f18)),
    totalMarketValue: finiteOrNull(toAmountYi(row?.f20)),
    floatMarketValue: finiteOrNull(toAmountYi(row?.f21)),
    mainNet: finiteOrNull(toEastmoneyYi(row?.f62)),
    rawBreakdown: {
      main: finiteOrNull(toEastmoneyYi(row?.f62)),
      superLarge: finiteOrNull(toEastmoneyYi(row?.f66)),
      large: finiteOrNull(toEastmoneyYi(row?.f72)),
      medium: finiteOrNull(toEastmoneyYi(row?.f78)),
      small: finiteOrNull(toEastmoneyYi(row?.f84))
    },
    updatedAt,
    hasQuote: Number.isFinite(latest) && latest > 0
  };
}

function unavailableSegmentLeaderStock(stock) {
  return {
    code: stock.code,
    market: stock.market,
    name: stock.name,
    latest: null,
    changePct: null,
    change: null,
    volume: null,
    turnoverAmount: null,
    turnoverRate: null,
    volumeRatio: null,
    high: null,
    low: null,
    open: null,
    preClose: null,
    totalMarketValue: null,
    floatMarketValue: null,
    mainNet: null,
    rawBreakdown: {
      main: null,
      superLarge: null,
      large: null,
      medium: null,
      small: null
    },
    updatedAt: null,
    hasQuote: false
  };
}

async function handleMargin(url, res) {
  const limit = Math.trunc(clamp(Number(url.searchParams.get('limit') || 60), 20, 240));
  const force = url.searchParams.get('force') === '1';
  const cached = memory.marginCached.get(limit);
  if (!force && cached && Date.now() - cached.cachedAt < marginCacheTtlMs) {
    sendJson(res, 200, cached.payload);
    return;
  }

  const source = await emJson('/api/data/v1/get', {
    reportName: 'RPTA_RZRQ_LSHJ',
    columns: 'ALL',
    source: 'WEB',
    client: 'WEB',
    sortColumns: 'DIM_DATE',
    sortTypes: '-1',
    pageNumber: '1',
    pageSize: String(limit)
  }, 'datacenter-web.eastmoney.com');
  const rows = Array.isArray(source?.result?.data) ? source.result.data : [];
  const points = rows.map(row => {
    const marginBalance = toNumber(row.RZRQYE);
    const financingBalance = toNumber(row.RZYE);
    const securitiesLendingBalance = toNumber(row.RQYE);
    const financingNetBuy = toNumber(row.RZJME);
    if (![marginBalance, financingBalance, securitiesLendingBalance].every(Number.isFinite)) return null;
    return {
      date: String(row.DIM_DATE || '').slice(0, 10),
      marginBalance: round(marginBalance / 100000000),
      financingBalance: round(financingBalance / 100000000),
      securitiesLendingBalance: round(securitiesLendingBalance / 100000000),
      financingNetBuy: Number.isFinite(financingNetBuy) ? round(financingNetBuy / 100000000) : null
    };
  }).filter(point => point && /^\d{4}-\d{2}-\d{2}$/.test(point.date)).reverse();
  if (!points.length) throw new Error('empty margin trading history');

  const payload = {
    updatedAt: new Date().toISOString(),
    source: '东方财富融资融券交易总量',
    amountUnit: '亿元',
    refreshAfterMs: marginCacheTtlMs,
    points
  };
  memory.marginCached.set(limit, { cachedAt: Date.now(), payload });
  sendJson(res, 200, payload);
}

async function handleReverseRepo(url, res) {
  const force = url.searchParams.get('force') === '1';
  const cached = memory.reverseRepoCached;
  if (!force && cached && Date.now() - cached.cachedAt < reverseRepoCacheTtlMs) {
    sendJson(res, 200, cached.payload);
    return;
  }

  const payload = await loadReverseRepoPayload();
  memory.reverseRepoCached = { cachedAt: Date.now(), payload };
  sendJson(res, 200, payload);
}

async function loadReverseRepoPayload() {
  const sources = [
    {
      instrument: 'reverse-repo',
      instrumentLabel: '普通逆回购',
      baseUrl: pbcReverseRepoBaseUrl,
      listUrls: [`${pbcReverseRepoBaseUrl}/index.html`, `${pbcReverseRepoBaseUrl}/17081-2.html`],
      titlePattern: /^公开市场业务交易公告/
    },
    {
      instrument: 'outright-reverse-repo',
      instrumentLabel: '买断式逆回购',
      baseUrl: pbcOutrightReverseRepoBaseUrl,
      listUrls: [`${pbcOutrightReverseRepoBaseUrl}/index.html`],
      titlePattern: /^公开市场买断式逆回购招标公告/
    },
    {
      instrument: 'mlf',
      instrumentLabel: 'MLF',
      baseUrl: pbcMlfBaseUrl,
      listUrls: [`${pbcMlfBaseUrl}/index.html`],
      titlePattern: /中期借贷便利(?:招标公告|开展情况)$/
    }
  ];
  const announcementGroups = await Promise.all(sources.map(async source => {
    const pages = await Promise.all(source.listUrls.map(pbcText));
    return parsePbcAnnouncementLinks(pages.join('\n'), source);
  }));
  const announcements = announcementGroups.flat();
  if (!announcements.length) throw new Error('央行公告列表未返回近期记录');

  const parsed = [];
  for (let index = 0; index < announcements.length; index += 12) {
    const batch = announcements.slice(index, index + 12);
    const batchOperations = await Promise.all(batch.map(async announcement => {
      const html = await pbcText(announcement.sourceUrl);
      if (announcement.instrument === 'reverse-repo') return parseReverseRepoAnnouncement(html, announcement);
      if (announcement.instrument === 'outright-reverse-repo') return parseOutrightReverseRepoAnnouncement(html, announcement);
      return parseMlfAnnouncement(html, announcement);
    }));
    parsed.push(...batchOperations);
  }
  const operations = parsed
    .flat()
    .filter(operation => operation.amount >= 0)
    .sort((a, b) => b.operationDate.localeCompare(a.operationDate)
      || a.instrument.localeCompare(b.instrument)
      || b.termDays - a.termDays);
  if (!operations.length) throw new Error('央行公告未解析到流动性操作');

  const today = formatShanghaiDate(new Date());
  const startDate = addCalendarDays(today, -10);
  const endDate = addCalendarDays(today, 14);
  const rowsByDate = new Map();
  const rowFor = date => {
    if (!rowsByDate.has(date)) rowsByDate.set(date, { date, injections: [], maturities: [] });
    return rowsByDate.get(date);
  };
  operations.forEach(operation => {
    rowFor(operation.operationDate).injections.push(operation);
    rowFor(operation.maturityDate).maturities.push(operation);
  });
  const rows = [...rowsByDate.values()]
    .filter(row => row.date >= startDate && row.date <= endDate)
    .map(row => {
      const injection = round(row.injections.reduce((sum, item) => sum + item.amount, 0));
      const maturity = round(row.maturities.reduce((sum, item) => sum + item.amount, 0));
      return { ...row, injection, maturity, netInjection: round(injection - maturity) };
    })
    .filter(row => row.injections.length || row.maturity > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    updatedAt: new Date().toISOString(),
    asOfDate: today,
    source: '中国人民银行公开市场及中期借贷便利公告',
    sourceUrl: `${pbcReverseRepoBaseUrl}/index.html`,
    sources: sources.map(source => ({
      name: source.instrumentLabel,
      url: source.listUrls[0]
    })),
    amountUnit: '亿元',
    range: { startDate, endDate },
    rows
  };
}

function parsePbcAnnouncementLinks(html, source) {
  const links = new Map();
  const pattern = /href="([^"]+\/index\.html)"[^>]*\stitle="([^"]+)"/g;
  for (const match of String(html || '').matchAll(pattern)) {
    const title = stripAnnouncementText(match[2]);
    if (!source.titlePattern.test(title)) continue;
    const sourceUrl = new URL(match[1], source.baseUrl).href;
    links.set(sourceUrl, {
      instrument: source.instrument,
      instrumentLabel: source.instrumentLabel,
      title,
      sourceUrl
    });
  }
  return [...links.values()];
}

function parseReverseRepoAnnouncement(html, announcement) {
  const pubDate = String(html || '').match(/<meta\s+name="PubDate"\s+content="(\d{4}-\d{2}-\d{2})"/i)?.[1];
  const zoom = String(html || '').match(/<div\s+id="zoom"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/i)?.[1];
  const text = stripAnnouncementText(zoom || html);
  if (!pubDate || !text.includes('逆回购')) return [];

  const byTerm = new Map();
  const addOperation = (termDays, amount) => {
    if (!Number.isFinite(termDays) || termDays < 1 || !Number.isFinite(amount) || amount < 0) return;
    const key = `${termDays}:${amount}`;
    if (byTerm.has(key)) return;
    byTerm.set(key, {
      instrument: announcement.instrument,
      instrumentLabel: announcement.instrumentLabel,
      operationDate: pubDate,
      maturityDate: movePastWeekend(addCalendarDays(pubDate, termDays)),
      termDays,
      termLabel: termDays === 1 ? '隔夜' : `${termDays}天`,
      amount: round(amount),
      title: announcement.title,
      sourceUrl: announcement.sourceUrl
    });
  };

  const primary = text.match(/(?:开展了?|[\uff0c,])\s*([\d,.]+)\s*亿元\s*(\d+)\s*天期逆回购操作/);
  if (primary) addOperation(Number(primary[2]), toNumber(primary[1]));

  const zeroOperation = text.match(/(\d+)\s*天期逆回购操作量为零/);
  if (zeroOperation) addOperation(Number(zeroOperation[1]), 0);

  for (const match of text.matchAll(/(?:同时[\uff0c,]?)?\s*(?:开展了?)\s*([\d,.]+)\s*亿元\s*(隔夜|\d+\s*天期)逆回购操作/g)) {
    addOperation(match[2].includes('隔夜') ? 1 : toNumber(match[2]), toNumber(match[1]));
  }
  return [...byTerm.values()];
}

function parseOutrightReverseRepoAnnouncement(html, announcement) {
  const zoom = String(html || '').match(/<div\s+id="zoom"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/i)?.[1];
  const text = stripAnnouncementText(zoom || html);
  const operation = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^。]*?开展([\d,.]+)亿元买断式逆回购操作/);
  const term = text.match(/期限为?(\d+)个月(?:[（(](\d+)天[）)])?/);
  if (!operation || !term) return [];

  const operationDate = `${operation[1]}-${operation[2].padStart(2, '0')}-${operation[3].padStart(2, '0')}`;
  const explicitMaturity = text.match(/到期日为(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const explicitMaturityDate = explicitMaturity
    ? `${explicitMaturity[1]}-${explicitMaturity[2].padStart(2, '0')}-${explicitMaturity[3].padStart(2, '0')}`
    : null;
  const termDays = explicitMaturityDate
    ? calendarDaysBetween(operationDate, explicitMaturityDate)
    : Number(term[2]);
  if (!Number.isFinite(termDays)) return [];

  return [{
    instrument: announcement.instrument,
    instrumentLabel: announcement.instrumentLabel,
    operationDate,
    maturityDate: movePastWeekend(explicitMaturityDate || addCalendarDays(operationDate, termDays)),
    termDays,
    termLabel: `${term[1]}个月`,
    amount: round(toNumber(operation[4])),
    title: announcement.title,
    sourceUrl: announcement.sourceUrl
  }];
}

function parseMlfAnnouncement(html, announcement) {
  const zoom = String(html || '').match(/<div\s+id="zoom"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/i)?.[1];
  const text = stripAnnouncementText(zoom || html);
  const operation = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^。]*?开展([\d,.]+)亿元(?:中期借贷便利（MLF）|MLF)操作/);
  const term = text.match(/期限为?(\d+)年期?/);
  if (!operation || !term) return [];

  const operationDate = `${operation[1]}-${operation[2].padStart(2, '0')}-${operation[3].padStart(2, '0')}`;
  const termYears = Number(term[1]);
  const maturityDate = movePastWeekend(addCalendarYears(operationDate, termYears));
  return [{
    instrument: announcement.instrument,
    instrumentLabel: announcement.instrumentLabel,
    operationDate,
    maturityDate,
    termDays: calendarDaysBetween(operationDate, maturityDate),
    termLabel: `${termYears}年`,
    amount: round(toNumber(operation[4])),
    title: announcement.title,
    sourceUrl: announcement.sourceUrl
  }];
}

async function pbcText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'zh-CN,zh;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(reverseRepoTimeoutMs)
  });
  if (!response.ok) throw new Error(`央行公告 HTTP ${response.status}`);
  return response.text();
}

function addCalendarDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function addCalendarYears(dateText, years) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + Number(years));
  return date.toISOString().slice(0, 10);
}

function calendarDaysBetween(startDate, endDate) {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
}

function movePastWeekend(dateText) {
  const weekday = new Date(`${dateText}T00:00:00Z`).getUTCDay();
  if (weekday === 6) return addCalendarDays(dateText, 2);
  if (weekday === 0) return addCalendarDays(dateText, 1);
  return dateText;
}

async function handleAfterHours(url, res) {
  const force = url.searchParams.get('force') === '1';
  const now = Date.now();
  const today = formatShanghaiDate(new Date());
  const tradeDatesCached = memory.tradeDatesCached;
  let tradeDates = tradeDatesCached
    && now - tradeDatesCached.cachedAt < tradeDatesCacheTtlMs
    && tradeDatesCached.dates.length
    ? tradeDatesCached.dates
    : null;
  if (!tradeDates) {
    tradeDates = await loadAvailableTradeDates(20);
    memory.tradeDatesCached = { cachedAt: now, dates: tradeDates };
  }
  const tradeDate = tradeDates.find(date => date <= today) || tradeDates[0];
  if (!tradeDate) throw new Error('empty latest trade date');
  const historicalClose = tradeDate < today;
  const timeline = historicalClose ? timelineForTradeDate(tradeDate) : tradingTimeline();
  const phase = historicalClose || timeline.session === 'closed' ? 'final' : 'preview';
  const isFinal = phase === 'final';
  const cacheKey = `${tradeDate}:${phase}`;
  const cacheTtl = isFinal ? afterHoursFinalCacheTtlMs : afterHoursPreviewCacheTtlMs;
  const cached = memory.afterHoursCached.get(cacheKey);
  if (!force && cached && Date.now() - cached.cachedAt < cacheTtl) {
    sendJson(res, 200, cached.payload);
    return;
  }

  const payload = await loadAfterHoursPayload({ tradeDate, phase, isFinal, timeline });
  memory.afterHoursCached.set(cacheKey, { cachedAt: Date.now(), payload });
  sendJson(res, 200, payload);
}

async function handleInstitutionPositions(url, res) {
  const force = url.searchParams.get('force') === '1';
  const requestedVariety = String(url.searchParams.get('variety') || 'IF').trim().toUpperCase();
  const variety = requestedVariety === 'ALL' || institutionPositionVarieties[requestedVariety]
    ? requestedVariety
    : 'IF';
  const today = formatShanghaiDate(new Date());
  const requestedDate = normalizeTradeDate(url.searchParams.get('date')) || today;
  let tradeDates;

  try {
    tradeDates = await loadInstitutionTradeDates(requestedDate);
  } catch (err) {
    sendJson(res, 502, { error: `机构多空交易日获取失败：${err?.message || err}` });
    return;
  }

  let lastError = null;
  for (const tradeDate of tradeDates) {
    const cacheKey = `${tradeDate}:${variety}`;
    const cached = memory.institutionPositionCached.get(cacheKey);
    if (!force && cached && Date.now() - cached.cachedAt < institutionPositionCacheTtlMs) {
      sendJson(res, 200, institutionPositionResponse(cached.payload, requestedDate, today));
      return;
    }

    try {
      const payload = variety === 'ALL'
        ? await loadAllInstitutionPositionPayload(tradeDate)
        : await loadInstitutionPositionPayload(tradeDate, variety);
      memory.institutionPositionCached.set(cacheKey, { cachedAt: Date.now(), payload });
      sendJson(res, 200, institutionPositionResponse(payload, requestedDate, today));
      return;
    } catch (err) {
      lastError = err;
    }
  }

  sendJson(res, 502, {
    error: `中金所尚未发布 ${requestedDate} 的机构多空排名：${lastError?.message || '暂无数据'}`,
    requestedDate,
    variety
  });
}

async function loadInstitutionTradeDates(requestedDate) {
  const now = Date.now();
  const cached = memory.tradeDatesCached;
  let dates = cached
    && now - cached.cachedAt < tradeDatesCacheTtlMs
    && cached.dates.length
    ? cached.dates
    : null;
  if (!dates) {
    dates = await loadAvailableTradeDates(20);
    memory.tradeDatesCached = { cachedAt: now, dates };
  }
  const candidates = [...new Set([requestedDate, ...dates.filter(date => date < requestedDate)])]
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8);
  if (!candidates.length) throw new Error('没有可查询的交易日');
  return candidates;
}

async function loadInstitutionPositionPayload(tradeDate, variety) {
  const compactDate = tradeDate.replaceAll('-', '');
  const [yearMonth, day] = [compactDate.slice(0, 6), compactDate.slice(6, 8)];
  const sourceUrl = `http://www.cffex.com.cn/sj/ccpm/${yearMonth}/${day}/${variety}_1.csv`;
  const response = await fetch(sourceUrl, {
    headers: {
      accept: 'text/csv,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(institutionPositionTimeoutMs)
  });
  if (!response.ok) throw new Error(`中金所 HTTP ${response.status}`);
  const text = new TextDecoder('gbk').decode(await response.arrayBuffer());
  const parsedRows = parseInstitutionPositionCsv(text, variety);
  if (!parsedRows.length) throw new Error('中金所 CSV 未返回持仓明细');
  const contractCodes = [...new Set(parsedRows.map(row => row.contract))].sort();
  const contracts = contractCodes.map(code => buildInstitutionContractView(
    code,
    parsedRows.filter(row => row.contract === code)
  ));
  const aggregate = buildInstitutionAggregateView(contracts);

  return {
    updatedAt: new Date().toISOString(),
    tradeDate,
    variety,
    varietyName: institutionPositionVarieties[variety],
    source: '中国金融期货交易所会员成交及持仓排名',
    sourceUrl,
    publishedAfter: '约16:30',
    amountUnit: '手',
    detail: '汇总数字为各合约公布的前20席位直接相加；当日净加多、净加空排行榜按会员简称合并后排序。',
    aggregate,
    contracts
  };
}

async function loadAllInstitutionPositionPayload(tradeDate) {
  const payloads = await Promise.all(
    institutionPositionVarietyCodes.map(variety => loadInstitutionPositionPayload(tradeDate, variety))
  );
  const contracts = payloads.flatMap(payload => payload.contracts);

  return {
    updatedAt: new Date().toISOString(),
    tradeDate,
    variety: 'ALL',
    varietyName: '全部股指期货',
    source: '中国金融期货交易所会员成交及持仓排名',
    sourceUrl: '',
    publishedAfter: '约16:30',
    amountUnit: '手',
    detail: '汇总数字为 IF、IH、IC、IM 各合约公布的前20席位直接相加；当日净加多、净加空排行榜按会员简称合并后排序。',
    aggregate: buildInstitutionAggregateView(contracts),
    contracts
  };
}

function institutionPositionResponse(payload, requestedDate, today) {
  return {
    ...payload,
    requestedDate,
    isRequestedDate: payload.tradeDate === requestedDate,
    isToday: payload.tradeDate === today
  };
}

function parseInstitutionPositionCsv(text, variety) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(parseCsvLine)
    .filter(columns => /^\d{8}$/.test(String(columns[0] || '').trim()) && columns.length >= 12)
    .map(columns => ({
      tradeDate: String(columns[0]).trim(),
      contract: String(columns[1] || '').trim().toUpperCase(),
      rank: institutionPositionNumber(columns[2]),
      volumeMember: String(columns[3] || '').trim(),
      volume: institutionPositionNumber(columns[4]),
      volumeChange: institutionPositionNumber(columns[5]),
      longMember: String(columns[6] || '').trim(),
      longPosition: institutionPositionNumber(columns[7]),
      longChange: institutionPositionNumber(columns[8]),
      shortMember: String(columns[9] || '').trim(),
      shortPosition: institutionPositionNumber(columns[10]),
      shortChange: institutionPositionNumber(columns[11])
    }))
    .filter(row => row.contract.startsWith(variety) && row.rank > 0 && (row.longMember || row.shortMember));
}

function parseCsvLine(line) {
  const columns = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      columns.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  columns.push(value);
  return columns;
}

function buildInstitutionContractView(code, rows) {
  const longRows = rows
    .filter(row => row.longMember)
    .map(row => institutionSideRow(row.rank, row.longMember, row.longPosition, row.longChange, [code]));
  const shortRows = rows
    .filter(row => row.shortMember)
    .map(row => institutionSideRow(row.rank, row.shortMember, row.shortPosition, row.shortChange, [code]));
  const netRankings = buildInstitutionNetRankings(longRows, shortRows);
  return {
    code,
    longRows,
    shortRows,
    ...netRankings,
    summary: summarizeInstitutionPositionRows(longRows, shortRows)
  };
}

function buildInstitutionAggregateView(contracts) {
  const sourceLongRows = contracts.flatMap(contract => contract.longRows);
  const sourceShortRows = contracts.flatMap(contract => contract.shortRows);
  const mergeSide = key => {
    const merged = new Map();
    contracts.forEach(contract => {
      contract[key].forEach(row => {
        const current = merged.get(row.member) || {
          member: row.member,
          position: 0,
          change: 0,
          contracts: []
        };
        current.position += row.position;
        current.change += row.change;
        current.contracts.push(contract.code);
        merged.set(row.member, current);
      });
    });
    return [...merged.values()]
      .sort((a, b) => b.position - a.position || Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 20)
      .map((row, index) => institutionSideRow(
        index + 1,
        row.member,
        row.position,
        row.change,
        row.contracts
      ));
  };
  const longRows = mergeSide('longRows');
  const shortRows = mergeSide('shortRows');
  const netRankings = buildInstitutionNetRankings(sourceLongRows, sourceShortRows);
  return {
    code: 'all',
    longRows,
    shortRows,
    ...netRankings,
    summary: summarizeInstitutionPositionRows(sourceLongRows, sourceShortRows)
  };
}

function institutionSideRow(rank, member, position, change, contracts) {
  return {
    rank,
    member,
    position: Math.trunc(position),
    change: Math.trunc(change),
    contracts: [...new Set(contracts)]
  };
}

function buildInstitutionNetRankings(longRows, shortRows) {
  const merged = new Map();
  const merge = (rows, side) => {
    rows.forEach(row => {
      const current = merged.get(row.member) || {
        member: row.member,
        longPosition: 0,
        longChange: 0,
        shortPosition: 0,
        shortChange: 0,
        contracts: []
      };
      current[`${side}Position`] += Number(row.position) || 0;
      current[`${side}Change`] += Number(row.change) || 0;
      current.contracts.push(...row.contracts);
      merged.set(row.member, current);
    });
  };
  merge(longRows, 'long');
  merge(shortRows, 'short');

  const rows = [...merged.values()].map(row => ({
    ...row,
    netPosition: row.longPosition - row.shortPosition,
    netChange: row.longChange - row.shortChange,
    contracts: [...new Set(row.contracts)].sort()
  }));
  const rank = rows => rows.slice(0, 20).map((row, index) => ({
    rank: index + 1,
    member: row.member,
    longPosition: Math.trunc(row.longPosition),
    longChange: Math.trunc(row.longChange),
    shortPosition: Math.trunc(row.shortPosition),
    shortChange: Math.trunc(row.shortChange),
    netPosition: Math.trunc(row.netPosition),
    netChange: Math.trunc(row.netChange),
    contracts: row.contracts
  }));

  return {
    netLongRows: rank(rows
      .filter(row => row.netChange > 0)
      .sort((a, b) => b.netChange - a.netChange || a.member.localeCompare(b.member, 'zh-CN'))),
    netShortRows: rank(rows
      .filter(row => row.netChange < 0)
      .sort((a, b) => a.netChange - b.netChange || a.member.localeCompare(b.member, 'zh-CN')))
  };
}

function summarizeInstitutionPositionRows(longRows, shortRows) {
  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const longPosition = sum(longRows, 'position');
  const longChange = sum(longRows, 'change');
  const shortPosition = sum(shortRows, 'position');
  const shortChange = sum(shortRows, 'change');
  return {
    longPosition,
    longChange,
    shortPosition,
    shortChange,
    netPosition: longPosition - shortPosition,
    netChange: longChange - shortChange
  };
}

function institutionPositionNumber(value) {
  const number = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(number) ? number : 0;
}

async function loadAfterHoursPayload({ tradeDate, phase, isFinal, timeline }) {
  const baseParams = {
    fields: 'f2,f3,f6,f12,f13,f14,f62,f66,f72,f78,f84,f100',
    fid: 'f62',
    fs: 'm:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23',
    ut: 'b2884a393a59ad64002292a3e90d46a5'
  };
  const [inflow, outflow] = await Promise.all([
    emAfterHoursRankSide(baseParams, afterHoursRankPerSide, '1'),
    emAfterHoursRankSide(baseParams, afterHoursRankPerSide, '0')
  ]);
  const stocks = mergeRows([...inflow.rows, ...outflow.rows])
    .filter(isAStockRow)
    .map(afterHoursRowToStock)
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.mainFlow) - Math.abs(a.mainFlow))
    .slice(0, afterHoursStockLimit);
  const industries = buildAfterHoursIndustries(stocks);
  const aggregate = aggregateAfterHoursStocks(stocks);
  const pagesLoaded = inflow.pagesLoaded + outflow.pagesLoaded;
  const pagesRequested = inflow.pagesRequested + outflow.pagesRequested;
  const marketTotal = Math.max(inflow.marketTotal, outflow.marketTotal, stocks.length);
  const complete = pagesLoaded === pagesRequested;

  return {
    updatedAt: new Date().toISOString(),
    tradeDate,
    asOf: timeline.endLabel,
    phase,
    isFinal,
    sourceStatus: {
      level: complete ? 'live' : 'warn',
      text: isFinal ? '收盘资金快照' : '盘中资金预览',
      detail: `东方财富主力资金排行，净流入与净流出方向各请求前 ${afterHoursRankPerSide} 只；已返回 ${stocks.length} 只股票、${industries.length} 个行业。${complete ? '' : `部分分页未返回（${pagesLoaded}/${pagesRequested}）。`}`
    },
    summary: {
      sampleMode: 'main-flow-extremes',
      requestedPerSide: afterHoursRankPerSide,
      marketTotal,
      stockCount: stocks.length,
      industryCount: industries.length,
      coveragePct: marketTotal ? round((stocks.length / marketTotal) * 100) : 0,
      inflowCount: stocks.filter(item => item.mainFlow > 0).length,
      outflowCount: stocks.filter(item => item.mainFlow < 0).length,
      flatCount: stocks.filter(item => item.mainFlow === 0).length,
      mainFlow: aggregate.mainFlow,
      mainFlowRatio: aggregate.mainFlowRatio,
      changePct: aggregate.changePct,
      turnoverAmount: aggregate.turnoverAmount,
      amountUnit: '亿元'
    },
    industries
  };
}

async function emAfterHoursRankSide(baseParams, targetSize, po) {
  const pageCount = Math.ceil(targetSize / afterHoursPageSize);
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const settled = await Promise.allSettled(pageNumbers.map(pn => (
    emH5Json('/dc/ZJLX/getZDYLBData', {
      ...baseParams,
      po,
      pn: String(pn),
      pz: String(afterHoursPageSize)
    })
  )));
  const payloads = settled
    .filter(item => item.status === 'fulfilled')
    .map(item => item.value);
  const rows = payloads.flatMap(payload => payload?.data?.diff || []);
  if (!rows.length) {
    const err = settled.find(item => item.status === 'rejected')?.reason;
    throw err || new Error('empty after-hours stock ranking');
  }
  return {
    rows: rows.slice(0, targetSize),
    marketTotal: Math.max(0, ...payloads.map(payload => Number(payload?.data?.total) || 0)),
    pagesLoaded: payloads.length,
    pagesRequested: pageCount
  };
}

function afterHoursRowToStock(row) {
  const mainFlowRaw = toNumber(row.f62);
  if (!Number.isFinite(mainFlowRaw)) return null;
  const turnoverRaw = toNumber(row.f6);
  const mainFlow = afterHoursAmountYi(mainFlowRaw);
  const turnoverAmount = afterHoursAmountYi(turnoverRaw);
  const industryValue = String(row.f100 || '').trim();
  return {
    code: String(row.f12 || ''),
    market: Number(row.f13),
    name: decodeName(row.f14),
    industry: industryValue && industryValue !== '-' ? industryValue : '其他',
    mainFlow,
    mainFlowRatio: Number.isFinite(turnoverRaw) && turnoverRaw > 0
      ? round((mainFlowRaw / turnoverRaw) * 100)
      : 0,
    changePct: toNumber(row.f3) || 0,
    turnoverAmount,
    rawBreakdown: {
      main: mainFlow,
      superLarge: afterHoursAmountYi(row.f66),
      large: afterHoursAmountYi(row.f72),
      medium: afterHoursAmountYi(row.f78),
      small: afterHoursAmountYi(row.f84)
    }
  };
}

function buildAfterHoursIndustries(stocks) {
  const grouped = new Map();
  stocks.forEach(stock => {
    if (!grouped.has(stock.industry)) grouped.set(stock.industry, []);
    grouped.get(stock.industry).push(stock);
  });
  return [...grouped.entries()]
    .map(([name, rows]) => {
      const aggregate = aggregateAfterHoursStocks(rows);
      return {
        name,
        stockCount: rows.length,
        mainFlow: aggregate.mainFlow,
        mainFlowRatio: aggregate.mainFlowRatio,
        changePct: aggregate.changePct,
        turnoverAmount: aggregate.turnoverAmount,
        stocks: rows.sort((a, b) => Math.abs(b.mainFlow) - Math.abs(a.mainFlow))
      };
    })
    .sort((a, b) => Math.abs(b.mainFlow) - Math.abs(a.mainFlow));
}

function aggregateAfterHoursStocks(stocks) {
  const mainFlow = round(stocks.reduce((sum, item) => sum + item.mainFlow, 0));
  const turnoverAmount = round(stocks.reduce((sum, item) => sum + item.turnoverAmount, 0));
  const weightedChange = stocks.reduce((sum, item) => sum + item.changePct * item.turnoverAmount, 0);
  const averageChange = stocks.length
    ? stocks.reduce((sum, item) => sum + item.changePct, 0) / stocks.length
    : 0;
  return {
    mainFlow,
    mainFlowRatio: turnoverAmount > 0 ? round((mainFlow / turnoverAmount) * 100) : 0,
    changePct: round(turnoverAmount > 0 ? weightedChange / turnoverAmount : averageChange),
    turnoverAmount
  };
}

function afterHoursAmountYi(value) {
  const amount = toEastmoneyYi(value);
  return Number.isFinite(amount) ? amount : 0;
}

async function handleTradeDates(url, res) {
  const limit = Math.trunc(clamp(Number(url.searchParams.get('limit') || 360), 20, 360));
  const now = Date.now();
  const cached = memory.tradeDatesCached;
  if (cached && now - cached.cachedAt < tradeDatesCacheTtlMs && cached.dates.length >= Math.min(limit, 20)) {
    sendJson(res, 200, tradeDatesPayload(cached.dates.slice(0, limit)));
    return;
  }
  const dates = await loadAvailableTradeDates(limit);
  memory.tradeDatesCached = { cachedAt: now, dates };
  sendJson(res, 200, tradeDatesPayload(dates));
}

async function handleStrategySimulation(url, res) {
  const force = url.searchParams.get('force') === '1';
  const tradeDate = formatShanghaiDate(new Date());
  const cached = memory.strategySimulationCached;
  if (!force && cached && cached.tradeDate === tradeDate && Date.now() - cached.cachedAt < strategySimulationCacheTtlMs) {
    sendJson(res, 200, cached.payload);
    return;
  }

  try {
    const payload = await loadStrategySimulationPayload(tradeDate);
    memory.strategySimulationCached = { cachedAt: Date.now(), tradeDate, payload };
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 502, { error: `自动策略模拟暂不可用：${err?.message || err}` });
  }
}

async function loadStrategySimulationPayload(tradeDate) {
  const session = timelineForTradeDate(tradeDate);
  const quoteRows = await loadStrategyUniverseQuoteRows(tradeDate);
  const failures = [];
  const universe = [];
  for (const batch of chunk(quoteRows, 6)) {
    const settled = await Promise.allSettled(batch.map(row => strategyStockHistory(row, tradeDate, session)));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.bars.length >= 40) universe.push(result.value);
      else failures.push({
        code: String(batch[index]?.f12 || ''),
        error: result.status === 'rejected' ? result.reason?.message || String(result.reason) : '历史行情不足'
      });
    });
  }
  const availableCodes = new Set(universe.map(stock => stock.code));
  const syncedHoldings = await Promise.all(strategySyncedAccount.positions
    .filter(position => !availableCodes.has(position.code))
    .map(position => strategySyncedPositionHistory(position, tradeDate, session)));
  const simulationUniverse = [...universe, ...syncedHoldings];
  const industryCount = new Set(universe.map(stock => stock.industry)).size;

  const benchmarkResult = await Promise.allSettled([
    withTimeout(emIndexDailyKlineRows('1.000300', '沪深300', tradeDate, strategyHistoryDays), 9000)
  ]);
  const benchmark = benchmarkResult[0].status === 'fulfilled' ? benchmarkResult[0].value : [];
  if (benchmarkResult[0].status === 'rejected') {
    failures.push({ code: '000300', error: benchmarkResult[0].reason?.message || String(benchmarkResult[0].reason) });
  }

  const simulation = simulateAutoStrategy({
    universe: simulationUniverse,
    benchmark,
    startDate: strategyStartDate,
    initialAccount: strategySyncedAccount,
    cashFlows: strategyCashFlows
  });
  return {
    updatedAt: new Date().toISOString(),
    tradeDate,
    refreshAfterMs: strategySimulationCacheTtlMs,
    session,
    source: '东方财富实时行情、沪深主板行业均衡活跃股与前复权日线',
    sourceStatus: {
      level: failures.length ? 'partial' : 'live',
      text: simulation.status === 'scheduled'
        ? `等待 ${strategyStartDate} 启动`
        : session.isTradingTime ? '盘中实时模拟' : '收盘模拟结果',
      detail: `从成交活跃样本按行业均衡扫描 ${quoteRows.length} 只沪深主板股，${universe.length} 只历史行情可用，覆盖 ${industryCount} 个行业${failures.length ? `，${failures.length} 只数据不完整` : ''}。`
    },
    universe: {
      requested: quoteRows.length,
      available: universe.length,
      industryCount,
      omitted: failures
    },
    strategy: {
      name: '资金动量轮动',
      selection: '从沪深主板成交活跃股中按行业均衡扫描；MA5 > MA20、价格高于 MA20、RSI14 处于 52–78、5 日动量为正且量能达标',
      execution: `${strategyStartDate} 起接管同步持仓，旧仓从快照价重新建立风控，卖出释放资金后再买入主板；最多同时持有 3 只`
    },
    account: strategySyncedAccount,
    ...simulation,
    disclaimer: '既有 ETF 只作为同步持仓管理，新买入范围仅取按行业均衡的沪深主板成交活跃股；结果仅用于策略观察，不构成投资建议或收益承诺。'
  };
}

async function loadStrategyUniverseQuoteRows(tradeDate) {
  const cached = memory.strategyUniverseCached;
  const fields = 'f2,f3,f4,f5,f6,f8,f10,f12,f13,f14,f15,f16,f17,f18,f100,f124';
  if (cached?.tradeDate === tradeDate) {
    const payload = await emPolicyQuoteJson('/api/qt/ulist.np/get', {
      fltt: '2',
      invt: '2',
      fields,
      secids: cached.items.map(item => `${item.market}.${item.code}`).join(','),
      ut: 'b2884a393a59ad64002292a3e90d46a5'
    });
    const rowsByCode = new Map((payload?.data?.diff || []).map(row => [String(row.f12 || ''), row]));
    return cached.items.map(item => rowsByCode.get(item.code)).filter(Boolean);
  }

  const quotePageSize = 100;
  const quotePageCount = Math.ceil(strategyUniverseSampleSize / quotePageSize);
  const payloads = await Promise.all(Array.from({ length: quotePageCount }, (_, index) => emQuoteClistJson({
    pn: String(index + 1),
    pz: String(quotePageSize),
    po: '1',
    np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2',
    invt: '2',
    fid: 'f6',
    fs: 'm:0+t:6,m:1+t:2',
    fields
  })));
  const rows = payloads
    .flatMap(payload => payload?.data?.diff || [])
    .filter(row => isAStockRow(row) && isStrategyMainBoardCode(row.f12))
    .filter(row => {
      const name = decodeName(row.f14 || '');
      const latest = toNumber(row.f2);
      const changePct = toNumber(row.f3);
      return name && !/(ST|退|^N)/i.test(name)
        && Number.isFinite(latest) && latest > 0
        && Number.isFinite(changePct) && Math.abs(changePct) < 9.8;
    });
  const selectedRows = selectStrategyUniverseRows(rows, strategyUniverseSize);
  if (selectedRows.length < 3) throw new Error('成交活跃股排行返回不足');
  memory.strategyUniverseCached = {
    tradeDate,
    items: selectedRows.map(row => ({ code: String(row.f12), market: Number(row.f13), name: decodeName(row.f14) }))
  };
  return selectedRows;
}

function selectStrategyUniverseRows(rows, limit) {
  const rowsByIndustry = new Map();
  rows.forEach(row => {
    const industry = decodeName(row.f100 || '') || '未分类';
    const industryRows = rowsByIndustry.get(industry) || [];
    industryRows.push(row);
    rowsByIndustry.set(industry, industryRows);
  });

  const selected = [];
  for (let depth = 0; selected.length < limit; depth += 1) {
    const previousSize = selected.length;
    for (const industryRows of rowsByIndustry.values()) {
      if (industryRows[depth]) selected.push(industryRows[depth]);
      if (selected.length >= limit) break;
    }
    if (selected.length === previousSize) break;
  }
  return selected;
}

async function strategyStockHistory(quoteRow, tradeDate, session) {
  const code = String(quoteRow.f12 || '');
  const market = Number(quoteRow.f13);
  const name = decodeName(quoteRow.f14 || code);
  const key = `${tradeDate}:${market}.${code}`;
  let cached = memory.strategyHistoryCached.get(key);
  if (!cached || Date.now() - cached.cachedAt >= strategyHistoryCacheTtlMs) {
    const bars = await withTimeout(
      emIndexDailyKlineRows(`${market}.${code}`, name, tradeDate, strategyHistoryDays),
      9000
    );
    cached = { cachedAt: Date.now(), bars };
    memory.strategyHistoryCached.set(key, cached);
  }
  const quote = quoteIndexRow(quoteRow, { name });
  const allowCurrentBar = ['trading', 'lunch', 'closed'].includes(session.session);
  const bars = allowCurrentBar ? cached.bars : cached.bars.filter(bar => bar.date !== tradeDate);
  const quoteUpdatedAt = quote?.updatedAt ? new Date(quote.updatedAt) : null;
  const hasCurrentQuote = allowCurrentBar
    && quoteUpdatedAt
    && !Number.isNaN(quoteUpdatedAt.getTime())
    && formatShanghaiDate(quoteUpdatedAt) === tradeDate;
  return {
    code,
    market,
    name,
    industry: decodeName(quoteRow.f100 || '') || '未分类',
    bars: hasCurrentQuote ? mergeIndexQuoteRow(bars, quote, tradeDate) : bars
  };
}

async function strategySyncedPositionHistory(position, tradeDate, session) {
  const quote = await resolveSecurityQuote(position.code);
  const key = `${tradeDate}:${quote.market}.${position.code}`;
  let cached = memory.strategyHistoryCached.get(key);
  if (!cached || Date.now() - cached.cachedAt >= strategyHistoryCacheTtlMs) {
    const bars = await withTimeout(
      emIndexDailyKlineRows(`${quote.market}.${position.code}`, position.name, tradeDate, strategyHistoryDays),
      9000
    );
    cached = { cachedAt: Date.now(), bars };
    memory.strategyHistoryCached.set(key, cached);
  }
  const allowCurrentBar = ['trading', 'lunch', 'closed'].includes(session.session);
  const bars = allowCurrentBar ? cached.bars : cached.bars.filter(bar => bar.date !== tradeDate);
  const quoteUpdatedAt = new Date(quote.updatedAt);
  const hasCurrentQuote = allowCurrentBar
    && !Number.isNaN(quoteUpdatedAt.getTime())
    && formatShanghaiDate(quoteUpdatedAt) === tradeDate;
  const liveQuote = {
    ...quote,
    name: position.name,
    volumeRaw: quote.volume,
    amountRaw: quote.amount
  };
  return {
    code: position.code,
    market: quote.market,
    name: position.name,
    bars: hasCurrentQuote ? mergeIndexQuoteRow(bars, liveQuote, tradeDate) : bars
  };
}

async function handleSecurityAdvice(url, res) {
  const code = String(url.searchParams.get('code') || '').trim();
  if (!/^\d{6}$/.test(code)) {
    sendJson(res, 400, { error: '请输入 6 位股票或 ETF 代码。' });
    return;
  }
  try {
    const quote = await resolveSecurityQuote(code);
    const securityType = securityTypeFromQuote(quote);
    if (!securityType) {
      sendJson(res, 422, { error: '当前仅支持 A 股股票和沪深场内 ETF。' });
      return;
    }

    const tradeDate = formatShanghaiDate(new Date());
    const session = timelineForTradeDate(tradeDate);
    const security = {
      code,
      market: quote.market,
      secid: `${quote.market}.${code}`,
      name: quote.name,
      type: securityType,
      typeLabel: securityType === 'etf' ? 'ETF' : 'A股'
    };
    const item = { code, market: quote.market, category: 'stock', name: quote.name };
    const baseCached = memory.securityAdviceBaseCached.get(code);
    const useCachedBase = baseCached
      && baseCached.tradeDate === tradeDate
      && Date.now() - baseCached.cachedAt < securityAdviceBaseCacheTtlMs;
    const [dailyResult, intradayResult, minuteFlowResult, dailyFlowResult, darkTradeResult] = await Promise.allSettled([
      useCachedBase
        ? Promise.resolve(baseCached.dailyBars)
        : withTimeout(emIndexDailyKlineRows(security.secid, quote.name, tradeDate, 120), 9000),
      withTimeout(emSecurityIntradayPoints(item, tradeDate), 9000),
      useCachedBase
        ? Promise.resolve(baseCached.minuteFlow)
        : withTimeout(emFundFlowMinutePoints(item, true, tradeDate), 8000),
      useCachedBase
        ? Promise.resolve(baseCached.dailyFlow)
        : withTimeout(emFundFlowDailySnapshot(item, true, tradeDate, 90), 8000),
      securityType === 'stock'
        ? withTimeout(emDarkTradeSnapshot(code, tradeDate), 9000)
        : Promise.resolve(null)
    ]);
    const dailyBars = settledValue(dailyResult, []);
    const intraday = mergeLiveQuoteIntoIntraday(
      settledValue(intradayResult, []),
      quote,
      tradeDate,
      session
    );
    const minuteFlow = settledValue(minuteFlowResult, []);
    const dailyFlow = settledValue(dailyFlowResult, null);
    const darkTrade = settledValue(darkTradeResult, null);
    if (!dailyBars.length) throw new Error('未取得该证券的日线数据');
    if (!useCachedBase && dailyResult.status === 'fulfilled') {
      memory.securityAdviceBaseCached.set(code, {
        cachedAt: Date.now(),
        tradeDate,
        dailyBars,
        minuteFlow,
        dailyFlow
      });
    }

    const fundFlow = securityFundFlow(quote, minuteFlow, dailyFlow, darkTrade);
    const analysis = analyzeSecuritySnapshot({
      security,
      quote,
      dailyBars,
      intraday,
      fundFlow,
      tradeDate,
      session
    });
    analysis.tradeSignals.intraday = latchSecurityIntradaySignals(
      code,
      tradeDate,
      analysis.tradeSignals.intraday
    );
    sendJson(res, 200, {
      updatedAt: new Date().toISOString(),
      tradeDate,
      session,
      source: '东方财富实时行情、darktrade 明暗盘与资金流',
      sourceStatus: {
        quote: 'available',
        daily: dailyResult.status === 'fulfilled' ? 'available' : 'unavailable',
        intraday: intradayResult.status === 'fulfilled' && intraday.length ? 'available' : 'unavailable',
        fundFlow: Number.isFinite(fundFlow.mainNet) ? 'available' : 'unavailable',
        darkTrade: darkTrade ? 'available' : 'unavailable'
      },
      ...analysis,
      disclaimer: '结果由公开行情与技术规则自动生成，仅用于辅助研判，不构成投资建议或收益承诺。'
    });
  } catch (err) {
    sendJson(res, 502, { error: securityAdviceErrorMessage(err) });
  }
}

function strategyLiveQuotePayload(quote) {
  const receivedAt = new Date();
  const tradeDate = formatShanghaiDate(receivedAt);
  return {
    receivedAt: receivedAt.toISOString(),
    tradeDate,
    source: '东方财富实时行情快照',
    security: {
      code: quote.code,
      market: quote.market,
      name: quote.name
    },
    quote: {
      latest: quote.latest,
      changePct: quote.changePct,
      change: quote.change,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      preClose: quote.preClose,
      volume: quote.volume,
      amount: quote.amount,
      updatedAt: quote.updatedAt
    },
    session: timelineForTradeDate(tradeDate)
  };
}

async function handleStrategyLiveQuote(url, req, res) {
  const code = String(url.searchParams.get('code') || '').trim();
  if (!/^\d{6}$/.test(code)) {
    sendJson(res, 400, { error: '请输入 6 位股票代码。' });
    return;
  }

  let initialQuote;
  try {
    initialQuote = await resolveSecurityQuote(code);
    if (!['stock', 'etf'].includes(securityTypeFromQuote(initialQuote))) {
      sendJson(res, 422, { error: '实时策略行情当前仅支持 A 股股票和沪深场内 ETF。' });
      return;
    }
  } catch (err) {
    sendJson(res, 502, { error: securityAdviceErrorMessage(err) });
    return;
  }

  const initialPayload = strategyLiveQuotePayload(initialQuote);
  if (url.searchParams.get('stream') !== '1') {
    sendJson(res, 200, initialPayload);
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'access-control-allow-origin': '*'
  });
  res.write('retry: 3000\n\n');

  let closed = false;
  let timer;
  let finish;
  const closedPromise = new Promise(resolveClosed => {
    finish = resolveClosed;
  });
  res.once('close', () => {
    closed = true;
    clearTimeout(timer);
    finish();
  });

  const writeQuote = payload => {
    res.write(`id: ${Date.now()}\nevent: quote\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const poll = async () => {
    if (closed) return;
    try {
      const payload = strategyLiveQuotePayload(await resolveSecurityQuote(code));
      if (closed) return;
      writeQuote(payload);
      const intervalMs = ['auction', 'trading'].includes(payload.session.session) ? 2000 : 20000;
      timer = setTimeout(poll, intervalMs);
    } catch (err) {
      if (closed) return;
      res.write(`event: quote-error\ndata: ${JSON.stringify({ error: securityAdviceErrorMessage(err) })}\n\n`);
      timer = setTimeout(poll, 5000);
    }
  };

  writeQuote(initialPayload);
  const initialIntervalMs = ['auction', 'trading'].includes(initialPayload.session.session) ? 2000 : 20000;
  timer = setTimeout(poll, initialIntervalMs);
  await closedPromise;
}

function mergeLiveQuoteIntoIntraday(points, quote, tradeDate, session) {
  const rows = Array.isArray(points) ? points.slice() : [];
  if (!['auction', 'trading'].includes(session?.session) || !Number.isFinite(quote?.latest)) return rows;
  const quoteDate = new Date(quote.updatedAt);
  if (Number.isNaN(quoteDate.getTime()) || formatShanghaiDate(quoteDate) !== tradeDate) return rows;

  const { hour, minute } = shanghaiTimeParts(quoteDate);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const existingIndex = rows.findIndex(point => point.date === tradeDate && point.time === time);
  const existing = existingIndex >= 0 ? rows[existingIndex] : null;
  const earlierRows = rows.filter(point => point.date === tradeDate && point.time < time);
  const completedVolume = earlierRows.reduce((sum, point) => sum + positiveNumberOrZero(point.volume), 0);
  const completedAmount = earlierRows.reduce((sum, point) => sum + positiveNumberOrZero(point.amount), 0);
  const liveVolume = Number.isFinite(quote.volume)
    ? Math.max(0, quote.volume - completedVolume)
    : null;
  const liveAmount = Number.isFinite(quote.amount)
    ? Math.max(0, quote.amount - completedAmount)
    : null;
  const cumulativeAverage = Number.isFinite(quote.amount) && Number.isFinite(quote.volume) && quote.volume > 0
    ? quote.amount / (quote.volume * 100)
    : null;
  const previousPrice = existingIndex > 0
    ? rows[existingIndex - 1]?.price
    : rows.at(-1)?.price;
  const open = firstPositiveNumber([existing?.open, previousPrice, quote.latest]);
  const livePoint = {
    date: tradeDate,
    time,
    open,
    price: quote.latest,
    high: maxFiniteNumber([existing?.high, existing?.price, open, quote.latest]),
    low: minFiniteNumber([existing?.low, existing?.price, open, quote.latest]),
    volume: maxFiniteNumber([existing?.volume, liveVolume]),
    amount: maxFiniteNumber([existing?.amount, liveAmount]),
    average: firstPositiveNumber([cumulativeAverage, existing?.average]),
    value: Number.isFinite(quote.changePct) ? quote.changePct : existing?.value ?? null
  };
  if (existingIndex >= 0) rows[existingIndex] = livePoint;
  else rows.push(livePoint);
  return rows.sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`));
}

function latchSecurityIntradaySignals(code, tradeDate, incoming) {
  for (const key of memory.securitySignalLedgers.keys()) {
    if (!key.startsWith(`${tradeDate}:`)) memory.securitySignalLedgers.delete(key);
  }
  const key = `${tradeDate}:${code}`;
  const ledger = memory.securitySignalLedgers.get(key) || [];
  const known = new Set(ledger.map(marker => `${marker.time}:${marker.type}`));
  (Array.isArray(incoming) ? incoming : []).forEach(marker => {
    const markerKey = `${marker.time}:${marker.type}`;
    if (!known.has(markerKey)) {
      ledger.push(marker);
      known.add(markerKey);
    }
  });
  ledger.sort((left, right) => clockMinuteValue(left.time) - clockMinuteValue(right.time));
  const retained = ledger.slice(-24);
  memory.securitySignalLedgers.set(key, retained);
  return retained.slice(-8);
}

function positiveNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function maxFiniteNumber(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function minFiniteNumber(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : null;
}

function clockMinuteValue(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
}

async function resolveSecurityQuote(code) {
  const preferredMarket = /^[569]/.test(code) ? 1 : 0;
  const markets = [preferredMarket, preferredMarket === 1 ? 0 : 1];
  let lastErr;
  for (const market of markets) {
    try {
      const quote = await securityQuoteForMarket(code, market);
      if (quote) return quote;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('未找到该证券，请确认代码是否正确');
}

async function securityQuoteForMarket(code, market) {
  const payload = await emPolicyQuoteJson('/api/qt/ulist.np/get', {
    fltt: '2',
    invt: '2',
    fields: 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f62,f66,f72,f78,f84,f124',
    secids: `${market}.${code}`,
    ut: 'b2884a393a59ad64002292a3e90d46a5'
  });
  const row = (payload?.data?.diff || []).find(item => String(item?.f12 || '') === code && Number(item?.f13) === market);
  const latest = toNumber(row?.f2);
  if (!row || !Number.isFinite(latest) || latest <= 0) return null;
  const updatedAt = Number.isFinite(Number(row.f124))
    ? new Date(Number(row.f124) * 1000).toISOString()
    : new Date().toISOString();
  return {
    code,
    market,
    name: decodeName(row.f14),
    latest,
    changePct: finiteOrNull(toNumber(row.f3)),
    change: finiteOrNull(toNumber(row.f4)),
    volume: finiteOrNull(toNumber(row.f5)),
    amount: finiteOrNull(toNumber(row.f6)),
    turnoverRate: finiteOrNull(toNumber(row.f8)),
    peDynamic: finiteOrNull(toNumber(row.f9)),
    volumeRatio: finiteOrNull(toNumber(row.f10)),
    high: finiteOrNull(toNumber(row.f15)),
    low: finiteOrNull(toNumber(row.f16)),
    open: finiteOrNull(toNumber(row.f17)),
    preClose: finiteOrNull(toNumber(row.f18)),
    totalMarketValue: finiteOrNull(toNumber(row.f20)),
    floatMarketValue: finiteOrNull(toNumber(row.f21)),
    mainNet: finiteOrNull(toEastmoneyYi(row.f62)),
    superLarge: finiteOrNull(toEastmoneyYi(row.f66)),
    large: finiteOrNull(toEastmoneyYi(row.f72)),
    medium: finiteOrNull(toEastmoneyYi(row.f78)),
    small: finiteOrNull(toEastmoneyYi(row.f84)),
    updatedAt
  };
}

function securityTypeFromQuote(quote) {
  const name = String(quote?.name || '');
  const code = String(quote?.code || '');
  if (/ETF/i.test(name)) return 'etf';
  if (/^(600|601|603|605|688|689)\d{3}$/.test(code)) return 'stock';
  if (/^(000|001|002|003|300|301)\d{3}$/.test(code)) return 'stock';
  if (/^(4\d{5}|8\d{5}|920\d{3})$/.test(code) && !/指数/.test(name)) return 'stock';
  return '';
}

async function fetchDarkTradePage(tradeDate, page) {
  const url = new URL(darkTradeBaseUrl);
  const params = {
    version: '100',
    cver: '100',
    date: tradeDate.replaceAll('-', ''),
    StartPage: String(page),
    NumPerPage: String(darkTradePageSize),
    sortflag: '4',
    desc: '1',
    market: '',
    datetype: ''
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      referer: 'https://emrnweb.eastmoney.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(darkTradeRequestTimeoutMs)
  });
  if (!response.ok) throw new Error(`darktrade HTTP ${response.status}`);

  const text = new TextDecoder('gbk').decode(await response.arrayBuffer());
  const payload = JSON.parse(text);
  if (payload?.errid !== 0 || !Array.isArray(payload?.data)) {
    throw new Error(`darktrade ${payload?.errmsg || payload?.errid || 'invalid response'}`);
  }
  return payload;
}

async function buildDarkTradeIndex(tradeDate) {
  const firstPage = await fetchDarkTradePage(tradeDate, 1);
  const total = Number(firstPage['2']);
  if (!Number.isFinite(total) || total <= 0) throw new Error('darktrade empty stock index');

  const pageCount = Math.ceil(total / darkTradePageSize);
  const pages = new Map([[1, firstPage]]);
  const remainingPages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (const batch of chunk(remainingPages, darkTradeIndexConcurrency)) {
    const payloads = await Promise.all(batch.map(page => fetchDarkTradePage(tradeDate, page)));
    payloads.forEach((payload, index) => pages.set(batch[index], payload));
  }

  const pageByCode = new Map();
  const cachedAt = Date.now();
  pages.forEach((payload, page) => {
    memory.darkTradePageCached.set(`${tradeDate}:${page}`, { cachedAt, payload });
    payload.data.forEach(row => {
      const code = String(row?.['4'] || '');
      if (code) pageByCode.set(code, page);
    });
  });
  return { tradeDate, pageByCode };
}

async function darkTradeIndexForDate(tradeDate) {
  if (memory.darkTradeIndexCached?.tradeDate === tradeDate) return memory.darkTradeIndexCached;
  if (memory.darkTradeIndexLoading?.tradeDate === tradeDate) return memory.darkTradeIndexLoading.promise;

  const promise = buildDarkTradeIndex(tradeDate);
  memory.darkTradeIndexLoading = { tradeDate, promise };
  try {
    const index = await promise;
    memory.darkTradeIndexCached = index;
    return index;
  } finally {
    if (memory.darkTradeIndexLoading?.promise === promise) memory.darkTradeIndexLoading = null;
  }
}

async function darkTradePageForDate(tradeDate, page) {
  const key = `${tradeDate}:${page}`;
  const cached = memory.darkTradePageCached.get(key);
  if (cached && Date.now() - cached.cachedAt < darkTradePageCacheTtlMs) return cached.payload;
  const payload = await fetchDarkTradePage(tradeDate, page);
  memory.darkTradePageCached.set(key, { cachedAt: Date.now(), payload });
  return payload;
}

async function emDarkTradeSnapshot(code, tradeDate) {
  const index = await darkTradeIndexForDate(tradeDate);
  const page = index.pageByCode.get(code);
  if (!page) return null;

  const payload = await darkTradePageForDate(tradeDate, page);
  const row = payload.data.find(item => String(item?.['4'] || '') === code);
  if (!row) return null;

  const dark = toEastmoneyYi(row['6']);
  const visible = toEastmoneyYi(row['7']);
  const main = toEastmoneyYi(row['8']);
  if (![dark, visible, main].every(Number.isFinite)) throw new Error('darktrade invalid fund values');

  const sourceDate = String(payload['1'] || '');
  const sourceTime = String(row['5'] || '').padStart(6, '0');
  return {
    main,
    visible,
    dark,
    retail: round(-main),
    activity: finiteOrNull(toNumber(row['11'])),
    tradeDate: /^\d{8}$/.test(sourceDate)
      ? `${sourceDate.slice(0, 4)}-${sourceDate.slice(4, 6)}-${sourceDate.slice(6, 8)}`
      : tradeDate,
    quoteTime: /^\d{6}$/.test(sourceTime)
      ? `${sourceTime.slice(0, 2)}:${sourceTime.slice(2, 4)}:${sourceTime.slice(4, 6)}`
      : '',
    source: '东方财富 darktrade 明暗盘资金'
  };
}

function securityFundFlow(quote, minutePoints, dailySnapshot, darkTradeSnapshot) {
  const dailyBreakdown = dailySnapshot?.rawBreakdown || {};
  const minuteLatest = Array.isArray(minutePoints) ? minutePoints.at(-1)?.value : null;
  const mainNet = firstPositiveOrNegativeNumber([quote.mainNet, minuteLatest, dailySnapshot?.latest]);
  return {
    mainNet: finiteOrNull(mainNet),
    mainNetPct: finiteOrNull(toNumber(dailyBreakdown.mainPct)),
    superLarge: finiteOrNull(firstPositiveOrNegativeNumber([dailyBreakdown.superLarge, quote.superLarge])),
    large: finiteOrNull(firstPositiveOrNegativeNumber([dailyBreakdown.large, quote.large])),
    medium: finiteOrNull(firstPositiveOrNegativeNumber([dailyBreakdown.medium, quote.medium])),
    small: finiteOrNull(firstPositiveOrNegativeNumber([dailyBreakdown.small, quote.small])),
    darkTrade: darkTradeSnapshot || null,
    unit: '亿元',
    points: Array.isArray(minutePoints) ? minutePoints : [],
    dailyPoints: Array.isArray(dailySnapshot?.history) ? dailySnapshot.history : [],
    source: Array.isArray(minutePoints) && minutePoints.length
      ? '东方财富主力资金分钟线'
      : dailySnapshot
        ? '东方财富主力资金日线'
        : Number.isFinite(quote.mainNet)
          ? '东方财富实时主力资金'
          : 'unavailable'
  };
}

function settledValue(result, fallback) {
  return result?.status === 'fulfilled' ? result.value : fallback;
}

function firstPositiveOrNegativeNumber(values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function securityAdviceErrorMessage(err) {
  const message = String(err?.message || err || '行情服务暂不可用');
  if (/未找到|empty|not found/i.test(message)) return '未找到该证券，请确认代码是否正确。';
  if (/timeout/i.test(message)) return '行情源响应超时，请稍后重试。';
  return `研判数据暂不可用：${message}`;
}

async function loadAvailableTradeDates(limit) {
  const payload = await emFundFlowMinuteJson('/api/qt/stock/fflow/daykline/get', {
    secid: '90.BK0475',
    klt: '101',
    lmt: String(limit),
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  }, 'push2his.eastmoney.com');
  const today = formatShanghaiDate(new Date());
  const queryableDates = (payload?.data?.klines || [])
    .map(line => String(line).split(',')[0])
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
  await ensureTrendStoreLoaded();
  const storedDates = [...memory.trendStore.values()]
    .filter(entry => Array.isArray(entry?.payload?.series) && entry.payload.series.length)
    .map(entry => String(entry.tradeDate || entry.payload.requestedDate || ''))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
  const dates = [...new Set([...queryableDates, ...storedDates])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);
  if (!dates.length) throw new Error('empty market trade dates');
  return dates;
}

function tradeDatesPayload(dates) {
  return {
    updatedAt: new Date().toISOString(),
    source: '东方财富板块资金流日线与本地存档',
    dates,
    maxDate: dates[0] || '',
    minDate: dates.at(-1) || ''
  };
}

function startFundFlowServer() {
  const server = createFundFlowServer();
  server.listen(port, () => {
    console.log(`A股资金流向大屏: http://127.0.0.1:${port}`);
    console.log('真实数据源: 东方财富公开资金流接口');
    console.log(`AKTools: ${aktoolsBase}`);
  });
  startPrefetchLoop();
  return server;
}

async function handleOverview(url, res) {
  const now = Date.now();
  const limit = clamp(Number(url.searchParams.get('limit') || 30), 10, 60);
  const scope = url.searchParams.get('scope') || 'all';
  const force = url.searchParams.get('force') === '1';
  const requestedDate = normalizeTradeDate(url.searchParams.get('date'));
  const focusLimit = focusLimitForRequest(url);
  const focusNames = normalizeFocusNames(url.searchParams.get('focus'), focusLimit);
  const singleFocus = url.searchParams.get('single') === '1' || (scope === 'all' && focusNames.length === 1);
  const focusKey = focusViewKey(focusNames);
  const historical = isHistoricalTradeDate(requestedDate);
  const cacheKey = scopedCacheKey(scope, requestedDate, focusKey);
  const sourceCacheKey = sourceScopedCacheKey(scope, requestedDate);
  if (historical) {
    const storedPayload = await loadStoredTrendPayload(scope, requestedDate, displayLimitForScope(scope, limit, focusLimit), focusKey, focusNames);
    if (storedPayload) {
      sendJson(res, 200, await attachMarketSummary(storedPayload, requestedDate));
      return;
    }
  }

  const cached = memory.cachedByScope.get(sourceCacheKey);
  const sourceTtlMs = singleFocus ? Math.max(cacheTtlMs, focusSourceCacheTtlMs) : cacheTtlMs;
  if (!force && cached && now - cached.cachedAt < sourceTtlMs) {
    applyMinutePointsToSeries(cached.payload.series, requestedDate);
    applyPricePointsToSeries(cached.payload.series, requestedDate);
    const filtered = await prepareFilteredPayload(cached.payload, scope, limit, 0, force, requestedDate, focusNames, focusLimit);
    await maybePersistTodayTrend(filtered, scope, requestedDate, focusKey);
    sendJson(res, 200, await attachMarketSummary(filtered, requestedDate));
    if (!historical && (scope === 'all' || scope === 'industry' || scope === 'concept')) scheduleMinuteHydration(cached.payload.series, false, requestedDate);
    if (!historical && (scope === 'all' || scope === 'industry' || scope === 'concept')) schedulePriceHydration(cached.payload.series, false, requestedDate);
    return;
  }

  const loadPromise = startOverviewLoad(sourceCacheKey, limit, scope, force, requestedDate);
  const loaded = await withTimeout(loadPromise, overviewFetchTimeoutMs).catch(err => ({
    result: {
      series: [],
      status: {
        level: 'warn',
        text: '真实源超时',
        detail: `资金流接口响应超过 ${Math.round(overviewFetchTimeoutMs / 1000)} 秒，已停止等待；后台会继续尝试刷新真实数据。${err?.message || ''}`
      }
    },
    payload: null
  }));

  if (!loaded.result.series.length && cached?.payload?.series?.length) {
    const stalePayload = {
      ...cached.payload,
      sourceStatus: {
        level: 'warn',
        text: '沿用上一帧',
        detail: '当前资金流接口暂时未返回可用行业/概念数据，页面保留上一帧真实数据，后台继续刷新。'
      }
    };
    const filtered = await prepareFilteredPayload(stalePayload, scope, limit, 0, force, requestedDate, focusNames, focusLimit);
    await maybePersistTodayTrend(filtered, scope, requestedDate, focusKey);
    sendJson(res, 200, await attachMarketSummary(filtered, requestedDate));
    return;
  }

  if (!loaded.payload) {
    const fallbackPayload = await buildMarketPriceFallbackPayload(scope, loaded.result.status, requestedDate);
    sendJson(res, 200, await attachMarketSummary(fallbackPayload || normalizePayload([], loaded.result.status, requestedDate), requestedDate));
    return;
  }

  const payload = loaded.payload;
  const hydrateWait = historical
    ? Math.max(13000, responseHydrateWaitMs * 28)
    : (force ? responseHydrateWaitMs * 2 : responseHydrateWaitMs);
  const filtered = await prepareFilteredPayload(payload, scope, limit, hydrateWait, force, requestedDate, focusNames, focusLimit);
  await maybePersistTodayTrend(filtered, scope, requestedDate, focusKey);
  sendJson(res, 200, await attachMarketSummary(filtered, requestedDate));
  if (!historical && (scope === 'all' || scope === 'industry' || scope === 'concept')) scheduleMinuteHydration(payload.series, force, requestedDate);
  if (!historical && (scope === 'all' || scope === 'industry' || scope === 'concept')) schedulePriceHydration(payload.series, force, requestedDate);
}

function normalizeTradeDate(value) {
  const today = formatShanghaiDate(new Date());
  const text = String(value || today).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return today;
  return text > today ? today : text;
}

function isHistoricalTradeDate(tradeDate) {
  return normalizeTradeDate(tradeDate) !== formatShanghaiDate(new Date());
}

function displayLimitForScope(scope, limit, focusLimit = focusGroupLimit) {
  return scope === 'all' ? focusLimit : limit;
}

function focusLimitForRequest(url) {
  const raw = url.searchParams.get('focusLimit');
  if (raw === 'all' || raw === 'unlimited') return availableFocusGroups.length;
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) return clamp(Math.round(value), 1, availableFocusGroups.length);
  return focusGroupLimit;
}

function normalizeFocusNames(value, limit = focusGroupLimit) {
  return uniqueValues(String(value || '')
    .split(',')
    .map(item => normalizeFocusName(item))
    .filter(Boolean))
    .slice(0, limit);
}

function normalizeFocusName(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 24);
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = normalizeBoardName(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFocusGroups(groups) {
  const seen = new Set();
  return groups.filter(group => {
    const key = normalizeBoardName(group.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function focusViewKey(names) {
  return Array.isArray(names) && names.length ? names.join('|') : 'default';
}

function scopedCacheKey(scope, tradeDate, focusKey = 'default') {
  const scopeKey = scope === 'all' ? 'focus' : scope;
  const suffix = scope === 'all' ? `:${focusKey || 'default'}` : '';
  return `${tradeDate || formatDate(new Date())}:${scopeKey}${suffix}`;
}

function sourceScopedCacheKey(scope, tradeDate) {
  const scopeKey = scope === 'all' ? 'focus-source' : scope;
  return `${tradeDate || formatDate(new Date())}:${scopeKey}`;
}

function securityCacheKey(item, tradeDate) {
  return `${tradeDate || formatDate(new Date())}:${item.market}.${item.code}`;
}

function trendStoreKey(scope, tradeDate, focusKey = 'default') {
  const scopeKey = scope === 'all' ? 'focus' : scope;
  const suffix = scope === 'all' ? `:${focusKey || 'default'}` : '';
  return `${tradeDate || formatDate(new Date())}:${scopeKey}${suffix}`;
}

function legacyTrendStoreKey(scope, tradeDate) {
  const scopeKey = scope === 'all' ? 'focus' : scope;
  return `${tradeDate || formatDate(new Date())}:${scopeKey}`;
}

function findStoredTrendEntry(scope, requestedDate, focusKey = 'default') {
  const keys = [
    trendStoreKey(scope, requestedDate, focusKey),
    scope === 'all' && focusKey !== 'default' ? trendStoreKey(scope, requestedDate, 'default') : '',
    legacyTrendStoreKey(scope, requestedDate)
  ].filter(Boolean);
  for (const key of [...new Set(keys)]) {
    const entry = memory.trendStore.get(key);
    if (entry?.payload?.series?.length) return { key, entry };
  }
  if (scope !== 'all') return null;
  const prefix = `${requestedDate}:focus`;
  return [...memory.trendStore.entries()]
    .filter(([key, entry]) => key === prefix || (key.startsWith(`${prefix}:`) && entry?.payload?.series?.length))
    .sort((a, b) => (b[1].payload?.series?.length || 0) - (a[1].payload?.series?.length || 0))
    .map(([key, entry]) => ({ key, entry }))[0] || null;
}

function filterStoredFocusSeries(series, focusNames = []) {
  if (!Array.isArray(focusNames) || !focusNames.length) return uniqueStoredSeriesByName(series);
  const wanted = new Set(focusNames.map(normalizeBoardName).filter(Boolean));
  const byName = new Map();
  series.forEach(item => {
    [item.name, item.sourceName].map(normalizeBoardName).filter(Boolean).forEach(key => {
      if (wanted.has(key) && !byName.has(key)) byName.set(key, item);
    });
  });
  return focusNames
    .map(name => byName.get(normalizeBoardName(name)))
    .filter(Boolean);
}

function uniqueStoredSeriesByName(series) {
  const seen = new Set();
  return (Array.isArray(series) ? series : []).filter(item => {
    const key = normalizeBoardName(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadStoredTrendPayload(scope, requestedDate, limit, focusKey = 'default', focusNames = []) {
  if (!trendStoreEnabled || !isHistoricalTradeDate(requestedDate)) return null;
  await ensureTrendStoreLoaded();
  const match = findStoredTrendEntry(scope, requestedDate, focusKey);
  const entry = match?.entry;
  const payload = entry?.payload;
  if (!payload?.series?.length) return null;
  const sourceSeries = filterStoredFocusSeries(payload.series, focusNames);
  if (!sourceSeries.length) return null;
  const series = sourceSeries
    .map(item => cloneTrendSeriesItem(item, requestedDate))
    .slice(0, limit);
  return {
    ...payload,
    updatedAt: entry.storedAt || payload.updatedAt || new Date().toISOString(),
    tradeDate: requestedDate,
    requestedDate,
    timeline: payload.timeline || timelineForTradeDate(requestedDate),
    series,
    leaders: buildLeaders(series),
    breakdown: buildBreakdown(series),
    sourceStatus: {
      level: 'live',
      text: '本地存档',
      detail: `命中本地走势库：${match.key}，由盘中用户查询覆盖写入。`
    },
    note: `${payload.note || '历史走势来自本地查询存档。'} 本次优先使用本地走势库。`
  };
}

async function maybePersistTodayTrend(payload, scope, requestedDate, focusKey = 'default') {
  if (!trendStoreEnabled || !shouldPersistTodayTrend(requestedDate) || !payload?.series?.length) return;
  trendStoreWriteQueue = trendStoreWriteQueue
    .catch(() => {})
    .then(async () => {
      await ensureTrendStoreLoaded();
      const key = trendStoreKey(scope, requestedDate, focusKey);
      const existing = memory.trendStore.get(key)?.payload;
      const nextPayload = clonePayloadForTrendStore(payload, requestedDate);
      const entry = {
        storedAt: new Date().toISOString(),
        scope,
        tradeDate: requestedDate,
        payload: mergeStoredTrendPayload(existing, nextPayload, requestedDate)
      };
      memory.trendStore.set(key, entry);
      await flushTrendStore();
    })
    .catch(err => {
      console.warn(`走势库写入失败：${err?.message || err}`);
    });
  await trendStoreWriteQueue;
}

function shouldPersistTodayTrend(requestedDate) {
  if (requestedDate !== formatShanghaiDate(new Date())) return false;
  const timeline = tradingTimeline();
  return timeline.session !== 'preopen' && timeline.session !== 'closed';
}

async function ensureTrendStoreLoaded() {
  if (memory.trendStoreLoaded) return;
  memory.trendStoreLoaded = true;
  try {
    const raw = await readFile(trendStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    Object.entries(parsed?.entries || {}).forEach(([key, entry]) => {
      if (entry?.payload?.series?.length) memory.trendStore.set(key, entry);
    });
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn(`走势库读取失败：${err?.message || err}`);
  }
}

async function flushTrendStore() {
  const entries = Object.fromEntries(memory.trendStore.entries());
  const body = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    entries
  }, null, 2);
  await mkdir(dirname(trendStorePath), { recursive: true });
  const tmpPath = `${trendStorePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, body, 'utf8');
  await rename(tmpPath, trendStorePath);
}

function clonePayloadForTrendStore(payload, requestedDate) {
  const series = (payload.series || []).map(item => cloneTrendSeriesItem(item, requestedDate));
  return {
    updatedAt: payload.updatedAt || new Date().toISOString(),
    tradeDate: requestedDate,
    requestedDate,
    refreshAfterMs: payload.refreshAfterMs || refreshAfterMs,
    sourceStatus: payload.sourceStatus || { level: 'live', text: '真实数据', detail: '盘中查询写入走势库。' },
    timeline: payload.timeline || timelineForTradeDate(requestedDate),
    series,
    leaders: buildLeaders(series),
    breakdown: buildBreakdown(series),
    note: payload.note || '盘中用户查询写入的本地走势。'
  };
}

function cloneTrendSeriesItem(item, requestedDate) {
  const points = cloneTrendPoints(item.points, requestedDate);
  const pricePoints = cloneTrendPoints(item.pricePoints, requestedDate);
  const pointSource = normalizeStoredPointSource(item.pointSource, points);
  const pricePointSource = normalizeStoredPointSource(item.pricePointSource || 'fallback', pricePoints, true);
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    code: item.code,
    market: item.market,
    sourceName: item.sourceName,
    sourceCategory: item.sourceCategory,
    sourceCode: item.sourceCode,
    sourceId: item.sourceId,
    latest: round(item.latest),
    rank: item.rank,
    changePct: round(item.changePct),
    pointSource,
    points,
    pricePointSource,
    pricePoints,
    rawBreakdown: item.rawBreakdown ? { ...item.rawBreakdown } : undefined
  };
}

function normalizeStoredPointSource(source, points, price = false) {
  if (source === 'missing') return 'missing';
  if (source === 'minute' || source === 'daily') return source;
  if (source === 'stored') return 'stored';
  if (Array.isArray(points) && points.length > (price ? 2 : 1)) return 'stored';
  return source || (price ? 'fallback' : 'snapshot');
}

function mergeStoredTrendPayload(existing, incoming, requestedDate) {
  if (!existing?.series?.length) return incoming;
  const existingByKey = new Map(existing.series.map(item => [trendSeriesKey(item), item]));
  const mergedSeries = incoming.series.map(item => mergeStoredSeriesItem(existingByKey.get(trendSeriesKey(item)), item, requestedDate));
  existing.series.forEach(item => {
    if (!mergedSeries.some(next => trendSeriesKey(next) === trendSeriesKey(item))) mergedSeries.push(item);
  });
  return {
    ...incoming,
    series: mergedSeries,
    leaders: buildLeaders(mergedSeries),
    breakdown: buildBreakdown(mergedSeries)
  };
}

function mergeStoredSeriesItem(existing, incoming, requestedDate) {
  if (!existing) return incoming;
  const points = mergeTrendPoints(existing.points, incoming.points, requestedDate);
  const pricePoints = mergeTrendPoints(existing.pricePoints, incoming.pricePoints, requestedDate);
  const latestPoint = points.at(-1);
  const latest = Number.isFinite(Number(latestPoint?.value)) ? round(latestPoint.value) : incoming.latest;
  return {
    ...existing,
    ...incoming,
    latest,
    points,
    pointSource: bestStoredSource(existing.pointSource, incoming.pointSource, points),
    pricePoints,
    pricePointSource: bestStoredSource(existing.pricePointSource, incoming.pricePointSource, pricePoints, true),
    rawBreakdown: incoming.rawBreakdown || existing.rawBreakdown
  };
}

function trendSeriesKey(item) {
  return item?.sourceId || item?.id || `${item?.category || ''}:${item?.sourceCode || item?.code || item?.name || ''}`;
}

function mergeTrendPoints(previous, next, requestedDate) {
  const byMinute = new Map();
  [...cloneTrendPoints(previous, requestedDate), ...cloneTrendPoints(next, requestedDate)].forEach(point => {
    const minute = timeToMinute(point.time);
    if (!Number.isFinite(minute)) return;
    byMinute.set(minute, point);
  });
  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

function bestStoredSource(previous, next, points, price = false) {
  if (next === 'missing') return previous === 'missing' ? 'missing' : normalizeStoredPointSource(previous, points, price);
  if (next === 'minute' || previous === 'minute') return 'minute';
  if (next === 'daily' || previous === 'daily') return 'daily';
  return normalizeStoredPointSource(next || previous, points, price);
}

function cloneTrendPoints(points, requestedDate) {
  return (Array.isArray(points) ? points : [])
    .map(point => {
      const time = point?.time;
      const value = Number(point?.value);
      if (!time || !Number.isFinite(value)) return null;
      return {
        time,
        value: round(value),
        date: point.date || requestedDate,
        ...(Number.isFinite(Number(point.price)) ? { price: Number(point.price) } : {}),
        ...(Number.isFinite(Number(point.main)) ? { main: round(point.main) } : {}),
        ...(Number.isFinite(Number(point.superLarge)) ? { superLarge: round(point.superLarge) } : {}),
        ...(Number.isFinite(Number(point.large)) ? { large: round(point.large) } : {}),
        ...(Number.isFinite(Number(point.medium)) ? { medium: round(point.medium) } : {}),
        ...(Number.isFinite(Number(point.small)) ? { small: round(point.small) } : {})
      };
    })
    .filter(Boolean);
}

function startOverviewLoad(cacheKey, limit, scope, force = false, requestedDate = formatDate(new Date())) {
  const current = memory.loadingByScope.get(cacheKey);
  if (!force && current) return current;
  const promise = loadRealData(limit, scope, requestedDate)
    .then(result => {
      if (!result.series.length) return { result, payload: null };
      const payload = normalizePayload(result.series, result.status, requestedDate);
      if (!force) {
        applyMinutePointsToSeries(payload.series, requestedDate);
        applyPricePointsToSeries(payload.series, requestedDate);
      }
      memory.cachedByScope.set(cacheKey, { payload, cachedAt: Date.now() });
      return { result, payload };
    })
    .catch(err => ({
      result: {
        series: [],
        status: {
          level: 'error',
          text: '真实源失败',
          detail: `资金流真实接口请求失败：${err?.message || err}`
        }
      },
      payload: null
    }))
    .finally(() => {
      if (!force) memory.loadingByScope.delete(cacheKey);
    });
  if (!force) memory.loadingByScope.set(cacheKey, promise);
  return promise;
}

async function loadRealData(limit, scope, requestedDate = formatDate(new Date())) {
  const eastmoney = await loadEastmoneyData(limit, scope, requestedDate);
  if (eastmoney.series.length) return eastmoney;

  const tasks = akTasksForScope(scope);
  const settled = await Promise.allSettled(tasks.map(task => withTimeout(task, akTaskTimeoutMs)));
  const series = [];
  const errors = [];
  settled.forEach((item, index) => {
    if (item.status === 'fulfilled') {
      series.push(...item.value);
    } else {
      errors.push(`${tasks[index].name || `接口${index + 1}`}: ${item.reason?.message || item.reason}`);
    }
  });

  if (!series.length) {
    return {
      series: [],
      status: {
        level: 'error',
        text: '真实源失败',
        detail: `东方财富与 AKTools 均未返回可用资金流。当前不展示模拟走势，请检查网络或稍后刷新。`
      }
    };
  }

  return {
    series: series.slice(0, Math.max(limit, 36)),
    status: {
      level: errors.length ? 'warn' : 'live',
      text: errors.length ? '部分实时' : 'AKTools实时',
      detail: historicalDetail(requestedDate, errors.length ? `部分接口失败：${errors.slice(0, 2).join('；')}` : '数据来自本地 AKTools/AKShare 代理，页面请求已做缓存和归一化。')
    }
  };
}

async function loadEastmoneyData(limit, scope, requestedDate = formatDate(new Date())) {
  const tasks = eastmoneyTasksForScope(scope, limit);
  const settled = await Promise.allSettled(tasks.map(task => withTimeout(task, eastmoneyTaskTimeoutMs)));
  const series = [];
  const errors = [];

  settled.forEach((item, index) => {
    if (item.status === 'fulfilled') {
      series.push(...item.value);
    } else {
      errors.push(`${tasks[index].sourceName || `东方财富接口${index + 1}`}: ${item.reason?.message || item.reason}`);
    }
  });

  return {
    series,
    status: {
      level: series.length ? (errors.length ? 'warn' : 'live') : 'error',
      text: series.length ? (errors.length ? '部分实时' : '真实数据') : '真实源失败',
      detail: series.length
        ? historicalDetail(requestedDate, `数据来自东方财富公开资金流接口；资金图只展示真实资金分钟线或当前真实净额快照，不再用估算曲线冒充全天资金走势。地域、指数、个股、北向可在单独标签查看。${errors.length ? `部分分类未返回：${errors.slice(0, 2).join('；')}` : ''}`)
        : `东方财富资金流接口未返回可用数据：${errors.slice(0, 3).join('；')}`
    }
  };
}

function historicalDetail(requestedDate, detail) {
  if (!isHistoricalTradeDate(requestedDate)) return detail;
  return `${detail} 当前为 ${requestedDate} 回溯模式：资金图优先展示目标日真实资金净额，分钟线缺失时显示 15:00 日资金快照；不会用当日资金或估算曲线冒充历史走势。`;
}

function attachMarketSummary(payload, requestedDate) {
  const cacheKey = requestedDate || formatShanghaiDate(new Date());
  const cached = memory.marketSummaryCached.get(cacheKey);
  const ttl = isHistoricalTradeDate(requestedDate) ? historicalDayCacheTtlMs : marketSummaryCacheTtlMs;
  if (!cached || Date.now() - cached.cachedAt >= ttl) startMarketSummaryLoad(requestedDate);
  return { ...payload, marketSummary: cached?.summary || null, auctionSeries: [] };
}

function startMarketSummaryLoad(requestedDate) {
  const cacheKey = requestedDate || formatShanghaiDate(new Date());
  const loading = memory.marketSummaryLoading.get(cacheKey);
  if (loading) return loading;
  const promise = loadMarketSummary(requestedDate)
    .catch(() => null)
    .finally(() => memory.marketSummaryLoading.delete(cacheKey));
  memory.marketSummaryLoading.set(cacheKey, promise);
  return promise;
}

function withAuctionCategoryMode(payload, requestedDate = formatDate(new Date())) {
  const session = timelineForTradeDate(requestedDate).session;
  if (session !== 'auction') return payload;
  if ((payload?.series || []).length && payload.series.every(item => item.category === 'market')) return payload;
  const hasCategoryAuction = (payload?.series || []).some(item => (
    (item.pricePoints || []).filter(point => isAuctionMinute(timeToMinute(point.time))).length > 1
  ));
  if (!hasCategoryAuction) return payload;
  return {
    ...payload,
    sourceStatus: {
      ...(payload.sourceStatus || {}),
      level: 'warn',
      text: '大类竞价',
      kind: 'auction-price-fallback',
      detail: '09:30 前资金流排行榜尚未形成，当前展示所选大类对应板块的真实集合竞价价格走势。'
    }
  };
}

async function loadAuctionOverlaySeries(requestedDate = formatDate(new Date()), sourceSeries = []) {
  if (isHistoricalTradeDate(requestedDate)) return [];
  const timeline = timelineForTradeDate(requestedDate);
  if (timeline.session === 'preopen') return [];
  const endMinute = clamp(timeline.elapsed, 0, tradingDayMinutes);
  if (endMinute <= 0) return [];
  return (Array.isArray(sourceSeries) ? sourceSeries : [])
    .map((item, index) => auctionOverlayFromSeriesItem(item, index, requestedDate, endMinute))
    .filter(Boolean);
}

function auctionOverlayFromSeriesItem(item, index, requestedDate, endMinute) {
  const storedPoints = [...(memory.auctionCategorySnapshots.get(auctionCategorySnapshotKey(item, requestedDate))?.values() || [])];
  const openingResultPoints = openingAuctionResultPoints(item, requestedDate);
  const sourcePricePoints = (Array.isArray(item?.pricePoints) ? item.pricePoints : []).filter(point => {
    const minute = timeToMinute(point.time);
    if (!item.sourceCode && Number(item.market) !== 90) return true;
    return !Number.isFinite(minute) || minute >= continuousOpenMinute;
  });
  const pricePoints = [...sourcePricePoints, ...openingResultPoints, ...storedPoints]
    .filter(point => {
      const minute = timeToMinute(point.time);
      return Number.isFinite(minute) && minute <= endMinute && isAuctionMinute(minute);
    })
    .map(point => ({ ...point, date: point.date || requestedDate }))
    .filter((point, pointIndex, points) => points.findLastIndex(row => row.time === point.time) === pointIndex);
  if (pricePoints.length < 2) return null;
  return {
    id: item.id || `auction-overlay-${index}`,
    name: item.name || `竞价${index + 1}`,
    category: item.category || 'focus',
    changePct: Number(pricePoints.at(-1)?.value) || 0,
    pricePointSource: 'minute',
    pricePoints
  };
}

function openingAuctionResultPoints(item, requestedDate) {
  const firstRegular = (Array.isArray(item?.pricePoints) ? item.pricePoints : [])
    .map(point => ({ point, minute: timeToMinute(point.time), value: Number(point.value) }))
    .filter(row => Number.isFinite(row.minute) && row.minute >= continuousOpenMinute && Number.isFinite(row.value))
    .sort((a, b) => a.minute - b.minute)[0];
  if (!firstRegular) return [];
  return [10, continuousOpenMinute - 1].map(minute => ({
    time: minuteToTimeLabel(minute),
    value: round(firstRegular.value),
    date: requestedDate,
    source: 'opening-result'
  }));
}

function isAuctionMinute(minute) {
  return Number.isFinite(minute)
    && (minute < continuousOpenMinute || minute >= regularCloseMinute)
    && minute <= tradingDayMinutes;
}

async function loadMarketSummary(requestedDate = formatDate(new Date())) {
  const cacheKey = requestedDate || formatDate(new Date());
  const cached = memory.marketSummaryCached.get(cacheKey);
  const ttl = isHistoricalTradeDate(requestedDate) ? historicalDayCacheTtlMs : marketSummaryCacheTtlMs;
  if (cached && Date.now() - cached.cachedAt < ttl) return cached.summary;
  const [summaryResult, allAMedianResult, etfTurnoverResult, policyFlowResult, tech50HoldingResult] = await Promise.allSettled([
    isHistoricalTradeDate(requestedDate)
      ? emIndexDailyMarketSummary(requestedDate)
      : emIndexQuoteMarketSummary(requestedDate),
    loadAllAMedianSnapshot(requestedDate),
    withTimeout(loadEtfTurnoverSummary(requestedDate), etfTurnoverTimeoutMs),
    withTimeout(loadPolicyFlowProxy(requestedDate), policyFlowProxyTimeoutMs),
    withTimeout(loadNationalTeamTech50Holding({ requestedDate }), nationalTeamTech50TimeoutMs)
  ]);
  const summary = summaryResult.status === 'fulfilled'
    ? summaryResult.value
    : {
        tradeDate: requestedDate,
        source: 'unavailable',
        detail: `两市成交额获取失败：${summaryResult.reason?.message || summaryResult.reason}`
      };
  summary.allAMedian = allAMedianResult.status === 'fulfilled'
    ? allAMedianResult.value
    : unavailableAllAMedian(
        requestedDate,
        `全A中位指数暂不可用：${allAMedianResult.reason?.message || allAMedianResult.reason}`
      );
  summary.etfTurnover = etfTurnoverResult.status === 'fulfilled'
    ? etfTurnoverResult.value
    : unavailableEtfTurnover(requestedDate, etfTurnoverResult.reason);
  summary.policyFlow = policyFlowResult.status === 'fulfilled'
    ? policyFlowResult.value
    : unavailablePolicyFlowProxy(requestedDate, policyFlowResult.reason);
  summary.nationalTeamTech50 = tech50HoldingResult.status === 'fulfilled'
    ? tech50HoldingResult.value
    : buildNationalTeamTech50Holding(requestedDate, {
        syncStatus: 'fallback',
        syncDetail: `科技50ETF公告查询超时或失败，沿用内置披露：${tech50HoldingResult.reason?.message || tech50HoldingResult.reason}`
      });
  memory.marketSummaryCached.set(cacheKey, { cachedAt: Date.now(), summary });
  return summary;
}

async function emIndexQuoteMarketSummary(requestedDate) {
  const payload = await emPolicyQuoteJson('/api/qt/ulist.np/get', {
    fltt: '2',
    invt: '2',
    fields: 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18,f104,f105,f106',
    secids: marketIndexItems.map(item => item.secid).join(','),
    ut: 'b2884a393a59ad64002292a3e90d46a5'
  });
  const rows = payload?.data?.diff || [];
  const indexes = await loadMarketIndexSnapshots(requestedDate, rows);
  const summary = buildMarketSummary(
    requestedDate,
    quoteMarketRow(rows, '000001', '上证指数'),
    quoteMarketRow(rows, '399001', '深证成指'),
    '东方财富指数实时成交',
    indexes
  );
  return summary;
}

async function emIndexDailyMarketSummary(requestedDate) {
  const [sh, sz, indexes] = await Promise.all([
    emIndexDailyMarketRow('1.000001', '上证指数', requestedDate),
    emIndexDailyMarketRow('0.399001', '深证成指', requestedDate),
    loadMarketIndexSnapshots(requestedDate)
  ]);
  return buildMarketSummary(requestedDate, sh, sz, '东方财富指数日成交', indexes);
}

async function loadAllAMedianSnapshot(requestedDate) {
  const response = await fetch(allAMedianMarketDataUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': 'a-share-fund-flow/0.1'
    },
    signal: AbortSignal.timeout(allAMedianTimeoutMs)
  });
  if (!response.ok) throw new Error(`880009 行情 HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.symbol !== '880009' || !Array.isArray(payload?.series?.day)) {
    throw new Error('880009 行情结构不正确');
  }
  const rows = payload.series.day
    .map(row => ({ ...row, tradeDate: formatShanghaiDate(new Date(Number(row.timestamp))) }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.tradeDate))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const targetIndex = rows.findIndex(row => row.tradeDate === requestedDate);
  if (targetIndex < 0) throw new Error(`${requestedDate} 无 880009 行情`);
  const target = rows[targetIndex];
  const yearStart = rows.find(row => row.tradeDate.startsWith(`${requestedDate.slice(0, 4)}-`));
  const requiredValues = [target.open, target.high, target.low, target.close, target.change, target.changePct];
  if (!yearStart || !requiredValues.every(value => Number.isFinite(Number(value)))) {
    throw new Error(`${requestedDate} 的 880009 行情字段不完整`);
  }
  const yearStartPoint = Number(yearStart.open);
  if (!Number.isFinite(yearStartPoint) || yearStartPoint <= 0) {
    throw new Error(`${requestedDate.slice(0, 4)} 年起始点位无效`);
  }
  const yearPoints = rows
    .filter(row => row.tradeDate.startsWith(`${requestedDate.slice(0, 4)}-`) && row.tradeDate <= target.tradeDate)
    .filter(row => Number.isFinite(Number(row.close)) && Number.isFinite(Number(row.changePct)))
    .map(row => ({
      date: row.tradeDate,
      latest: roundIndexPoint(row.close),
      changePct: round(Number(row.changePct))
    }));
  const upCount = Number(target.upCount);
  const downCount = Number(target.downCount);
  const hasBreadth = Number.isFinite(upCount) && Number.isFinite(downCount);
  return {
    name: '全A中位指数',
    code: '880009',
    tradeDate: target.tradeDate,
    latest: roundIndexPoint(target.close),
    change: roundIndexPoint(target.change),
    changePct: round(Number(target.changePct)),
    yearToDatePct: round((Number(target.close) / yearStartPoint - 1) * 100),
    yearStartPoint: roundIndexPoint(yearStartPoint),
    yearStartDate: yearStart.tradeDate,
    yearPoints,
    open: roundIndexPoint(target.open),
    high: roundIndexPoint(target.high),
    low: roundIndexPoint(target.low),
    sampleCount: hasBreadth ? upCount + downCount : 0,
    upCount: hasBreadth ? upCount : 0,
    downCount: hasBreadth ? downCount : 0,
    flatCount: null,
    updatedAt: String(payload.generatedAt || ''),
    source: '880009.com 公开行情（mootdx）',
    sourceUrl: 'https://880009.com/',
    detail: '每日将正常交易 A 股涨跌幅排序取中位数，再逐日连乘形成累计指数点位；用于观察多数股票的累计盈亏体感，不代表所有投资者账户的实际收益，也不是可复制组合。'
  };
}

function unavailableAllAMedian(tradeDate, detail) {
  return {
    name: '全A中位指数',
    code: '880009',
    tradeDate,
    latest: null,
    change: null,
    changePct: null,
    yearToDatePct: null,
    yearStartPoint: null,
    yearStartDate: '',
    yearPoints: [],
    open: null,
    high: null,
    low: null,
    sampleCount: 0,
    upCount: 0,
    downCount: 0,
    flatCount: null,
    updatedAt: '',
    source: 'unavailable',
    sourceUrl: 'https://880009.com/',
    detail
  };
}

function quoteMarketRow(rows, code, fallbackName) {
  const row = rows.find(item => String(item.f12) === code);
  if (!row) return { name: fallbackName };
  return {
    name: row.f14 || fallbackName,
    amount: row.f6,
    volume: row.f5
  };
}

async function emIndexDailyMarketRow(secid, fallbackName, requestedDate) {
  const rows = await emIndexDailyKlineRows(secid, fallbackName, requestedDate, 1);
  const line = rows.find(row => row.date === requestedDate);
  if (!line) return { name: rows.at(-1)?.name || fallbackName };
  return {
    name: line.name || fallbackName,
    amount: line.amountRaw,
    volume: line.volumeRaw
  };
}

function buildMarketSummary(tradeDate, sh, sz, source, indexes = []) {
  const shAmount = toAmountYi(sh?.amount);
  const szAmount = toAmountYi(sz?.amount);
  const shVolume = toVolumeYiGu(sh?.volume);
  const szVolume = toVolumeYiGu(sz?.volume);
  return {
    tradeDate,
    source,
    amountUnit: '亿元',
    volumeUnit: '亿股',
    turnoverAmount: safeSum([shAmount, szAmount]),
    turnoverVolume: safeSum([shVolume, szVolume]),
    markets: [
      { name: sh?.name || '上证指数', turnoverAmount: finiteOrNull(shAmount), turnoverVolume: finiteOrNull(shVolume) },
      { name: sz?.name || '深证成指', turnoverAmount: finiteOrNull(szAmount), turnoverVolume: finiteOrNull(szVolume) }
    ],
    indexes
  };
}

async function loadMarketIndexSnapshots(requestedDate, quoteRows = []) {
  const quoteByCode = new Map((Array.isArray(quoteRows) ? quoteRows : [])
    .map(row => [String(row?.f12 || ''), row])
    .filter(([code]) => code));
  const settled = await Promise.allSettled(marketIndexItems.map(item => (
    marketIndexSnapshot(item, requestedDate, quoteByCode.get(item.code))
  )));
  return settled
    .filter(item => item.status === 'fulfilled' && item.value)
    .map(item => item.value);
}

async function marketIndexSnapshot(indexItem, requestedDate, quoteRow) {
  const quote = quoteIndexRow(quoteRow, indexItem);
  const dailyRows = await emIndexDailyKlineRows(indexItem.secid, indexItem.name, requestedDate, 80);
  const rows = isHistoricalTradeDate(requestedDate)
    ? dailyRows
    : mergeIndexQuoteRow(dailyRows, quote, requestedDate);
  const targetRow = rows.find(row => row.date === requestedDate) || rows.at(-1) || null;
  const latest = !isHistoricalTradeDate(requestedDate) && Number.isFinite(Number(quote?.latest))
    ? Number(quote.latest)
    : Number(targetRow?.close);
  const changePct = !isHistoricalTradeDate(requestedDate) && Number.isFinite(Number(quote?.changePct))
    ? Number(quote.changePct)
    : Number(targetRow?.changePct);
  const levels = buildMarketIndexLevels(rows, latest);
  return {
    key: indexItem.key,
    secid: indexItem.secid,
    code: indexItem.code,
    name: quote?.name || targetRow?.name || indexItem.name,
    tradeDate: targetRow?.date || requestedDate,
    latest: finiteOrNull(roundIndexPoint(latest)),
    changePct: finiteOrNull(round(changePct)),
    support: finiteOrNull(levels.support),
    pressure: finiteOrNull(levels.pressure),
    resistance: finiteOrNull(levels.pressure),
    supportDistancePct: finiteOrNull(levels.supportDistancePct),
    pressureDistancePct: finiteOrNull(levels.pressureDistancePct),
    resistanceDistancePct: finiteOrNull(levels.pressureDistancePct),
    supportSource: levels.supportSource || '',
    pressureSource: levels.pressureSource || '',
    resistanceSource: levels.pressureSource || '',
    levelSource: '最近60日高低点、收盘价和MA5/10/20/60',
    source: isHistoricalTradeDate(requestedDate) ? '东方财富指数日K' : '东方财富指数实时行情+日K'
  };
}

function quoteIndexRow(row, fallback) {
  if (!row) return null;
  const timestamp = Number(row.f124);
  return {
    name: decodeName(row.f14 || fallback.name),
    latest: toNumber(row.f2),
    changePct: toNumber(row.f3),
    change: toNumber(row.f4),
    volumeRaw: row.f5,
    amountRaw: row.f6,
    high: toNumber(row.f15),
    low: toNumber(row.f16),
    open: toNumber(row.f17),
    preClose: toNumber(row.f18),
    updatedAt: Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp * 1000).toISOString()
      : null
  };
}

async function emIndexDailyKlineRows(secid, fallbackName, requestedDate, limit = 80) {
  const payload = await emTrendJson('/api/qt/stock/kline/get', {
    secid,
    klt: '101',
    fqt: '1',
    end: requestedDate.replace(/-/g, ''),
    lmt: String(limit),
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
  });
  const name = payload?.data?.name || fallbackName;
  return (payload?.data?.klines || [])
    .map(line => parseIndexDailyKline(line, name))
    .filter(row => row && row.date <= requestedDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseIndexDailyKline(line, name) {
  const [date, open, close, high, low, volume, amount, amplitude, changePct, change] = String(line).split(',');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const closeValue = toNumber(close);
  if (!Number.isFinite(closeValue)) return null;
  return {
    date,
    name,
    open: toNumber(open),
    close: closeValue,
    high: toNumber(high),
    low: toNumber(low),
    volumeRaw: volume,
    amountRaw: amount,
    amplitude: toNumber(amplitude),
    changePct: toNumber(changePct),
    change: toNumber(change)
  };
}

function mergeIndexQuoteRow(rows, quote, requestedDate) {
  if (!quote || !Number.isFinite(Number(quote.latest))) return rows;
  const latest = Number(quote.latest);
  const highValues = [quote.high, quote.open, quote.preClose, latest].map(Number).filter(Number.isFinite);
  const lowValues = [quote.low, quote.open, quote.preClose, latest].map(Number).filter(Number.isFinite);
  const row = {
    date: requestedDate,
    name: quote.name,
    open: firstPositiveNumber([quote.open, quote.preClose, latest]),
    close: latest,
    high: Math.max(...highValues),
    low: Math.min(...lowValues),
    volumeRaw: quote.volumeRaw,
    amountRaw: quote.amountRaw,
    changePct: quote.changePct,
    change: quote.change
  };
  return [...rows.filter(item => item.date !== requestedDate), row]
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildMarketIndexLevels(rows, latest) {
  const current = Number(latest);
  const recent = (Array.isArray(rows) ? rows : [])
    .filter(row => Number.isFinite(Number(row.close)) && Number(row.close) > 0)
    .slice(-60);
  if (!Number.isFinite(current) || current <= 0 || !recent.length) return {};
  const candidates = [];
  const addCandidate = (value, source) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return;
    candidates.push({ value: roundIndexPoint(num), source });
  };
  recent.forEach(row => {
    addCandidate(row.low, `${row.date}低点`);
    addCandidate(row.high, `${row.date}高点`);
    addCandidate(row.close, `${row.date}收盘`);
  });
  [5, 10, 20, 60].forEach(size => {
    const closes = recent.slice(-size).map(row => Number(row.close)).filter(Number.isFinite);
    if (closes.length !== size) return;
    const average = closes.reduce((sum, value) => sum + value, 0) / size;
    addCandidate(average, `MA${size}`);
  });
  const support = candidates
    .filter(item => item.value < current)
    .sort((a, b) => b.value - a.value)[0] || null;
  const pressure = candidates
    .filter(item => item.value > current)
    .sort((a, b) => a.value - b.value)[0] || null;
  return {
    support: support ? support.value : null,
    pressure: pressure ? pressure.value : null,
    supportDistancePct: support ? round(((current - support.value) / current) * 100) : null,
    pressureDistancePct: pressure ? round(((pressure.value - current) / current) * 100) : null,
    supportSource: support?.source || '',
    pressureSource: pressure?.source || ''
  };
}

function roundIndexPoint(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : NaN;
}

async function loadEtfTurnoverSummary(requestedDate = formatDate(new Date())) {
  if (isHistoricalTradeDate(requestedDate)) throw new Error('ETF分类成交额暂只支持实时数据');
  try {
    return await loadPublishedEtfTurnoverSummary(requestedDate);
  } catch (err) {
    const fallback = await loadEstimatedEtfTurnoverSummary(requestedDate);
    fallback.detail = `${fallback.detail} 同花顺7x24快讯暂不可用，已降级为东方财富估算：${err?.message || err}`;
    return fallback;
  }
}

async function loadPublishedEtfTurnoverSummary(requestedDate = formatDate(new Date())) {
  const pages = [1, 2, 3, 4, 5, 6];
  for (const page of pages) {
    const payload = await thsNewsPushPage(page);
    const list = payload?.data?.list || [];
    const matches = list
      .map(item => publishedEtfTurnoverFromNews(item, requestedDate))
      .filter(Boolean);
    if (matches.length) return matches[0];
  }
  throw new Error('未找到同花顺ETF成交额快讯');
}

async function thsNewsPushPage(page) {
  const url = `https://news.10jqka.com.cn/tapp/news/push/stock/?${new URLSearchParams({ page: String(page) })}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: 'https://news.10jqka.com.cn/realtimenews.html',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(etfAnnouncementTimeoutMs)
  });
  if (!response.ok) throw new Error(`同花顺快讯 HTTP ${response.status}`);
  return response.json();
}

function publishedEtfTurnoverFromNews(item, requestedDate) {
  const text = `${item?.title || ''} ${item?.digest || ''}`;
  if (!text.includes('ETF两市成交额')) return null;
  const publishedAt = item?.ctime ? new Date(Number(item.ctime) * 1000) : null;
  const tradeDate = publishedAt ? formatDate(publishedAt) : requestedDate;
  if (requestedDate && tradeDate !== requestedDate) return null;
  const total = extractAnnouncementAmount(text, /ETF两市成交额报\s*([\d.]+)\s*亿元/);
  const deltaMatch = text.match(/(放量|缩量)\s*([\d.]+)\s*亿元/);
  const deltaDirection = deltaMatch?.[1] || '';
  const delta = deltaMatch ? round(Number(deltaMatch[2])) : NaN;
  const categories = etfAnnouncementCategories.map(category => ({
    key: category.key,
    name: category.name,
    source: '同花顺7x24快讯',
    amountUnit: '亿元',
    volumeUnit: '亿份',
    turnoverAmount: extractAnnouncementAmount(text, new RegExp(`${category.label}成交额\\s*([\\d.]+)\\s*亿元`)),
    turnoverVolume: null,
    itemCount: 0,
    items: []
  }));
  if (!Number.isFinite(total) && !categories.some(category => Number.isFinite(category.turnoverAmount))) return null;
  return {
    tradeDate,
    source: '同花顺7x24快讯',
    sourceUrl: item?.url || item?.shareUrl || '',
    publishedAt: publishedAt ? publishedAt.toISOString() : '',
    title: item?.title || '',
    amountUnit: '亿元',
    volumeUnit: '亿份',
    turnoverAmount: Number.isFinite(total) ? total : safeSum(categories.map(category => category.turnoverAmount)),
    turnoverVolume: null,
    deltaAmount: finiteOrNull(delta),
    deltaDirection,
    itemCount: 0,
    categories,
    detail: item?.digest || item?.title || '同花顺7x24快讯公布的ETF分类成交额。'
  };
}

function extractAnnouncementAmount(text, pattern) {
  const match = String(text || '').match(pattern);
  if (!match) return NaN;
  const value = Number(match[1]);
  return Number.isFinite(value) ? round(value) : NaN;
}

async function loadEstimatedEtfTurnoverSummary(requestedDate = formatDate(new Date())) {
  const categories = await Promise.all(etfTurnoverGroups.map(async group => {
    const rows = await emEtfTurnoverRows(group);
    return buildEtfTurnoverCategory(group, rows);
  }));
  const available = categories.filter(item => item.itemCount > 0);
  if (!available.length) throw new Error('empty ETF turnover summary');
  return {
    tradeDate: requestedDate,
    source: '东方财富ETF分类实时成交',
    amountUnit: '亿元',
    volumeUnit: '亿份',
    turnoverAmount: safeSum(available.map(item => item.turnoverAmount)),
    turnoverVolume: safeSum(available.map(item => item.turnoverVolume)),
    itemCount: available.reduce((sum, item) => sum + item.itemCount, 0),
    categories,
    detail: '按东方财富ETF分类板块实时汇总；债券型ETF使用场内ETF列表中名称含“债”的品种聚合，仅作为公布快讯不可用时的估算。'
  };
}

async function emEtfTurnoverRows(group) {
  const first = await emEtfTurnoverPage(group.fs, 1);
  const total = Number(first?.data?.total) || 0;
  const firstRows = first?.data?.diff || [];
  const pageSize = Math.max(20, Math.min(100, etfTurnoverPageSize));
  const pages = Math.ceil(total / pageSize);
  let rows = firstRows;
  const pageNumbers = [];
  for (let page = 2; page <= pages; page += 1) pageNumbers.push(page);
  for (const batch of chunk(pageNumbers, 4)) {
    const settled = await Promise.allSettled(batch.map(page => emEtfTurnoverPage(group.fs, page)));
    settled.forEach(result => {
      if (result.status === 'fulfilled') rows = rows.concat(result.value?.data?.diff || []);
    });
  }
  const seen = new Map();
  rows
    .map(etfTurnoverQuoteItem)
    .filter(Boolean)
    .filter(item => !group.match || group.match.test(item.name))
    .forEach(item => seen.set(`${item.market}.${item.code}`, item));
  return [...seen.values()];
}

async function emEtfTurnoverPage(fs, page) {
  const pageSize = Math.max(20, Math.min(100, etfTurnoverPageSize));
  return emQuoteClistJson({
    pn: String(page),
    pz: String(pageSize),
    po: '1',
    np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2',
    invt: '2',
    fid: 'f6',
    fs,
    fields: 'f12,f13,f14,f3,f5,f6'
  });
}

async function emQuoteClistJson(params) {
  let lastErr;
  for (const host of emFlowMinuteHosts) {
    try {
      return await emCurlResolvedJson(
        '/api/qt/clist/get',
        params,
        host,
        'https://quote.eastmoney.com/center/gridlist.html',
        6,
        1024 * 1024 * 6
      );
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    return await emJson('/api/qt/clist/get', params);
  } catch {
    throw lastErr || new Error('ETF turnover clist request failed');
  }
}

function etfTurnoverQuoteItem(row) {
  const code = String(row?.f12 || '');
  const name = decodeName(row?.f14 || '');
  if (!code || !name) return null;
  return {
    code,
    market: Number(row.f13),
    name,
    turnoverAmount: toAmountYi(row.f6),
    turnoverVolume: toVolumeYiGu(row.f5),
    changePct: toNumber(row.f3)
  };
}

function buildEtfTurnoverCategory(group, rows) {
  const validRows = rows.filter(item => Number.isFinite(item.turnoverAmount));
  const sortedRows = [...validRows].sort((a, b) => (b.turnoverAmount || 0) - (a.turnoverAmount || 0));
  return {
    key: group.key,
    name: group.name,
    source: group.source,
    amountUnit: '亿元',
    volumeUnit: '亿份',
    turnoverAmount: safeSum(validRows.map(item => item.turnoverAmount)),
    turnoverVolume: safeSum(validRows.map(item => item.turnoverVolume)),
    itemCount: validRows.length,
    items: sortedRows.slice(0, 5).map(item => ({
      code: item.code,
      market: item.market,
      name: item.name,
      turnoverAmount: finiteOrNull(item.turnoverAmount),
      turnoverVolume: finiteOrNull(item.turnoverVolume),
      changePct: finiteOrNull(item.changePct)
    }))
  };
}

function unavailableEtfTurnover(tradeDate, err) {
  return {
    tradeDate,
    source: 'unavailable',
    amountUnit: '亿元',
    volumeUnit: '亿份',
    turnoverAmount: null,
    turnoverVolume: null,
    itemCount: 0,
    categories: etfTurnoverGroups.map(group => ({
      key: group.key,
      name: group.name,
      source: group.source,
      amountUnit: '亿元',
      volumeUnit: '亿份',
      turnoverAmount: null,
      turnoverVolume: null,
      itemCount: 0,
      items: []
    })),
    detail: `ETF分类成交额暂不可用：${err?.message || err}`
  };
}

async function loadPolicyFlowProxy(requestedDate = formatDate(new Date())) {
  return isHistoricalTradeDate(requestedDate)
    ? emPolicyFlowDaily(requestedDate)
    : emPolicyFlowQuote(requestedDate);
}

async function emPolicyFlowQuote(requestedDate) {
  const payload = await emPolicyQuoteJson('/api/qt/ulist.np/get', {
    fltt: '2',
    invt: '2',
    fields: 'f12,f13,f14,f2,f3,f5,f6,f62,f66,f72,f78,f84',
    secids: policyFlowProxyEtfs.map(item => `${item.market}.${item.code}`).join(','),
    ut: 'b2884a393a59ad64002292a3e90d46a5'
  });
  const items = (payload?.data?.diff || []).map(policyFlowQuoteItem).filter(Boolean);
  return buildPolicyFlowProxy(requestedDate, items, '东方财富宽基ETF实时资金流');
}

async function emPolicyFlowDaily(requestedDate) {
  const itemTasks = policyFlowProxyEtfs.map(etf => (
    withTimeout(emPolicyFlowDailyItem(etf, requestedDate), Math.max(1800, policyFlowProxyTimeoutMs - 400))
  ));
  const settled = await Promise.allSettled(itemTasks);
  const items = settled
    .filter(item => item.status === 'fulfilled')
    .map(item => item.value)
    .filter(Boolean);
  return buildPolicyFlowProxy(requestedDate, items, '东方财富宽基ETF日资金流');
}

async function emPolicyFlowDailyItem(etf, requestedDate) {
  const payload = await emTrendJson('/api/qt/stock/fflow/daykline/get', {
    lmt: String(historicalDailyKlineLimit(requestedDate)),
    klt: '101',
    secid: `${etf.market}.${etf.code}`,
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
    ut: 'b2884a393a59ad64002292a3e90d46a5'
  });
  const line = (payload?.data?.klines || []).find(item => String(item).startsWith(`${requestedDate},`));
  if (!line) return null;
  return policyFlowDailyLineItem(line, payload?.data, etf);
}

async function emPolicyQuoteJson(path, params) {
  let lastErr;
  for (const host of emFlowMinuteHosts) {
    try {
      return await emCurlResolvedJson(path, params, host, 'https://data.eastmoney.com/zjlx/', 6, 1024 * 1024 * 3);
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    return await emJson(path, params);
  } catch {
    throw lastErr || new Error('policy flow quote request failed');
  }
}

async function emCurlResolvedJson(path, params, host, referer, maxTime = 6, maxBuffer = 1024 * 1024 * 4) {
  const url = `https://${host}${path}?${new URLSearchParams(params)}`;
  let lastErr;
  for (const ip of eastmoneyResolveIps) {
    try {
      const args = [
        '-s',
        '-S',
        '--max-time',
        String(maxTime),
        '--resolve',
        `${host}:443:${ip}`,
        url,
        '-H',
        `Referer: ${referer}`,
        '-H',
        'User-Agent: Mozilla/5.0'
      ];
      const { stdout } = await execFileAsync('curl', args, { maxBuffer });
      const text = stdout.trim();
      if (!text) throw new Error(`${host} curl empty response`);
      if (text.startsWith('<')) throw new Error(`${host} returned html`);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`${host} resolved request failed`);
}

function policyFlowQuoteItem(row) {
  const main = toEastmoneyYi(row?.f62);
  if (!Number.isFinite(main)) return null;
  return {
    code: String(row.f12 || ''),
    market: Number(row.f13),
    name: decodeName(row.f14 || ''),
    main,
    superLarge: toEastmoneyYi(row.f66),
    large: toEastmoneyYi(row.f72),
    medium: toEastmoneyYi(row.f78),
    small: toEastmoneyYi(row.f84),
    turnoverAmount: toAmountYi(row.f6),
    changePct: toNumber(row.f3)
  };
}

function policyFlowDailyLineItem(line, data, fallback) {
  const [date, main, small, medium, large, superLarge, , , , , , close, changePct] = String(line).split(',');
  if (!date) return null;
  const mainYi = toEastmoneyYi(main);
  if (!Number.isFinite(mainYi)) return null;
  return {
    code: String(data?.code || fallback.code),
    market: Number(data?.market ?? fallback.market),
    name: decodeName(data?.name || fallback.name),
    main: mainYi,
    superLarge: toEastmoneyYi(superLarge),
    large: toEastmoneyYi(large),
    medium: toEastmoneyYi(medium),
    small: toEastmoneyYi(small),
    close: toNumber(close),
    changePct: toNumber(changePct)
  };
}

function buildPolicyFlowProxy(tradeDate, items, source) {
  const validItems = items.filter(item => Number.isFinite(item.main));
  if (!validItems.length) throw new Error('empty policy flow proxy');
  const sortedItems = [...validItems].sort((a, b) => Math.abs(b.main) - Math.abs(a.main));
  return {
    tradeDate,
    label: '护盘观察',
    proxy: 'broad-etf-main-flow',
    source,
    amountUnit: '亿元',
    net: safeSum(validItems.map(item => item.main)),
    superLarge: safeSum(validItems.map(item => item.superLarge)),
    large: safeSum(validItems.map(item => item.large)),
    medium: safeSum(validItems.map(item => item.medium)),
    small: safeSum(validItems.map(item => item.small)),
    turnoverAmount: safeSum(validItems.map(item => item.turnoverAmount)),
    itemCount: validItems.length,
    totalCount: policyFlowProxyEtfs.length,
    positiveCount: validItems.filter(item => item.main > 0).length,
    negativeCount: validItems.filter(item => item.main < 0).length,
    detail: '宽基ETF主力净流入合计，仅用于观察护盘资金迹象；不代表确认的国家队交易主体。',
    items: sortedItems.map(item => ({
      code: item.code,
      market: item.market,
      name: item.name,
      main: finiteOrNull(item.main),
      superLarge: finiteOrNull(item.superLarge),
      large: finiteOrNull(item.large),
      medium: finiteOrNull(item.medium),
      small: finiteOrNull(item.small),
      turnoverAmount: finiteOrNull(item.turnoverAmount),
      changePct: finiteOrNull(item.changePct)
    }))
  };
}

function unavailablePolicyFlowProxy(tradeDate, err) {
  return {
    tradeDate,
    label: '护盘观察',
    proxy: 'broad-etf-main-flow',
    source: 'unavailable',
    amountUnit: '亿元',
    net: null,
    itemCount: 0,
    totalCount: policyFlowProxyEtfs.length,
    detail: `宽基ETF资金流代理暂不可用：${err?.message || err}`
  };
}

async function loadNationalTeamTech50Holding(options = {}) {
  const requestedDate = options.requestedDate || formatDate(new Date());
  const force = Boolean(options.force);
  const timeoutMs = Number(options.timeoutMs || nationalTeamTech50TimeoutMs);
  const now = Date.now();
  const cached = memory.nationalTeamTech50Cached;
  if (!force && cached && now - cached.cachedAt < nationalTeamTech50CacheTtlMs) {
    return withRequestedTech50Date(cached.holding, requestedDate);
  }

  try {
    const holding = await withTimeout(fetchLatestNationalTeamTech50Holding(requestedDate), timeoutMs);
    memory.nationalTeamTech50Cached = { cachedAt: now, holding };
    patchMarketSummaryTech50Cache(holding);
    return withRequestedTech50Date(holding, requestedDate);
  } catch (err) {
    if (cached?.holding) {
      return withRequestedTech50Date({
        ...cached.holding,
        syncStatus: 'cached-fallback',
        syncDetail: `最新公告查询失败，暂用上次同步结果：${err?.message || err}`
      }, requestedDate);
    }
    return buildNationalTeamTech50Holding(requestedDate, {
      syncStatus: 'fallback',
      syncDetail: `最新公告查询失败，暂用内置披露：${err?.message || err}`,
      updatedAt: new Date().toISOString()
    });
  }
}

function withRequestedTech50Date(holding, requestedDate) {
  return {
    ...holding,
    requestedDate
  };
}

function patchMarketSummaryTech50Cache(holding) {
  memory.marketSummaryCached.forEach(entry => {
    if (!entry?.summary) return;
    entry.summary.nationalTeamTech50 = withRequestedTech50Date(
      holding,
      entry.summary.tradeDate || entry.summary.requestedDate || formatDate(new Date())
    );
  });
}

async function fetchLatestNationalTeamTech50Holding(requestedDate) {
  const fundCode = nationalTeamTech50Holding.fundCode;
  const listUrl = `https://api.fund.eastmoney.com/f10/JJGG?${new URLSearchParams({
    fundcode: fundCode,
    pageIndex: '1',
    pageSize: '20',
    type: '3'
  })}`;
  const listPayload = await emFundAnnouncementJson(
    listUrl,
    `https://fundf10.eastmoney.com/jjgg_${fundCode}_3.html`,
    Math.max(4000, nationalTeamTech50TimeoutMs)
  );
  const rows = Array.isArray(listPayload?.Data) ? listPayload.Data : (Array.isArray(listPayload?.data) ? listPayload.data : []);
  const report = rows.find(isTech50HolderDisclosureReport);
  if (!report) throw new Error('未找到科技50ETF年报或半年报公告');

  const artCode = String(report.ID || report.id || report.ART_CODE || '').trim();
  if (!artCode) throw new Error('科技50ETF公告缺少公告编号');
  const contentUrl = `https://np-cnotice-fund.eastmoney.com/api/content/ann?${new URLSearchParams({
    client_source: 'web_fund',
    show_all: '1',
    art_code: artCode
  })}`;
  const contentPayload = await emFundAnnouncementJson(
    contentUrl,
    `https://fund.eastmoney.com/gonggao/${fundCode},${artCode}.html`,
    Math.max(8000, nationalTeamTech50TimeoutMs)
  );
  const data = contentPayload?.data || contentPayload?.Data || {};
  const rawContent = data.notice_content || data.NOTICE_CONTENT || data.content || '';
  if (!rawContent) throw new Error('科技50ETF公告正文为空');

  const reportName = String(data.notice_title || report.TITLE || report.title || nationalTeamTech50Holding.reportName).trim();
  const publishedDate = normalizeDisclosureDateValue(data.notice_date || report.PUBLISHDATEDesc || report.PUBLISHDATE);
  const parsed = parseNationalTeamTech50Disclosure(rawContent);
  return buildNationalTeamTech50Holding(requestedDate, {
    ...parsed,
    fundCode,
    fundName: report.ShortTitle || report.SHORTTITLE || nationalTeamTech50Holding.fundName,
    reportName,
    source: '东方财富基金公告',
    sourceUrl: data.attach_url || data.ATTACH_URL || nationalTeamTech50Holding.sourceUrl,
    publishedDate: publishedDate || nationalTeamTech50Holding.publishedDate,
    artCode,
    syncStatus: 'synced',
    syncDetail: '已检查最新年报/半年报公告；季报通常不披露前十大上市持有人，未纳入判断。',
    updatedAt: new Date().toISOString()
  });
}

async function emFundAnnouncementJson(url, referer, timeoutMs) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`基金公告 HTTP ${response.status}`);
  const text = (await response.text()).trim();
  if (!text) throw new Error('基金公告空响应');
  const jsonText = text.replace(/^[\w$]+\(([\s\S]*)\);?$/, '$1');
  return JSON.parse(jsonText);
}

function isTech50HolderDisclosureReport(row) {
  const title = String(row?.TITLE || row?.title || row?.notice_title || '').trim();
  return /(年度报告|中期报告|半年度报告)/.test(title) && !/摘要/.test(title);
}

function parseNationalTeamTech50Disclosure(rawContent) {
  const text = stripAnnouncementText(rawContent);
  const section = extractTech50HolderSection(text);
  const nav = extractFundShareNav(text) || nationalTeamTech50Holding.disclosureNav;
  const disclosureDate = extractReportDisclosureDate(text) || nationalTeamTech50Holding.disclosureDate;
  const threshold = extractDisclosureThreshold(section);
  const holderRows = extractNationalTeamHolderRows(section);
  const confirmedShares = holderRows.reduce((sum, row) => sum + row.shares, 0);
  const confirmedAmount = round(confirmedShares * nav / 100000000);
  const disclosureLimitShares = threshold?.shares || nationalTeamTech50Holding.disclosureLimitShares;
  const disclosureLimitPct = threshold?.pct || nationalTeamTech50Holding.disclosureLimitPct;
  const disclosureLimitAmount = round(disclosureLimitShares * nav / 100000000);
  const status = confirmedShares > 0 ? '已披露进入前十大' : '未进前十大';
  const detail = confirmedShares > 0
    ? `科技50ETF富国最新定期报告前十大上市持有人披露了常见国家队主体，按披露份额和期末基金份额净值估算持有金额。`
    : `科技50ETF富国最新定期报告前十大上市持有人未出现中央汇金、证金、汇金资管等常见国家队主体；公开可确认持有金额按0展示，低于前十大披露门槛的持仓无法确认。`;

  return {
    disclosureDate,
    amountUnit: '亿元',
    status,
    confirmedShares: round(confirmedShares),
    confirmedAmount,
    disclosureLimitShares,
    disclosureLimitPct,
    disclosureNav: nav,
    disclosureLimitAmount,
    holderRows,
    detail
  };
}

function stripAnnouncementText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTech50HolderSection(text) {
  const key = '期末上市基金前十名持有人';
  const endMarkers = [
    '期末基金管理人的从业人员持有本基金',
    '期末基金管理人的从业人员持有本开放式基金',
    '开放式基金份额变动',
    '重大事件揭示'
  ];
  let start = text.indexOf(key);
  let fallback = '';
  while (start >= 0) {
    const end = nearestMarkerIndex(text, endMarkers, start + key.length);
    const section = text.slice(start, end > start ? end : start + 4000).trim();
    if (/持有人名称/.test(section) && /持有份额/.test(section)) return section;
    if (section.length > fallback.length) fallback = section;
    start = text.indexOf(key, start + key.length);
  }
  return fallback;
}

function nearestMarkerIndex(text, markers, fromIndex) {
  const indexes = markers
    .map(marker => text.indexOf(marker, fromIndex))
    .filter(index => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function extractFundShareNav(text) {
  const match = text.match(/期末基金份额净值\s+([0-9]+(?:\.[0-9]+)?)/);
  const value = toNumber(match?.[1]);
  return Number.isFinite(value) ? value : null;
}

function extractReportDisclosureDate(text) {
  const matches = [...text.matchAll(/(20\d{2})\s*年\s*(6|06|12)\s*月\s*(30|31)\s*日/g)]
    .map(match => ({
      value: `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`,
      month: Number(match[2]),
      day: Number(match[3])
    }))
    .filter(item => (item.month === 6 && item.day === 30) || (item.month === 12 && item.day === 31));
  if (!matches.length) return '';
  return matches.map(item => item.value).sort().at(-1);
}

function extractDisclosureThreshold(section) {
  const pairs = extractSharePctPairs(section);
  return pairs[9] || pairs.at(-1) || null;
}

function extractNationalTeamHolderRows(section) {
  const rows = [];
  const seen = new Set();
  const compact = String(section || '').replace(/\s+/g, ' ');
  for (const subject of nationalTeamTech50Holding.nationalTeamSubjects) {
    let index = compact.indexOf(subject);
    while (index >= 0) {
      const slice = compact.slice(index, index + 280);
      const pair = extractSharePctPairs(slice)[0];
      if (pair) {
        const key = `${pair.shares}:${pair.pct}:${index}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({
            subject,
            shares: pair.shares,
            pct: pair.pct
          });
        }
      }
      index = compact.indexOf(subject, index + subject.length);
    }
  }
  return rows;
}

function extractSharePctPairs(value) {
  const pairs = [];
  const compact = String(value || '').replace(/\s+/g, ' ');
  const regex = /([1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?|[1-9]\d{5,}(?:\.\d+)?)\s+([0-9]{1,2}(?:\.\d+)?)/g;
  let match;
  while ((match = regex.exec(compact))) {
    const shares = toNumber(match[1]);
    const pct = toNumber(match[2]);
    if (Number.isFinite(shares) && shares >= 1000 && Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      pairs.push({ shares, pct });
    }
  }
  return pairs;
}

function normalizeDisclosureDateValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
}

function buildNationalTeamTech50Holding(requestedDate, overrides = {}) {
  const holding = {
    ...nationalTeamTech50Holding,
    ...overrides
  };
  const disclosureLimitAmount = Number.isFinite(Number(holding.disclosureLimitAmount))
    ? Number(holding.disclosureLimitAmount)
    : round(
      Number(holding.disclosureLimitShares || 0) * Number(holding.disclosureNav || 0) / 100000000
    );
  const confirmedShares = Number.isFinite(Number(holding.confirmedShares)) ? Number(holding.confirmedShares) : 0;
  const confirmedAmount = Number.isFinite(Number(holding.confirmedAmount))
    ? Number(holding.confirmedAmount)
    : round(confirmedShares * Number(holding.disclosureNav || 0) / 100000000);
  return {
    ...holding,
    requestedDate,
    confirmedShares,
    confirmedAmount,
    disclosureLimitAmount
  };
}

function safeSum(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? round(nums.reduce((sum, value) => sum + value, 0)) : null;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function buildAuctionFallbackPayload(scope, sourceStatus, requestedDate = formatDate(new Date())) {
  if (isHistoricalTradeDate(requestedDate)) return null;
  if (scope !== 'market') return null;
  const timeline = timelineForTradeDate(requestedDate);
  if (timeline.session !== 'auction') return null;
  const series = await fetchAuctionIndexSeries(requestedDate, timeline.elapsed);
  if (!series.length) return null;
  return normalizePayload(series, {
    ...(sourceStatus || {}),
    level: 'warn',
    text: '竞价走势',
    kind: 'auction-price-fallback',
    detail: '09:30 前资金流排行榜通常未返回，当前展示东方财富真实指数集合竞价分时；资金图不会用竞价成交额冒充净流入。'
  }, requestedDate);
}

async function buildMarketPriceFallbackPayload(scope, sourceStatus, requestedDate = formatDate(new Date())) {
  if (isHistoricalTradeDate(requestedDate)) return null;
  if (scope !== 'market') return null;
  const timeline = timelineForTradeDate(requestedDate);
  if (timeline.session === 'auction' || timeline.session === 'preopen') return null;
  const series = await fetchIndexPriceSeries(requestedDate);
  if (!series.length) return null;
  return normalizePayload(series, {
    ...(sourceStatus || {}),
    level: 'warn',
    text: timeline.session === 'auction' ? '竞价走势' : '指数分时',
    kind: timeline.session === 'auction' ? 'auction-price-fallback' : 'market-price-fallback',
    detail: timeline.session === 'auction'
      ? '09:30 前资金流排行榜通常未返回，当前展示东方财富真实指数集合竞价分时；资金图不会用竞价成交额冒充净流入。'
      : '市场资金流接口暂未返回，当前展示东方财富真实指数价格分时；资金图不会用涨跌幅冒充净流入。'
  }, requestedDate);
}

function fallbackIndexItems() {
  return [
    { secid: '1.000001', name: '上证指数' },
    { secid: '0.399001', name: '深证成指' },
    { secid: '0.399006', name: '创业板指' },
    { secid: '1.000688', name: '科创50' }
  ];
}

async function fetchAuctionIndexSeries(requestedDate = formatDate(new Date()), endMinute = continuousOpenMinute) {
  const indexes = fallbackIndexItems();
  const settled = await Promise.allSettled(indexes.map((item, index) => auctionIndexSeries(item, index + 1, requestedDate, endMinute)));
  return settled
    .filter(item => item.status === 'fulfilled' && item.value)
    .map(item => item.value);
}

async function fetchIndexPriceSeries(requestedDate = formatDate(new Date())) {
  const indexes = fallbackIndexItems();
  const settled = await Promise.allSettled(indexes.map((item, index) => indexPriceSeries(item, index + 1, requestedDate)));
  return settled
    .filter(item => item.status === 'fulfilled' && item.value)
    .map(item => item.value);
}

async function auctionIndexSeries(indexItem, rank, requestedDate, endMinute = continuousOpenMinute) {
  const [marketText, codeText] = String(indexItem.secid).split('.');
  const market = Number(marketText);
  const rawPricePoints = await emAuctionTrendPoints({ market, code: codeText }, requestedDate);
  const cappedEndMinute = clamp(Number(endMinute) || 0, 0, continuousOpenMinute);
  const pricePoints = rawPricePoints.filter(point => {
    const minute = timeToMinute(point.time);
    return Number.isFinite(minute) && minute <= cappedEndMinute;
  });
  const lastPoint = pricePoints.at(-1);
  const lastMinute = timeToMinute(lastPoint?.time);
  if (lastPoint && Number.isFinite(lastMinute) && lastMinute < cappedEndMinute) {
    pricePoints.push({
      ...lastPoint,
      time: minuteToTimeLabel(cappedEndMinute)
    });
  }
  if (!pricePoints.length) return null;
  const changePct = Number(pricePoints.at(-1)?.value) || 0;
  return {
    id: `auction-${indexItem.secid}`,
    name: indexItem.name,
    category: 'market',
    code: codeText,
    market,
    latest: 0,
    rank,
    changePct,
    points: [],
    pointSource: 'missing',
    pricePoints,
    pricePointSource: 'minute',
    rawBreakdown: { main: 0 }
  };
}

async function indexPriceSeries(indexItem, rank, requestedDate) {
  const [marketText, codeText] = String(indexItem.secid).split('.');
  const market = Number(marketText);
  const pricePoints = await emPriceTrendPoints({ market, code: codeText }, false, requestedDate);
  if (!pricePoints.length) return null;
  const changePct = Number(pricePoints.at(-1)?.value) || 0;
  return {
    id: `market-price-${indexItem.secid}`,
    name: indexItem.name,
    category: 'market',
    code: codeText,
    market,
    latest: 0,
    rank,
    changePct,
    points: [],
    pointSource: 'missing',
    pricePoints,
    pricePointSource: 'minute',
    rawBreakdown: { main: 0 }
  };
}

function eastmoneyTasksForScope(scope, limit) {
  if (scope === 'all') {
    return [
      emRankList('m:90+t:2', 'industry', rankFetchSize.industry, '行业资金流'),
      emRankList('m:90+t:3', 'concept', rankFetchSize.concept, '概念资金流')
    ];
  }
  if (scope === 'industry') return [emRankList('m:90+t:2', 'industry', limit, '行业资金流')];
  if (scope === 'concept') return [emRankList('m:90+t:3', 'concept', limit, '概念资金流')];
  if (scope === 'region') return [emRankList('m:90+t:1', 'region', limit, '地域资金流')];
  if (scope === 'stock') return [emRankList('m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23', 'stock', limit, '个股主力资金')];
  if (scope === 'market') {
    return [
      emIndexFlow('1.000001', '上证指数'),
      emIndexFlow('0.399001', '深证成指'),
      emIndexFlow('0.399006', '创业板指')
    ];
  }
  if (scope === 'northbound') return [emNorthbound()];
  return [];
}

function akTasksForScope(scope) {
  if (scope === 'all') {
    return [
      akCall('stock_sector_fund_flow_rank', { indicator: '今日', sector_type: '行业资金流' }, 'industry'),
      akCall('stock_sector_fund_flow_rank', { indicator: '今日', sector_type: '概念资金流' }, 'concept')
    ];
  }
  if (scope === 'industry') return [akCall('stock_sector_fund_flow_rank', { indicator: '今日', sector_type: '行业资金流' }, 'industry')];
  if (scope === 'concept') return [akCall('stock_sector_fund_flow_rank', { indicator: '今日', sector_type: '概念资金流' }, 'concept')];
  if (scope === 'region') return [akCall('stock_sector_fund_flow_rank', { indicator: '今日', sector_type: '地域资金流' }, 'region')];
  if (scope === 'stock') return [akCall('stock_main_fund_flow', { symbol: '全部股票' }, 'stock')];
  if (scope === 'market') return [akCall('stock_market_fund_flow', {}, 'market')];
  if (scope === 'northbound') return [akCall('stock_hsgt_fund_flow_summary_em', {}, 'northbound')];
  return [];
}

function emRankList(fs, category, limit, sourceName) {
  const baseParams = {
    fields: 'f1,f2,f3,f4,f12,f13,f14,f128,f62,f66,f69,f72,f75,f78,f81,f84,f87',
    fid: 'f62',
    fs,
    ut: 'b2884a393a59ad64002292a3e90d46a5'
  };
  const targetSize = Math.max(limit, rankFetchSize[category] || 30);
  const pageTimeout = Math.min(eastmoneyTaskTimeoutMs, rankFetchTimeoutMs + 300);
  const promise = Promise.allSettled([
    withTimeout(emRankPages(baseParams, targetSize, '1'), pageTimeout),
    withTimeout(emRankPages(baseParams, targetSize, '0'), pageTimeout)
  ]).then(results => {
    const rows = mergeRows(results.filter(item => item.status === 'fulfilled').flatMap(item => item.value));
    if (!rows.length) throw new Error('empty diff');
    const mapped = rows
      .filter(row => category !== 'stock' || isAStockRow(row))
      .map((row, index) => eastmoneyRowToSeries(row, category, sourceName, index))
      .filter(Boolean);
    return mapped;
  });
  promise.sourceName = sourceName;
  return promise;
}

async function emRankPages(baseParams, targetSize, po) {
  const pageSize = clamp(rankPageSize, 20, 100);
  const pageCount = Math.ceil(targetSize / pageSize);
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const settled = await Promise.allSettled(pageNumbers.map(pn => (
    emH5Json('/dc/ZJLX/getZDYLBData', {
      ...baseParams,
      po,
      pn: String(pn),
      pz: String(pageSize)
    })
  )));
  const rows = settled
    .filter(item => item.status === 'fulfilled')
    .flatMap(item => item.value?.data?.diff || []);
  if (!rows.length) {
    const err = settled.find(item => item.status === 'rejected')?.reason;
    throw err || new Error('empty diff');
  }
  return rows.slice(0, targetSize);
}

function mergeRows(rows) {
  const byKey = new Map();
  rows.forEach(row => {
    const key = `${row?.f13 || ''}-${row?.f12 || ''}-${row?.f14 || ''}`;
    if (!byKey.has(key)) byKey.set(key, row);
  });
  return [...byKey.values()];
}

function emClist(fs, category, limit, sourceName) {
  const fields = 'f3,f12,f14,f62,f66,f69,f72,f75,f78,f81,f84,f87';
  const params = {
    pn: '1',
    pz: String(Math.max(limit, 30)),
    po: '1',
    np: '1',
    ut: 'b2884a393a59ad64002292a3e90d46a5',
    fltt: '2',
    invt: '2',
    fid: 'f62',
    fs,
    fields
  };
  const promise = emJson('/api/qt/clist/get', params).then(payload => {
    const rows = payload?.data?.diff || [];
    if (!rows.length) throw new Error('empty diff');
    return rows.map((row, index) => eastmoneyRowToSeries(row, category, sourceName, index)).filter(Boolean);
  });
  promise.sourceName = sourceName;
  return promise;
}

async function emH5Json(path, params) {
  const url = `https://emdatah5.eastmoney.com${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json,text/plain,*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'referer': 'https://emdatah5.eastmoney.com/dc/zjlx/index',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(rankFetchTimeoutMs)
  });
  if (!response.ok) throw new Error(`emdatah5 HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error('emdatah5 empty response');
  return JSON.parse(text);
}

function emIndexFlow(secid, name) {
  const [marketText, codeText] = String(secid).split('.');
  const params = {
    lmt: '1',
    klt: '101',
    secid,
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  };
  const promise = emJson('/api/qt/stock/fflow/daykline/get', params, 'push2his.eastmoney.com').then(payload => {
    const line = payload?.data?.klines?.[0];
    if (!line) throw new Error('empty kline');
    const [date, main, small, medium, large, superLarge, mainPct] = String(line).split(',');
    const latest = toYi(main);
    return [{
      id: `market-${secid}`,
      name: payload?.data?.name || name,
      category: 'market',
      code: codeText || '',
      market: Number(marketText),
      latest,
      rank: 1,
      changePct: toNumber(mainPct) || 0,
      points: pushSnapshot(`market-${secid}`, latest),
      rawBreakdown: {
        main: latest,
        superLarge: toYi(superLarge),
        large: toYi(large),
        medium: toYi(medium),
        small: toYi(small),
        date
      }
    }];
  });
  promise.sourceName = `${name}资金流`;
  return promise;
}

function emNorthbound() {
  const params = {
    fields1: 'f1,f2,f3,f4',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  };
  const promise = emJson('/api/qt/kamt/get', params).then(payload => {
    const data = payload?.data || {};
    const hk2sh = toMarketYi(data.hk2sh?.dayNetAmtIn);
    const hk2sz = toMarketYi(data.hk2sz?.dayNetAmtIn);
    const rows = [
      ['北向合计', Number.isFinite(hk2sh) && Number.isFinite(hk2sz) ? hk2sh + hk2sz : undefined, true],
      ['沪股通', data.hk2sh?.dayNetAmtIn],
      ['深股通', data.hk2sz?.dayNetAmtIn]
    ];
    return rows
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name, value, alreadyYi], index) => {
        const latest = alreadyYi ? round(value) : toMarketYi(value);
        return {
          id: `northbound-${index}`,
          name,
          category: 'northbound',
          latest,
          rank: index + 1,
          changePct: 0,
          points: pushSnapshot(`northbound-${index}`, latest)
        };
      });
  });
  promise.sourceName = '沪深港通资金流';
  return promise;
}

async function emJson(path, params, forcedHost) {
  const hosts = forcedHost ? [forcedHost] : emHosts.slice(0, 4);
  let lastErr;
  for (const host of hosts) {
    const url = `https://${host}${path}?${new URLSearchParams(params)}`;
    try {
      const response = await fetch(url, {
        headers: {
          'accept': 'application/json,text/plain,*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'referer': 'https://data.eastmoney.com/zjlx/',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(emJsonTimeoutMs)
      });
      if (!response.ok) throw new Error(`${host} HTTP ${response.status}`);
      const text = await response.text();
      if (!text.trim()) throw new Error(`${host} empty response`);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`${path} failed`);
}

function eastmoneyRowToSeries(row, category, sourceName, index) {
  const latest = toEastmoneyYi(row.f62);
  if (!Number.isFinite(latest)) return null;
  const id = `${category}-${row.f12 || index}`;
  const code = String(row.f12 || '');
  const market = Number(row.f13);
  return {
    id,
    name: decodeName(row.f14 || `${sourceName}${index + 1}`),
    category,
    code,
    market,
    latest,
    rank: index + 1,
    changePct: toNumber(row.f3) || 0,
    points: pushSnapshot(id, latest),
    pointSource: 'snapshot',
    rawBreakdown: {
      main: latest,
      superLarge: toEastmoneyYi(row.f66),
      large: toEastmoneyYi(row.f72),
      medium: toEastmoneyYi(row.f78),
      small: toEastmoneyYi(row.f84)
    }
  };
}

function startPrefetchLoop() {
  if (!prefetchIntervalMs || prefetchIntervalMs < 5000) return;
  setInterval(() => {
    const timeline = tradingTimeline();
    if (!timeline.isTradingTime) return;
    const today = formatShanghaiDate(new Date());
    startOverviewLoad(scopedCacheKey('all', today), 60, 'all', true, today)
      .then(({ payload }) => {
        if (!payload?.series?.length) return;
        scheduleMinuteHydration(payload.series, true, today);
        schedulePriceHydration(payload.series, true, today);
      })
      .catch(() => {});
  }, prefetchIntervalMs).unref?.();
}

function scheduleMinuteHydration(series, force = false, requestedDate = formatDate(new Date())) {
  if (memory.minuteHydrating) return;
  memory.minuteHydrating = true;
  setTimeout(async () => {
    try {
      await hydrateMinutePoints(series, force, requestedDate);
      memory.cachedByScope.forEach(entry => applyMinutePointsToSeries(entry.payload.series, entry.payload.requestedDate || requestedDate));
    } finally {
      memory.minuteHydrating = false;
    }
  }, 0);
}

function schedulePriceHydration(series, force = false, requestedDate = formatDate(new Date())) {
  if (memory.priceHydrating) return;
  memory.priceHydrating = true;
  setTimeout(async () => {
    try {
      await hydratePricePoints(series, force, requestedDate);
      memory.cachedByScope.forEach(entry => applyPricePointsToSeries(entry.payload.series, entry.payload.requestedDate || requestedDate));
    } finally {
      memory.priceHydrating = false;
    }
  }, 0);
}

async function hydrateMinutePoints(series, force = false, requestedDate = formatDate(new Date())) {
  const focusCandidates = selectMinuteCandidates(series);
  const focusIds = new Set(focusCandidates.map(item => item.id));
  const extraCount = Math.max(0, minuteFetchLimit - focusCandidates.length);
  const topCandidates = series
    .filter(item => item.code && item.market === 90 && !focusIds.has(item.id))
    .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
    .slice(0, extraCount);
  const candidates = [...focusCandidates, ...topCandidates];
  const batches = chunk(candidates, 24);
  for (const batch of batches) {
    await Promise.all(batch.map(async item => {
      try {
        const points = await emFundFlowMinutePoints(item, force, requestedDate);
        if (points.length) {
          item.points = points;
          item.pointSource = 'minute';
        }
      } catch {
        // The snapshot path remains available when a board minute endpoint is empty.
      }
    }));
  }
}

function applyMinutePointsToSeries(series, requestedDate = formatDate(new Date())) {
  series.forEach(item => {
    const code = item.sourceCode || item.code;
    const market = item.sourceCode ? 90 : item.market;
    const cached = market === 90 && code ? memory.minuteCached.get(`${requestedDate}:${market}.${code}`) : null;
    if (cached?.points?.length) {
      item.points = cached.points;
      item.pointSource = 'minute';
    }
  });
}

async function hydratePricePoints(series, force = false, requestedDate = formatDate(new Date())) {
  const candidates = selectPriceCandidates(series);
  const batches = chunk(candidates, 6);
  for (const batch of batches) {
    await Promise.all(batch.map(async item => {
      try {
        const points = await emPriceTrendPoints(item, force, requestedDate);
        if (points.length) {
          item.pricePoints = points;
          item.pricePointSource = points.length > 10 ? 'minute' : 'fallback';
          item.changePct = points.at(-1)?.value ?? item.changePct;
        }
      } catch {
        // Price trend is optional; the current changePct fallback remains available.
      }
    }));
  }
}

function applyPricePointsToSeries(series, requestedDate = formatDate(new Date())) {
  series.forEach(item => {
    const code = item.sourceCode || item.code;
    const market = item.sourceCode ? 90 : item.market;
    const cached = code ? memory.priceCached.get(`${requestedDate}:${market}.${code}`) : null;
    if (cached?.points?.length) {
      item.pricePoints = cached.points;
      item.pricePointSource = cached.source || (cached.points.length > 10 ? 'minute' : 'fallback');
      item.changePct = cached.points.at(-1)?.value ?? item.changePct;
    }
  });
}

function selectPriceCandidates(series) {
  const byId = new Map();
  defaultFocusGroups.forEach(group => {
    const selected = selectFocusRepresentative(group, series);
    if (selected?.code && selected.market === 90) byId.set(selected.id, selected);
  });
  const extraCount = Math.max(0, priceFetchLimit - byId.size);
  series
    .filter(item => item.code && item.market === 90 && !byId.has(item.id))
    .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
    .slice(0, extraCount)
    .forEach(item => byId.set(item.id, item));
  return [...byId.values()].slice(0, priceFetchLimit);
}

function selectMinuteCandidates(series) {
  const byId = new Map();
  defaultFocusGroups.forEach(group => {
    const selected = selectFocusRepresentative(group, series);
    if (selected?.code && selected.market === 90) byId.set(selected.id, selected);
    findFocusMatches(group, series)
      .filter(item => item.code && item.market === 90 && item.id !== selected?.id)
      .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
      .slice(0, Math.max(0, minuteFetchPerGroup - 1))
      .forEach(item => byId.set(item.id, item));
  });
  return [...byId.values()]
    .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
    .slice(0, minuteFetchLimit);
}

async function emFundFlowMinutePoints(item, force = false, requestedDate = formatDate(new Date())) {
  const cacheKey = securityCacheKey(item, requestedDate);
  const cached = memory.minuteCached.get(cacheKey);
  const now = Date.now();
  if (!force && cached && now - cached.cachedAt < minuteCacheTtlMs) return cached.points;
  const params = {
    secid: `${item.market}.${item.code}`,
    klt: '1',
    lmt: '0',
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  };
  const rows = await emFundFlowMinuteRows(params);
  const endMinute = timelineForTradeDate(requestedDate).elapsed;
  const parsed = rows
    .map(line => minuteKlineToPoint(line))
    .filter(Boolean);
  const points = parsed
    .filter(point => point.date === requestedDate)
    .map(point => ({ ...point, minute: timeToMinute(point.time) }))
    .filter(point => Number.isFinite(point.minute) && point.minute <= endMinute)
    .map(({ minute, ...point }) => point);
  if (points.length) {
    memory.minuteCached.set(cacheKey, { cachedAt: now, points });
  }
  return points;
}

async function emFundFlowDailySnapshot(item, force = false, requestedDate = formatDate(new Date()), historyLimit = 1) {
  const limit = Math.trunc(clamp(
    Math.max(historicalDailyKlineLimit(requestedDate), Number(historyLimit) || 1),
    10,
    360
  ));
  const cacheKey = `${securityCacheKey(item, requestedDate)}:lmt:${limit}`;
  const cached = memory.flowDailyCached.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < historicalDayCacheTtlMs) return cached.snapshot;
  const params = {
    secid: `${item.market}.${item.code}`,
    lmt: String(limit),
    klt: '101',
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  };
  const payload = await emFundFlowMinuteJson('/api/qt/stock/fflow/daykline/get', params, 'push2his.eastmoney.com');
  const history = (payload?.data?.klines || [])
    .map(dayFlowLineToSnapshot)
    .filter(Boolean)
    .filter(row => row.date <= requestedDate)
    .slice(-limit);
  const snapshot = history.find(row => row.date === requestedDate) || (historyLimit > 1 ? {
    date: requestedDate,
    latest: null,
    changePct: 0,
    points: [],
    rawBreakdown: {}
  } : null);
  if (snapshot) {
    snapshot.history = history.slice(-historyLimit).map(row => ({
      date: row.date,
      main: row.latest,
      superLarge: row.rawBreakdown.superLarge,
      large: row.rawBreakdown.large,
      medium: row.rawBreakdown.medium,
      small: row.rawBreakdown.small
    }));
  }
  if (snapshot) memory.flowDailyCached.set(cacheKey, { cachedAt: now, snapshot });
  return snapshot;
}

function dayFlowLineToSnapshot(line) {
  if (!line) return null;
  const [date, main, small, medium, large, superLarge, mainPct, smallPct, mediumPct, largePct, superLargePct, close, changePct] = String(line).split(',');
  const latest = toEastmoneyYi(main);
  if (!Number.isFinite(latest)) return null;
  return {
    date,
    latest,
    changePct: toNumber(changePct) || 0,
    points: [{ time: '15:00', value: latest, date }],
    rawBreakdown: {
      main: latest,
      superLarge: toEastmoneyYi(superLarge),
      large: toEastmoneyYi(large),
      medium: toEastmoneyYi(medium),
      small: toEastmoneyYi(small),
      mainPct: toNumber(mainPct) || 0,
      superLargePct: toNumber(superLargePct) || 0,
      largePct: toNumber(largePct) || 0,
      mediumPct: toNumber(mediumPct) || 0,
      smallPct: toNumber(smallPct) || 0,
      close: toNumber(close) || 0,
      date
    }
  };
}

function historicalDailyKlineLimit(requestedDate) {
  const minLimit = Math.max(10, historyTrendDays * 2);
  const todayMs = tradeDateUtcMs(formatDate(new Date()));
  const requestedMs = tradeDateUtcMs(requestedDate);
  if (!Number.isFinite(todayMs) || !Number.isFinite(requestedMs)) return minLimit;
  const calendarDays = Math.max(0, Math.ceil((todayMs - requestedMs) / 86400000));
  return Math.trunc(clamp(Math.ceil(calendarDays * 1.8) + 12, minLimit, 360));
}

function tradeDateUtcMs(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

async function emFundFlowMinuteRows(params) {
  let lastErr;
  for (const host of emFlowMinuteHosts) {
    try {
      const payload = await emFundFlowMinuteJson('/api/qt/stock/fflow/kline/get', params, host);
      const rows = payload?.data?.klines || [];
      if (rows.length) return rows;
      lastErr = new Error(`${host} empty klines`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('empty fund flow minute klines');
}

async function emFundFlowMinuteJson(path, params, host) {
  const url = `https://${host}${path}?${new URLSearchParams(params)}`;
  let lastErr;
  for (const ip of eastmoneyResolveIps) {
    try {
      const args = [
        '-s',
        '-S',
        '--max-time',
        '6',
        '--resolve',
        `${host}:443:${ip}`,
        url,
        '-H',
        'Referer: https://data.eastmoney.com/zjlx/',
        '-H',
        'User-Agent: Mozilla/5.0'
      ];
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1024 * 1024 * 6 });
      if (!stdout.trim()) throw new Error(`${host} curl empty response`);
      return JSON.parse(stdout);
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    return await emJson(path, params, host);
  } catch {
    throw lastErr || new Error(`${host} fund flow minute request failed`);
  }
}

async function emPriceTrendPoints(item, force = false, requestedDate = formatDate(new Date())) {
  const cacheKey = securityCacheKey(item, requestedDate);
  const cached = memory.priceCached.get(cacheKey);
  const now = Date.now();
  if (!force && cached && now - cached.cachedAt < minuteCacheTtlMs) return cached.points;
  const historical = isHistoricalTradeDate(requestedDate);
  const auctionPromise = Promise.resolve([]);
  const regularPromise = emRegularPriceTrendPoints(item, historical, requestedDate);
  const [auctionPoints, regularPoints] = await Promise.all([auctionPromise, regularPromise]);
  const points = mergePriceTrendPoints(auctionPoints, regularPoints);
  if (points.length) memory.priceCached.set(cacheKey, { cachedAt: now, points, source: points.length > 10 ? 'minute' : 'fallback' });
  return points;
}

async function emRegularPriceTrendPoints(item, historical, requestedDate) {
  const params = {
    secid: `${item.market}.${item.code}`,
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    iscr: '0',
    iscca: '0',
    ndays: historical ? String(clamp(historyTrendDays, 1, 5)) : '1',
    ut: 'fa5fd1943c7b386f172d6893dbfba10b'
  };
  try {
    const payload = await emTrendJson('/api/qt/stock/trends2/get', params);
    const points = parseEastmoneyTrendPayload(payload, requestedDate);
    if (points.length) return points;
  } catch {
    // Fall through to AKTools board minute data when Eastmoney trends are empty.
  }
  return akBoardPriceTrendPoints(item, requestedDate);
}

async function emSecurityIntradayPoints(item, requestedDate = formatDate(new Date())) {
  const params = {
    secid: `${item.market}.${item.code}`,
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    iscr: '0',
    iscca: '0',
    ndays: '1',
    ut: 'fa5fd1943c7b386f172d6893dbfba10b'
  };
  try {
    const payload = await emTrendJson('/api/qt/stock/trends2/get', params);
    const preClose = toNumber(payload?.data?.preClose || payload?.data?.prePrice);
    const endMinute = timelineForTradeDate(requestedDate).elapsed;
    const points = (payload?.data?.trends || [])
      .map(line => securityIntradayRow(line, preClose))
      .filter(Boolean)
      .filter(point => point.date === requestedDate)
      .map(point => ({ ...point, minute: timeToMinute(point.time) }))
      .filter(point => Number.isFinite(point.minute) && point.minute <= endMinute)
      .map(({ minute, ...point }) => point);
    if (points.length) return points;
  } catch {
    // 退回现有分时价格链路，保证行情可用性。
  }
  return emPriceTrendPoints(item, true, requestedDate);
}

function securityIntradayRow(line, preClose) {
  const cells = String(line).split(',');
  const match = cells[0]?.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})$/);
  const price = firstPositiveNumber([cells[2], cells[1], cells[7]]);
  if (!match || !Number.isFinite(price)) return null;
  return {
    date: match[1],
    time: match[2],
    open: finiteOrNull(toNumber(cells[1])),
    price,
    high: finiteOrNull(toNumber(cells[3])),
    low: finiteOrNull(toNumber(cells[4])),
    volume: finiteOrNull(toNumber(cells[5])),
    amount: finiteOrNull(toNumber(cells[6])),
    average: finiteOrNull(toNumber(cells[7])),
    value: Number.isFinite(preClose) && preClose > 0 ? round((price - preClose) / preClose * 100) : null
  };
}

async function emAuctionTrendPoints(item, requestedDate = formatDate(new Date())) {
  if (!item?.code || !Number.isFinite(Number(item.market))) return [];
  const params = {
    secid: `${item.market}.${item.code}`,
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f19',
    fields2: 'f51,f52',
    ut: 'c92c50e6b0fab2c17cd5e276e9a79c42'
  };
  const payload = await emJson('/api/qt/stock/auction/trend/get', params, 'push2dycalc.eastmoney.com');
  return parseAuctionTrendPayload(payload, requestedDate);
}

function parseAuctionTrendPayload(payload, requestedDate = formatDate(new Date())) {
  const rows = payload?.data?.trends || [];
  const preClose = toNumber(payload?.data?.preClose);
  if (!Number.isFinite(preClose) || preClose <= 0 || !Array.isArray(rows)) return [];
  const byMinute = new Map();
  rows.forEach(line => {
    const point = auctionTrendRow(line, preClose, requestedDate);
    if (!point) return;
    const minute = timeToMinute(point.time);
    if (!isAuctionMinute(minute)) return;
    byMinute.set(minute, {
      ...point,
      time: minuteToTimeLabel(minute)
    });
  });
  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

function auctionTrendRow(line, preClose, requestedDate) {
  const [timeRaw, priceRaw] = String(line).split(',');
  const match = String(timeRaw || '').match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
  const rawPrice = toNumber(priceRaw);
  const price = Number.isFinite(rawPrice) && rawPrice > preClose * 10 ? rawPrice / 1000 : rawPrice;
  if (!match || !Number.isFinite(price) || price <= 0) return null;
  return {
    time: match[1],
    value: round(((price - preClose) / preClose) * 100),
    price,
    date: requestedDate
  };
}

function mergePriceTrendPoints(auctionPoints, regularPoints) {
  const byMinute = new Map();
  [...(auctionPoints || []), ...(regularPoints || [])].forEach(point => {
    const minute = timeToMinute(point?.time);
    if (!Number.isFinite(minute)) return;
    byMinute.set(minute, {
      time: minuteToTimeLabel(minute),
      value: Number(point.value) || 0,
      price: Number(point.price) || 0,
      date: point.date
    });
  });
  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

function parseEastmoneyTrendPayload(payload, requestedDate = formatDate(new Date())) {
  const rows = payload?.data?.trends || [];
  const payloadPreClose = toNumber(payload?.data?.preClose || payload?.data?.prePrice);
  const endMinute = tradingTimeline().elapsed;
  const parsed = rows
    .map(line => priceTrendRow(line))
    .filter(Boolean);
  const targetRows = parsed
    .filter(point => point.date === requestedDate)
    .map(point => ({ ...point, minute: timeToMinute(point.time) }))
    .filter(point => Number.isFinite(point.minute) && point.minute <= (isHistoricalTradeDate(requestedDate) ? tradingDayMinutes : endMinute));
  if (!targetRows.length) return [];
  const preClose = preCloseForTrendDate(parsed, requestedDate, payloadPreClose);
  if (!Number.isFinite(preClose) || !preClose) return [];
  return targetRows.map(point => ({
    time: point.time,
    value: round(((point.price - preClose) / preClose) * 100),
    price: point.price,
    date: point.date
  }));
}

async function akBoardPriceTrendPoints(item, requestedDate = formatDate(new Date())) {
  const fn = item.category === 'industry'
    ? 'stock_board_industry_hist_min_em'
    : item.category === 'concept'
      ? 'stock_board_concept_hist_min_em'
      : null;
  if (!fn || !item.name) return [];
  try {
    const payload = await callAktools(fn, { symbol: item.name, period: '1' }, 8000);
    return parseAkBoardPricePayload(payload, item.changePct, requestedDate);
  } catch {
    return [];
  }
}

function parseAkBoardPricePayload(payload, latestPct, requestedDate = formatDate(new Date())) {
  const rows = extractRows(payload);
  if (!rows.length) return [];
  const parsed = rows.map(row => {
    const timeRaw = firstValue(row, ['时间', '日期时间', 'datetime', 'date', 'time']);
    const close = toNumber(firstValue(row, ['收盘', '最新价', 'close', '最新', '价格']));
    const pct = toNumber(firstValue(row, ['涨跌幅', '涨跌幅%', 'change_pct', 'pct_chg']));
    if (!timeRaw || !Number.isFinite(close)) return null;
    const match = String(timeRaw).match(/(\d{4}-\d{2}-\d{2})?.*?(\d{2}:\d{2})/);
    if (!match) return null;
    return {
      date: match[1] || requestedDate,
      time: match[2],
      close,
      pct: Number.isFinite(pct) ? pct : NaN
    };
  }).filter(Boolean);
  const endMinute = isHistoricalTradeDate(requestedDate) ? tradingDayMinutes : tradingTimeline().elapsed;
  const todayRows = parsed
    .filter(point => point.date === requestedDate)
    .map(point => ({ ...point, minute: timeToMinute(point.time) }))
    .filter(point => Number.isFinite(point.minute) && point.minute <= endMinute);
  if (!todayRows.length) return [];
  const preClose = preCloseForAkDate(parsed, requestedDate);
  if (Number.isFinite(preClose) && preClose) {
    return todayRows.map(point => ({
      time: point.time,
      value: round(((point.close - preClose) / preClose) * 100),
      price: point.close,
      date: point.date
    }));
  }
  const first = todayRows[0];
  const open = first.close || 1;
  const points = todayRows.map(point => ({
    time: point.time,
    value: round(((point.close - open) / open) * 100),
    price: point.close,
    date: point.date
  }));
  const last = points.at(-1);
  if (last && Number.isFinite(Number(latestPct))) {
    const drift = round((Number(latestPct) || 0) - last.value);
    const total = Math.max(1, points.length - 1);
    return points.map((point, index) => ({
      ...point,
      value: round(point.value + drift * (index / total))
    }));
  }
  return points;
}

function priceTrendRow(line) {
  const cells = String(line).split(',');
  const match = cells[0]?.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})$/);
  if (!match) return null;
  const price = firstPositiveNumber([cells[1], cells[2], cells[7]]);
  if (!Number.isFinite(price)) return null;
  return { date: match[1], time: match[2], price };
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const num = toNumber(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return NaN;
}

function preCloseForTrendDate(points, requestedDate, payloadPreClose) {
  const dates = uniqueSortedDates(points);
  const targetIndex = dates.indexOf(requestedDate);
  if (targetIndex < 0) return NaN;
  if (targetIndex === dates.length - 1 && Number.isFinite(payloadPreClose) && payloadPreClose > 0) {
    return payloadPreClose;
  }
  if (targetIndex > 0) {
    const previousRows = points.filter(point => point.date === dates[targetIndex - 1]);
    const previousClose = previousRows.at(-1)?.price;
    if (Number.isFinite(previousClose) && previousClose > 0) return previousClose;
  }
  const first = points.find(point => point.date === requestedDate);
  return Number.isFinite(first?.price) ? first.price : NaN;
}

function preCloseForAkDate(points, requestedDate) {
  const targetRows = points.filter(point => point.date === requestedDate);
  const first = targetRows[0];
  if (first && Number.isFinite(first.pct) && first.close) {
    return first.close / (1 + first.pct / 100);
  }
  const dates = uniqueSortedDates(points);
  const targetIndex = dates.indexOf(requestedDate);
  if (targetIndex > 0) {
    const previousRows = points.filter(point => point.date === dates[targetIndex - 1]);
    const previousClose = previousRows.at(-1)?.close;
    if (Number.isFinite(previousClose) && previousClose > 0) return previousClose;
  }
  return Number.isFinite(first?.close) ? first.close : NaN;
}

function uniqueSortedDates(points) {
  return [...new Set(points.map(point => point.date).filter(Boolean))].sort();
}

async function emTrendJson(path, params) {
  const host = 'push2his.eastmoney.com';
  const url = `https://${host}${path}?${new URLSearchParams(params)}`;
  let lastErr;
  for (const ip of eastmoneyResolveIps) {
    try {
      const args = [
        '-s',
        '-S',
        '--max-time',
        '8',
        '--resolve',
        `${host}:443:${ip}`,
        url,
        '-H',
        'Referer: https://quote.eastmoney.com/',
        '-H',
        'User-Agent: Mozilla/5.0'
      ];
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1024 * 1024 * 4 });
      if (!stdout.trim()) throw new Error('curl empty response');
      return JSON.parse(stdout);
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    return await emJson(path, params, host);
  } catch {
    throw lastErr || new Error('trend request failed');
  }
}

function minuteKlineToPoint(line) {
  const [time, main, small, medium, large, superLarge] = String(line).split(',');
  const match = time.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})$/);
  if (!match) return null;
  const breakdown = {
    main: toEastmoneyYi(main),
    superLarge: toEastmoneyYi(superLarge),
    large: toEastmoneyYi(large),
    medium: toEastmoneyYi(medium),
    small: toEastmoneyYi(small)
  };
  if (Object.values(breakdown).some(value => !Number.isFinite(value))) return null;
  return { date: match[1], time: match[2], value: breakdown.main, ...breakdown };
}

function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function withTimeout(promise, timeoutMs) {
  const ms = Math.max(1, Number(timeoutMs) || 1);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isAStockRow(row) {
  const code = String(row.f12 || '');
  const market = Number(row.f13);
  return /^[0368]\d{5}$/.test(code) && (market === 0 || market === 1);
}

async function akCall(functionName, params, category) {
  const payload = await callAktools(functionName, params);
  const rows = extractRows(payload);
  return rows
    .map((row, index) => rowToSeries(row, category, functionName, index))
    .filter(Boolean);
}

async function callAktools(functionName, params, timeoutMs = 5500) {
  const attempts = [
    {
      url: `${aktoolsBase}/api/public/${functionName}`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params || {})
      }
    },
    {
      url: `${aktoolsBase}/api/public/${functionName}?${new URLSearchParams(params || {})}`,
      init: { method: 'GET' }
    },
    {
      url: `${aktoolsBase}/${functionName}?${new URLSearchParams(params || {})}`,
      init: { method: 'GET' }
    }
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        ...attempt.init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`${functionName} failed`);
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.records)) return payload.records;
  if (payload && typeof payload === 'object') {
    const arrayValue = Object.values(payload).find(Array.isArray);
    if (arrayValue) return arrayValue;
  }
  return [];
}

function rowToSeries(row, category, source, index) {
  const name = firstValue(row, ['名称', '板块名称', '行业', '概念名称', '地域名称', '股票简称', '名称代码', '市场', 'name']) || `${category}-${index + 1}`;
  const latest = toYi(firstValue(row, [
    '今日主力净流入-净额',
    '主力净流入-净额',
    '净额',
    '净流入',
    '今日净流入',
    '资金净流入',
    '成交净买额',
    'value',
    'latest'
  ]));
  if (!Number.isFinite(latest)) return null;
  const idSeed = firstValue(row, ['代码', '股票代码', '板块代码', 'symbol']) || `${source}-${category}-${index}`;
  const id = `${category}-${String(idSeed).replace(/\W+/g, '')}-${index}`;
  const points = pushSnapshot(id, latest);
  return {
    id,
    name: String(name),
    category,
    latest,
    rank: Number(firstValue(row, ['序号', '排名', 'rank'])) || index + 1,
    changePct: toNumber(firstValue(row, ['涨跌幅', '涨跌幅%', '最新涨跌幅'])) || 0,
    points
  };
}

function normalizePayload(series, sourceStatus, requestedDate = formatDate(new Date())) {
  const normalized = series;
  const leaders = buildLeaders(normalized);
  const timeline = timelineForTradeDate(requestedDate);
  const historical = isHistoricalTradeDate(requestedDate);
  return {
    updatedAt: new Date().toISOString(),
    tradeDate: requestedDate,
    requestedDate,
    refreshAfterMs,
    sourceStatus,
    timeline,
    series: normalized,
    leaders,
    breakdown: buildBreakdown(normalized),
    focusCandidates: buildFocusCandidates(normalized),
    note: historical
      ? '历史回溯展示目标日真实资金净额；资金分钟线缺失时只展示 15:00 日资金快照，避免伪造历史资金走势。'
      : '默认重点大类按代表板块展示，不做重叠概念求和；资金分钟线缺失时只展示真实净额快照，避免伪造全天资金走势。'
  };
}

function filterPayload(payload, scope, limit, requestedDate = payload.requestedDate || formatDate(new Date()), focusNames = [], focusLimit = focusGroupLimit) {
  const maxLimit = displayLimitForScope(scope, limit, focusLimit);
  const scoped = scope === 'all' ? buildFocusSeries(payload.series, focusNames) : payload.series.filter(item => item.category === scope);
  const sorted = [...scoped].sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest)).slice(0, maxLimit);
  applyPricePointsToSeries(sorted, requestedDate);
  return {
    ...payload,
    series: sorted,
    leaders: buildLeaders(scoped),
    breakdown: buildBreakdown(scoped),
    focusCandidates: buildFocusCandidates(payload.series)
  };
}

async function prepareFilteredPayload(payload, scope, limit, waitMs, force = false, requestedDate = payload.requestedDate || formatDate(new Date()), focusNames = [], focusLimit = focusGroupLimit) {
  const filtered = filterPayload(payload, scope, limit, requestedDate, focusNames, focusLimit);
  const shouldHydrateFlow = scope === 'all' || scope === 'industry' || scope === 'concept';
  const shouldHydratePrice = shouldHydrateFlow || scope === 'stock' || scope === 'market';
  if (shouldHydratePrice) {
    if (isHistoricalTradeDate(requestedDate)) {
      const flowWaitMs = Math.max(8500, Math.floor(waitMs * 0.7));
      const priceWaitMs = Math.max(2200, waitMs - flowWaitMs);
      if (shouldHydrateFlow) {
        await hydrateVisibleHistoricalFlow(filtered.series, flowWaitMs, force, requestedDate);
        markMissingHistoricalFlow(filtered.series, requestedDate);
      }
      await hydrateVisiblePricePoints(filtered.series, priceWaitMs, force, requestedDate);
      applyPricePointsToSeries(filtered.series, requestedDate);
      markMissingHistoricalPrice(filtered.series, requestedDate);
      return shouldHydrateFlow ? finalizeFilteredPayload(filtered, limit) : filtered;
    }
    const minuteWaitMs = Math.max(700, Math.floor(waitMs * 0.42));
    const priceWaitMs = Math.max(700, waitMs - minuteWaitMs);
    if (shouldHydrateFlow) {
      await hydrateVisibleMinutePoints(filtered.series, minuteWaitMs, force, requestedDate);
      applyMinutePointsToSeries(filtered.series, requestedDate);
    }
    await hydrateVisiblePricePoints(filtered.series, priceWaitMs, force, requestedDate);
    applyPricePointsToSeries(filtered.series, requestedDate);
  }
  return filtered;
}

function finalizeFilteredPayload(payload, limit) {
  const scoped = Array.isArray(payload.series) ? payload.series : [];
  const sorted = [...scoped]
    .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
    .slice(0, limit);
  return {
    ...payload,
    series: sorted,
    leaders: buildLeaders(scoped),
    breakdown: buildBreakdown(scoped)
  };
}

async function hydrateVisibleHistoricalFlow(series, waitMs = 3000, force = false, requestedDate = formatDate(new Date())) {
  const candidates = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => item.category === 'focus' || item.category === 'industry' || item.category === 'concept')
    .map(item => ({
      target: item,
      query: {
        ...item,
        code: item.sourceCode || item.code,
        market: item.sourceCode ? 90 : item.market,
        name: item.sourceName || item.name,
        category: item.sourceCategory || item.category
      }
    }))
    .filter(({ query }) => query.code && query.market === 90);
  if (!candidates.length) return;
  const deadline = Date.now() + waitMs;
  const batches = chunk(candidates, 8);
  for (const batch of batches) {
    if (Date.now() >= deadline) return;
    const leftMs = deadline - Date.now();
    await withTimeout(Promise.allSettled(batch.map(async ({ target, query }) => {
      const snapshot = await withTimeout(emFundFlowDailySnapshot(query, force, requestedDate), Math.min(3200, leftMs)).catch(() => null);
      if (!snapshot) return;
      target.latest = snapshot.latest;
      target.changePct = snapshot.changePct;
      target.points = snapshot.points;
      target.pointSource = 'daily';
      target.rawBreakdown = snapshot.rawBreakdown;
    })), leftMs).catch(() => null);
  }
}

function markMissingHistoricalFlow(series, requestedDate) {
  series.forEach(item => {
    const hasTargetPoint = Array.isArray(item.points)
      && item.points.some(point => point.date === requestedDate);
    if (hasTargetPoint) return;
    item.latest = 0;
    item.points = [];
    item.pointSource = 'missing';
    item.rawBreakdown = { main: 0 };
  });
}

function markMissingHistoricalPrice(series, requestedDate) {
  series.forEach(item => {
    const hasTargetPoints = Array.isArray(item.pricePoints)
      && item.pricePoints.some(point => point.date === requestedDate);
    if (hasTargetPoints) return;
    item.pricePoints = [];
    item.pricePointSource = 'missing';
    item.changePct = 0;
  });
}

async function hydrateVisibleMinutePoints(series, waitMs = 2500, force = false, requestedDate = formatDate(new Date())) {
  const missing = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => item.category === 'focus' || item.category === 'industry' || item.category === 'concept')
    .filter(item => force || item.pointSource !== 'minute' || !Array.isArray(item.points) || item.points.length <= 10)
    .slice(0, minuteFetchLimit)
    .map(item => ({
      ...item,
      id: item.sourceId || item.id,
      code: item.sourceCode || item.code,
      market: item.sourceCode ? 90 : item.market,
      name: item.sourceName || item.name,
      category: item.sourceCategory || item.category
    }))
    .filter(item => item.code && item.market === 90);
  if (!missing.length) return;
  const deadline = Date.now() + waitMs;
  const batches = chunk(missing, 5);
  for (const batch of batches) {
    if (Date.now() >= deadline) return;
    const leftMs = deadline - Date.now();
    await withTimeout(Promise.allSettled(batch.map(item => (
      withTimeout(emFundFlowMinutePoints(item, force, requestedDate), Math.min(900, leftMs)).catch(() => null)
    ))), leftMs).catch(() => null);
  }
}

async function hydrateVisiblePricePoints(series, waitMs = 3000, force = false, requestedDate = formatDate(new Date())) {
  const priceCategories = new Set(['focus', 'industry', 'concept', 'stock', 'market']);
  const missing = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => priceCategories.has(item.category))
    .filter(item => force || !Array.isArray(item.pricePoints) || item.pricePoints.length <= 10)
    .slice(0, priceFetchLimit)
    .map(item => ({
      ...item,
      id: item.sourceId || item.id,
      code: item.sourceCode || item.code,
      market: item.sourceCode ? 90 : item.market,
      name: item.sourceName || item.name,
      category: item.sourceCategory || item.category
    }))
    .filter(item => item.code && Number.isFinite(Number(item.market)));
  if (!missing.length) return;
  const deadline = Date.now() + waitMs;
  const batches = chunk(missing, 5);
  for (const batch of batches) {
    if (Date.now() >= deadline) return;
    const leftMs = deadline - Date.now();
    await withTimeout(Promise.allSettled(batch.map(item => (
      withTimeout(emPriceTrendPoints(item, force, requestedDate), Math.min(isHistoricalTradeDate(requestedDate) ? 1600 : 900, leftMs)).catch(() => null)
    ))), leftMs).catch(() => null);
  }
}

async function hydrateVisibleAuctionPricePoints(series, waitMs = 2400, requestedDate = formatDate(new Date())) {
  const priceCategories = new Set(['focus', 'industry', 'concept', 'stock', 'market']);
  const candidates = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => priceCategories.has(item.category))
    .slice(0, priceFetchLimit)
    .map(target => ({
      target,
      query: {
        ...target,
        id: target.sourceId || target.id,
        code: target.sourceCode || target.code,
        market: target.sourceCode ? 90 : target.market,
        name: target.sourceName || target.name,
        category: target.sourceCategory || target.category
      }
    }))
    .filter(({ query }) => query.code && Number.isFinite(Number(query.market)));
  if (!candidates.length) return;
  await withTimeout(Promise.allSettled(candidates.map(async ({ target, query }) => {
    const auctionPoints = Number(query.market) === 90
      ? recordCategoryAuctionSnapshot(target, requestedDate)
      : await withTimeout(emAuctionTrendPoints(query, requestedDate), Math.min(1800, waitMs));
    if (auctionPoints.length < 2) return;
    target.pricePoints = mergePriceTrendPoints(target.pricePoints || [], auctionPoints);
    target.pricePointSource = 'minute';
    target.changePct = Number(target.pricePoints.at(-1)?.value) || target.changePct;
  })), waitMs).catch(() => null);
}

function recordVisibleCategoryAuctionSnapshots(series, requestedDate = formatDate(new Date())) {
  (Array.isArray(series) ? series : []).forEach(item => {
    if (!item.sourceCode && Number(item.market) !== 90) return;
    const points = recordCategoryAuctionSnapshot(item, requestedDate);
    if (points.length < 2) return;
    item.pricePoints = mergePriceTrendPoints(item.pricePoints || [], points);
    item.pricePointSource = 'minute';
  });
}

function recordCategoryAuctionSnapshot(item, requestedDate = formatDate(new Date())) {
  const timeline = timelineForTradeDate(requestedDate);
  const closing = timeline.session === 'closing-auction';
  const startMinute = closing ? regularCloseMinute : 0;
  const currentMinute = clamp(timeline.elapsed, startMinute, tradingDayMinutes);
  const key = auctionCategorySnapshotKey(item, requestedDate);
  let byMinute = memory.auctionCategorySnapshots.get(key);
  if (!byMinute) {
    byMinute = new Map();
    memory.auctionCategorySnapshots.set(key, byMinute);
  }
  if (!byMinute.has(startMinute)) {
    const baseline = closing ? categoryPriceAtOrBefore(item, startMinute) : 0;
    byMinute.set(startMinute, {
      time: minuteToTimeLabel(startMinute),
      value: Number.isFinite(baseline) ? round(baseline) : round(Number(item.changePct) || 0),
      date: requestedDate
    });
  }
  byMinute.set(currentMinute, {
    time: minuteToTimeLabel(currentMinute),
    value: round(Number(item.changePct) || 0),
    date: requestedDate
  });
  return [...byMinute.entries()]
    .filter(([minute]) => closing ? minute >= regularCloseMinute : minute < continuousOpenMinute)
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

function auctionCategorySnapshotKey(item, requestedDate) {
  return `${requestedDate}:${item.id || item.sourceId || item.sourceCode || item.code || item.name}`;
}

function categoryPriceAtOrBefore(item, minute) {
  const point = (Array.isArray(item?.pricePoints) ? item.pricePoints : [])
    .map(row => ({ minute: timeToMinute(row.time), value: Number(row.value) }))
    .filter(row => Number.isFinite(row.minute) && row.minute <= minute && Number.isFinite(row.value))
    .sort((a, b) => a.minute - b.minute)
    .at(-1);
  return Number.isFinite(point?.value) ? point.value : NaN;
}

function buildFocusCandidates(series) {
  const seen = new Set();
  const source = series.filter(item => item.category === 'industry' || item.category === 'concept');
  return availableFocusGroups
    .map(group => {
      const selected = selectFocusRepresentative(group, source);
      return {
        name: group.name,
        category: 'focus',
        sourceName: selected?.name || '',
        sourceCategory: selected?.category || '',
        sourceCode: selected?.code || '',
        sourceId: selected?.id || '',
        latest: selected?.latest || 0,
        changePct: selected?.changePct || 0
      };
    })
    .filter(item => {
      const key = normalizeBoardName(item.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 800);
}

function buildFocusSeries(series, focusNames = []) {
  const source = series.filter(item => item.category === 'industry' || item.category === 'concept');
  const groups = focusGroupsForRequest(focusNames)
    .map((group, index) => {
      const selected = selectFocusRepresentative(group, source);
      const focus = selected ? focusSeriesFromSelected(group, selected, index) : fallbackFocusSeries(group, index);
      if (selected) memory.focusLastByKey.set(group.key, cloneSeriesItem(focus));
      return focus;
    })
    .filter(Boolean);
  return groups.length ? groups : source;
}

function focusGroupsForRequest(focusNames = []) {
  const custom = Array.isArray(focusNames) && focusNames.length
    ? focusNames.map(name => focusGroupFromName(name))
    : defaultFocusGroups;
  return custom;
}

function focusGroupFromName(name) {
  const cleanName = normalizeFocusName(name);
  const normalized = normalizeBoardName(cleanName);
  const matchedDefault = availableFocusGroups.find(group => normalizeBoardName(group.name) === normalized);
  if (matchedDefault) return { ...matchedDefault, name: cleanName || matchedDefault.name };
  return {
    key: `custom-${hashText(normalized || cleanName)}`,
    name: cleanName,
    preferred: [cleanName],
    match: [cleanName]
  };
}

function focusSeriesFromSelected(group, selected, index) {
  return {
    id: `focus-${group.key}`,
    name: group.name,
    category: 'focus',
    sourceName: selected.name,
    sourceCategory: selected.category,
    sourceCode: selected.code,
    sourceId: selected.id,
    latest: selected.latest,
    rank: index + 1,
    changePct: selected.changePct || 0,
    points: normalizeFocusPoints(selected),
    pricePoints: normalizePricePoints(selected),
    pricePointSource: selected.pricePointSource || (Array.isArray(selected.pricePoints) && selected.pricePoints.length > 10 ? 'minute' : 'fallback'),
    pointSource: selected.pointSource || 'snapshot',
    rawBreakdown: selected.rawBreakdown || { main: selected.latest }
  };
}

function fallbackFocusSeries(group, index) {
  const cached = memory.focusLastByKey.get(group.key);
  if (cached) return { ...cloneSeriesItem(cached), rank: index + 1 };
  const latest = 0;
  return {
    id: `focus-${group.key}`,
    name: group.name,
    category: 'focus',
    sourceName: '',
    sourceCategory: '',
    sourceCode: '',
    sourceId: '',
    latest,
    rank: index + 1,
    changePct: 0,
    points: [{ time: minuteToTimeLabel(tradingTimeline().elapsed), value: latest }],
    pricePoints: normalizePricePoints({ latest, changePct: 0 }),
    pricePointSource: 'fallback',
    pointSource: 'placeholder',
    rawBreakdown: { main: latest }
  };
}

function cloneSeriesItem(item) {
  return {
    ...item,
    points: Array.isArray(item.points) ? item.points.map(point => ({ ...point })) : [],
    pricePoints: Array.isArray(item.pricePoints) ? item.pricePoints.map(point => ({ ...point })) : [],
    rawBreakdown: item.rawBreakdown ? { ...item.rawBreakdown } : undefined
  };
}

function selectFocusRepresentative(group, series) {
  const matches = findFocusMatches(group, series);
  if (!matches.length) return null;
  for (const code of focusCodes(group)) {
    const found = matches.find(item => String(item.code || '') === code);
    if (found) return found;
  }
  const exactNames = [group.name, ...(group.preferred || [])].map(normalizeBoardName);
  for (const exact of exactNames) {
    const found = matches.find(item => normalizeBoardName(item.name) === exact);
    if (found) return found;
  }
  for (const exact of exactNames) {
    const found = matches.find(item => normalizeBoardName(item.name).includes(exact) || exact.includes(normalizeBoardName(item.name)));
    if (found) return found;
  }
  return [...matches].sort((a, b) => focusScore(group, b) - focusScore(group, a))[0];
}

function findFocusMatches(group, series) {
  const codes = focusCodes(group);
  const keywords = Array.isArray(group.match) ? group.match : [];
  return series
    .filter(item => item.category === 'industry' || item.category === 'concept')
    .filter(item => codes.includes(String(item.code || '')) || keywords.some(keyword => item.name.includes(keyword)));
}

function focusScore(group, item) {
  const name = normalizeBoardName(item.name);
  const preferred = group.preferred || [];
  const preferredIndex = preferred.findIndex(keyword => name.includes(normalizeBoardName(keyword)));
  const codeScore = focusCodes(group).includes(String(item.code || '')) ? 140 : 0;
  const categoryScore = item.category === 'industry' ? 8 : 4;
  const preferredScore = preferredIndex >= 0 ? 80 - preferredIndex * 6 : 0;
  const exactScore = name === normalizeBoardName(group.name) ? 100 : 0;
  return codeScore + exactScore + preferredScore + categoryScore + Math.min(30, Math.abs(item.latest || 0));
}

function focusCodes(group) {
  return (Array.isArray(group.codes) ? group.codes : [])
    .map(code => String(code || '').trim())
    .filter(Boolean);
}

function normalizeBoardName(name) {
  return String(name || '')
    .replace(/[ⅠⅡⅢIV]+$/i, '')
    .replace(/概念|行业|板块/g, '')
    .trim();
}

function hashText(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeFocusPoints(item) {
  const points = Array.isArray(item.points) ? item.points : [];
  if (item.pointSource === 'minute' && points.length) return dedupePointsByTime(points);
  return currentSnapshotPoints(item);
}

function normalizePricePoints(item) {
  const points = Array.isArray(item.pricePoints) ? item.pricePoints : [];
  if (points.length) return dedupePointsByTime(points);
  const timeline = tradingTimeline();
  return [
    { time: '09:15', value: 0 },
    { time: minuteToTimeLabel(timeline.elapsed), value: round(item.changePct || 0) }
  ];
}

function aggregatePoints(items) {
  const byTime = new Map();
  const minuteItems = items.filter(item => item.pointSource === 'minute');
  minuteItems.forEach(item => {
    (item.points || []).forEach(point => {
      if (!point?.time) return;
      byTime.set(point.time, round((byTime.get(point.time) || 0) + (Number(point.value) || 0)));
    });
  });
  if (byTime.size) {
    const latest = round(items.reduce((sum, item) => sum + item.latest, 0));
    const minuteLatest = round(minuteItems.reduce((sum, item) => sum + item.latest, 0));
    const residual = round(latest - minuteLatest);
    const rows = [...byTime.entries()]
      .map(([time, value]) => ({ time, value, minute: timeToMinute(time) }))
      .filter(point => Number.isFinite(point.minute))
      .sort((a, b) => a.minute - b.minute)
      .map(({ time, value }) => ({ time, value }));
    const total = Math.max(1, rows.length - 1);
    return rows.map((point, index) => ({
      time: point.time,
      value: round(point.value + residual * (index / total))
    }));
  }

  const timeline = tradingTimeline();
  const count = pointCountForTimeline(timeline.elapsed);
  const latest = round(items.reduce((sum, item) => sum + item.latest, 0));
  return makePath(latest, count, items.length).map((value, index) => ({
    time: timeLabel(index, count, timeline.elapsed),
    value
  }));
}

function aggregateBreakdown(items) {
  return items.reduce((acc, item) => {
    const raw = item.rawBreakdown || {};
    acc.main += Number(raw.main ?? item.latest) || 0;
    acc.superLarge += Number(raw.superLarge) || 0;
    acc.large += Number(raw.large) || 0;
    acc.medium += Number(raw.medium) || 0;
    acc.small += Number(raw.small) || 0;
    return acc;
  }, { main: 0, superLarge: 0, large: 0, medium: 0, small: 0 });
}

function pushSnapshot(id, latest) {
  const now = new Date();
  const timeline = tradingTimeline(now);
  const label = minuteToTimeLabel(timeline.elapsed);
  if (!memory.snapshots.has(id)) {
    memory.snapshots.set(id, [{ time: label, value: round(latest) }]);
  }
  const points = memory.snapshots.get(id);
  const last = points[points.length - 1];
  if (last && last.time === label) {
    last.value = round(latest);
  } else {
    points.push({ time: label, value: round(latest) });
    while (points.length > snapshotLimit) points.shift();
  }
  return points;
}

function currentSnapshotPoints(item) {
  const points = Array.isArray(item.points) ? dedupePointsByTime(item.points) : [];
  if (points.length) return points;
  const timeline = tradingTimeline();
  return [{ time: minuteToTimeLabel(timeline.elapsed), value: round(item.latest) }];
}

function dedupePointsByTime(points) {
  const byTime = new Map();
  points.forEach(point => {
    if (!point?.time) return;
    const value = Number(point.value);
    const minute = timeToMinute(point.time);
    if (!Number.isFinite(value) || !Number.isFinite(minute)) return;
    byTime.set(point.time, { ...point, time: point.time, value: round(value), minute });
  });
  return [...byTime.values()]
    .sort((a, b) => a.minute - b.minute)
    .map(({ minute, ...point }) => point);
}

function createFallbackSeries() {
  const timeline = tradingTimeline();
  const rows = [
    ['算力租赁', 'concept', 67.65], ['CPO', 'concept', 53.78], ['液冷服务器', 'concept', 42.59],
    ['消费电子', 'industry', 34.15], ['半导体', 'industry', 29.29], ['通信技术', 'industry', 22.37],
    ['AI应用', 'concept', 19.84], ['稀土', 'concept', 16.24], ['MLCC', 'concept', 9.22],
    ['沪深300', 'market', 6.16], ['北向资金', 'northbound', 18.58], ['上海板块', 'region', 13.42],
    ['贵州茅台', 'stock', 7.31], ['煤炭', 'industry', -4.36], ['商业航天', 'concept', -8.54],
    ['纺织服装', 'industry', -12.25], ['电网设备', 'industry', -15.5], ['有色金属', 'industry', -25.83],
    ['电力', 'industry', -36.37], ['贵金属', 'industry', -39.32], ['化工', 'industry', -41.04],
    ['锂矿', 'concept', -50.59], ['光学光电子', 'industry', -61.12], ['储能', 'concept', -77.78],
    ['电力设备', 'industry', -88.97], ['锂电池', 'concept', -107.25], ['宁德时代', 'stock', -11.72]
  ];
  return rows.map(([name, category, latest], index) => ({
    id: `${category}-${index}`,
    name,
    category,
    latest,
    rank: index + 1,
    changePct: latest / 120,
    points: [{ time: minuteToTimeLabel(timeline.elapsed), value: round(latest) }],
    pointSource: 'snapshot'
  }));
}

function buildLeaders(series) {
  return {
    inflowTop: [...series].filter(item => item.latest > 0).sort((a, b) => b.latest - a.latest).slice(0, 8),
    outflowTop: [...series].filter(item => item.latest < 0).sort((a, b) => a.latest - b.latest).slice(0, 8)
  };
}

function buildBreakdown(series) {
  return [...series]
    .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
    .slice(0, 8)
    .map((item, index) => {
      if (item.rawBreakdown) {
        return {
          name: item.name,
          main: round(item.rawBreakdown.main ?? item.latest),
          superLarge: round(item.rawBreakdown.superLarge ?? item.latest * 0.34),
          large: round(item.rawBreakdown.large ?? item.latest * 0.2),
          medium: round(item.rawBreakdown.medium ?? item.latest * -0.08),
          small: round(item.rawBreakdown.small ?? item.latest * -0.12)
        };
      }
      return {
        name: item.name,
        main: round(item.latest * 0.62),
        superLarge: round(item.latest * (0.3 + (index % 3) * 0.04)),
        large: round(item.latest * 0.2),
        medium: round(item.latest * -0.08),
        small: round(item.latest * -0.12)
      };
    });
}

async function handleStatic(pathname, res) {
  const cleanPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = normalize(join(pageDir, cleanPath));
  if (!target.startsWith(pageDir)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      await streamFile(join(target, 'index.html'), res);
      return;
    }
    await streamFile(target, res);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function streamFile(path, res) {
  await readFile(path);
  res.writeHead(200, {
    'content-type': mime[extname(path)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(path).pipe(res);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return undefined;
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const clean = String(value).replace(/,/g, '').replace(/%/g, '').trim();
  const num = Number(clean);
  return Number.isFinite(num) ? num : NaN;
}

function toYi(value) {
  if (typeof value === 'string' && value.includes('亿')) return toNumber(value.replace('亿', ''));
  const num = toNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.abs(num) > 100000000 ? round(num / 100000000) : round(num);
}

function toMarketYi(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return NaN;
  if (Math.abs(num) >= 100000000) return round(num / 100000000);
  if (Math.abs(num) >= 10000) return round(num / 10000);
  return round(num);
}

function toEastmoneyYi(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return round(num / 100000000);
}

function toAmountYi(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return round(num / 100000000);
}

function toVolumeYiGu(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return round(num / 1000000);
}

function decodeName(value) {
  const text = String(value || '').trim();
  return text || '--';
}

function makePath(latest, count, seed) {
  const points = [];
  const drift = latest / Math.max(1, count - 1);
  let current = 0;
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin((i + seed) * 0.53) * Math.min(8, Math.abs(latest) * 0.08);
    const early = i < 8 ? Math.sin(i * 0.9 + seed) * 5 : 0;
    current += drift + wave * 0.12 + early * 0.12;
    const progress = i / Math.max(1, count - 1);
    points.push(round(current * 0.42 + latest * progress * 0.58));
  }
  points[points.length - 1] = round(latest);
  return points;
}

function timeLabel(index, count, endMinute = tradingTimeline().elapsed) {
  const total = Math.max(1, count - 1);
  const minute = Math.round((index / total) * clamp(endMinute, 0, tradingDayMinutes));
  return minuteToTimeLabel(minute);
}

function minuteToTimeLabel(minutes) {
  const clamped = clamp(minutes, 0, tradingDayMinutes);
  if (clamped < continuousOpenMinute) {
    const date = new Date(2026, 0, 1, 9, 15 + clamped, 0);
    return date.toTimeString().slice(0, 5);
  }
  if (clamped <= morningCloseMinute) {
    const date = new Date(2026, 0, 1, 9, 30 + clamped - continuousOpenMinute, 0);
    return date.toTimeString().slice(0, 5);
  }
  const date = new Date(2026, 0, 1, 13, clamped - morningCloseMinute, 0);
  return date.toTimeString().slice(0, 5);
}

function timeToMinute(label) {
  const match = String(label || '').match(/(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  const total = hour * 60 + minute;
  const auctionStart = 9 * 60 + 15;
  const open = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const close = 15 * 60;
  if (total < auctionStart) return NaN;
  if (total < open) return clamp(total - auctionStart, 0, continuousOpenMinute - 1);
  if (total <= morningClose) return clamp(continuousOpenMinute + total - open, continuousOpenMinute, morningCloseMinute);
  if (total < afternoonOpen) return morningCloseMinute;
  if (total > close) return NaN;
  return clamp(morningCloseMinute + total - afternoonOpen, morningCloseMinute, tradingDayMinutes);
}

function pointCountForTimeline(endMinute) {
  if (endMinute <= 0) return 1;
  return clamp(Math.ceil(endMinute / 5) + 1, 2, 58);
}

function tradingTimeline(date = new Date()) {
  const { hour, minute } = shanghaiTimeParts(date);
  const minutes = hour * 60 + minute;
  const auctionStart = 9 * 60 + 15;
  const open = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const regularClose = 15 * 60;
  const close = regularClose + closingAuctionMinutes;
  let elapsed = 0;
  let session = 'preopen';
  if (minutes < auctionStart) {
    elapsed = 0;
    session = 'preopen';
  } else if (minutes < open) {
    elapsed = minutes - auctionStart;
    session = 'auction';
  } else if (minutes <= morningClose) {
    elapsed = continuousOpenMinute + minutes - open;
    session = 'trading';
  } else if (minutes < afternoonOpen) {
    elapsed = morningCloseMinute;
    session = 'lunch';
  } else if (minutes <= regularClose) {
    elapsed = morningCloseMinute + minutes - afternoonOpen;
    session = 'trading';
  } else {
    elapsed = tradingDayMinutes;
    session = 'closed';
  }
  return {
    elapsed,
    total: tradingDayMinutes,
    endLabel: minuteToTimeLabel(elapsed),
    session,
    isTradingTime: session === 'trading'
  };
}

function timelineForTradeDate(tradeDate = formatDate(new Date())) {
  if (isHistoricalTradeDate(tradeDate)) {
    return {
      elapsed: tradingDayMinutes,
      total: tradingDayMinutes,
      endLabel: '15:00',
      session: 'closed',
      isTradingTime: false
    };
  }
  return tradingTimeline();
}

function shanghaiTimeParts(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(date);
  const value = key => Number(parts.find(part => part.type === key)?.value || 0);
  return { hour: value('hour'), minute: value('minute') };
}

function formatShanghaiDate(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = key => parts.find(part => part.type === key)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startFundFlowServer();
}

export {
  selectStrategyUniverseRows,
  handleOverview,
  handleSecurityAdvice,
  handleStrategyLiveQuote,
  handleStrategySimulation,
  handleAfterHours,
  handleInstitutionPositions,
  handleMargin,
  handleReverseRepo,
  handleNationalTeamTech50,
  handleSegmentLeaders,
  handleLimitUp,
  handleLimitUpAuction,
  handleLimitUpIntraday,
  handleTradeDates,
  handleRequest,
  createFundFlowServer,
  startFundFlowServer
};
