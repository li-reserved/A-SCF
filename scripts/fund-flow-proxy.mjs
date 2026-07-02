#!/usr/bin/env node
import http from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const execFileAsync = promisify(execFile);
const rootDir = resolve(__dirname, '..');
const pageDir = join(rootDir, 'public');
const port = Number(process.env.FUND_FLOW_PORT || process.env.PORT || 5177);
const aktoolsBase = process.env.AKTOOLS_BASE_URL || 'http://127.0.0.1:8080';
const refreshAfterMs = Number(process.env.FUND_FLOW_REFRESH_MS || 15000);
const cacheTtlMs = Number(process.env.FUND_FLOW_CACHE_MS || 30000);
const minuteCacheTtlMs = Number(process.env.FUND_FLOW_MINUTE_CACHE_MS || 60000);
const minuteFetchLimit = Number(process.env.FUND_FLOW_KLINE_LIMIT || 72);
const minuteFetchPerGroup = Number(process.env.FUND_FLOW_KLINE_PER_GROUP || 4);
const priceFetchLimit = Number(process.env.FUND_FLOW_PRICE_LIMIT || 60);
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
const tradingDayMinutes = 240;
const snapshotLimit = 96;
const rankFetchSize = {
  industry: 360,
  concept: 420,
  region: 80,
  stock: 80
};
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
const focusGroups = [
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
  { key: 'semiconductor-equipment', name: '半导体设备', preferred: ['半导体设备'], match: ['半导体设备'] },
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

const memory = {
  cachedByScope: new Map(),
  snapshots: new Map(),
  minuteCached: new Map(),
  priceCached: new Map(),
  focusLastByKey: new Map(),
  loadingByScope: new Map(),
  minuteHydrating: false,
  priceHydrating: false
};

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
    await handleStatic(url.pathname, res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'server error' });
  }
}

function startFundFlowServer() {
  const server = createFundFlowServer();
  server.listen(port, () => {
    console.log(`A股资金流向大屏: http://127.0.0.1:${port}`);
    console.log('真实数据源: 东方财富公开资金流接口');
    console.log(`AKTools: ${aktoolsBase}`);
  });
  return server;
}

async function handleOverview(url, res) {
  const now = Date.now();
  const limit = clamp(Number(url.searchParams.get('limit') || 30), 10, 60);
  const scope = url.searchParams.get('scope') || 'all';
  const cacheKey = scope === 'all' ? 'focus' : scope;
  const cached = memory.cachedByScope.get(cacheKey);
  if (cached && now - cached.cachedAt < cacheTtlMs) {
    applyMinutePointsToSeries(cached.payload.series);
    const filtered = await prepareFilteredPayload(cached.payload, scope, limit, 0);
    sendJson(res, 200, filtered);
    if (scope === 'all' || scope === 'industry' || scope === 'concept') scheduleMinuteHydration(cached.payload.series);
    if (scope === 'all' || scope === 'industry' || scope === 'concept') schedulePriceHydration(cached.payload.series);
    return;
  }

  const loadPromise = startOverviewLoad(cacheKey, limit, scope);
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
    sendJson(res, 200, await prepareFilteredPayload(stalePayload, scope, limit, 0));
    return;
  }

  if (!loaded.payload) {
    sendJson(res, 200, normalizePayload([], loaded.result.status));
    return;
  }

  const payload = loaded.payload;
  sendJson(res, 200, await prepareFilteredPayload(payload, scope, limit, responseHydrateWaitMs));
  if (scope === 'all' || scope === 'industry' || scope === 'concept') scheduleMinuteHydration(payload.series);
  if (scope === 'all' || scope === 'industry' || scope === 'concept') schedulePriceHydration(payload.series);
}

function startOverviewLoad(cacheKey, limit, scope) {
  const current = memory.loadingByScope.get(cacheKey);
  if (current) return current;
  const promise = loadRealData(limit, scope)
    .then(result => {
      if (!result.series.length) return { result, payload: null };
      const payload = normalizePayload(result.series, result.status);
      applyMinutePointsToSeries(payload.series);
      applyPricePointsToSeries(payload.series);
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
      memory.loadingByScope.delete(cacheKey);
    });
  memory.loadingByScope.set(cacheKey, promise);
  return promise;
}

async function loadRealData(limit, scope) {
  const eastmoney = await loadEastmoneyData(limit, scope);
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
      detail: errors.length ? `部分接口失败：${errors.slice(0, 2).join('；')}` : '数据来自本地 AKTools/AKShare 代理，页面请求已做缓存和归一化。'
    }
  };
}

