const quoteDefinitions = [
  { key: 'spy', symbol: 'SPY', name: '标普 500' },
  { key: 'qqq', symbol: 'QQQ', name: '纳斯达克 100' },
  { key: 'dia', symbol: 'DIA', name: '道琼斯 30' },
  { key: 'iwm', symbol: 'IWM', name: '罗素 2000' }
];

const importantStockDefinitions = [
  { symbol: 'NVDA', nameZh: '英伟达' },
  { symbol: 'MSFT', nameZh: '微软' },
  { symbol: 'AAPL', nameZh: '苹果' },
  { symbol: 'GOOGL', nameZh: '谷歌' },
  { symbol: 'AMZN', nameZh: '亚马逊' },
  { symbol: 'META', nameZh: 'Meta' },
  { symbol: 'TSLA', nameZh: '特斯拉' },
  { symbol: 'AVGO', nameZh: '博通' },
  { symbol: 'AMD', nameZh: '超威半导体' },
  { symbol: 'PLTR', nameZh: '帕兰提尔' }
];

const symbolNamesZh = {
  SPY: '标普500 ETF',
  QQQ: '纳斯达克100 ETF',
  DIA: '道琼斯30 ETF',
  IWM: '罗素2000 ETF',
  ...Object.fromEntries(importantStockDefinitions.map(item => [item.symbol, item.nameZh])),
  COHR: '相干公司',
  LITE: '朗美通',
  FN: 'Fabrinet',
  SOXX: 'iShares半导体ETF',
  MU: '美光科技',
  WDC: '西部数据',
  STX: '希捷科技',
  VRT: '维谛技术',
  EQIX: '易昆尼克斯',
  DLR: '数字房地产信托',
  SKYY: '云计算ETF',
  RKLB: '火箭实验室',
  ASTS: 'AST太空移动',
  RDW: '红线公司',
  IRDM: '铱星通讯',
  GSAT: '全球星',
  BOTZ: '机器人与人工智能ETF',
  DRIV: '自动驾驶与电动车ETF',
  GRID: '智能电网ETF',
  ITA: '美国航空航天与国防ETF',
  NLR: '铀矿与核能ETF',
  ICLN: '全球清洁能源ETF',
  TAN: '太阳能ETF',
  LIT: '锂电池ETF',
  XOP: '油气勘探ETF',
  FCG: '天然气ETF',
  COPX: '铜矿ETF',
  GLD: '黄金ETF',
  XLF: '金融精选ETF',
  XBI: '生物科技ETF',
  XLY: '可选消费ETF'
};

