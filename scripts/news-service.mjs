import { createHash } from 'node:crypto';

const NEWS_CACHE_TTL_MS = Number(process.env.NEWS_CACHE_TTL_MS || 2000);
const NEWS_FETCH_TIMEOUT_MS = Number(process.env.NEWS_FETCH_TIMEOUT_MS || 6500);
const NEWS_REFRESH_AFTER_MS = Number(process.env.NEWS_REFRESH_AFTER_MS || 3000);
const NEWS_MAX_AGE_MS = Number(process.env.NEWS_MAX_AGE_MS || 72 * 60 * 60 * 1000);
const NEWS_TRANSLATE_TIMEOUT_MS = Number(process.env.NEWS_TRANSLATE_TIMEOUT_MS || 8000);
const NEWS_TRANSLATE_WAIT_MS = Number(process.env.NEWS_TRANSLATE_WAIT_MS || 1200);
const NEWS_TRANSLATE_ENABLED = process.env.NEWS_TRANSLATE_ENABLED !== '0';
const RSS_REFRESH_MS = Number(process.env.NEWS_RSS_REFRESH_MS || 30000);
const NEWS_STREAM_INTERVAL_MS = Number(process.env.NEWS_STREAM_INTERVAL_MS || 3000);
const NEWS_STREAM_HEARTBEAT_MS = Number(process.env.NEWS_STREAM_HEARTBEAT_MS || 15000);
const NEWS_STREAM_SNAPSHOT_LIMIT = Number(process.env.NEWS_STREAM_SNAPSHOT_LIMIT || 20);
const NEWS_STREAM_SEEN_LIMIT = Number(process.env.NEWS_STREAM_SEEN_LIMIT || 2000);
const NEWS_STREAM_HISTORY_LIMIT = Number(process.env.NEWS_STREAM_HISTORY_LIMIT || 500);