async function loadEastmoneyData(limit, scope) {
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
        ? `数据来自东方财富公开资金流接口；资金图只展示真实资金分钟线或当前真实净额快照，不再用估算曲线冒充全天资金走势。地域、指数、个股、北向可在单独标签查看。${errors.length ? `部分分类未返回：${errors.slice(0, 2).join('；')}` : ''}`
        : `东方财富资金流接口未返回可用数据：${errors.slice(0, 3).join('；')}`
    }
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
    const [date, main, superLarge, large, medium, small, mainPct] = String(line).split(',');
    const latest = toYi(main);
    return [{
      id: `market-${secid}`,
      name: payload?.data?.name || name,
      category: 'market',
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

function scheduleMinuteHydration(series) {
  if (memory.minuteHydrating) return;
  memory.minuteHydrating = true;
  setTimeout(async () => {
    try {
      await hydrateMinutePoints(series);
      memory.cachedByScope.forEach(entry => applyMinutePointsToSeries(entry.payload.series));
    } finally {
      memory.minuteHydrating = false;
    }
  }, 0);
}

function schedulePriceHydration(series) {
  if (memory.priceHydrating) return;
  memory.priceHydrating = true;
  setTimeout(async () => {
    try {
      await hydratePricePoints(series);
      memory.cachedByScope.forEach(entry => applyPricePointsToSeries(entry.payload.series));
    } finally {
      memory.priceHydrating = false;
    }
  }, 0);
}

async function hydrateMinutePoints(series) {
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
        const points = await emFundFlowMinutePoints(item);
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

function applyMinutePointsToSeries(series) {
  series.forEach(item => {
    const code = item.sourceCode || item.code;
    const market = item.sourceCode ? 90 : item.market;
    const cached = market === 90 && code ? memory.minuteCached.get(`${market}.${code}`) : null;
    if (cached?.points?.length) {
      item.points = cached.points;
      item.pointSource = 'minute';
    }
  });
}

async function hydratePricePoints(series) {
  const candidates = selectPriceCandidates(series);
  const batches = chunk(candidates, 6);
  for (const batch of batches) {
    await Promise.all(batch.map(async item => {
      try {
        const points = await emPriceTrendPoints(item);
        if (points.length) {
          item.pricePoints = points;
          item.pricePointSource = points.length > 10 ? 'minute' : 'fallback';
        }
      } catch {
        // Price trend is optional; the current changePct fallback remains available.
      }
    }));
  }
}

function applyPricePointsToSeries(series) {
  series.forEach(item => {
    const code = item.sourceCode || item.code;
    const market = item.sourceCode ? 90 : item.market;
    const cached = code ? memory.priceCached.get(`${market}.${code}`) : null;
    if (cached?.points?.length) {
      item.pricePoints = cached.points;
      item.pricePointSource = cached.source || (cached.points.length > 10 ? 'minute' : 'fallback');
    }
  });
}

function selectPriceCandidates(series) {
  const byId = new Map();
  focusGroups.forEach(group => {
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
  focusGroups.forEach(group => {
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

async function emFundFlowMinutePoints(item) {
  const cacheKey = `${item.market}.${item.code}`;
  const cached = memory.minuteCached.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < minuteCacheTtlMs) return cached.points;
  const params = {
    secid: `${item.market}.${item.code}`,
    klt: '1',
    lmt: '0',
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  };
  const rows = await emFundFlowMinuteRows(params);
  const endMinute = tradingTimeline().elapsed;
  const parsed = rows
    .map(line => minuteKlineToPoint(line))
    .filter(Boolean);
  const latestDate = parsed
    .map(point => point.date)
    .filter(Boolean)
    .sort()
    .at(-1);
  const points = parsed
    .filter(point => !latestDate || point.date === latestDate)
    .filter(point => timeToMinute(point.time) <= endMinute)
    .map(({ time, value, date }) => ({ time, value, date }));
  if (points.length) {
    memory.minuteCached.set(cacheKey, { cachedAt: now, points });
  }
  return points;
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

async function emPriceTrendPoints(item) {
  const cacheKey = `${item.market}.${item.code}`;
  const cached = memory.priceCached.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < minuteCacheTtlMs) return cached.points;
  const params = {
    secid: `${item.market}.${item.code}`,
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    iscr: '0',
    iscca: '0',
    ndays: '1',
    ut: 'fa5fd1943c7b386f172d6893dbfba10b'
  };
  let points = [];
  try {
    const payload = await emTrendJson('/api/qt/stock/trends2/get', params);
    points = parseEastmoneyTrendPayload(payload);
  } catch {
    points = [];
  }
  if (!points.length) {
    points = await akBoardPriceTrendPoints(item);
  }
  if (points.length) memory.priceCached.set(cacheKey, { cachedAt: now, points, source: points.length > 10 ? 'minute' : 'fallback' });
  return points;
}

function parseEastmoneyTrendPayload(payload) {
  const rows = payload?.data?.trends || [];
  const preClose = toNumber(payload?.data?.preClose || payload?.data?.prePrice);
  if (!Number.isFinite(preClose) || !preClose) return [];
  const endMinute = tradingTimeline().elapsed;
  const parsed = rows
    .map(line => priceTrendToPoint(line, preClose))
    .filter(Boolean);
  const latestDate = parsed
    .map(point => point.date)
    .filter(Boolean)
    .sort()
    .at(-1);
  return parsed
    .filter(point => !latestDate || point.date === latestDate)
    .filter(point => timeToMinute(point.time) <= endMinute)
    .map(({ time, value, price, date }) => ({ time, value, price, date }));
}

async function akBoardPriceTrendPoints(item) {
  const fn = item.category === 'industry'
    ? 'stock_board_industry_hist_min_em'
    : item.category === 'concept'
      ? 'stock_board_concept_hist_min_em'
      : null;
  if (!fn || !item.name) return [];
  try {
    const payload = await callAktools(fn, { symbol: item.name, period: '1' }, 8000);
    return parseAkBoardPricePayload(payload, item.changePct);
  } catch {
    return [];
  }
}

function parseAkBoardPricePayload(payload, latestPct) {
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
      date: match[1] || '',
      time: match[2],
      close,
      pct: Number.isFinite(pct) ? pct : NaN
    };
  }).filter(Boolean);
  const latestDate = parsed
    .map(point => point.date)
    .filter(Boolean)
    .sort()
    .at(-1);
  const todayRows = parsed
    .filter(point => !latestDate || point.date === latestDate)
    .filter(point => timeToMinute(point.time) <= tradingTimeline().elapsed);
  if (!todayRows.length) return [];
  const first = todayRows[0];
  const preClose = Number.isFinite(first.pct) && first.close
    ? first.close / (1 + first.pct / 100)
    : NaN;
  if (Number.isFinite(preClose) && preClose) {
    return todayRows.map(point => ({
      time: point.time,
      value: round(((point.close - preClose) / preClose) * 100),
      price: point.close,
      date: point.date
    }));
  }
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

function priceTrendToPoint(line, preClose) {
  const cells = String(line).split(',');
  const match = cells[0]?.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})$/);
  if (!match) return null;
  const price = toNumber(cells[1]);
  if (!Number.isFinite(price)) return null;
  const value = round(((price - preClose) / preClose) * 100);
  return { date: match[1], time: match[2], value, price };
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
  const [time, main] = String(line).split(',');
  const match = time.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})$/);
  if (!match) return null;
  const value = toEastmoneyYi(main);
  if (!Number.isFinite(value)) return null;
  return { date: match[1], time: match[2], value };
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

