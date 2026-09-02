const DEFAULT_SETTINGS = {
  initialCapital: 300_000,
  maxPositions: 3,
  positionPct: 0.3,
  stopLossPct: 6,
  takeProfitPct: 12,
  maxHoldingDays: 15,
  commissionRate: 0.0003,
  stampDutyRate: 0.0005
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

export function isStrategyMainBoardCode(code) {
  return /^(?:00[0123]|60[0135])\d{3}$/.test(String(code));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rsiAt(bars, index, period = 14) {
  if (index < period) return null;
  let gains = 0;
  let losses = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    const change = bars[cursor].close - bars[cursor - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  return 100 - 100 / (1 + gains / losses);
}

function buildSnapshot(stock, index) {
  if (index < 20) return null;
  const bar = stock.bars[index];
  const ma5 = average(stock.bars.slice(index - 4, index + 1).map(item => item.close));
  const ma20 = average(stock.bars.slice(index - 19, index + 1).map(item => item.close));
  const rsi14 = rsiAt(stock.bars, index);
  const previousVolume = average(stock.bars.slice(index - 5, index).map(item => Number(item.volumeRaw) || 0));
  const volumeRatio = previousVolume > 0 ? (Number(bar.volumeRaw) || 0) / previousVolume : 0;
  const momentum5 = (bar.close / stock.bars[index - 5].close - 1) * 100;
  const trendSpread = (ma5 / ma20 - 1) * 100;
  const changePct = Number.isFinite(bar.changePct)
    ? bar.changePct
    : (bar.close / stock.bars[index - 1].close - 1) * 100;
  const eligible = ma5 > ma20
    && bar.close > ma20
    && rsi14 >= 52
    && rsi14 <= 78
    && momentum5 > 0
    && momentum5 < 20
    && volumeRatio >= 0.75
    && changePct > -2
    && changePct < 8;
  const score = clamp(Math.round(
    clamp(trendSpread * 12, 0, 24)
      + clamp(momentum5 * 2.2, 0, 22)
      + clamp(18 - Math.abs(rsi14 - 62) * 0.8, 0, 18)
      + clamp((volumeRatio - 0.7) * 14, 0, 20)
      + clamp((changePct + 1) * 2.5, 0, 16)
  ), 0, 100);
  return {
    date: bar.date,
    code: stock.code,
    market: stock.market,
    name: stock.name,
    industry: stock.industry,
    latest: bar.close,
    changePct: round(changePct),
    ma5: round(ma5),
    ma20: round(ma20),
    rsi14: round(rsi14, 1),
    volumeRatio: round(volumeRatio, 2),
    momentum5: round(momentum5),
    trendSpread: round(trendSpread),
    score,
    eligible,
    reasons: [
      `MA5 较 MA20 ${trendSpread >= 0 ? '+' : ''}${round(trendSpread)}%`,
      `5日动量 ${momentum5 >= 0 ? '+' : ''}${round(momentum5)}%`,
      `量比 ${round(volumeRatio, 2)}`
    ]
  };
}

function prepareUniverse(universe) {
  return universe.map(stock => {
    const bars = [...stock.bars].sort((left, right) => left.date.localeCompare(right.date));
    const prepared = { ...stock, bars };
    const barsByDate = new Map(bars.map(bar => [bar.date, bar]));
    const snapshots = new Map();
    bars.forEach((bar, index) => {
      const snapshot = buildSnapshot(prepared, index);
      if (snapshot) snapshots.set(bar.date, snapshot);
    });
    return { ...prepared, barsByDate, snapshots };
  });
}

function commission(amount, rate) {
  return Math.max(5, amount * rate);
}

function buyOrder(price, availableCash, equity, config) {
  const targetValue = Math.min(availableCash, equity * config.positionPct);
  let shares = Math.floor(targetValue / (price * 100)) * 100;
  let grossCost = shares * price;
  let entryFee = shares > 0 ? commission(grossCost, config.commissionRate) : 0;
  if (grossCost + entryFee > availableCash) {
    shares -= 100;
    grossCost = shares * price;
    entryFee = shares > 0 ? commission(grossCost, config.commissionRate) : 0;
  }
  return { shares, grossCost, entryFee, cost: grossCost + entryFee };
}

function calendarDays(start, end) {
  const startAt = new Date(`${start}T00:00:00+08:00`).getTime();
  const endAt = new Date(`${end}T00:00:00+08:00`).getTime();
  return Math.max(1, (endAt - startAt) / 86_400_000);
}

export function simulateAutoStrategy({ universe, benchmark = [], settings = {}, startDate = '2026-08-31', initialAccount = null, cashFlows = [] }) {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const initialPositionCodes = new Set((initialAccount?.positions || []).map(position => position.code));
  const stocks = prepareUniverse(universe.filter(stock => (
    isStrategyMainBoardCode(stock.code) || initialPositionCodes.has(stock.code)
  ) && stock.bars.length >= 40));
  const selectionStocks = stocks.filter(stock => isStrategyMainBoardCode(stock.code));
  if (selectionStocks.length < 3) throw new Error('可用历史行情不足，无法形成自动选股池');

  const stockByCode = new Map(stocks.map(stock => [stock.code, stock]));
  const dates = [...new Set(selectionStocks.flatMap(stock => stock.bars.map(bar => bar.date)))].sort();
  const benchmarkByDate = new Map(benchmark.map(bar => [bar.date, bar.close]));
  const minimumBreadth = Math.min(6, selectionStocks.length);
  const positions = new Map();
  const lastMarks = new Map();
  const trades = [];
  const actions = [];
  const equityCurve = [];
  let pendingBuys = [];
  let pendingSells = new Map();
  const strategyBaseline = initialAccount?.equity ?? config.initialCapital;
  let cash = initialAccount?.cash ?? strategyBaseline;
  let lastEquity = strategyBaseline;
  let strategyGrowth = 1;
  let peakStrategyGrowth = 1;
  let totalFees = 0;
  let exposureDays = 0;
  let started = false;
  let benchmarkStart = null;
  let benchmarkLast = null;
  let currentCandidates = [];

  const rankCandidates = snapshots => snapshots
    .filter(snapshot => snapshot.eligible)
    .sort((left, right) => right.score - left.score || right.momentum5 - left.momentum5)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  (initialAccount?.positions || []).forEach(initialPosition => {
    if (!stockByCode.has(initialPosition.code)) {
      throw new Error(`同步持仓 ${initialPosition.code} 缺少历史行情`);
    }
    positions.set(initialPosition.code, {
      code: initialPosition.code,
      name: initialPosition.name,
      entryDate: initialAccount.snapshotDate,
      entryPrice: initialPosition.entryPrice,
      shares: initialPosition.shares,
      availableShares: initialPosition.availableShares,
      entryFee: 0,
      cost: initialPosition.cost,
      strategyCost: initialPosition.marketValue,
      strategyEntryPrice: initialPosition.latest,
      holdingDays: 0,
      entryScore: null,
      origin: 'synced'
    });
    lastMarks.set(initialPosition.code, initialPosition.latest);
  });

  const preStartSignalDate = dates.filter(date => date < startDate).at(-1);
  if (preStartSignalDate) {
    stocks.forEach(stock => {
      const bar = stock.barsByDate.get(preStartSignalDate);
      if (bar) lastMarks.set(stock.code, bar.close);
    });
    currentCandidates = rankCandidates(selectionStocks
      .map(stock => stock.snapshots.get(preStartSignalDate))
      .filter(Boolean));
    for (const position of positions.values()) {
      if (position.origin === 'synced') continue;
      const latest = lastMarks.get(position.code);
      const snapshot = stockByCode.get(position.code).snapshots.get(preStartSignalDate);
      if (latest <= position.strategyEntryPrice * (1 - config.stopLossPct / 100)) {
        pendingSells.set(position.code, '止损');
      } else if (latest >= position.strategyEntryPrice * (1 + config.takeProfitPct / 100)) {
        pendingSells.set(position.code, '止盈');
      } else if (snapshot && (snapshot.ma5 < snapshot.ma20 || snapshot.rsi14 < 45)) {
        pendingSells.set(position.code, '趋势转弱');
      }
    }
    const projectedPositions = positions.size - pendingSells.size;
    pendingBuys = currentCandidates
      .filter(candidate => !positions.has(candidate.code) && candidate.score >= 52)
      .slice(0, Math.max(0, config.maxPositions - projectedPositions));
  }
  const simulationDates = dates.filter(date => date >= startDate);

  const closePosition = (position, price, date, reason) => {
    const grossValue = position.shares * price;
    const exitFee = commission(grossValue, config.commissionRate) + grossValue * config.stampDutyRate;
    const netValue = grossValue - exitFee;
    const pnl = netValue - position.strategyCost;
    cash += netValue;
    totalFees += exitFee;
    positions.delete(position.code);
    const trade = {
      id: `${position.entryDate}-${date}-${position.code}`,
      code: position.code,
      name: position.name,
      entryDate: position.entryDate,
      exitDate: date,
      entryPrice: position.strategyEntryPrice,
      exitPrice: round(price),
      shares: position.shares,
      holdingDays: position.holdingDays,
      pnl: round(pnl),
      returnPct: round(pnl / position.strategyCost * 100),
      fees: round(position.entryFee + exitFee),
      exitReason: reason
    };
    trades.push(trade);
    actions.push({
      date,
      side: 'sell',
      code: position.code,
      name: position.name,
      price: round(price),
      shares: position.shares,
      amount: round(grossValue),
      reason,
      pnl: trade.pnl
    });
  };

  for (const date of simulationDates) {
    const snapshots = selectionStocks
      .map(stock => stock.snapshots.get(date))
      .filter(Boolean);
    if (!started) {
      if (snapshots.length < minimumBreadth) continue;
      started = true;
      benchmarkStart = benchmarkByDate.get(date) ?? null;
    }

    for (const position of positions.values()) {
      if (date > position.entryDate) position.availableShares = position.shares;
      if (stockByCode.get(position.code).barsByDate.has(date) && date !== position.entryDate) {
        position.holdingDays += 1;
      }
    }

    const carriedSells = new Map();
    pendingSells.forEach((reason, code) => {
      const position = positions.get(code);
      if (!position) return;
      const bar = stockByCode.get(code).barsByDate.get(date);
      if (!bar) {
        carriedSells.set(code, reason);
        return;
      }
      closePosition(position, bar.open, date, reason);
    });
    pendingSells = carriedSells;

    for (const candidate of pendingBuys) {
      if (positions.size >= config.maxPositions || positions.has(candidate.code)) continue;
      const stock = stockByCode.get(candidate.code);
      const bar = stock?.barsByDate.get(date);
      if (!bar) continue;
      const { shares, grossCost, entryFee, cost } = buyOrder(bar.open, cash, lastEquity, config);
      if (shares <= 0) continue;
      const position = {
        code: candidate.code,
        name: candidate.name,
        entryDate: date,
        entryPrice: bar.open,
        shares,
        availableShares: 0,
        entryFee,
        cost,
        strategyCost: cost,
        strategyEntryPrice: bar.open,
        holdingDays: 0,
        entryScore: candidate.score,
        origin: 'strategy'
      };
      positions.set(candidate.code, position);
      cash -= position.cost;
      totalFees += entryFee;
      actions.push({
        date,
        side: 'buy',
        code: candidate.code,
        name: candidate.name,
        price: round(bar.open),
        shares,
        amount: round(grossCost),
        reason: `综合评分 ${candidate.score}`,
        score: candidate.score
      });
    }
    pendingBuys = [];

    for (const position of [...positions.values()]) {
      const bar = stockByCode.get(position.code).barsByDate.get(date);
      if (!bar || date === position.entryDate) continue;
      const stopPrice = position.strategyEntryPrice * (1 - config.stopLossPct / 100);
      const targetPrice = position.strategyEntryPrice * (1 + config.takeProfitPct / 100);
      if (bar.open <= stopPrice) closePosition(position, bar.open, date, '止损');
      else if (bar.open >= targetPrice) closePosition(position, bar.open, date, '止盈');
      else if (bar.low <= stopPrice) closePosition(position, stopPrice, date, '止损');
      else if (bar.high >= targetPrice) closePosition(position, targetPrice, date, '止盈');
    }

    stocks.forEach(stock => {
      const bar = stock.barsByDate.get(date);
      if (bar) lastMarks.set(stock.code, bar.close);
    });
    for (const position of positions.values()) {
      const snapshot = stockByCode.get(position.code).snapshots.get(date);
      if (!snapshot) continue;
      if (snapshot.ma5 < snapshot.ma20 || snapshot.rsi14 < 45) {
        pendingSells.set(position.code, '趋势转弱');
      } else if (position.holdingDays >= config.maxHoldingDays) {
        pendingSells.set(position.code, '到期轮换');
      }
    }

    currentCandidates = rankCandidates(snapshots);
    const projectedPositions = positions.size - pendingSells.size;
    const openSlots = Math.max(0, config.maxPositions - projectedPositions);
    pendingBuys = currentCandidates
      .filter(candidate => !positions.has(candidate.code) && candidate.score >= 52)
      .slice(0, openSlots);

    const marketValue = [...positions.values()].reduce((sum, position) => {
      return sum + position.shares * lastMarks.get(position.code);
    }, 0);
    const equityBeforeCashFlow = cash + marketValue;
    strategyGrowth *= equityBeforeCashFlow / lastEquity;
    const cashFlow = cashFlows.find(item => item.date === date);
    if (cashFlow) cash += cashFlow.amount;
    lastEquity = cash + marketValue;
    peakStrategyGrowth = Math.max(peakStrategyGrowth, strategyGrowth);
    exposureDays += positions.size / config.maxPositions;
    const benchmarkClose = benchmarkByDate.get(date);
    if (benchmarkClose) {
      benchmarkLast = benchmarkClose;
      if (benchmarkStart === null) benchmarkStart = benchmarkClose;
    }
    equityCurve.push({
      date,
      equity: round(lastEquity),
      strategyReturn: round((strategyGrowth - 1) * 100),
      benchmarkReturn: benchmarkStart && benchmarkLast ? round((benchmarkLast / benchmarkStart - 1) * 100) : 0,
      drawdown: round((strategyGrowth / peakStrategyGrowth - 1) * 100)
    });
  }

  const settingsPayload = {
    initialCapital: strategyBaseline,
    maxPositions: config.maxPositions,
    positionPct: config.positionPct * 100,
    stopLossPct: config.stopLossPct,
    takeProfitPct: config.takeProfitPct,
    maxHoldingDays: config.maxHoldingDays,
    commissionPct: config.commissionRate * 100,
    stampDutyPct: config.stampDutyRate * 100
  };
  const candidatePayloadForPlans = plans => {
    const plannedCodes = new Set(plans.filter(plan => plan.side === 'buy').map(plan => plan.code));
    return currentCandidates.slice(0, 24).map(candidate => ({
      ...candidate,
      held: positions.has(candidate.code),
      planned: plannedCodes.has(candidate.code)
    }));
  };
  const positionPayload = () => [...positions.values()].map(position => {
    const latest = lastMarks.get(position.code);
    const marketValue = position.shares * latest;
    return {
      code: position.code,
      name: position.name,
      entryDate: position.entryDate,
      entryPrice: round(position.entryPrice, 4),
      latest: round(latest, 4),
      shares: position.shares,
      availableShares: position.availableShares,
      holdingDays: position.holdingDays,
      marketValue: round(marketValue),
      pnl: round(marketValue - position.cost),
      returnPct: round((marketValue / position.cost - 1) * 100),
      stopPrice: round(position.strategyEntryPrice * (1 - config.stopLossPct / 100), 4),
      targetPrice: round(position.strategyEntryPrice * (1 + config.takeProfitPct / 100), 4),
      entryScore: position.entryScore,
      pendingExit: pendingSells.get(position.code) || null,
      origin: position.origin
    };
  }).sort((left, right) => right.marketValue - left.marketValue);
  const planPayload = () => {
    const sellPlans = [...pendingSells.entries()].map(([code, reason]) => {
      const position = positions.get(code);
      return {
        side: 'sell',
        code,
        name: position.name,
        referencePrice: round(lastMarks.get(code), 4),
        shares: position.shares,
        reason
      };
    });
    let plannedCash = sellPlans.reduce((available, plan) => {
      const grossValue = plan.shares * plan.referencePrice;
      const exitFee = commission(grossValue, config.commissionRate) + grossValue * config.stampDutyRate;
      return available + grossValue - exitFee;
    }, cash);
    const buyPlans = [];
    pendingBuys.forEach(candidate => {
      const order = buyOrder(candidate.latest, plannedCash, lastEquity, config);
      if (order.shares <= 0) return;
      plannedCash -= order.cost;
      buyPlans.push({
        side: 'buy',
        code: candidate.code,
        name: candidate.name,
        referencePrice: round(candidate.latest),
        shares: order.shares,
        reason: `综合评分 ${candidate.score}`,
        score: candidate.score
      });
    });
    return [...sellPlans, ...buyPlans];
  };

  if (!equityCurve.length) {
    const plans = planPayload();
    const openPositions = positionPayload();
    return {
      status: 'scheduled',
      startDate,
      range: { start: startDate, end: startDate, tradingDays: 0 },
      settings: settingsPayload,
      summary: {
        currentEquity: round(strategyBaseline),
        cash: round(cash),
        marketValue: round(initialAccount?.marketValue ?? openPositions.reduce((sum, position) => sum + position.marketValue, 0)),
        totalReturnPct: 0,
        annualizedReturnPct: 0,
        benchmarkReturnPct: 0,
        excessReturnPct: 0,
        winRatePct: null,
        maxDrawdownPct: 0,
        completedTrades: 0,
        wins: 0,
        openPositions: openPositions.length,
        exposurePct: openPositions.length ? round(openPositions.length / config.maxPositions * 100) : 0,
        totalFees: 0
      },
      candidates: candidatePayloadForPlans(plans),
      positions: openPositions,
      plans,
      todayActions: [],
      actions: [],
      trades: [],
      equityCurve: []
    };
  }

  const lastPoint = equityCurve.at(-1);
  const endDate = lastPoint.date;
  const rangeStartDate = equityCurve[0].date;
  const wins = trades.filter(trade => trade.pnl > 0).length;
  const openPositions = positionPayload();
  const plans = planPayload();
  const periodDays = calendarDays(rangeStartDate, endDate);

  return {
    status: 'running',
    startDate,
    range: { start: rangeStartDate, end: endDate, tradingDays: equityCurve.length },
    settings: settingsPayload,
    summary: {
      currentEquity: round(lastEquity),
      cash: round(cash),
      marketValue: round(lastEquity - cash),
      totalReturnPct: lastPoint.strategyReturn,
      annualizedReturnPct: round((Math.pow(strategyGrowth, 365 / periodDays) - 1) * 100),
      benchmarkReturnPct: lastPoint.benchmarkReturn,
      excessReturnPct: round(lastPoint.strategyReturn - lastPoint.benchmarkReturn),
      winRatePct: trades.length ? round(wins / trades.length * 100) : null,
      maxDrawdownPct: Math.abs(Math.min(...equityCurve.map(point => point.drawdown))),
      completedTrades: trades.length,
      wins,
      openPositions: openPositions.length,
      exposurePct: round(exposureDays / equityCurve.length * 100),
      totalFees: round(totalFees)
    },
    candidates: candidatePayloadForPlans(plans),
    positions: openPositions,
    plans,
    todayActions: actions.filter(action => action.date === endDate),
    actions: actions.slice(-30).reverse(),
    trades: trades.slice(-30).reverse(),
    equityCurve
  };
}
