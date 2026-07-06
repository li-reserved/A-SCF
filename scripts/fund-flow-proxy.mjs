#!/usr/bin/env node
import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

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
const tradingDayMinutes = 240;
const snapshotLimit = 96;
const focusGroupLimit = 31;
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
    if (url.pathname === '/api/fund-flow/focus-groups') {
      sendJson(res, 200, {
        updatedAt: new Date().toISOString(),
        limit: focusGroupLimit,
        focusCandidates: buildFocusCandidates([])
      });
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
    const storedPayload = await loadStoredTrendPayload(scope, requestedDate, displayLimitForScope(scope, limit, focusLimit), focusKey);
    if (storedPayload) {
      sendJson(res, 200, storedPayload);
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
    sendJson(res, 200, filtered);
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
    sendJson(res, 200, filtered);
    return;
  }

  if (!loaded.payload) {
    sendJson(res, 200, normalizePayload([], loaded.result.status, requestedDate));
    return;
  }

  const payload = loaded.payload;
  const hydrateWait = historical ? Math.max(13000, responseHydrateWaitMs * 28) : (force ? responseHydrateWaitMs * 2 : responseHydrateWaitMs);
  const filtered = await prepareFilteredPayload(payload, scope, limit, hydrateWait, force, requestedDate, focusNames, focusLimit);
  await maybePersistTodayTrend(filtered, scope, requestedDate, focusKey);
  sendJson(res, 200, filtered);
  if (!historical && (scope === 'all' || scope === 'industry' || scope === 'concept')) scheduleMinuteHydration(payload.series, force, requestedDate);
  if (!historical && (scope === 'all' || scope === 'industry' || scope === 'concept')) schedulePriceHydration(payload.series, force, requestedDate);
}

function normalizeTradeDate(value) {
  const today = formatDate(new Date());
  const text = String(value || today).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return today;
  return text > today ? today : text;
}

function isHistoricalTradeDate(tradeDate) {
  return normalizeTradeDate(tradeDate) !== formatDate(new Date());
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

async function loadStoredTrendPayload(scope, requestedDate, limit, focusKey = 'default') {
  if (!trendStoreEnabled || !isHistoricalTradeDate(requestedDate)) return null;
  await ensureTrendStoreLoaded();
  const entry = memory.trendStore.get(trendStoreKey(scope, requestedDate, focusKey));
  const payload = entry?.payload;
  if (!payload?.series?.length) return null;
  const series = payload.series
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
      detail: `命中本地走势库：${requestedDate} ${scope}，由盘中用户查询覆盖写入。`
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
  if (requestedDate !== formatDate(new Date())) return false;
  const timeline = tradingTimeline();
  return timeline.elapsed > 0 && timeline.session !== 'closed';
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
        ...(Number.isFinite(Number(point.price)) ? { price: Number(point.price) } : {})
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
    const [date, main, small, medium, large, superLarge, mainPct] = String(line).split(',');
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

function startPrefetchLoop() {
  if (!prefetchIntervalMs || prefetchIntervalMs < 5000) return;
  setInterval(() => {
    const timeline = tradingTimeline();
    if (!timeline.isTradingTime) return;
    const today = formatDate(new Date());
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
    .filter(point => timeToMinute(point.time) <= endMinute)
    .map(({ time, value, date }) => ({ time, value, date }));
  if (points.length) {
    memory.minuteCached.set(cacheKey, { cachedAt: now, points });
  }
  return points;
}

async function emFundFlowDailySnapshot(item, force = false, requestedDate = formatDate(new Date())) {
  const cacheKey = securityCacheKey(item, requestedDate);
  const cached = memory.flowDailyCached.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < historicalDayCacheTtlMs) return cached.snapshot;
  const params = {
    secid: `${item.market}.${item.code}`,
    lmt: String(historicalDailyKlineLimit(requestedDate)),
    klt: '101',
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  };
  const payload = await emFundFlowMinuteJson('/api/qt/stock/fflow/daykline/get', params, 'push2his.eastmoney.com');
  const line = (payload?.data?.klines || []).find(row => String(row).startsWith(`${requestedDate},`));
  const snapshot = dayFlowLineToSnapshot(line);
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
  const params = {
    secid: `${item.market}.${item.code}`,
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    iscr: '0',
    iscca: '0',
    ndays: historical ? String(clamp(historyTrendDays, 1, 5)) : '1',
    ut: 'fa5fd1943c7b386f172d6893dbfba10b'
  };
  let points = [];
  try {
    const payload = await emTrendJson('/api/qt/stock/trends2/get', params);
    points = parseEastmoneyTrendPayload(payload, requestedDate);
  } catch {
    points = [];
  }
  if (!points.length) {
    points = await akBoardPriceTrendPoints(item, requestedDate);
  }
  if (points.length) memory.priceCached.set(cacheKey, { cachedAt: now, points, source: points.length > 10 ? 'minute' : 'fallback' });
  return points;
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
    .filter(point => timeToMinute(point.time) <= (isHistoricalTradeDate(requestedDate) ? tradingDayMinutes : endMinute));
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
    .filter(point => timeToMinute(point.time) <= endMinute);
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
  if (scope === 'all' || scope === 'industry' || scope === 'concept') {
    if (isHistoricalTradeDate(requestedDate)) {
      const flowWaitMs = Math.max(8500, Math.floor(waitMs * 0.7));
      const priceWaitMs = Math.max(2200, waitMs - flowWaitMs);
      await hydrateVisibleHistoricalFlow(filtered.series, flowWaitMs, force, requestedDate);
      markMissingHistoricalFlow(filtered.series, requestedDate);
      await hydrateVisiblePricePoints(filtered.series, priceWaitMs, force, requestedDate);
      applyPricePointsToSeries(filtered.series, requestedDate);
      markMissingHistoricalPrice(filtered.series, requestedDate);
      return finalizeFilteredPayload(filtered, limit);
    }
    const minuteWaitMs = Math.max(700, Math.floor(waitMs * 0.42));
    const priceWaitMs = Math.max(700, waitMs - minuteWaitMs);
    await hydrateVisibleMinutePoints(filtered.series, minuteWaitMs, force, requestedDate);
    applyMinutePointsToSeries(filtered.series, requestedDate);
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
  const missing = series
    .filter(item => item.sourceCode || item.code)
    .filter(item => item.category === 'focus' || item.category === 'industry' || item.category === 'concept')
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
    .filter(item => item.code && item.market === 90);
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
