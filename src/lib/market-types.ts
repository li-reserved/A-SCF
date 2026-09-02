export interface FundFlowBreakdown {
  main: number;
  superLarge: number;
  large: number;
  medium: number;
  small: number;
}

export interface FlowPoint extends Partial<FundFlowBreakdown> {
  time: string;
  value: number;
  date: string;
  price?: number;
}

export interface FlowSeries {
  id: string;
  name: string;
  category: string;
  sourceName: string;
  sourceCategory: string;
  sourceCode: string;
  latest: number;
  rank: number;
  changePct: number;
  points: FlowPoint[];
  pricePoints: FlowPoint[];
  rawBreakdown?: Partial<FundFlowBreakdown>;
}

export interface FocusCandidate {
  name: string;
  category: string;
  sourceName: string;
  sourceCategory: string;
  sourceCode: string;
  sourceId: string;
  latest: number;
  changePct: number;
}

export interface FocusGroupsData {
  updatedAt: string;
  limit: number;
  defaultFocusNames: string[];
  focusCandidates: FocusCandidate[];
}

export interface MarketIndex {
  key: string;
  code: string;
  name: string;
  latest: number;
  changePct: number;
  support: number;
  pressure: number;
}

export interface AllAMedianSnapshot {
  code: string;
  tradeDate: string;
  latest: number;
  changePct: number;
  yearToDatePct: number;
  yearStartPoint: number;
  yearStartDate: string;
  yearPoints?: Array<{
    date: string;
    latest: number;
    changePct: number;
  }>;
  upCount: number;
  downCount: number;
  sampleCount: number;
}

export interface OverviewData {
  updatedAt: string;
  tradeDate: string;
  refreshAfterMs: number;
  sourceStatus: { level: string; text: string; detail: string };
  timeline: { elapsed: number; total: number; endLabel: string; session: string; isTradingTime: boolean };
  series: FlowSeries[];
  focusCandidates: FocusCandidate[];
  leaders: { inflowTop: FlowSeries[]; outflowTop: FlowSeries[] };
  breakdown: Array<{ name: string } & FundFlowBreakdown>;
  note: string;
  marketSummary: {
    tradeDate: string;
    turnoverAmount: number;
    turnoverVolume: number;
    indexes: MarketIndex[];
    allAMedian: AllAMedianSnapshot;
    policyFlow: {
      net: number;
      positiveCount: number;
      negativeCount: number;
      detail: string;
    };
  } | null;
}

export interface MarginPoint {
  date: string;
  marginBalance: number;
  financingBalance: number;
  securitiesLendingBalance: number;
  financingNetBuy: number;
}

export interface MarginData {
  updatedAt: string;
  source: string;
  amountUnit: string;
  points: MarginPoint[];
}

export interface ReverseRepoOperation {
  instrument: "reverse-repo" | "outright-reverse-repo" | "mlf";
  instrumentLabel: string;
  operationDate: string;
  maturityDate: string;
  termDays: number;
  termLabel: string;
  amount: number;
  title: string;
  sourceUrl: string;
}

export interface ReverseRepoRow {
  date: string;
  injections: ReverseRepoOperation[];
  maturities: ReverseRepoOperation[];
  injection: number;
  maturity: number;
  netInjection: number;
}

export interface ReverseRepoData {
  updatedAt: string;
  asOfDate: string;
  source: string;
  sourceUrl: string;
  sources: Array<{ name: string; url: string }>;
  amountUnit: string;
  range: { startDate: string; endDate: string };
  rows: ReverseRepoRow[];
}

export interface InstitutionRankRow {
  rank: number;
  member: string;
  longPosition: number;
  longChange: number;
  shortPosition: number;
  shortChange: number;
  netPosition: number;
  netChange: number;
  contracts: string[];
}

export interface InstitutionSummary {
  longPosition: number;
  longChange: number;
  shortPosition: number;
  shortChange: number;
  netPosition: number;
  netChange: number;
}

export interface InstitutionContract {
  code: string;
  netLongRows: InstitutionRankRow[];
  netShortRows: InstitutionRankRow[];
  summary: InstitutionSummary;
}

