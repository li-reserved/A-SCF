export function analyzeSecuritySnapshot(input) {
  const security = input.security || {};
  const quote = normalizeQuote(input.quote);
  const intraday = normalizeIntraday(input.intraday);
  const dailyBars = mergeLiveQuote(normalizeDailyBars(input.dailyBars), quote, input.tradeDate);
  const fundFlow = normalizeFundFlow(input.fundFlow);
  const precision = security.type === 'etf' ? 3 : 2;

  const closes = dailyBars.map(row => row.close);
  const indicators = buildIndicators(dailyBars, intraday, quote.latest);
  const signal = buildSignal({ quote, intraday, fundFlow, indicators });
  const levels = buildLevels({ quote, dailyBars, indicators, precision });
  const outlook = buildOutlook({
    quote,
    intraday,
    indicators,
    signal,
    levels,
    session: input.session,
    precision
  });
  const tradeSignals = buildTradeSignals({
    intraday,
    dailyBars,
    levels,
    indicators,
    session: input.session,
    precision
  });
  const dataCompleteness = dataCompletenessScore({ quote, intraday, dailyBars, fundFlow });
  const confidence = Math.round(clamp(
    38
      + Math.abs(signal.score) * 1.2
      + dataCompleteness * 0.18
      + positiveOr(indicators.trendConsistency, 0) * 0.08
      - sessionPenalty(input.session, intraday),
    35,
    76
  ));

  return {
    security,
    quote,
    intraday,
    dailyBars: dailyBars.slice(-90),
    fundFlow,
    indicators: {
      ...indicators,
      ma5: roundPrice(indicators.ma5, precision),
      ma10: roundPrice(indicators.ma10, precision),
      ma20: roundPrice(indicators.ma20, precision),
      ma60: roundPrice(indicators.ma60, precision),
      atr14: roundPrice(indicators.atr14, precision),
      intradayAverage: roundPrice(indicators.intradayAverage, precision)
    },
    levels,
    outlook: {
      ...outlook,
      confidence,
      dataCompleteness
    },
    advice: buildAdvice({ signal, quote, levels, indicators }),
    tradeSignals,
    signals: signal.reasons,
    risks: buildRisks({ quote, indicators, intraday, fundFlow, session: input.session }),
    sampleSize: {
      dailyBars: closes.length,
      intradayPoints: intraday.length,
      hasFundFlow: Number.isFinite(fundFlow.mainNet)
    }
  };
}

function normalizeQuote(quote = {}) {
  return {
    latest: finiteNumber(quote.latest),
    changePct: finiteNumber(quote.changePct),
    change: finiteNumber(quote.change),
    open: finiteNumber(quote.open),
    high: finiteNumber(quote.high),
    low: finiteNumber(quote.low),
    preClose: finiteNumber(quote.preClose),
    volume: finiteNumber(quote.volume),
    amount: finiteNumber(quote.amount),
    turnoverRate: finiteNumber(quote.turnoverRate),
    volumeRatio: finiteNumber(quote.volumeRatio),
    peDynamic: finiteNumber(quote.peDynamic),
    pb: finiteNumber(quote.pb),
    updatedAt: quote.updatedAt || null
  };
}

function normalizeIntraday(points) {
  return (Array.isArray(points) ? points : [])
    .map(point => ({
      time: String(point?.time || ''),
      price: finiteNumber(point?.price),
      value: finiteNumber(point?.value),
      date: String(point?.date || ''),
      open: finiteNumber(point?.open),
      high: finiteNumber(point?.high),
      low: finiteNumber(point?.low),
      volume: finiteNumber(point?.volume),
      amount: finiteNumber(point?.amount),
      average: finiteNumber(point?.average)
    }))
    .filter(point => /^\d{2}:\d{2}$/.test(point.time) && Number.isFinite(point.price) && point.price > 0);
}