function normalizePayload(series, sourceStatus) {
  const normalized = series;
  const leaders = buildLeaders(normalized);
  const timeline = tradingTimeline();
  return {
    updatedAt: new Date().toISOString(),
    tradeDate: formatDate(new Date()),
    refreshAfterMs,
    sourceStatus,
    timeline,
    series: normalized,
    leaders,
    breakdown: buildBreakdown(normalized),
    note: '默认重点大类按代表板块展示，不做重叠概念求和；资金分钟线缺失时只展示真实净额快照，避免伪造全天资金走势。'
  };
}

function filterPayload(payload, scope, limit) {
  const scoped = scope === 'all' ? buildFocusSeries(payload.series) : payload.series.filter(item => item.category === scope);
  const sorted = [...scoped].sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest)).slice(0, limit);
  applyPricePointsToSeries(sorted);
  return {
    ...payload,
    series: sorted,
    leaders: buildLeaders(scoped),
    breakdown: buildBreakdown(scoped)
  };
}

async function prepareFilteredPayload(payload, scope, limit, waitMs) {
  const filtered = filterPayload(payload, scope, limit);
  if (scope === 'all' || scope === 'industry' || scope === 'concept') {
    const minuteWaitMs = Math.max(700, Math.floor(waitMs * 0.42));
    const priceWaitMs = Math.max(700, waitMs - minuteWaitMs);
    await hydrateVisibleMinutePoints(filtered.series, minuteWaitMs);
    applyMinutePointsToSeries(filtered.series);
    await hydrateVisiblePricePoints(filtered.series, priceWaitMs);
    applyPricePointsToSeries(filtered.series);
  }
  return filtered;
}