export interface InstitutionData {
  updatedAt: string;
  tradeDate: string;
  requestedDate: string;
  isRequestedDate: boolean;
  isToday: boolean;
  variety: string;
  varietyName: string;
  source: string;
  sourceUrl: string;
  publishedAfter: string;
  detail: string;
  aggregate: InstitutionContract;
  contracts: InstitutionContract[];
}

export interface LeaderStock {
  code: string;
  market: number;
  name: string;
  latest: number | null;
  changePct: number | null;
  turnoverAmount: number | null;
  turnoverRate: number | null;
  mainNet: number | null;
  hasQuote: boolean;
}

export interface LeaderSegment {
  key: string;
  name: string;
  leader: LeaderStock | null;
  stockCount: number;
  quotedCount: number;
  positiveCount: number;
  negativeCount: number;
  averageChangePct: number | null;
  netMainFlow: number | null;
  turnoverAmount: number | null;
  stocks: LeaderStock[];
}

export interface SegmentLeadersData {
  updatedAt: string;
  tradeDate: string;
  source: string;
  segmentCount: number;
  stockCount: number;
  quotedCount: number;
  segments: LeaderSegment[];
}

export interface LimitUpStock {
  code: string;
  market: 0 | 1;
  name: string;
  category: string;
  price: number;
  changePct: number;
  turnoverAmount: number;
  turnoverRate: number;
  floatMarketCap: number;
  sealAmount: number;
  firstSealTime: string;
  lastSealTime: string;
  breakCount: number;
  streak: number;
  statisticDays: number;
  statisticCount: number;
  isAuctionLimitUp: boolean;
}

export interface LimitUpCategory {
  name: string;
  count: number;
  auctionCount: number;
  maxStreak: number;
  sharePct: number;
  isLeader: boolean;
}

export interface LimitUpData {
  updatedAt: string;
  tradeDate: string;
  source: string;
  summary: {
    limitUpCount: number;
    auctionCount: number;
    openedCount: number;
    categoryCount: number;
    topCategoryCount: number;
    leadingCategories: string[];
  };
  categories: LimitUpCategory[];
  stocks: LimitUpStock[];
}

export interface LimitUpTrendPoint {
  time: string;
  value: number;
  price: number;
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  amount?: number | null;
  average?: number | null;
}

export interface LimitUpTrendData {
  updatedAt: string;
  tradeDate: string;
  code: string;
  market: 0 | 1;
  points: LimitUpTrendPoint[];
}

export interface AfterHoursStock {
  code: string;
  market: number;
  name: string;
  industry: string;
  mainFlow: number;
  mainFlowRatio: number;
  changePct: number;
  turnoverAmount: number;
  rawBreakdown: FundFlowBreakdown;
}

export interface AfterHoursIndustry {
  name: string;
  stockCount: number;
  mainFlow: number;
  mainFlowRatio: number;
  changePct: number;
  turnoverAmount: number;
  stocks: AfterHoursStock[];
}

export interface AfterHoursData {
  updatedAt: string;
  tradeDate: string;
  asOf: string;
  phase: "preview" | "final";
  isFinal: boolean;
  sourceStatus: { level: string; text: string; detail: string };
  summary: {
    marketTotal: number;
    stockCount: number;
    industryCount: number;
    coveragePct: number;
    inflowCount: number;
    outflowCount: number;
    mainFlow: number;
    mainFlowRatio: number;
    changePct: number;
    turnoverAmount: number;
  };
  industries: AfterHoursIndustry[];
}