const themeDefinitions = [
  { key: 'ai-compute', name: 'AI算力', group: 'technology', groupLabel: '科技基建', symbols: ['NVDA', 'AMD', 'AVGO'] },
  { key: 'cpo', name: 'CPO', group: 'technology', groupLabel: '科技基建', symbols: ['COHR', 'LITE', 'FN'] },
  { key: 'semiconductor', name: '半导体', group: 'technology', groupLabel: '科技基建', symbols: ['SOXX'] },
  { key: 'memory', name: '存储', group: 'technology', groupLabel: '科技基建', symbols: ['MU', 'WDC', 'STX'] },
  { key: 'data-center', name: '数据中心', group: 'technology', groupLabel: '科技基建', symbols: ['VRT', 'EQIX', 'DLR'] },
  { key: 'cloud', name: '云计算', group: 'technology', groupLabel: '科技基建', symbols: ['SKYY'] },
  { key: 'commercial-space', name: '商业航天', group: 'industry', groupLabel: '先进制造', symbols: ['RKLB', 'ASTS', 'RDW'] },
  { key: 'satellite', name: '卫星', group: 'industry', groupLabel: '先进制造', symbols: ['ASTS', 'IRDM', 'GSAT'] },
  { key: 'robotics', name: '机器人', group: 'industry', groupLabel: '先进制造', symbols: ['BOTZ'] },
  { key: 'autonomous-driving', name: '自动驾驶', group: 'industry', groupLabel: '先进制造', symbols: ['DRIV'] },
  { key: 'grid', name: '电网', group: 'industry', groupLabel: '先进制造', symbols: ['GRID'] },
  { key: 'defense', name: '军工', group: 'industry', groupLabel: '先进制造', symbols: ['ITA'] },
  { key: 'nuclear', name: '核电', group: 'resources', groupLabel: '能源资源', symbols: ['NLR'] },
  { key: 'clean-energy', name: '新能源', group: 'resources', groupLabel: '能源资源', symbols: ['ICLN'] },
  { key: 'solar', name: '光伏', group: 'resources', groupLabel: '能源资源', symbols: ['TAN'] },
  { key: 'lithium', name: '锂电池', group: 'resources', groupLabel: '能源资源', symbols: ['LIT'] },
  { key: 'oil', name: '石油', group: 'resources', groupLabel: '能源资源', symbols: ['XOP'] },
  { key: 'natural-gas', name: '天然气', group: 'resources', groupLabel: '能源资源', symbols: ['FCG'] },
  { key: 'copper', name: '铜 / 有色', group: 'resources', groupLabel: '能源资源', symbols: ['COPX'] },
  { key: 'gold', name: '黄金', group: 'resources', groupLabel: '能源资源', symbols: ['GLD'] },
  { key: 'financials', name: '银行金融', group: 'defensive', groupLabel: '稳健消费', symbols: ['XLF'] },
  { key: 'biotech', name: '生物医药', group: 'defensive', groupLabel: '稳健消费', symbols: ['XBI'] },
  { key: 'consumer', name: '消费', group: 'defensive', groupLabel: '稳健消费', symbols: ['XLY'] }
];

const allSymbols = [...new Set([
  ...quoteDefinitions.map(item => item.symbol),
  ...importantStockDefinitions.map(item => item.symbol),
  ...themeDefinitions.flatMap(item => item.symbols)
])];
const stockSymbols = new Set([
  ...importantStockDefinitions.map(item => item.symbol),
  'COHR', 'LITE', 'FN', 'MU', 'WDC', 'STX', 'VRT', 'EQIX', 'DLR',
  'RKLB', 'ASTS', 'RDW', 'IRDM', 'GSAT'
]);
const cacheTtlMs = Number(process.env.US_MARKET_CACHE_MS || 30000);
const requestTimeoutMs = Number(process.env.US_MARKET_TIMEOUT_MS || 12000);
let cachedOverview = null;
const cachedTrends = new Map();

const newYorkFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const newYorkDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '' || value === '--') return null;
  const number = Number(String(value).replace(/[$,%+]/g, '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function average(values) {
  const numbers = values.filter(value => value !== null);
  return numbers.length ? round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
}

function newYorkParts(date) {
  const parts = newYorkFormatter.formatToParts(date);
  const value = key => parts.find(part => part.type === key)?.value || '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: value('weekday'),
    hour: Number(value('hour')),
    minute: Number(value('minute'))
  };
}

function zonedTimeToUtc(parts, hour, minute) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  let timestamp = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = newYorkParts(new Date(timestamp));
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    timestamp += desired - actualWallTime;
  }
  return timestamp;
}

function shiftNewYorkDate(parts, days) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    ...parts,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function overnightStart(date) {
  const parts = newYorkParts(date);
  const startDate = parts.hour < 4 ? shiftNewYorkDate(parts, -1) : parts;
  return zonedTimeToUtc(startDate, 20, 0);
}

function beijingTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp));
}