function normalizeDailyBars(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      date: String(row?.date || ''),
      open: finiteNumber(row?.open),
      close: finiteNumber(row?.close),
      high: finiteNumber(row?.high),
      low: finiteNumber(row?.low),
      volume: finiteNumber(row?.volumeRaw ?? row?.volume),
      amount: finiteNumber(row?.amountRaw ?? row?.amount),
      changePct: finiteNumber(row?.changePct)
    }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeLiveQuote(rows, quote, tradeDate) {
  if (!Number.isFinite(quote.latest) || !tradeDate) return rows;
  const existingIndex = rows.findIndex(row => row.date === tradeDate);
  const liveRow = {
    date: tradeDate,
    open: firstFinite([quote.open, quote.preClose, quote.latest]),
    close: quote.latest,
    high: maxFinite([quote.high, quote.open, quote.latest]),
    low: minFinite([quote.low, quote.open, quote.latest]),
    volume: quote.volume,
    amount: quote.amount,
    changePct: quote.changePct
  };
  if (existingIndex >= 0) {
    const next = rows.slice();
    next[existingIndex] = liveRow;
    return next;
  }
  return [...rows, liveRow].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeFundFlow(flow = {}) {
  return {
    mainNet: finiteNumber(flow.mainNet),
    mainNetPct: finiteNumber(flow.mainNetPct),
    superLarge: finiteNumber(flow.superLarge),
    large: finiteNumber(flow.large),
    medium: finiteNumber(flow.medium),
    small: finiteNumber(flow.small),
    darkTrade: flow.darkTrade || null,
    unit: flow.unit || '亿元',
    points: Array.isArray(flow.points) ? flow.points : [],
    dailyPoints: Array.isArray(flow.dailyPoints) ? flow.dailyPoints : [],
    source: flow.source || 'unavailable'
  };
}

function buildIndicators(rows, intraday, latest) {
  const closes = rows.map(row => row.close);
  const prices = intraday.map(point => point.price);
  const liveTrend = buildLiveTrend(prices);
  const dayLow = minFinite(prices);
  const dayHigh = maxFinite(prices);
  const rangePosition = Number.isFinite(dayLow) && Number.isFinite(dayHigh) && dayHigh > dayLow
    ? clamp((latest - dayLow) / (dayHigh - dayLow), 0, 1)
    : 0.5;
  return {
    ma5: simpleAverage(closes.slice(-5)),
    ma10: simpleAverage(closes.slice(-10)),
    ma20: simpleAverage(closes.slice(-20)),
    ma60: simpleAverage(closes.slice(-60)),
    rsi14: roundNumber(relativeStrengthIndex(closes, 14), 1),
    atr14: averageTrueRange(rows, 14),
    intradayAverage: simpleAverage(prices),
    ...liveTrend,
    rangePosition: roundNumber(rangePosition * 100, 1)
  };
}

function buildSignal({ quote, intraday, fundFlow, indicators }) {
  let score = 0;
  const reasons = [];
  score += compareSignal(quote.latest, indicators.ma5, 1, reasons, '现价站上 MA5', '现价位于 MA5 下方');
  score += compareSignal(indicators.ma5, indicators.ma10, 1, reasons, 'MA5 高于 MA10', 'MA5 低于 MA10');
  score += compareSignal(indicators.ma10, indicators.ma20, 1, reasons, 'MA10 高于 MA20', 'MA10 低于 MA20');
  score += compareSignal(quote.latest, quote.open, 1, reasons, '现价高于开盘价', '现价低于开盘价');
  score += compareSignal(quote.latest, indicators.intradayAverage, 1, reasons, '价格运行在日内均价上方', '价格运行在日内均价下方');

  if (Number.isFinite(indicators.momentum5Pct)) {
    if (indicators.momentum5Pct >= 0.12) {
      score += 1;
      reasons.push({ tone: 'positive', text: `近 5 分钟动量 +${formatPct(indicators.momentum5Pct)}` });
    } else if (indicators.momentum5Pct <= -0.12) {
      score -= 1;
      reasons.push({ tone: 'negative', text: `近 5 分钟动量 ${formatPct(indicators.momentum5Pct)}` });
    }
  }

  if (Number.isFinite(fundFlow.mainNet)) {
    if (fundFlow.mainNet > 0) {
      score += 1;
      reasons.push({ tone: 'positive', text: `主力净流入 ${formatSigned(fundFlow.mainNet)} 亿元` });
    } else if (fundFlow.mainNet < 0) {
      score -= 1;
      reasons.push({ tone: 'negative', text: `主力净流出 ${formatSigned(fundFlow.mainNet)} 亿元` });
    }
  }

  if (indicators.rangePosition >= 68) score += 1;
  if (indicators.rangePosition <= 32) score -= 1;
  if (indicators.rsi14 >= 76) {
    score -= 1;
    reasons.push({ tone: 'warning', text: `RSI14 ${formatNumber(indicators.rsi14)}，短线偏热` });
  } else if (indicators.rsi14 <= 28) {
    reasons.push({ tone: 'warning', text: `RSI14 ${formatNumber(indicators.rsi14)}，弱势超卖` });
  }

  const direction = score >= 4
    ? '偏强延续'
    : score >= 1
      ? '震荡偏强'
      : score <= -4
        ? '偏弱延续'
        : score <= -1
          ? '震荡偏弱'
          : '区间震荡';
  const tone = score >= 1 ? 'positive' : score <= -1 ? 'negative' : 'neutral';
  return { score, direction, tone, reasons: reasons.slice(0, 8) };
}

function buildLevels({ quote, dailyBars, indicators, precision }) {
  const latest = quote.latest;
  const atr = positiveOr(indicators.atr14, latest * 0.018);
  const recent5 = dailyBars.slice(-5);
  const recent20 = dailyBars.slice(-20);
  const supports = [
    quote.low,
    indicators.ma5,
    indicators.ma10,
    indicators.ma20,
    minFinite(recent5.map(row => row.low)),
    minFinite(recent20.map(row => row.low))
  ].filter(value => Number.isFinite(value) && value < latest * 0.998);
  const resistances = [
    quote.high,
    indicators.ma5,
    indicators.ma10,
    indicators.ma20,
    maxFinite(recent5.map(row => row.high)),
    maxFinite(recent20.map(row => row.high))
  ].filter(value => Number.isFinite(value) && value > latest * 1.002);
  const support = supports.length ? Math.max(...supports) : latest - atr * 0.8;
  const resistance = resistances.length ? Math.min(...resistances) : latest + atr * 0.8;
  const observeLow = Math.max(0, support - atr * 0.16);
  const observeHigh = Math.min(latest, support + atr * 0.18);
  const reduceLow = Math.max(latest, resistance - atr * 0.14);
  const reduceHigh = resistance + atr * 0.18;
  return {
    support: roundPrice(support, precision),
    resistance: roundPrice(resistance, precision),
    observeBuyZone: [roundPrice(observeLow, precision), roundPrice(observeHigh, precision)],
    breakoutTrigger: roundPrice(resistance + atr * 0.12, precision),
    reduceZone: [roundPrice(reduceLow, precision), roundPrice(reduceHigh, precision)],
    stopLoss: roundPrice(Math.max(0, support - Math.max(atr * 0.46, latest * 0.006)), precision),
    secondTarget: roundPrice(resistance + atr * 0.72, precision),
    basis: '近 20 日高低点、MA5/10/20 与 ATR14'
  };
}

function buildOutlook({ quote, intraday, indicators, signal, levels, session, precision }) {
  const latest = quote.latest;
  const horizonMinutes = predictionHorizonMinutes(intraday, session);
  const minuteVolatilityPct = positiveOr(indicators.minuteVolatilityPct, 0.08);
  const rawSlopePct = Number.isFinite(indicators.liveSlopePctPerMinute)
    ? indicators.liveSlopePctPerMinute
    : 0;
  const slopeLimitPct = clamp(minuteVolatilityPct * 0.62, 0.035, 0.16);
  const liveSlopePct = clamp(rawSlopePct, -slopeLimitPct, slopeLimitPct);
  const continuationPct = liveSlopePct * horizonMinutes * 0.16;
  const meanReversionPct = Number.isFinite(indicators.intradayAverage)
    ? clamp(percentChange(indicators.intradayAverage, latest) * 0.12, -0.45, 0.45)
    : 0;
  const structuralBiasPct = clamp(signal.score / 8 * 0.22, -0.22, 0.22);
  const maxMovePct = clamp(minuteVolatilityPct * Math.sqrt(horizonMinutes) * 0.9, 0.6, 2.8);
  const targetChangePct = clamp(continuationPct + meanReversionPct + structuralBiasPct, -maxMovePct, maxMovePct);
  const center = latest * (1 + targetChangePct / 100);
  const halfBandPct = clamp(minuteVolatilityPct * Math.sqrt(horizonMinutes) * 0.52, 0.35, 1.8);
  const halfBand = latest * halfBandPct / 100;
  const expectedLow = roundPrice(Math.max(0, center - halfBand), precision);
  const expectedHigh = roundPrice(center + halfBand, precision);
  const direction = targetChangePct >= 0.55
    ? '短线偏强'
    : targetChangePct <= -0.55
      ? '短线偏弱'
      : '短线震荡';
  const tone = targetChangePct > 0.12 ? 'positive' : targetChangePct < -0.12 ? 'negative' : 'neutral';
  const horizon = session?.session === 'trading'
    ? `未来 ${horizonMinutes} 分钟`
    : session?.session === 'lunch'
      ? '午后前 60 分钟'
      : '下一交易时段';
  return {
    direction,
    tone,
    horizon,
    expectedRange: [expectedLow, expectedHigh],
    center: roundPrice(center, precision),
    liveChangePct: roundNumber(targetChangePct, 2),
    basis: '最近 5/15/30 分钟实时斜率、一分钟波动率、日内均价与资金方向',
    invalidation: targetChangePct >= 0
      ? `跌破 ${formatPrice(levels.stopLoss, precision)} 后，偏强情景失效`
      : `放量站上 ${formatPrice(levels.breakoutTrigger, precision)} 后，偏弱情景失效`,
    projection: buildProjection(intraday, latest, center, halfBand, horizonMinutes, precision)
  };
}

function buildProjection(intraday, latest, center, halfBand, horizonMinutes, precision) {
  const lastTime = intraday.at(-1)?.time || '15:00';
  const pointCount = clamp(Math.ceil(horizonMinutes / 10), 1, 6);
  const easingTotal = 1 - Math.exp(-1.8);
  return Array.from({ length: pointCount }, (_, index) => {
    const progress = (index + 1) / pointCount;
    const easedProgress = (1 - Math.exp(-1.8 * progress)) / easingTotal;
    const value = latest + (center - latest) * easedProgress;
    const currentBand = halfBand * Math.sqrt(progress);
    return {
      time: projectedTimeLabel(lastTime, Math.min(horizonMinutes, (index + 1) * 10)),
      price: roundPrice(value, precision),
      low: roundPrice(Math.max(0, value - currentBand), precision),
      high: roundPrice(value + currentBand, precision)
    };
  });
}

function buildAdvice({ signal, quote, levels, indicators }) {
  const strong = signal.score >= 3;
  const weak = signal.score <= -3;
  const positionText = strong
    ? '持仓可沿支撑位观察，冲入压力区后分批锁定收益。'
    : weak
      ? '持仓以控制回撤为先，反弹至减仓区但量能不跟随时降低仓位。'
      : '持仓先看区间，支撑有效可持有，压力位附近不追涨。';
  const watcherText = strong
    ? '未持有优先等待回踩观察区企稳，或放量突破确认位后再评估。'
    : weak
      ? '未持有暂缓追入，等待重新站上日内均价并出现资金回流。'
      : '未持有可等待观察区缩量止跌，避免在区间中部开仓。';
  return {
    summary: strong ? '顺势观察，避免追高' : weak ? '偏防守，等待企稳' : '区间应对，等待触发',
    holder: positionText,
    watcher: watcherText,
    trigger: signal.score >= 0
      ? `观察区 ${formatRange(levels.observeBuyZone)}；突破确认 ${formatNumber(levels.breakoutTrigger)}`
      : `重新站上日内均价 ${formatNumber(indicators.intradayAverage)}，并收复 ${formatNumber(quote.open)}`,
    discipline: `失效位 ${formatNumber(levels.stopLoss)}，触及前不扩大风险敞口。`
  };
}

function buildTradeSignals({ intraday, dailyBars, levels, indicators, session, precision }) {
  return {
    mode: 'live-confirmed',
    nonRepainting: true,
    intraday: intradaySignalMarkers(intraday, indicators.minuteVolatilityPct, precision),
    daily: dailySignalMarkers(dailyBars, precision, session),
    plan: [
      {
        type: 'B',
        key: 'pullback',
        label: '回踩买点',
        range: levels.observeBuyZone,
        condition: '进入观察区后，价格重回分时均价、5 分钟斜率转正且当分钟放量时确认'
      },
      {
        type: 'B',
        key: 'breakout',
        label: '突破买点',
        price: levels.breakoutTrigger,
        condition: '当分钟收在近 15 分钟高点之上、斜率为正且量能高于近 10 分钟均量时确认'
      },
      {
        type: 'S',
        key: 'reduce',
        label: '减仓卖点',
        range: levels.reduceZone,
        condition: '高位回落并跌回分时均价下方、5 分钟斜率转负且当分钟放量时确认'
      },
      {
        type: 'S',
        key: 'stop',
        label: '止损卖点',
        price: levels.stopLoss,
        condition: '当分钟跌破近 15 分钟低点、斜率为负且量能确认；计划止损位仍优先执行'
      }
    ]
  };
}

function intradaySignalMarkers(points, minuteVolatilityPct, precision) {
  if (points.length < 7) return [];
  const reversalThresholdPct = clamp(positiveOr(minuteVolatilityPct, 0.08) * 1.05, 0.07, 0.36);
  const slopeThresholdPct = clamp(positiveOr(minuteVolatilityPct, 0.08) * 0.12, 0.005, 0.05);
  const candidates = [];
  for (let index = 6; index < points.length; index += 1) {
    const current = points[index];
    if (clockMinute(current.time) < 9 * 60 + 35) continue;
    const currentSlope = intradaySlopeAt(points, index);
    const previousSlopes = [
      intradaySlopeAt(points, index - 1),
      intradaySlopeAt(points, index - 2)
    ].filter(Number.isFinite);
    const volumeRatio = intradayVolumeRatio(points, index);
    if (!Number.isFinite(currentSlope) || !Number.isFinite(volumeRatio) || volumeRatio < 1.05) continue;

    const positiveTurn = currentSlope >= slopeThresholdPct
      && previousSlopes.some(value => value <= 0);
    const negativeTurn = currentSlope <= -slopeThresholdPct
      && previousSlopes.some(value => value >= 0);
    const aboveAverage = current.price > intradayAverageAt(points, index);
    const belowAverage = current.price < intradayAverageAt(points, index);
    const regainedAverage = crossedIntradayAverage(points, index, 'above', 3);
    const lostAverage = crossedIntradayAverage(points, index, 'below', 3);
    const recentPrices = points.slice(index - 6, index).map(point => point.price);
    const recentLow = Math.min(...recentPrices);
    const recentHigh = Math.max(...recentPrices);
    const rangeMinutes = Math.min(15, index);
    const priorRange = points.slice(index - rangeMinutes, index).map(point => point.price);
    const priorHigh = Math.max(...priorRange);
    const priorLow = Math.min(...priorRange);
    const reboundPct = percentChange(current.price, recentLow);
    const retreatPct = percentChange(current.price, recentHigh);
    const volumeText = `${volumeRatio.toFixed(2)} 倍均量`;

    if (aboveAverage && currentSlope >= slopeThresholdPct && current.price > priorHigh && volumeRatio >= 1.12) {
      candidates.push(confirmedIntradayMarker({
        type: 'B',
        rule: 'breakout',
        label: '放量突破',
        point: current,
        precision,
        volumeRatio,
        reason: `收在近 ${rangeMinutes} 分钟高点 ${formatPrice(priorHigh, precision)} 上方，${volumeText}`
      }));
    } else if (regainedAverage && positiveTurn && reboundPct >= reversalThresholdPct) {
      candidates.push(confirmedIntradayMarker({
        type: 'B',
        rule: 'pullback',
        label: '回踩确认',
        point: current,
        precision,
        volumeRatio,
        reason: `重回分时均价，5 分钟斜率转正，低点反弹 ${formatPct(reboundPct)}，${volumeText}`
      }));
    } else if (belowAverage && currentSlope <= -slopeThresholdPct && current.price < priorLow && volumeRatio >= 1.12) {
      candidates.push(confirmedIntradayMarker({
        type: 'S',
        rule: 'breakdown',
        label: '跌破确认',
        point: current,
        precision,
        volumeRatio,
        reason: `收在近 ${rangeMinutes} 分钟低点 ${formatPrice(priorLow, precision)} 下方，${volumeText}`
      }));
    } else if (lostAverage && negativeTurn && retreatPct <= -reversalThresholdPct) {
      candidates.push(confirmedIntradayMarker({
        type: 'S',
        rule: 'rejection',
        label: '冲高回落',
        point: current,
        precision,
        volumeRatio,
        reason: `跌回分时均价下方，5 分钟斜率转负，高点回落 ${formatPct(Math.abs(retreatPct))}，${volumeText}`
      }));
    }
  }
  return compactConfirmedSignals(candidates, 8).slice(-8);
}

function dailySignalMarkers(rows, precision, session) {
  const confirmedRows = ['preopen', 'auction', 'trading', 'lunch'].includes(session?.session)
    ? rows.slice(0, -1)
    : rows;
  if (confirmedRows.length < 12) return [];
  const candidates = [];
  for (let index = 10; index < confirmedRows.length; index += 1) {
    const previousFast = simpleAverage(confirmedRows.slice(index - 5, index).map(row => row.close));
    const previousSlow = simpleAverage(confirmedRows.slice(index - 10, index).map(row => row.close));
    const currentFast = simpleAverage(confirmedRows.slice(index - 4, index + 1).map(row => row.close));
    const currentSlow = simpleAverage(confirmedRows.slice(index - 9, index + 1).map(row => row.close));
    if (previousFast <= previousSlow && currentFast > currentSlow) {
      candidates.push({
        type: 'B',
        status: 'confirmed',
        label: '收盘金叉',
        date: confirmedRows[index].date,
        confirmedAt: confirmedRows[index].date,
        price: roundPrice(confirmedRows[index].close, precision),
        reason: '收盘确认 MA5 上穿 MA10，信号价为当日收盘价'
      });
    } else if (previousFast >= previousSlow && currentFast < currentSlow) {
      candidates.push({
        type: 'S',
        status: 'confirmed',
        label: '收盘死叉',
        date: confirmedRows[index].date,
        confirmedAt: confirmedRows[index].date,
        price: roundPrice(confirmedRows[index].close, precision),
        reason: '收盘确认 MA5 下穿 MA10，信号价为当日收盘价'
      });
    }
  }
  const visibleDates = new Set(confirmedRows.slice(-60).map(row => row.date));
  return candidates.filter(marker => visibleDates.has(marker.date)).slice(-8);
}

function confirmedIntradayMarker({ type, rule, label, point, precision, volumeRatio, reason }) {
  return {
    type,
    rule,
    label,
    status: 'confirmed',
    time: point.time,
    confirmedAt: point.time,
    price: roundPrice(point.price, precision),
    volumeRatio: roundNumber(volumeRatio, 2),
    reason
  };
}

function intradaySlopeAt(points, index) {
  if (index < 5) return NaN;
  return regressionSlopePctPerMinute(points.slice(index - 5, index + 1).map(point => point.price));
}

function intradayAverageAt(points, index) {
  const reportedAverage = points[index]?.average;
  return Number.isFinite(reportedAverage)
    ? reportedAverage
    : simpleAverage(points.slice(0, index + 1).map(point => point.price));
}

function crossedIntradayAverage(points, index, direction, lookback) {
  const firstIndex = Math.max(1, index - lookback + 1);
  for (let cursor = firstIndex; cursor <= index; cursor += 1) {
    const previousPrice = points[cursor - 1].price;
    const currentPrice = points[cursor].price;
    const previousAverage = intradayAverageAt(points, cursor - 1);
    const currentAverage = intradayAverageAt(points, cursor);
    if (direction === 'above' && previousPrice <= previousAverage && currentPrice > currentAverage) return true;
    if (direction === 'below' && previousPrice >= previousAverage && currentPrice < currentAverage) return true;
  }
  return false;
}

function intradayVolumeRatio(points, index) {
  const currentVolume = points[index]?.volume;
  const recentVolumes = points
    .slice(Math.max(0, index - 10), index)
    .map(point => point.volume)
    .filter(value => Number.isFinite(value) && value > 0);
  const averageVolume = simpleAverage(recentVolumes);
  return Number.isFinite(currentVolume) && currentVolume > 0 && Number.isFinite(averageVolume) && averageVolume > 0
    ? currentVolume / averageVolume
    : NaN;
}

function compactConfirmedSignals(markers, minimumMinutes) {
  const result = [];
  markers.forEach(marker => {
    const previous = result.at(-1);
    if (!previous) {
      result.push(marker);
      return;
    }
    if (previous.type === marker.type) return;
    const distance = Math.abs(clockMinute(marker.time) - clockMinute(previous.time));
    if (Number.isFinite(distance) && distance < minimumMinutes) return;
    result.push(marker);
  });
  return result;
}

function buildRisks({ quote, indicators, intraday, fundFlow, session }) {
  const risks = [];
  if (intraday.length < 20) risks.push('分时样本较少，预测置信度已下调。');
  if (!Number.isFinite(fundFlow.mainNet)) risks.push('当前未取得资金流数据，研判未计入主力净额。');
  if (session?.session === 'preopen' || session?.session === 'auction') risks.push('尚未形成完整盘中走势，点位以昨收和日线为主。');
  if (session?.session === 'closed') risks.push('已收盘，预测区间指向下一交易时段，不代表次日开盘价。');
  if (quote.volume === 0) risks.push('当前无成交量，可能处于停牌或非交易状态。');
  if (indicators.rsi14 >= 76) risks.push('RSI 进入偏热区，追涨回撤风险上升。');
  if (indicators.rsi14 <= 28) risks.push('RSI 处于弱势超卖区，反弹不等于趋势反转。');
  return risks.slice(0, 4);
}

function dataCompletenessScore({ quote, intraday, dailyBars, fundFlow }) {
  let score = Number.isFinite(quote.latest) ? 30 : 0;
  score += Math.min(30, dailyBars.length / 20 * 30);
  score += Math.min(25, intraday.length / 60 * 25);
  score += Number.isFinite(fundFlow.mainNet) ? 15 : 0;
  return Math.round(clamp(score, 0, 100));
}

function sessionPenalty(session, intraday) {
  if (intraday.length < 20) return 8;
  if (session?.session === 'preopen' || session?.session === 'auction') return 12;
  if (session?.session === 'closed') return 3;
  return 0;
}

function compareSignal(left, right, weight, reasons, positiveText, negativeText) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  if (left > right) {
    reasons.push({ tone: 'positive', text: positiveText });
    return weight;
  }
  if (left < right) {
    reasons.push({ tone: 'negative', text: negativeText });
    return -weight;
  }
  return 0;
}

