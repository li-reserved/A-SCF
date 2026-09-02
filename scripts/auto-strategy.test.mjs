import assert from 'node:assert/strict';
import test from 'node:test';

import { isStrategyMainBoardCode, simulateAutoStrategy } from './auto-strategy.mjs';
import { selectStrategyUniverseRows } from './fund-flow-proxy.mjs';

function weekdayDates(start, end) {
  const dates = [];
  for (let date = new Date(`${start}T00:00:00Z`); date <= new Date(`${end}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    if (weekday > 0 && weekday < 6) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function stockHistory(code, basePrice, end) {
  let close = basePrice;
  const bars = weekdayDates('2026-06-15', end).map((date, index) => {
    const open = close;
    close += index % 4 === 0 ? -1.1 : 1;
    return {
      date,
      open,
      close,
      high: Math.max(open, close) + 0.4,
      low: Math.min(open, close) - 0.4,
      volumeRaw: date === '2026-08-28' ? 1_600_000 : 1_000_000 + index * 2_000,
      changePct: (close / open - 1) * 100
    };
  });
  return { code, market: 1, name: `测试${code}`, industry: `测试行业${code.at(-1)}`, bars };
}

test('策略股票池先覆盖行业再补充同行业股票', () => {
  const rows = [
    { f12: '600001', f100: '电子' },
    { f12: '600002', f100: '电子' },
    { f12: '600003', f100: '电子' },
    { f12: '600004', f100: '医药' },
    { f12: '600005', f100: '医药' },
    { f12: '600006', f100: '银行' }
  ];

  assert.deepEqual(
    selectStrategyUniverseRows(rows, 5).map(row => row.f12),
    ['600001', '600004', '600006', '600002', '600005']
  );
});

function fixture(end) {
  const universe = [
    stockHistory('600001', 50, end),
    stockHistory('600002', 55, end),
    stockHistory('600003', 60, end)
  ];
  const benchmark = universe[0].bars.map(bar => ({ date: bar.date, close: bar.close }));
  return { universe, benchmark };
}

test('无同步账户时使用默认资金生成启动计划', () => {
  const result = simulateAutoStrategy(fixture('2026-08-28'));

  assert.equal(result.status, 'scheduled');
  assert.equal(result.startDate, '2026-08-31');
  assert.equal(result.settings.initialCapital, 300_000);
  assert.deepEqual(result.summary, {
    currentEquity: 300_000,
    cash: 300_000,
    marketValue: 0,
    totalReturnPct: 0,
    annualizedReturnPct: 0,
    benchmarkReturnPct: 0,
    excessReturnPct: 0,
    winRatePct: null,
    maxDrawdownPct: 0,
    completedTrades: 0,
    wins: 0,
    openPositions: 0,
    exposurePct: 0,
    totalFees: 0
  });
  assert.equal(result.equityCurve.length, 0);
  assert.equal(result.positions.length, 0);
  assert.equal(result.actions.length, 0);
  assert.equal(result.trades.length, 0);
  assert.ok(result.plans.length > 0);
  assert.ok(result.plans.every(plan => Number.isFinite(plan.referencePrice) && plan.referencePrice > 0));
  assert.ok(result.plans.every(plan => plan.shares > 0 && plan.shares % 100 === 0));
  assert.ok(result.plans.every(plan => isStrategyMainBoardCode(plan.code)));
});

test('创业板股票不会进入候选或买入计划', () => {
  const data = fixture('2026-08-28');
  data.universe.unshift(stockHistory('300001', 40, '2026-08-28'));
  const result = simulateAutoStrategy(data);

  assert.ok(result.candidates.every(candidate => candidate.code !== '300001'));
  assert.ok(result.plans.every(plan => plan.code !== '300001'));
});

test('同步持仓不因历史亏损立即卖出，新买入仍仅限主板', () => {
  const data = fixture('2026-08-28');
  data.universe.push(stockHistory('588170', 40, '2026-08-28'));
  const latestByCode = new Map(data.universe.map(stock => [stock.code, stock.bars.at(-1).close]));
  const positions = ['588170', '600001', '600002'].map((code, index) => {
    const latest = latestByCode.get(code);
    const shares = (index + 2) * 100;
    return {
      code,
      name: `同步${code}`,
      shares,
      availableShares: code === '588170' ? 100 : shares,
      latest,
      marketValue: latest * shares,
      cost: latest * shares * 1.2,
      entryPrice: latest * 1.2
    };
  });
  const marketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const initialAccount = {
    snapshotDate: '2026-08-28',
    cash: 81.05,
    marketValue,
    equity: marketValue + 81.05,
    positions
  };

  const result = simulateAutoStrategy({ ...data, initialAccount });

  assert.equal(result.status, 'scheduled');
  assert.equal(result.settings.initialCapital, initialAccount.equity);
  assert.equal(result.summary.currentEquity, Number(initialAccount.equity.toFixed(2)));
  assert.equal(result.summary.cash, 81.05);
  assert.equal(result.summary.marketValue, Number(marketValue.toFixed(2)));
  assert.equal(result.summary.openPositions, 3);
  assert.equal(result.positions.find(position => position.code === '588170').availableShares, 100);
  assert.equal(result.positions.find(position => position.code === '588170').origin, 'synced');
  assert.equal(result.positions.find(position => position.code === '588170').stopPrice, Number((latestByCode.get('588170') * 0.94).toFixed(4)));
  assert.equal(result.plans.length, 0);
  assert.ok(result.candidates.every(candidate => isStrategyMainBoardCode(candidate.code)));
  assert.ok(result.plans.filter(plan => plan.side === 'buy').every(plan => isStrategyMainBoardCode(plan.code)));
});

test('同步持仓在启动日跌破快照价止损线后才卖出', () => {
  const data = fixture('2026-08-31');
  const etf = stockHistory('588170', 40, '2026-08-31');
  const snapshotPrice = etf.bars.find(bar => bar.date === '2026-08-28').close;
  const mondayBar = etf.bars.find(bar => bar.date === '2026-08-31');
  mondayBar.open = snapshotPrice * 0.93;
  mondayBar.close = mondayBar.open;
  mondayBar.high = mondayBar.open;
  mondayBar.low = mondayBar.open;
  mondayBar.changePct = -7;
  data.universe.push(etf);
  const shares = 200;
  const marketValue = snapshotPrice * shares;
  const result = simulateAutoStrategy({
    ...data,
    initialAccount: {
      snapshotDate: '2026-08-28',
      cash: 100_000,
      marketValue,
      equity: 100_000 + marketValue,
      positions: [{
        code: '588170',
        name: '同步ETF',
        shares,
        availableShares: shares,
        latest: snapshotPrice,
        marketValue,
        cost: marketValue * 2,
        entryPrice: snapshotPrice * 2
      }]
    }
  });

  const sell = result.actions.find(action => action.side === 'sell' && action.code === '588170');
  assert.equal(sell.date, '2026-08-31');
  assert.equal(sell.reason, '止损');
  assert.equal(sell.price, Number(mondayBar.open.toFixed(2)));
});

test('启动日开盘后才成交，并按自定义初始资金计算', () => {
  const result = simulateAutoStrategy({
    ...fixture('2026-09-01'),
    settings: { initialCapital: 450_000 }
  });

  assert.equal(result.status, 'running');
  assert.equal(result.settings.initialCapital, 450_000);
  assert.equal(result.range.start, '2026-08-31');
  assert.ok(result.actions.some(action => action.side === 'buy' && action.date === '2026-08-31'));
  assert.ok(result.actions.filter(action => action.side === 'buy').every(action => action.shares > 0 && action.shares % 100 === 0));
  assert.ok(result.actions.every(action => action.date >= '2026-08-31'));
  assert.ok(result.equityCurve.every(point => point.date >= '2026-08-31'));
});

test('银行卡入金在到账日交易后增加现金且不计入策略收益', () => {
  const data = fixture('2026-09-01');
  const beforeDeposit = simulateAutoStrategy(data);
  const afterDeposit = simulateAutoStrategy({
    ...data,
    cashFlows: [{ date: '2026-09-01', amount: 42_000, source: '银行卡转入' }]
  });

  assert.deepEqual(afterDeposit.actions, beforeDeposit.actions);
  assert.equal(afterDeposit.summary.cash, Number((beforeDeposit.summary.cash + 42_000).toFixed(2)));
  assert.equal(afterDeposit.summary.currentEquity, Number((beforeDeposit.summary.currentEquity + 42_000).toFixed(2)));
  assert.equal(afterDeposit.summary.totalReturnPct, beforeDeposit.summary.totalReturnPct);
});