function resolveSession(date = new Date()) {
  const parts = newYorkParts(date);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const tradingDay = !['Sat', 'Sun'].includes(parts.weekday);
  const overnightTrading = (
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(parts.weekday) && minuteOfDay >= 20 * 60
  ) || (
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(parts.weekday) && minuteOfDay < 4 * 60
  );
  let phase = 'closed';
  if (overnightTrading) phase = 'overnight';
  else if (tradingDay && minuteOfDay >= 4 * 60 && minuteOfDay < 9 * 60 + 30) phase = 'pre-market';
  else if (tradingDay && minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60) phase = 'regular';
  else if (tradingDay && minuteOfDay >= 16 * 60 && minuteOfDay < 20 * 60) phase = 'after-hours';

  const phaseCopy = {
    closed: { label: '休市', detail: '夜盘及延长交易时段均未开放' },
    overnight: { label: '夜盘交易', detail: '24 小时市场夜盘正在更新' },
    'pre-market': { label: '盘前交易', detail: '观察开盘前的风险偏好' },
    regular: { label: '常规交易', detail: '指数分时正在更新' },
    'after-hours': { label: '盘后交易', detail: '观察收盘后的方向延续' }
  };
  const overnightDayOffset = minuteOfDay < 4 * 60 ? -1 : 0;
  const followingDayOffset = minuteOfDay >= 20 * 60 ? 1 : 0;
  const schedule = [
    { key: 'overnight', label: '夜盘', etTime: '20:00', minute: 20 * 60, dayOffset: overnightDayOffset },
    { key: 'pre-market', label: '盘前', etTime: '04:00', minute: 4 * 60, dayOffset: followingDayOffset },
    { key: 'regular', label: '开盘', etTime: '09:30', minute: 9 * 60 + 30, dayOffset: followingDayOffset },
    { key: 'after-hours', label: '盘后', etTime: '16:00', minute: 16 * 60, dayOffset: followingDayOffset }
  ].map(item => {
    const stageDate = shiftNewYorkDate(parts, item.dayOffset);
    const timestamp = zonedTimeToUtc(stageDate, Math.floor(item.minute / 60), item.minute % 60);
    return {
      key: item.key,
      label: item.label,
      etTime: item.etTime,
      beijingTime: beijingTime(timestamp),
      active: item.key === phase,
      passed: date.getTime() >= timestamp
    };
  });

  const progressRange = phase === 'overnight'
    ? [20 * 60, 28 * 60]
    : phase === 'pre-market'
    ? [4 * 60, 9 * 60 + 30]
    : phase === 'regular'
      ? [9 * 60 + 30, 16 * 60]
      : phase === 'after-hours'
        ? [16 * 60, 20 * 60]
        : null;
  const progressMinute = phase === 'overnight' && minuteOfDay < 4 * 60 ? minuteOfDay + 24 * 60 : minuteOfDay;
  const progress = progressRange
    ? round((progressMinute - progressRange[0]) / (progressRange[1] - progressRange[0]), 3)
    : 0;

  return {
    phase,
    label: phaseCopy[phase].label,
    detail: phaseCopy[phase].detail,
    newYorkTime: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ET`,
    progress,
    schedule
  };
}

async function fetchJson(url, source) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  if (!response.ok) throw new Error(`${source}请求失败（${response.status}）`);
  return response.json();
}

function extendedLabel(type) {
  if (String(type).includes('PRE')) return '盘前';
  if (String(type).includes('POST')) return '盘后';
  return '延长盘';
}

function normalizeQuote(raw) {
  const extended = raw.ExtendedMktQuote || null;
  return {
    symbol: raw.symbol,
    name: raw.name || raw.shortName || raw.symbol,
    nameZh: symbolNamesZh[raw.symbol] || raw.symbol,
    latest: parseNumber(raw.last),
    change: parseNumber(raw.change),
    changePct: parseNumber(raw.change_pct),
    extendedLatest: parseNumber(extended?.last),
    extendedChange: parseNumber(extended?.change),
    extendedChangePct: parseNumber(extended?.change_pct),
    extendedType: extended?.type || null,
    extendedLabel: extended ? extendedLabel(extended.type) : '延长盘',
    updatedAt: extended?.last_timedate || raw.last_timedate || raw.last_time || '',
    realTime: raw.realTime === 'true'
  };
}

async function loadCnbcQuotes() {
  const url = new URL('https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol');
  url.search = new URLSearchParams({
    symbols: allSymbols.join('|'),
    requestMethod: 'quick',
    noform: '1',
    partnerId: '2',
    fund: '1',
    exthrs: '1',
    output: 'json'
  });
  const payload = await fetchJson(url, 'CNBC行情');
  const rows = payload?.FormattedQuoteResult?.FormattedQuote;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('CNBC行情未返回有效数据');
  return rows.map(normalizeQuote);
}

async function loadOvernightQuotes() {
  const url = new URL('https://api.robinhood.com/quotes/');
  url.searchParams.set('symbols', allSymbols.join(','));
  url.searchParams.set('bounds', '24_5');
  const payload = await fetchJson(url, 'Robinhood夜盘行情');
  if (!Array.isArray(payload?.results)) throw new Error('Robinhood夜盘行情未返回有效数据');
  return payload.results;
}

function applyOvernightQuote(quote, overnightQuote, startedAt) {
  const latest = parseNumber(overnightQuote?.last_non_reg_trade_price);
  const previousClose = parseNumber(overnightQuote?.previous_close);
  const updatedAt = Date.parse(overnightQuote?.venue_last_non_reg_trade_time || '');
  const hasCurrentTrade = Number.isFinite(updatedAt) && updatedAt >= startedAt && latest !== null && previousClose !== null && previousClose !== 0;
  return {
    ...quote,
    extendedLatest: hasCurrentTrade ? latest : null,
    extendedChange: hasCurrentTrade ? round(latest - previousClose) : null,
    extendedChangePct: hasCurrentTrade ? round((latest / previousClose - 1) * 100) : null,
    extendedType: 'OVERNIGHT',
    extendedLabel: '夜盘',
    updatedAt: hasCurrentTrade ? overnightQuote.venue_last_non_reg_trade_time : quote.updatedAt
  };
}

async function loadQuotes(session, observedAt) {
  const quotes = await loadCnbcQuotes();
  if (session.phase !== 'overnight') return quotes;
  const overnightRows = await loadOvernightQuotes();
  const overnightMap = new Map(overnightRows.map(row => [row.symbol, row]));
  const startedAt = overnightStart(observedAt);
  return quotes.map(quote => applyOvernightQuote(quote, overnightMap.get(quote.symbol), startedAt));
}

function chartPhase(label) {
  const match = String(label).match(/(\d+):(\d+)\s+(AM|PM)/i);
  if (!match) return 'regular';
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  const minute = hour * 60 + Number(match[2]);
  if (minute < 9 * 60 + 30) return 'pre-market';
  if (minute < 16 * 60) return 'regular';
  return 'after-hours';
}

function nasdaqTimestamp(value) {
  const wallTime = new Date(Number(value));
  if (!Number.isFinite(wallTime.getTime())) return Number(value);
  const parts = {
    year: wallTime.getUTCFullYear(),
    month: wallTime.getUTCMonth() + 1,
    day: wallTime.getUTCDate()
  };
  return zonedTimeToUtc(parts, wallTime.getUTCHours(), wallTime.getUTCMinutes());
}

async function loadNasdaqChart(symbol, assetClass) {
  const url = new URL(`https://api.nasdaq.com/api/quote/${symbol}/chart`);
  url.searchParams.set('assetclass', assetClass);
  const payload = await fetchJson(url, `Nasdaq ${symbol}分时`);
  const data = payload?.data;
  if (!data || !Array.isArray(data.chart) || data.chart.length === 0) {
    throw new Error(`Nasdaq ${symbol}分时未返回有效数据`);
  }
  const previousClose = parseNumber(data.previousClose);
  const points = data.chart
    .filter((_, index) => index % 5 === 0 || index === data.chart.length - 1)
    .map(point => ({
      time: nasdaqTimestamp(point.x),
      value: Number(point.y),
      changePct: previousClose ? round((Number(point.y) / previousClose - 1) * 100, 3) : null,
      phase: chartPhase(point.z?.dateTime),
      etTime: point.z?.dateTime || ''
    }));
  return {
    symbol,
    name: data.company || symbol,
    marketDate: data.timeAsOf || '',
    previousClose,
    points
  };
}

async function loadIndexChart(definition) {
  return {
    ...await loadNasdaqChart(definition.symbol, 'etf'),
    key: definition.key,
    name: definition.name
  };
}

async function loadOvernightChart(symbol) {
  const url = new URL(`https://api.robinhood.com/quotes/historicals/${symbol}/`);
  url.searchParams.set('interval', '5minute');
  url.searchParams.set('span', 'day');
  url.searchParams.set('bounds', '24_5');
  const payload = await fetchJson(url, `Robinhood ${symbol}夜盘分时`);
  if (!Array.isArray(payload?.historicals)) throw new Error(`Robinhood ${symbol}夜盘分时未返回有效数据`);
  const previousClose = parseNumber(payload.previous_close_price);
  const openTime = Date.parse(payload.open_time || '');
  if (previousClose === null || !Number.isFinite(openTime)) throw new Error(`Robinhood ${symbol}夜盘分时缺少基准数据`);
  const points = payload.historicals
    .filter(point => point.session === 'overnight' && point.interpolated === false && Date.parse(point.begins_at) >= openTime)
    .map(point => {
      const value = Number(point.close_price);
      return {
        time: Date.parse(point.begins_at),
        value,
        changePct: round((value / previousClose - 1) * 100, 3),
        phase: 'overnight',
        etTime: ''
      };
    });
  return {
    symbol,
    name: symbol,
    marketDate: newYorkDateFormatter.format(new Date(openTime)),
    previousClose,
    points
  };
}

async function loadUsMarketTrend(symbol, { force = false } = {}) {
  const session = resolveSession();
  const now = Date.now();
  const cacheKey = `${session.phase}:${symbol}`;
  const cached = cachedTrends.get(cacheKey);
  if (!force && cached && now - cached.storedAt < cacheTtlMs) return cached.data;

  const chart = session.phase === 'overnight'
    ? await loadOvernightChart(symbol)
    : await loadNasdaqChart(symbol, stockSymbols.has(symbol) ? 'stocks' : 'etf');
  if (chart.previousClose === null) throw new Error(`${symbol}分时缺少昨收价`);
  const data = {
    ...chart,
    nameZh: symbolNamesZh[symbol],
    updatedAt: new Date().toISOString(),
    source: session.phase === 'overnight' ? 'Robinhood 24 小时市场' : 'Nasdaq 分时',
    sessionLabel: session.phase === 'overnight' ? '夜盘走势' : '全时段走势',
    baselineLabel: session.phase === 'overnight' ? '常规盘收盘' : '上一常规盘收盘'
  };
  cachedTrends.set(cacheKey, { storedAt: now, data });
  return data;
}

function activeChange(changePct, extendedChangePct, phase) {
  return phase === 'regular' ? changePct : extendedChangePct;
}

function buildThemes(quoteMap, session) {
  return themeDefinitions.map(definition => {
    const members = definition.symbols.map(symbol => quoteMap.get(symbol)).filter(Boolean);
    if (members.length === 0) throw new Error(`${definition.name}代理标的缺少行情`);
    const changePct = average(members.map(item => item.changePct));
    const extendedChangePct = average(members.map(item => item.extendedChangePct));
    return {
      key: definition.key,
      name: definition.name,
      group: definition.group,
      groupLabel: definition.groupLabel,
      proxyLabel: definition.symbols.join(' / '),
      changePct,
      extendedChangePct,
      activeChangePct: activeChange(changePct, extendedChangePct, session.phase),
      extendedLabel: members.find(item => item.extendedType)?.extendedLabel || '延长盘',
      members
    };
  });
}

async function loadUsMarketOverview({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedOverview && now - cachedOverview.storedAt < cacheTtlMs) return cachedOverview.data;

  const observedAt = new Date();
  const session = resolveSession(observedAt);
  const chartRequests = quoteDefinitions.map(definition => loadIndexChart(definition));
  const [quotes, chartResults] = await Promise.all([
    loadQuotes(session, observedAt),
    Promise.allSettled(chartRequests)
  ]);
  const quoteMap = new Map(quotes.map(quote => [quote.symbol, quote]));
  const charts = chartResults
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  const chartErrors = chartResults
    .filter(result => result.status === 'rejected')
    .map(result => result.reason instanceof Error ? result.reason.message : '分时数据请求失败');
  const chartMap = new Map(charts.map(chart => [chart.symbol, chart]));
  const indexes = quoteDefinitions.map(definition => {
    const quote = quoteMap.get(definition.symbol);
    if (!quote) throw new Error(`${definition.symbol}缺少行情`);
    return {
      ...quote,
      ...definition,
      activeChangePct: activeChange(quote.changePct, quote.extendedChangePct, session.phase),
      marketDate: chartMap.get(definition.symbol)?.marketDate || '',
      previousClose: chartMap.get(definition.symbol)?.previousClose || null,
      points: chartMap.get(definition.symbol)?.points || []
    };
  });
  const importantStocks = importantStockDefinitions.map(definition => {
    const quote = quoteMap.get(definition.symbol);
    if (!quote) throw new Error(`${definition.symbol}缺少行情`);
    return quote;
  });
  const themes = buildThemes(quoteMap, session);
  const rankedThemes = themes
    .filter(theme => theme.activeChangePct !== null)
    .sort((left, right) => right.activeChangePct - left.activeChangePct);
  const advancing = themes.filter(theme => (theme.activeChangePct ?? 0) > 0).length;
  const declining = themes.filter(theme => (theme.activeChangePct ?? 0) < 0).length;
  const flat = themes.filter(theme => theme.activeChangePct === 0).length;
  const data = {
    updatedAt: new Date().toISOString(),
    marketDate: indexes.find(index => index.marketDate)?.marketDate || '',
    source: session.phase === 'overnight' ? 'CNBC 正股 · Robinhood 夜盘 · Nasdaq 分时' : 'CNBC 报价 · Nasdaq 分时',
    refreshAfterMs: cacheTtlMs,
    session,
    indexes,
    importantStocks,
    themes,
    breadth: {
      advancing,
      declining,
      flat,
      averageChangePct: average(themes.map(theme => theme.activeChangePct)),
      strongest: rankedThemes.slice(0, 3).map(theme => theme.key),
      weakest: rankedThemes.slice(-3).reverse().map(theme => theme.key)
    },
    chartStatus: {
      level: chartErrors.length === 0 ? 'ok' : charts.length ? 'partial' : 'error',
      text: chartErrors.length === 0 ? '四大指数分时完整' : `${charts.length}/4 组指数分时可用`,
      detail: chartErrors.join('；')
    },
    note: session.phase === 'overnight'
      ? '夜盘涨跌与个股走势来自 Robinhood 24 小时市场，按最近常规盘收盘价计算；没有当前夜盘成交的标的显示 --，且不参与主题温度和强弱排序。主题按所列 ETF 或代表公司等权计算。行情可能存在数据源延迟，不构成投资建议。'
      : '主题涨跌按所列 ETF 或代表公司等权计算；延长盘覆盖盘前与盘后。行情可能存在数据源延迟，不构成投资建议。'
  };
  cachedOverview = { storedAt: now, data };
  return data;
}

async function handleUsMarketOverview(url, res) {
  try {
    const data = await loadUsMarketOverview({ force: url.searchParams.get('force') === '1' });
    sendJson(res, 200, data);
  } catch (reason) {
    sendJson(res, 502, {
      error: reason instanceof Error ? reason.message : '美股行情请求失败'
    });
  }
}

async function handleUsMarketTrend(url, res) {
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!allSymbols.includes(symbol)) {
    sendJson(res, 400, { error: '不支持的美股标的' });
    return;
  }

  try {
    const data = await loadUsMarketTrend(symbol, { force: url.searchParams.get('force') === '1' });
    sendJson(res, 200, data);
  } catch (reason) {
    sendJson(res, 502, {
      error: reason instanceof Error ? reason.message : '美股走势请求失败'
    });
  }
}

export { handleUsMarketOverview, handleUsMarketTrend, loadUsMarketOverview, loadUsMarketTrend };