export interface SecurityData {
  updatedAt: string;
  tradeDate: string;
  source: string;
  security: { code: string; market: number; secid: string; name: string; type: string; typeLabel: string };
  quote: {
    latest: number;
    changePct: number;
    change: number;
    open: number;
    high: number;
    low: number;
    preClose: number;
    volume: number;
    amount: number;
    turnoverRate: number | null;
    volumeRatio: number | null;
    peDynamic: number | null;
    pb: number | null;
    updatedAt: string;
  };
  session: {
    elapsed: number;
    total: number;
    endLabel: string;
    session: string;
    isTradingTime: boolean;
  };
  intraday: Array<{
    time: string;
    price: number;
    value: number | null;
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
    amount: number | null;
    average: number | null;
  }>;
  dailyBars: Array<{
    date: string;
    open: number;
    close: number;
    high: number;
    low: number;
    volume: number;
    amount: number;
    changePct: number;
  }>;
  fundFlow: {
    mainNet: number | null;
    mainNetPct: number | null;
    superLarge: number | null;
    large: number | null;
    medium: number | null;
    small: number | null;
    darkTrade: {
      main: number;
      visible: number;
      dark: number;
      retail: number;
      activity: number | null;
      tradeDate: string;
      quoteTime: string;
      source: string;
    } | null;
    unit: string;
    source: string;
    points: Array<FlowPoint & FundFlowBreakdown>;
    dailyPoints: Array<{ date: string } & FundFlowBreakdown>;
  };
  indicators: {
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
    rsi14: number | null;
    atr14: number | null;
    rangePosition: number | null;
  };
  levels: {
    support: number;
    resistance: number;
    observeBuyZone: [number, number];
    breakoutTrigger: number;
    reduceZone: [number, number];
    stopLoss: number;
    secondTarget: number;
  };
  outlook: {
    direction: string;
    tone: string;
    horizon: string;
    expectedRange: [number, number];
    confidence: number;
    dataCompleteness: number;
  };
  advice: { summary: string; holder: string; watcher: string; trigger: string; discipline: string };
  tradeSignals: {
    mode: string;
    nonRepainting: boolean;
    intraday: Array<{
      type: "B" | "S";
      rule: string;
      label: string;
      status: string;
      time: string;
      confirmedAt: string;
      price: number;
      volumeRatio: number;
      reason: string;
    }>;
    daily: Array<{
      type: "B" | "S";
      status: string;
      label: string;
      date: string;
      confirmedAt: string;
      price: number;
      reason: string;
    }>;
    plan: Array<{
      type: "B" | "S";
      key: string;
      label: string;
      price?: number;
      range?: [number, number];
      condition: string;
    }>;
  };
  signals: Array<{ tone: string; text: string }>;
  risks: string[];
  disclaimer: string;
}

export interface AutoStrategyCandidate {
  date: string;
  code: string;
  market: number;
  name: string;
  industry: string;
  latest: number;
  changePct: number;
  ma5: number;
  ma20: number;
  rsi14: number;
  volumeRatio: number;
  momentum5: number;
  trendSpread: number;
  score: number;
  eligible: boolean;
  reasons: string[];
  rank: number;
  held: boolean;
  planned: boolean;
}

export interface AutoStrategyPosition {
  code: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  latest: number;
  shares: number;
  availableShares: number;
  holdingDays: number;
  marketValue: number;
  pnl: number;
  returnPct: number;
  stopPrice: number;
  targetPrice: number;
  entryScore: number | null;
  pendingExit: string | null;
  origin: "synced" | "strategy";
}

export interface AutoStrategyAction {
  date: string;
  side: "buy" | "sell";
  code: string;
  name: string;
  price: number;
  shares: number;
  amount: number;
  reason: string;
  score?: number;
  pnl?: number;
}

export interface AutoStrategyPlan {
  side: "buy" | "sell";
  code: string;
  name: string;
  referencePrice: number;
  shares: number;
  reason: string;
  score?: number;
}

export interface AutoStrategyTrade {
  id: string;
  code: string;
  name: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  holdingDays: number;
  pnl: number;
  returnPct: number;
  fees: number;
  exitReason: string;
}

export interface AutoStrategyEquityPoint {
  date: string;
  equity: number;
  strategyReturn: number;
  benchmarkReturn: number;
  drawdown: number;
}

export interface StrategyLiveQuote {
  receivedAt: string;
  tradeDate: string;
  source: string;
  security: {
    code: string;
    market: number;
    name: string;
  };
  quote: {
    latest: number;
    changePct: number | null;
    change: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    preClose: number | null;
    volume: number | null;
    amount: number | null;
    updatedAt: string;
  };
  session: {
    elapsed: number;
    total: number;
    endLabel: string;
    session: string;
    isTradingTime: boolean;
  };
}