async function hydrateVisibleMinutePoints(series, waitMs = 2500) {
  const missing = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => item.category === 'focus' || item.category === 'industry' || item.category === 'concept')
    .filter(item => item.pointSource !== 'minute' || !Array.isArray(item.points) || item.points.length <= 10)
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
      withTimeout(emFundFlowMinutePoints(item), Math.min(900, leftMs)).catch(() => null)
    ))), leftMs).catch(() => null);
  }
}

async function hydrateVisiblePricePoints(series, waitMs = 3000) {
  const missing = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => item.category === 'focus' || item.category === 'industry' || item.category === 'concept')
    .filter(item => !Array.isArray(item.pricePoints) || item.pricePoints.length <= 10)
    .slice(0, priceFetchLimit)
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
      withTimeout(emPriceTrendPoints(item), Math.min(900, leftMs)).catch(() => null)
    ))), leftMs).catch(() => null);
  }
}

function buildFocusSeries(series) {
  const source = series.filter(item => item.category === 'industry' || item.category === 'concept');
  const groups = focusGroups
    .map((group, index) => {
      const selected = selectFocusRepresentative(group, source);
      const focus = selected ? focusSeriesFromSelected(group, selected, index) : fallbackFocusSeries(group, index);
      if (selected) memory.focusLastByKey.set(group.key, cloneSeriesItem(focus));
      return focus;
    })
    .filter(Boolean);
  return groups.length ? groups : source;
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
  return series
    .filter(item => item.category === 'industry' || item.category === 'concept')
    .filter(item => group.match.some(keyword => item.name.includes(keyword)));
}

function focusScore(group, item) {
  const name = normalizeBoardName(item.name);
  const preferred = group.preferred || [];
  const preferredIndex = preferred.findIndex(keyword => name.includes(normalizeBoardName(keyword)));
  const categoryScore = item.category === 'industry' ? 8 : 4;
  const preferredScore = preferredIndex >= 0 ? 80 - preferredIndex * 6 : 0;
  const exactScore = name === normalizeBoardName(group.name) ? 100 : 0;
  return exactScore + preferredScore + categoryScore + Math.min(30, Math.abs(item.latest || 0));
}

function normalizeBoardName(name) {
  return String(name || '')
    .replace(/[ⅠⅡⅢIV]+$/i, '')
    .replace(/概念|行业|板块/g, '')
    .trim();
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
    { time: '09:30', value: 0 },
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
      .sort((a, b) => timeToMinute(a[0]) - timeToMinute(b[0]))
      .map(([time, value]) => ({ time, value }));
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
    if (!Number.isFinite(value)) return;
    byTime.set(point.time, { time: point.time, value: round(value) });
  });
  return [...byTime.values()].sort((a, b) => timeToMinute(a.time) - timeToMinute(b.time));
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
  if (clamped <= 120) {
    const date = new Date(2026, 0, 1, 9, 30 + clamped, 0);
    return date.toTimeString().slice(0, 5);
  }
  const date = new Date(2026, 0, 1, 13, clamped - 120, 0);
  return date.toTimeString().slice(0, 5);
}

function timeToMinute(label) {
  const [hour, minute] = String(label || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  const total = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const afternoonOpen = 13 * 60;
  if (total <= 11 * 60 + 30) return clamp(total - open, 0, 120);
  return clamp(120 + total - afternoonOpen, 120, tradingDayMinutes);
}

function pointCountForTimeline(endMinute) {
  if (endMinute <= 0) return 1;
  return clamp(Math.ceil(endMinute / 5) + 1, 2, 48);
}

function tradingTimeline(date = new Date()) {
  const { hour, minute } = shanghaiTimeParts(date);
  const minutes = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const close = 15 * 60;
  let elapsed = 0;
  let session = 'preopen';
  if (minutes < open) {
    elapsed = 0;
    session = 'preopen';
  } else if (minutes <= morningClose) {
    elapsed = minutes - open;
    session = 'trading';
  } else if (minutes < afternoonOpen) {
    elapsed = 120;
    session = 'lunch';
  } else if (minutes <= close) {
    elapsed = 120 + minutes - afternoonOpen;
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
  handleOverview,
  handleRequest,
  createFundFlowServer,
  startFundFlowServer
};