function buildLiveTrend(prices) {
  const windows = [
    { size: 6, weight: 0.5 },
    { size: 16, weight: 0.3 },
    { size: 31, weight: 0.2 }
  ];
  const slopes = windows.map(window => ({
    ...window,
    value: regressionSlopePctPerMinute(prices.slice(-window.size))
  }));
  const available = slopes.filter(item => Number.isFinite(item.value));
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const liveSlopePctPerMinute = totalWeight
    ? available.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : NaN;
  const direction = Math.sign(liveSlopePctPerMinute);
  const consistentWeight = direction
    ? available.filter(item => Math.sign(item.value) === direction).reduce((sum, item) => sum + item.weight, 0)
    : 0;
  const minuteReturns = prices.slice(-31).map((price, index, rows) => (
    index ? percentChange(price, rows[index - 1]) : NaN
  )).filter(Number.isFinite);
  return {
    momentum5Pct: roundNumber(windowMomentumPct(prices, 5), 2),
    momentum15Pct: roundNumber(windowMomentumPct(prices, 15), 2),
    momentum30Pct: roundNumber(windowMomentumPct(prices, 30), 2),
    liveSlopePctPerMinute: roundNumber(liveSlopePctPerMinute, 4),
    minuteVolatilityPct: roundNumber(standardDeviation(minuteReturns), 3),
    trendConsistency: roundNumber(totalWeight ? consistentWeight / totalWeight * 100 : NaN, 0)
  };
}