export interface AutoStrategyData {
  updatedAt: string;
  tradeDate: string;
  status: "scheduled" | "running";
  startDate: string;
  refreshAfterMs: number;
  session: {
    elapsed: number;
    total: number;
    endLabel: string;
    session: string;
    isTradingTime: boolean;
  };
  source: string;
  sourceStatus: { level: "live" | "partial"; text: string; detail: string };
  universe: {
    requested: number;
    available: number;
    industryCount: number;
    omitted: Array<{ code: string; error: string }>;
  };
  strategy: { name: string; selection: string; execution: string };
  account: {
    snapshotDate: string;
    syncedAt: string;
    equity: number;
    marketValue: number;
    cash: number;
    withdrawableCash: number;
    positionPct: number;
    totalPnl: number;
    totalReturnPct: number;
    todayPnl: number;
    todayReturnPct: number;
    realizedPnl: number;
    pendingDeposit: number;
    positions: Array<{
      code: string;
      market: number;
      name: string;
      shares: number;
      availableShares: number;
      latest: number;
      marketValue: number;
      cost: number;
      entryPrice: number;
      pnl: number;
      returnPct: number;
    }>;
  };
  range: { start: string; end: string; tradingDays: number };
  settings: {
    initialCapital: number;
    maxPositions: number;
    positionPct: number;
    stopLossPct: number;
    takeProfitPct: number;
    maxHoldingDays: number;
    commissionPct: number;
    stampDutyPct: number;
  };
  summary: {
    currentEquity: number;
    cash: number;
    marketValue: number;
    totalReturnPct: number;
    annualizedReturnPct: number;
    benchmarkReturnPct: number;
    excessReturnPct: number;
    winRatePct: number | null;
    maxDrawdownPct: number;
    completedTrades: number;
    wins: number;
    openPositions: number;
    exposurePct: number;
    totalFees: number;
  };
  candidates: AutoStrategyCandidate[];
  positions: AutoStrategyPosition[];
  plans: AutoStrategyPlan[];
  todayActions: AutoStrategyAction[];
  actions: AutoStrategyAction[];
  trades: AutoStrategyTrade[];
  equityCurve: AutoStrategyEquityPoint[];
  disclaimer: string;
}

export type UsMarketPhase = "closed" | "overnight" | "pre-market" | "regular" | "after-hours";

export interface UsMarketQuote {
  symbol: string;
  name: string;
  nameZh: string;
  latest: number | null;
  change: number | null;
  changePct: number | null;
  extendedLatest: number | null;
  extendedChange: number | null;
  extendedChangePct: number | null;
  extendedType: string | null;
  extendedLabel: string;
  updatedAt: string;
  realTime: boolean;
}

export interface UsMarketPoint {
  time: number;
  value: number;
  changePct: number | null;
  phase: Exclude<UsMarketPhase, "closed">;
  etTime: string;
}

export interface UsMarketIndex extends UsMarketQuote {
  key: string;
  marketDate: string;
  previousClose: number | null;
  activeChangePct: number | null;
  points: UsMarketPoint[];
}

export interface UsMarketTrendData {
  symbol: string;
  name: string;
  nameZh: string;
  updatedAt: string;
  marketDate: string;
  previousClose: number;
  source: string;
  sessionLabel: string;
  baselineLabel: string;
  points: UsMarketPoint[];
}

export interface UsMarketTheme {
  key: string;
  name: string;
  group: "technology" | "industry" | "resources" | "defensive";
  groupLabel: string;
  proxyLabel: string;
  changePct: number | null;
  extendedChangePct: number | null;
  activeChangePct: number | null;
  extendedLabel: string;
  members: UsMarketQuote[];
}

export interface UsMarketData {
  updatedAt: string;
  marketDate: string;
  source: string;
  refreshAfterMs: number;
  session: {
    phase: UsMarketPhase;
    label: string;
    detail: string;
    newYorkTime: string;
    progress: number;
    schedule: Array<{
      key: UsMarketPhase;
      label: string;
      etTime: string;
      beijingTime: string;
      active: boolean;
      passed: boolean;
    }>;
  };
  indexes: UsMarketIndex[];
  importantStocks: UsMarketQuote[];
  themes: UsMarketTheme[];
  breadth: {
    advancing: number;
    declining: number;
    flat: number;
    averageChangePct: number | null;
    strongest: string[];
    weakest: string[];
  };
  chartStatus: { level: "ok" | "partial" | "error"; text: string; detail: string };
  note: string;
}