const DEFAULT_NEWS_SOURCES = [
  {
    key: 'ths-flash',
    name: '同花顺7×24快讯',
    url: 'https://news.10jqka.com.cn/tapp/news/push/stock/?page=1',
    tier: 1,
    type: 'ths-json',
    refreshMs: 3000
  },
  { key: 'bbc-world', name: 'BBC世界新闻', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tier: 1, refreshMs: RSS_REFRESH_MS },
  { key: 'bbc-business', name: 'BBC商业', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', tier: 1, refreshMs: RSS_REFRESH_MS },
  { key: 'nyt-world', name: '《纽约时报》', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', tier: 1, refreshMs: RSS_REFRESH_MS },
  { key: 'wsj-world', name: '《华尔街日报》', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', tier: 1, refreshMs: RSS_REFRESH_MS },
  { key: 'guardian-world', name: '英国《卫报》', url: 'https://www.theguardian.com/world/rss', tier: 2, refreshMs: RSS_REFRESH_MS },
  { key: 'npr-world', name: 'NPR世界新闻', url: 'https://feeds.npr.org/1004/rss.xml', tier: 2, refreshMs: RSS_REFRESH_MS },
  { key: 'aljazeera', name: '半岛电视台', url: 'https://www.aljazeera.com/xml/rss/all.xml', tier: 2, refreshMs: RSS_REFRESH_MS }
];

const CRITICAL_EVENT_RULES = [
  {
    label: '军事冲突显著升级',
    score: 2.4,
    test: /\b(declares? war|invasion|missile (attack|strike)|airstrikes?|nuclear (attack|threat|weapon)|martial law)\b|宣战|入侵|导弹袭击|空袭|核威胁|戒严|军事打击|扩大打击|轰炸|交火|(美军|军方|以色列|伊朗|俄罗斯|乌克兰).{0,12}(袭击|打击)/i
  },
  {
    label: '系统性金融风险',
    score: 2.4,
    test: /\b(bank run|sovereign default|systemic risk|financial crisis|debt default)\b|银行挤兑|主权违约|系统性风险|金融危机|债务违约/i
  },
  {
    label: '主要央行紧急行动',
    score: 2.2,
    test: /\b(emergency rate (cut|hike)|unexpectedly (cuts?|raises?) (interest )?rates?)\b|紧急降息|紧急加息|意外降息|意外加息/i
  },
  {
    label: '重大自然灾害',
    score: 2,
    test: /\b(magnitude [78](?:\.\d)?|major earthquake|tsunami warning|catastrophic (flood|wildfire))\b|[78]级地震|强震|海啸预警|特大洪水|特大山火/i
  }
];

const MAJOR_EVENT_RULES = [
  {
    label: '全球货币政策变化',
    score: 1.4,
    test: /\b(federal reserve|fed |ecb|bank of japan|people'?s bank of china|central bank).{0,45}\b(rate|interest|quantitative|liquidity|inflation)\b|(美联储|欧洲央行|日本央行|央行).{0,16}(降息|加息|降准|流动性|利率|通胀)/i
  },
  {
    label: '关税或制裁政策',
    score: 1.4,
    test: /\b(tariffs?|sanctions?|export controls?|trade war|import ban|export ban)\b|关税|制裁|出口管制|贸易战|禁运/i
  },
  {
    label: '重要宏观数据',
    score: 1.15,
    test: /\b(inflation|consumer prices?|cpi|gross domestic product|gdp|recession|jobs report|unemployment)\b|通胀|消费者价格|国内生产总值|衰退|非农|失业率/i
  },
  {
    label: '能源供应变化',
    score: 1.25,
    test: /\b(opec|oil supply|crude oil|gas supply|pipeline|strait of hormuz)\b|欧佩克|原油供应|天然气供应|输油管道|霍尔木兹海峡/i
  },
  {
    label: '重大科技或产业政策',
    score: 1.15,
    test: /\b(semiconductor|advanced chips?|artificial intelligence|ai model|chip subsidy|technology ban)\b|半导体|先进芯片|人工智能|芯片补贴|科技禁令/i
  },
  {
    label: '政权或国家级政策变动',
    score: 1.15,
    test: /\b(coup|impeachment|resigns?|snap election|state of emergency|peace agreement|ceasefire)\b|政变|弹劾|辞职|提前大选|紧急状态|和平协议|停火/i
  },
  {
    label: '重大企业或市场事件',
    score: 1,
    test: /\b(bankruptcy|files? for chapter 11|mega-?merger|antitrust ruling|cyberattack|data breach)\b|破产|大型并购|反垄断裁决|网络攻击|数据泄露/i
  }
];

const IMPACT_RULES = [
  {
    test: /\b(rate cut|cuts? (interest )?rates?|monetary easing|quantitative easing)\b|降息|降准|量化宽松|货币宽松/i,
    impacts: [
      ['证券', 'positive', 4, '流动性宽松通常提升风险偏好和成交活跃度，需确认政策是否正式落地。'],
      ['黄金', 'positive', 3, '利率下行可能降低黄金持有的机会成本。'],
      ['银行', 'negative', 2, '利率下行可能压缩净息差，宽信用对冲效果需继续观察。']
    ]
  },
  {
    test: /\b(rate hike|raises? (interest )?rates?|monetary tightening|hawkish)\b|加息|货币紧缩|鹰派/i,
    impacts: [
      ['证券', 'negative', 4, '利率上行通常压制估值和风险偏好。'],
      ['人工智能', 'negative', 3, '高估值成长资产对折现率上行更敏感。'],
      ['黄金', 'negative', 2, '实际利率上行可能对黄金形成阶段性压力。']
    ]
  },
  {
    test: /\b(bank run|bank failure|banking crisis|credit crisis|sovereign default)\b|银行挤兑|银行破产|银行危机|信贷危机|主权违约/i,
    impacts: [
      ['银行', 'negative', 5, '信用风险和流动性压力可能向银行体系传导。'],
      ['证券', 'negative', 4, '系统性风险往往压制市场风险偏好。'],
      ['黄金', 'positive', 4, '金融稳定性担忧可能提升避险需求。']
    ]
  },
  {
    test: /\b(chip|semiconductor).{0,45}(export controls?|ban|sanctions?|restriction)|\b(export controls?|ban|sanctions?).{0,45}(chip|semiconductor)\b|芯片.{0,18}(出口管制|禁令|制裁|限制)|(出口管制|禁令|制裁).{0,18}半导体/i,
    impacts: [
      ['半导体材料设备', 'negative', 5, '先进制程供应、设备与终端需求可能同时受限。'],
      ['半导体', 'negative', 4, '出口管制可能改变产能、客户与供应链预期。'],
      ['人工智能', 'negative', 3, '高端芯片可得性下降会影响算力扩张节奏。']
    ]
  },
  {
    test: /\b(chip|semiconductor).{0,45}(subsidy|investment|factory|breakthrough|funding)|\b(chips act)\b|半导体.{0,18}(补贴|投资|建厂|突破|基金)|芯片法案/i,
    impacts: [
      ['半导体材料设备', 'positive', 4, '扩产和政策资金有望增加设备、材料的中期订单。'],
      ['半导体', 'positive', 4, '产业投资与技术突破可能改善行业增长预期。']
    ]
  },
  {
    test: /\b(ai|artificial intelligence).{0,45}(investment|spending|data cent(?:er|re)|orders?|demand|new model|launch)|\b(data cent(?:er|re)|cloud).{0,45}(investment|spending|demand)\b|人工智能.{0,18}(投资|支出|大模型|数据中心|需求|发布)|算力.{0,12}(投资|需求|订单)/i,
    impacts: [
      ['算力租赁', 'positive', 4, 'AI 资本开支上行可能增加数据中心与算力服务需求。'],
      ['CPO', 'positive', 4, '高密度算力集群扩张有望带动高速光连接需求。'],
      ['液冷服务器', 'positive', 3, '高功率 AI 服务器扩张可能提高液冷渗透率。'],
      ['AI应用', 'positive', 3, '模型能力与投入增加可能加快应用商业化。']
    ]
  },
  {
    test: /\b(ai|artificial intelligence|ai model).{0,45}(integration|integrated|adoption|deployment|partnership)\b|(?:AI|人工智能|大模型|千问).{0,18}(集成|接入|采用|部署|备案|合作|落地)/i,
    impacts: [
      ['AI应用', 'positive', 4, 'AI 能力进入操作系统或终端场景，有利于应用渗透和商业化预期。'],
      ['消费电子', 'positive', 3, '端侧智能功能落地可能提升换机与软硬件生态价值预期。']
    ]
  },
  {
    test: /\b(oil|gas|pipeline|tanker|strait of hormuz).{0,40}(attack|disruption|shutdown|sanction|shortage)|\b(opec).{0,30}(cuts?|reduces?)\b|原油.{0,16}(中断|减产|制裁|短缺)|天然气.{0,16}(断供|短缺)|霍尔木兹.{0,10}(封锁|中断)/i,
    impacts: [
      ['油气', 'positive', 4, '供应中断风险可能推高能源风险溢价。'],
      ['化工', 'negative', 3, '原料价格上行可能压缩部分中下游产品利润。'],
      ['机场航空', 'negative', 4, '航油成本上行通常压制航空业盈利预期。']
    ]
  },
  {
    test: /\b(ceasefire|peace agreement|peace deal)\b|停火|和平协议/i,
    impacts: [
      ['黄金', 'negative', 3, '地缘冲突缓和可能降低短期避险溢价。'],
      ['油气', 'negative', 3, '供应中断风险降低可能压缩能源风险溢价。'],
      ['机场航空', 'positive', 3, '航线风险和燃料风险缓和有利于成本预期。']
    ]
  },
  {
    test: /\b(war|invasion|missile|airstrike|military conflict|geopolitical tension)\b|\b(?:us|u\.s\.|israel|iran|russia|ukraine|military).{0,24}(?:strikes?|attacks?)\b|战争|入侵|导弹|空袭|军事冲突|军事打击|扩大打击|轰炸|交火|地缘紧张|(美军|军方|以色列|伊朗|俄罗斯|乌克兰).{0,12}(袭击|打击)/i,
    impacts: [
      ['黄金', 'positive', 4, '地缘风险升温通常提升避险资产需求。'],
      ['军工', 'positive', 4, '安全局势紧张可能提升军费与装备订单预期。'],
      ['证券', 'negative', 3, '风险偏好回落和波动率上升可能压制市场估值。']
    ]
  },
  {
    test: /\b(tariffs?|trade war|import duties|import ban)\b|关税|贸易战|进口禁令/i,
    impacts: [
      ['消费电子', 'negative', 4, '跨境供应链和终端价格可能受关税与需求下降影响。'],
      ['汽车零部件', 'negative', 3, '贸易摩擦可能增加出口成本与供应链不确定性。'],
      ['航运港口', 'negative', 3, '贸易量预期下调可能压制集运与港口需求。']
    ]
  },
  {
    test: /\b(stimulus|support package|fiscal spending).{0,45}(china|chinese)|\b(china|chinese).{0,45}(stimulus|support package|fiscal spending)\b|中国.{0,18}(刺激政策|稳增长|财政支出|一揽子政策)/i,
    impacts: [
      ['证券', 'positive', 4, '稳增长政策可能改善盈利和风险偏好预期。'],
      ['建筑', 'positive', 3, '财政发力通常带动基建和工程需求。'],
      ['建材', 'positive', 3, '基建与地产链需求预期改善可能带动建材消耗。']
    ]
  },
  {
    test: /\b(property|housing|mortgage).{0,35}(support|easing|rescue|stimulus)|房地产.{0,16}(支持|放松|纡困|刺激)|房贷.{0,12}(降息|放松)/i,
    impacts: [
      ['房地产', 'positive', 4, '需求端和融资端支持可能改善行业现金流预期。'],
      ['建材', 'positive', 3, '地产施工和竣工预期改善有利于上游建材需求。'],
      ['银行', 'positive', 2, '地产信用风险缓和可能改善银行资产质量预期。']
    ]
  },
  {
    test: /\b(drug|medicine|therapy|vaccine).{0,40}(approval|approved|trial success|breakthrough)|\b(fda|ema).{0,30}(approves?|approval)\b|创新药.{0,16}(获批|临床成功|突破)|药物.{0,12}(获批|试验成功)/i,
    impacts: [
      ['创新药', 'positive', 4, '获批或关键临床进展可能提升同赛道管线估值。'],
      ['CRO', 'positive', 3, '研发成功率与投入预期改善可能带动外包研发需求。']
    ]
  },
  {
    test: /\b(drug|medicine|therapy|vaccine).{0,40}(trial failure|fails? trial|safety warning|recall)|创新药.{0,16}(临床失败|安全警示|召回)|药物.{0,12}(试验失败|召回)/i,
    impacts: [
      ['创新药', 'negative', 4, '临床或安全性事件可能降低管线估值和风险偏好。'],
      ['CRO', 'negative', 2, '研发失败可能影响部分赛道的试验投入预期。']
    ]
  },
  {
    test: /\b(power grid|electric grid|transmission).{0,35}(investment|spending|upgrade|contract)|电网.{0,16}(投资|升级|建设|订单)|特高压.{0,12}(投资|建设)/i,
    impacts: [
      ['电网设备', 'positive', 4, '输配电投资上行可能直接增加设备订单。'],
      ['电力设备', 'positive', 3, '电网扩容与改造有利于电源、输变电产业链需求。']
    ]
  },
  {
    test: /\b(cyberattack|ransomware|data breach|critical infrastructure hack)\b|网络攻击|勒索软件|数据泄露|关键基础设施被黑/i,
    impacts: [
      ['网络安全', 'positive', 3, '重大安全事件通常提升政企安全预算与合规需求。']
    ]
  },
  {
    test: /\b(space launch|satellite launch|rocket contract|lunar mission)\b|航天发射|卫星发射|火箭订单|登月任务/i,
    impacts: [
      ['商业航天', 'positive', 3, '发射任务和合同增加可能提升卫星、火箭与地面系统需求。']
    ]
  },
  {
    test: /\b(shipping|container ship|port|red sea).{0,35}(attack|closure|disruption|blocked)|航运.{0,16}(中断|袭击|延误)|港口.{0,12}(关闭|堵塞)|红海.{0,12}(袭击|中断)/i,
    impacts: [
      ['航运港口', 'positive', 3, '运力受限和绕行可能推高运价，但需同时评估成本与安全风险。'],
      ['消费电子', 'negative', 2, '物流延误和运费上行可能增加出口供应链成本。']
    ]
  }
];

let newsCache = { payload: null, expiresAt: 0 };
let newsInflight = null;
const newsSourceCache = new Map();
const newsSourceInflight = new Map();
const newsTranslationCache = new Map();
const newsTranslationInflight = new Set();
const thsNewsState = { cursor: 0, items: new Map() };
const newsStreamState = {
  clients: new Set(),
  timer: null,
  heartbeatTimer: null,
  collecting: false,
  initialized: false,
  seenIds: new Set(),
  seenOrder: [],
  alertHistory: [],
  latestAlerts: [],
  lastCollectedAt: '',
  status: 'idle',
  lastError: ''
};

async function loadNewsAlerts({ limit = 120, force = false } = {}) {
  const cappedLimit = clamp(Math.trunc(Number(limit) || 120), 1, 200);
  const now = Date.now();
  if (!force && newsCache.payload && now < newsCache.expiresAt) {
    return slicePayload(newsCache.payload, cappedLimit);
  }
  if (!newsInflight) {
    newsInflight = refreshNewsAlerts()
      .then(payload => {
        newsCache = { payload, expiresAt: Date.now() + NEWS_CACHE_TTL_MS };
        return payload;
      })
      .catch(error => {
        if (!newsCache.payload) throw error;
        return {
          ...newsCache.payload,
          updatedAt: new Date().toISOString(),
          sourceStatus: {
            level: 'warn',
            text: '沿用新闻缓存',
            detail: `本轮全部新闻源请求失败：${error.message || error}`
          }
        };
      })
      .finally(() => {
        newsInflight = null;
      });
  }
  return slicePayload(await newsInflight, cappedLimit);
}

async function refreshNewsAlerts() {
  const sources = newsSources();
  const results = await Promise.allSettled(sources.map(loadNewsSource));
  const sourceStatus = results.map((result, index) => {
    const source = sources[index];
    return result.status === 'fulfilled'
      ? {
          key: source.key,
          name: source.name,
          status: result.value.stale ? 'stale' : 'ok',
          itemCount: result.value.items.length,
          refreshMs: source.refreshMs || RSS_REFRESH_MS
        }
      : { key: source.key, name: source.name, status: 'error', itemCount: 0, error: String(result.reason?.message || result.reason || '请求失败') };
  });
  const articles = results.flatMap(result => result.status === 'fulfilled' ? result.value.items : []);
  if (!articles.length) throw new Error('没有新闻源返回可用内容');

  const scoredAlerts = deduplicateArticles(articles)
    .map(scoreNewsArticle)
    .filter(item => Date.now() - newsDateMs(item.publishedAt) <= NEWS_MAX_AGE_MS)
    .sort((a, b) => newsDateMs(b.publishedAt) - newsDateMs(a.publishedAt))
    .slice(0, 80);
  const alerts = await translateAlertsToChinese(scoredAlerts);
  const okCount = sourceStatus.filter(item => item.status === 'ok' || item.status === 'stale').length;
  const failedNames = sourceStatus.filter(item => item.status === 'error').map(item => item.name);
  return {
    updatedAt: new Date().toISOString(),
    refreshAfterMs: NEWS_REFRESH_AFTER_MS,
    sourceStatus: {
      level: failedNames.length ? 'warn' : 'live',
      text: failedNames.length ? `实时聚合 ${okCount}/${sources.length}` : '全球新闻实时聚合',
      detail: failedNames.length ? `本轮未连通：${failedNames.join('、')}` : '全部新闻源已更新。'
    },
    sources: sourceStatus,
    alerts
  };
}

async function loadNewsSource(source) {
  const now = Date.now();
  const cached = newsSourceCache.get(source.key);
  if (cached && now < cached.expiresAt) {
    return { items: cached.items, stale: false };
  }
  if (cached?.items?.length && source.type !== 'ths-json') {
    void refreshNewsSource(source).catch(() => {});
    return { items: cached.items, stale: true };
  }
  try {
    const items = await refreshNewsSource(source);
    return { items, stale: false };
  } catch (error) {
    if (cached?.items?.length) return { items: cached.items, stale: true, error: error.message || String(error) };
    throw error;
  }
}

function refreshNewsSource(source) {
  if (newsSourceInflight.has(source.key)) return newsSourceInflight.get(source.key);
  const request = fetchNewsFeed(source)
    .then(items => {
      newsSourceCache.set(source.key, {
        items,
        expiresAt: Date.now() + Math.max(2000, Number(source.refreshMs) || RSS_REFRESH_MS)
      });
      return items;
    })
    .finally(() => {
      newsSourceInflight.delete(source.key);
    });
  newsSourceInflight.set(source.key, request);
  return request;
}

async function fetchNewsFeed(source) {
  if (source.type === 'ths-json') return fetchThsNewsFeed(source);
  const response = await fetch(source.url, {
    headers: {
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      'user-agent': 'A-Share-Fund-Flow-News/1.0 (+local-dashboard)'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(NEWS_FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  const rows = parseFeedXml(xml, source).slice(0, 40);
  if (!rows.length) throw new Error('新闻源内容为空');
  return rows;
}

async function fetchThsNewsFeed(source) {
  const url = new URL(source.url);
  url.searchParams.set('page', '1');
  url.searchParams.set('tag', '');
  url.searchParams.set('track', 'website');
  url.searchParams.set('pagesize', '100');
  if (thsNewsState.cursor > 0) url.searchParams.set('ctime', String(thsNewsState.cursor));
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: 'https://news.10jqka.com.cn/realtimenews.html',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(NEWS_FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  rows.forEach(item => {
    const timestamp = Number(item?.ctime || item?.rtime) || 0;
    if (timestamp > thsNewsState.cursor) thsNewsState.cursor = timestamp;
  });
  parseThsNews(payload, source).forEach(item => thsNewsState.items.set(item.id, item));
  const retained = [...thsNewsState.items.values()]
    .filter(item => Date.now() - newsDateMs(item.publishedAt) <= NEWS_MAX_AGE_MS)
    .sort((a, b) => newsDateMs(b.publishedAt) - newsDateMs(a.publishedAt))
    .slice(0, 200);
  thsNewsState.items = new Map(retained.map(item => [item.id, item]));
  return retained;
}

function parseThsNews(payload, source) {
  const rows = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  return rows
    .filter(isRelevantThsNews)
    .map((item, index) => {
      const title = cleanFeedText(item?.title || '');
      const summary = cleanFeedText(item?.digest || item?.short || '');
      const timestamp = Number(item?.ctime || item?.rtime) * 1000;
      const publishedAt = Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();
      const url = cleanFeedUrl(item?.url || item?.shareUrl || item?.appUrl || '');
      return {
        id: stableNewsId(`ths:${item?.id || item?.seq || `${title}:${index}`}`),
        title,
        summary: summary.slice(0, 520),
        url,
        source: source.name,
        sourceKey: source.key,
        sourceTier: source.tier,
        sourceMarkedImportant: String(item?.color || '') === '2' || String(item?.import || '') === '3',
        publishedAt
      };
    })
    .filter(item => item.title && item.title.length >= 6)
    .slice(0, 40);
}

function isRelevantThsNews(item) {
  if (String(item?.color || '') === '2' || String(item?.import || '') === '3') return true;
  const tags = Array.isArray(item?.tags) ? item.tags.map(tag => tag?.name || '').join(' ') : '';
  const text = `${item?.title || ''} ${item?.digest || ''} ${item?.tag || ''} ${tags}`;
  return /(全球|国际|海外|美联储|欧洲央行|日本央行|央行|美国|欧洲|伊朗|以色列|俄罗斯|乌克兰|关税|制裁|原油|黄金|汇率|美元|通胀|非农|芯片禁令|出口管制|停火|战争|导弹|地震|海啸)/i.test(text);
}

function parseFeedXml(xml, source) {
  const rssItems = [...String(xml || '').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  const atomEntries = [...String(xml || '').matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map(match => match[1]);
  return [...rssItems, ...atomEntries].map((block, index) => {
    const title = cleanFeedText(readXmlTag(block, ['title']));
    const description = cleanFeedText(readXmlTag(block, ['description', 'summary', 'content:encoded', 'content']));
    const publishedRaw = cleanFeedText(readXmlTag(block, ['pubDate', 'published', 'updated', 'dc:date']));
    const publishedAt = normalizePublishedAt(publishedRaw);
    const url = cleanFeedUrl(readFeedLink(block) || readXmlTag(block, ['guid', 'id']));
    return {
      id: stableNewsId(url || `${source.key}:${title}:${publishedAt || index}`),
      title,
      summary: description.slice(0, 520),
      url,
      source: source.name,
      sourceKey: source.key,
      sourceTier: source.tier,
      publishedAt: publishedAt || new Date().toISOString()
    };
  }).filter(item => item.title && item.title.length >= 8);
}

function readXmlTag(block, names) {
  const tags = names.map(escapeRegExp).join('|');
  const match = String(block || '').match(new RegExp(`<(?:${tags})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:${tags})>`, 'i'));
  return match?.[1] || '';
}

function readFeedLink(block) {
  const atom = String(block || '').match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
  if (atom?.[1]) return decodeXmlEntities(atom[1]);
  return readXmlTag(block, ['link']);
}

function cleanFeedText(value) {
  let text = String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let pass = 0; pass < 3; pass += 1) {
    text = decodeXmlEntities(text)
      .replace(/<\/(?:p|div|li|h\d)>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…'
  };
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => safeCodePoint(Number(code)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip);/gi, (_, name) => named[name.toLowerCase()] || _);
}

function safeCodePoint(code) {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
  } catch {
    return '';
  }
}

function cleanFeedUrl(value) {
  const decoded = decodeXmlEntities(cleanFeedText(value));
  try {
    const url = new URL(decoded);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function normalizePublishedAt(value) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function deduplicateArticles(articles) {
  const groups = [];
  articles
    .sort((a, b) => newsDateMs(b.publishedAt) - newsDateMs(a.publishedAt))
    .forEach(article => {
      const exactKey = normalizedTitle(article.title);
      let group = groups.find(item => item.exactKey === exactKey || titleSimilarity(item.primary.title, article.title) >= 0.58);
      if (!group) {
        group = { exactKey, primary: article, sources: new Set(), relatedTitles: [] };
        groups.push(group);
      }
      group.sources.add(article.source);
      group.relatedTitles.push(article.title);
      const currentTier = Number(group.primary.sourceTier) || 3;
      if ((Number(article.sourceTier) || 3) < currentTier) group.primary = article;
    });
  return groups.map(group => ({
    ...group.primary,
    sourceCount: group.sources.size,
    corroboratingSources: [...group.sources],
    relatedTitles: [...new Set(group.relatedTitles)].slice(0, 6)
  }));
}

function titleSimilarity(left, right) {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach(token => {
    if (b.has(token)) shared += 1;
  });
  return shared / Math.max(a.size, b.size);
}

function titleTokens(value) {
  const text = normalizedTitle(value);
  const tokens = new Set((text.match(/[a-z0-9]{3,}/g) || []).filter(word => !ENGLISH_STOP_WORDS.has(word)));
  (text.match(/[\u3400-\u9fff]+/g) || []).forEach(sequence => {
    for (let index = 0; index < sequence.length - 1; index += 1) tokens.add(sequence.slice(index, index + 2));
  });
  return tokens;
}

const ENGLISH_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'after', 'says', 'say', 'into', 'over', 'what', 'why', 'how']);

function normalizedTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreNewsArticle(article) {
  const text = `${article.title} ${article.summary}`;
  const ageMs = Math.max(0, Date.now() - newsDateMs(article.publishedAt));
  let score = 1;
  const reasons = [];
  if (article.sourceTier === 1) {
    score += 0.6;
    reasons.push('一级全球新闻源');
  } else {
    score += 0.3;
  }
  if (ageMs <= 30 * 60 * 1000) {
    score += 0.8;
    reasons.push('30 分钟内发布');
  } else if (ageMs <= 2 * 60 * 60 * 1000) {
    score += 0.5;
    reasons.push('2 小时内发布');
  } else if (ageMs <= 8 * 60 * 60 * 1000) {
    score += 0.2;
  }
  if (article.sourceCount >= 2) {
    score += article.sourceCount >= 3 ? 1.4 : 1;
    reasons.push(`${article.sourceCount} 个来源交叉报道`);
  }
  if (article.sourceMarkedImportant) {
    score += 0.9;
    reasons.push('快讯源标记重要');
  }
  const critical = CRITICAL_EVENT_RULES.filter(rule => rule.test.test(text));
  const major = MAJOR_EVENT_RULES.filter(rule => rule.test.test(text));
  const strongest = [...critical, ...major].sort((a, b) => b.score - a.score)[0];
  if (strongest) {
    score += strongest.score;
    reasons.push(strongest.label);
  }
  const impacts = judgeNewsImpacts(text);
  if (impacts.some(impact => impact.level >= 4)) score += 0.25;
  const importance = clamp(Math.round(score), 1, 5);
  return {
    ...article,
    importance,
    importanceLabel: ['一般', '关注', '重要', '重大', '极重大'][importance - 1],
    importanceReasons: reasons.slice(0, 4),
    impacts,
    isBreaking: importance >= 5 || (importance >= 4 && ageMs <= 90 * 60 * 1000),
    shouldAlert: importance >= 4 && ageMs <= 6 * 60 * 60 * 1000
  };
}

function judgeNewsImpacts(text) {
  const byModule = new Map();
  IMPACT_RULES.forEach(rule => {
    if (!rule.test.test(text)) return;
    rule.impacts.forEach(([module, direction, level, reason]) => {
      const current = byModule.get(module);
      if (!current || level > current.level || (level === current.level && direction === 'negative')) {
        byModule.set(module, { module, direction, level, reason });
      }
    });
  });
  return [...byModule.values()].sort((a, b) => b.level - a.level).slice(0, 6);
}

async function translateAlertsToChinese(alerts) {
  if (!NEWS_TRANSLATE_ENABLED) return alerts;
  const pending = alerts
    .filter(item => !hasChineseText(`${item.title} ${item.summary}`))
    .map((item, slot) => ({
      item,
      slot,
      key: stableNewsId(`translation:${item.title}\n${item.summary}`)
    }))
    .filter(record => !newsTranslationCache.has(record.key) && !newsTranslationInflight.has(record.key));

  const batches = buildTranslationBatches(pending);
  pending.forEach(record => newsTranslationInflight.add(record.key));
  const translationWork = mapWithConcurrency(batches, 3, async batch => {
    try {
      const translated = await translateNewsBatch(batch);
      batch.forEach(record => {
        const value = translated.get(record.slot);
        if (!value?.title) return;
        setTranslationCache(record.key, value);
      });
    } catch {
      // A failed translation batch keeps the original article and retries next refresh.
    } finally {
      batch.forEach(record => newsTranslationInflight.delete(record.key));
    }
  });
  await Promise.race([
    translationWork,
    new Promise(resolve => setTimeout(resolve, NEWS_TRANSLATE_WAIT_MS))
  ]);

  return alerts.map(item => {
    if (hasChineseText(`${item.title} ${item.summary}`)) {
      return { ...item, displayLanguage: 'zh-CN', translationStatus: 'source' };
    }
    const key = stableNewsId(`translation:${item.title}\n${item.summary}`);
    const translated = newsTranslationCache.get(key);
    if (!translated?.title) return { ...item, displayLanguage: 'en', translationStatus: 'unavailable' };
    return {
      ...item,
      originalTitle: item.title,
      originalSummary: item.summary,
      title: translated.title,
      summary: translated.summary || '',
      displayLanguage: 'zh-CN',
      translationStatus: 'translated'
    };
  });
}

function buildTranslationBatches(records) {
  const batches = [];
  let current = [];
  let size = 0;
  records.forEach(record => {
    const cost = record.item.title.length + Math.min(280, record.item.summary.length) + 50;
    if (current.length && (current.length >= 4 || size + cost > 2800)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(record);
    size += cost;
  });
  if (current.length) batches.push(current);
  return batches;
}

async function translateNewsBatch(records) {
  const url = new URL('https://translate.googleapis.com/translate_a/t');
  Object.entries({ client: 'gtx', format: 'text', sl: 'en', tl: 'zh-CN', v: '1.0' })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  records.forEach(record => {
    url.searchParams.append('q', record.item.title);
    url.searchParams.append('q', record.item.summary.slice(0, 280) || record.item.title);
  });
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(NEWS_TRANSLATE_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`翻译服务 HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length !== records.length * 2) {
    throw new Error('翻译服务返回条数不匹配');
  }
  const values = new Map();
  records.forEach((record, index) => {
    values.set(record.slot, {
      title: cleanFeedText(payload[index * 2]),
      summary: record.item.summary ? cleanFeedText(payload[index * 2 + 1]) : ''
    });
  });
  return values;
}

async function mapWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function setTranslationCache(key, value) {
  if (newsTranslationCache.size >= 1200) {
    const oldestKey = newsTranslationCache.keys().next().value;
    if (oldestKey) newsTranslationCache.delete(oldestKey);
  }
  newsTranslationCache.set(key, value);
}

function hasChineseText(value) {
  const text = String(value || '');
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return chineseCount >= 4 && chineseCount / Math.max(1, text.length) >= 0.08;
}

function newsSources() {
  const extraUrls = String(process.env.NEWS_EXTRA_FEEDS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const extras = extraUrls.map((url, index) => ({
    key: `extra-${index + 1}`,
    name: `自定义新闻源 ${index + 1}`,
    url,
    tier: 2,
    refreshMs: RSS_REFRESH_MS
  }));
  return [...DEFAULT_NEWS_SOURCES, ...extras];
}

function slicePayload(payload, limit) {
  return { ...payload, alerts: (payload.alerts || []).slice(0, limit) };
}

function stableNewsId(value) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, 20);
}

function newsDateMs(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function streamNewsSources() {
  return newsSources()
    .filter(source => source.type === 'ths-json' || source.streamPriority === true)
    .sort((left, right) => Number(right.type === 'ths-json') - Number(left.type === 'ths-json'));
}

function startNewsStreamCollector() {
  if (!newsStreamState.clients.size || newsStreamState.timer) return;
  newsStreamState.status = newsStreamState.initialized ? newsStreamState.status : 'connecting';
  newsStreamState.timer = setInterval(() => {
    void collectNewsStreamAlerts();
  }, Math.max(1000, NEWS_STREAM_INTERVAL_MS));
  newsStreamState.timer.unref?.();
  newsStreamState.heartbeatTimer = setInterval(() => {
    const heartbeat = `: heartbeat ${new Date().toISOString()}\n\n`;
    [...newsStreamState.clients].forEach(client => writeNewsStreamChunk(client, heartbeat));
  }, Math.max(5000, NEWS_STREAM_HEARTBEAT_MS));
  newsStreamState.heartbeatTimer.unref?.();
  void collectNewsStreamAlerts();
}

function stopNewsStreamCollector() {
  if (newsStreamState.clients.size) return;
  if (newsStreamState.timer) clearInterval(newsStreamState.timer);
  if (newsStreamState.heartbeatTimer) clearInterval(newsStreamState.heartbeatTimer);
  newsStreamState.timer = null;
  newsStreamState.heartbeatTimer = null;
}

async function collectNewsStreamAlerts() {
  if (newsStreamState.collecting || !newsStreamState.clients.size) return;
  newsStreamState.collecting = true;
  const sources = streamNewsSources();
  try {
    const results = await Promise.allSettled(sources.map(loadNewsSource));
    const fulfilled = results.filter(result => result.status === 'fulfilled');
    if (!fulfilled.length) {
      const failed = results.find(result => result.status === 'rejected');
      throw new Error(String(failed?.reason?.message || failed?.reason || '高优先级新闻源不可用'));
    }

    const articles = deduplicateArticles(fulfilled.flatMap(result => result.value.items));
    const scored = articles
      .map(scoreNewsArticle)
      .filter(item => Date.now() - newsDateMs(item.publishedAt) <= NEWS_MAX_AGE_MS)
      .sort((left, right) => newsDateMs(right.publishedAt) - newsDateMs(left.publishedAt));
    const important = scored.filter(item => item.importance >= 4 || item.shouldAlert);
    const unseen = important.filter(item => !newsStreamState.seenIds.has(item.id));
    articles.forEach(item => rememberNewsStreamId(item.id));
    newsStreamState.lastCollectedAt = new Date().toISOString();
    const recovered = newsStreamState.status === 'error';
    newsStreamState.status = 'live';
    newsStreamState.lastError = '';

    if (!newsStreamState.initialized) {
      newsStreamState.initialized = true;
      newsStreamState.latestAlerts = important.slice(0, Math.max(1, NEWS_STREAM_SNAPSHOT_LIMIT));
      broadcastNewsStreamEvent('snapshot', newsStreamSnapshot());
      broadcastNewsStreamEvent('status', newsStreamStatus());
      return;
    }

    if (recovered) broadcastNewsStreamEvent('status', newsStreamStatus());
    if (!unseen.length) return;
    const latestById = new Map([
      ...unseen.map(item => [item.id, item]),
      ...newsStreamState.latestAlerts.map(item => [item.id, item])
    ]);
    newsStreamState.latestAlerts = [...latestById.values()]
      .sort((left, right) => newsDateMs(right.publishedAt) - newsDateMs(left.publishedAt))
      .slice(0, Math.max(1, NEWS_STREAM_SNAPSHOT_LIMIT));
    unseen
      .sort((left, right) => newsDateMs(left.publishedAt) - newsDateMs(right.publishedAt))
      .forEach(alert => {
        rememberNewsStreamAlert(alert);
        broadcastNewsStreamEvent('alert', alert, alert.id);
      });
  } catch (error) {
    const message = error.message || String(error);
    const changed = newsStreamState.status !== 'error' || newsStreamState.lastError !== message;
    newsStreamState.status = 'error';
    newsStreamState.lastError = message;
    if (changed) broadcastNewsStreamEvent('status', newsStreamStatus());
  } finally {
    newsStreamState.collecting = false;
  }
}

function rememberNewsStreamId(id) {
  const value = String(id || '').trim();
  if (!value || newsStreamState.seenIds.has(value)) return;
  newsStreamState.seenIds.add(value);
  newsStreamState.seenOrder.push(value);
  const limit = Math.max(200, NEWS_STREAM_SEEN_LIMIT);
  while (newsStreamState.seenOrder.length > limit) {
    newsStreamState.seenIds.delete(newsStreamState.seenOrder.shift());
  }
}

function rememberNewsStreamAlert(alert) {
  if (!alert?.id || newsStreamState.alertHistory.some(item => item.id === alert.id)) return;
  newsStreamState.alertHistory.push(alert);
  const limit = Math.max(20, NEWS_STREAM_HISTORY_LIMIT);
  while (newsStreamState.alertHistory.length > limit) newsStreamState.alertHistory.shift();
}

function newsStreamSnapshot() {
  return {
    updatedAt: newsStreamState.lastCollectedAt || new Date().toISOString(),
    alerts: newsStreamState.latestAlerts.slice(0, Math.max(1, NEWS_STREAM_SNAPSHOT_LIMIT))
  };
}

function newsStreamStatus() {
  return {
    state: newsStreamState.status,
    updatedAt: newsStreamState.lastCollectedAt || new Date().toISOString(),
    intervalMs: Math.max(1000, NEWS_STREAM_INTERVAL_MS),
    sourceKeys: streamNewsSources().map(source => source.key),
    clientCount: newsStreamState.clients.size,
    error: newsStreamState.lastError || undefined
  };
}

function writeNewsStreamEvent(client, event, data, id = '') {
  const lines = [];
  if (id) lines.push(`id: ${String(id).replace(/[\r\n]/g, '')}`);
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`, '');
  return writeNewsStreamChunk(client, `${lines.join('\n')}\n`);
}

function writeNewsStreamChunk(client, chunk) {
  const { res } = client;
  if (res.destroyed || res.writableEnded) {
    removeNewsStreamClient(client);
    return false;
  }
  try {
    res.write(chunk);
    return true;
  } catch {
    removeNewsStreamClient(client);
    return false;
  }
}

function broadcastNewsStreamEvent(event, data, id = '') {
  [...newsStreamState.clients].forEach(client => writeNewsStreamEvent(client, event, data, id));
}

function removeNewsStreamClient(client) {
  if (!newsStreamState.clients.delete(client)) return;
  client.req.off('close', client.close);
  client.res.off('close', client.close);
  client.res.off('error', client.close);
  stopNewsStreamCollector();
}

function handleNewsStream(req, res) {
  if (req.method && req.method !== 'GET') {
    res.writeHead(405, {
      'content-type': 'application/json; charset=utf-8',
      allow: 'GET'
    });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
    'x-accel-buffering': 'no'
  });
  res.flushHeaders?.();
  req.socket?.setKeepAlive?.(true);
  req.socket?.setTimeout?.(0);
  const client = { req, res, close: null };
  client.close = () => removeNewsStreamClient(client);
  req.once('close', client.close);
  res.once('close', client.close);
  res.once('error', client.close);
  newsStreamState.clients.add(client);

  startNewsStreamCollector();
  writeNewsStreamChunk(client, `retry: ${Math.max(1000, NEWS_STREAM_INTERVAL_MS)}\n`);
  writeNewsStreamEvent(client, 'ready', {
    connectedAt: new Date().toISOString(),
    ...newsStreamStatus()
  });
  const lastEventId = Array.isArray(req.headers?.['last-event-id'])
    ? req.headers['last-event-id'][0]
    : req.headers?.['last-event-id'];
  const resumeIndex = lastEventId
    ? newsStreamState.alertHistory.findIndex(alert => alert.id === String(lastEventId).trim())
    : -1;
  if (resumeIndex >= 0) {
    newsStreamState.alertHistory
      .slice(resumeIndex + 1)
      .forEach(alert => writeNewsStreamEvent(client, 'alert', alert, alert.id));
  } else {
    writeNewsStreamEvent(client, 'snapshot', newsStreamSnapshot());
  }
}

async function handleNewsAlerts(url, res) {
  try {
    const limit = clamp(Math.trunc(Number(url?.searchParams?.get('limit') || 120)), 1, 200);
    const force = url?.searchParams?.get('force') === '1';
    const payload = await loadNewsAlerts({ limit, force });
    sendNewsJson(res, 200, payload);
  } catch (error) {
    sendNewsJson(res, 502, {
      updatedAt: new Date().toISOString(),
      refreshAfterMs: NEWS_REFRESH_AFTER_MS,
      sourceStatus: { level: 'error', text: '新闻源不可用', detail: error.message || String(error) },
      sources: [],
      alerts: []
    });
  }
}

function sendNewsJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(payload));
}

export {
  handleNewsAlerts,
  handleNewsStream,
  loadNewsAlerts,
  parseFeedXml,
  scoreNewsArticle
};