function windowMomentumPct(prices, minutes) {
  if (prices.length < 2) return NaN;
  const rows = prices.slice(-(minutes + 1));
  return percentChange(rows.at(-1), rows[0]);
}

function regressionSlopePctPerMinute(values) {
  if (values.length < 3) return NaN;
  const meanX = (values.length - 1) / 2;
  const meanY = simpleAverage(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  const slope = denominator ? numerator / denominator : NaN;
  const latest = values.at(-1);
  return Number.isFinite(slope) && Number.isFinite(latest) && latest > 0 ? slope / latest * 100 : NaN;
}

function standardDeviation(values) {
  if (values.length < 2) return NaN;
  const average = simpleAverage(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function predictionHorizonMinutes(intraday, session) {
  if (session?.session !== 'trading') return 60;
  const lastMinute = clockMinute(intraday.at(-1)?.time);
  if (!Number.isFinite(lastMinute)) return 60;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const close = 15 * 60;
  const remaining = lastMinute <= morningClose
    ? morningClose - lastMinute + (close - afternoonOpen)
    : Math.max(0, close - Math.max(lastMinute, afternoonOpen));
  return Math.round(clamp(remaining, 1, 60));
}

function relativeStrengthIndex(values, period) {
  if (values.length <= period) return NaN;
  const recent = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const change = recent[index] - recent[index - 1];
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }
  if (losses === 0) return gains > 0 ? 100 : 50;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function averageTrueRange(rows, period) {
  if (rows.length < 2) return NaN;
  const ranges = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const previousClose = rows[index - 1].close;
    if (![row.high, row.low, previousClose].every(Number.isFinite)) continue;
    ranges.push(Math.max(
      row.high - row.low,
      Math.abs(row.high - previousClose),
      Math.abs(row.low - previousClose)
    ));
  }
  return simpleAverage(ranges.slice(-period));
}

function projectedTimeLabel(lastTime, minuteOffset) {
  const match = String(lastTime).match(/^(\d{2}):(\d{2})$/);
  if (!match) return `预测 +${minuteOffset}分`;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const close = 15 * 60;
  let minutes = Number(match[1]) * 60 + Number(match[2]);
  let remaining = minuteOffset;
  let nextDay = false;
  if (minutes >= close) {
    minutes = 9 * 60 + 30;
    nextDay = true;
  }
  if (minutes < morningClose) {
    const morningRoom = morningClose - minutes;
    const used = Math.min(remaining, morningRoom);
    minutes += used;
    remaining -= used;
    if (remaining > 0) minutes = afternoonOpen;
  } else if (minutes < afternoonOpen) {
    minutes = afternoonOpen;
  }
  minutes += remaining;
  if (minutes > close) return `预测 +${minuteOffset}分`;
  const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return nextDay ? `次日 ${label}` : label;
}

function clockMinute(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

function simpleAverage(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}

function percentChange(value, base) {
  return Number.isFinite(value) && Number.isFinite(base) && base !== 0 ? (value - base) / base * 100 : NaN;
}

function roundPrice(value, precision) {
  return Number.isFinite(value) ? Number(value.toFixed(precision)) : null;
}

function roundNumber(value, precision = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(precision)) : null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(values) {
  return values.find(Number.isFinite) ?? null;
}

function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function minFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : null;
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(value) : '--';
}

function formatPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '--';
}

function formatSigned(value) {
  return Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}` : '--';
}

function formatRange(range) {
  return Array.isArray(range) ? `${formatNumber(range[0])}-${formatNumber(range[1])}` : '--';
}

function formatPrice(value, precision) {
  return Number.isFinite(value) ? value.toFixed(precision) : '--';
}
