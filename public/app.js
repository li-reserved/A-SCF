(function () {
  'use strict';

  const API_PATH = '/api/fund-flow/overview';
  const REQUEST_INTERVAL_MS = 8000;
  const REQUEST_TIMEOUT_MS = 6500;
  const CLIENT_CACHE_KEY = 'a-share-fund-flow:last-overview:v2';
  const CLIENT_CACHE_MAX_AGE_MS = 20 * 60 * 1000;
  const POINT_COUNT = 48;
  const TRADING_DAY_MINUTES = 240;
  const CATEGORY_LABELS = {
    all: '重点大类',
    focus: '重点大类',
    industry: '行业',
    concept: '概念',
    region: '地域',
    market: '市场',
    stock: '个股',
    northbound: '北向'
  };
  const CATEGORY_COLORS = {
    focus: ['#9f2e32', '#b93c39', '#cf5840', '#dc7447', '#c78927', '#a98d2b'],
    industry: ['#a92e31', '#c2463a', '#d76545', '#b8791f'],
    concept: ['#b4373d', '#cc5740', '#d87f44', '#b88a24'],
    region: ['#b8403d', '#ce6046', '#d28a3d'],
    market: ['#a53a40', '#c15b45'],
    stock: ['#96333a', '#b85844', '#db7b53'],
    northbound: ['#ad3b3f', '#c86446', '#d3903a']
  };
  const POSITIVE_COLORS = ['#9f2e32', '#b93c39', '#cf5840', '#dc7447', '#c78927', '#a98d2b'];

  const state = {
    data: null,
    selectedScope: 'all',
    chartMode: 'flow',
    sortMode: 'absolute',
    paused: false,
    hoverId: null,
    lockedId: null,
    lastFetchAt: 0,
    nextFetchAt: 0,
    fetching: false,
    consecutiveErrors: 0,
    cacheLoaded: false,
    visibleSeries: [],
    plot: null,
    scrubMinute: null,
    scrubDragging: false,
    scrubFrame: 0
  };

  const els = {
    canvas: document.getElementById('flowCanvas'),
    wrap: document.getElementById('canvasWrap'),
    tooltip: document.getElementById('tooltip'),
    clock: document.getElementById('clock'),
    tradeDate: document.getElementById('tradeDate'),
    status: document.getElementById('sourceStatus'),
    countdown: document.getElementById('countdown'),
    hint: document.getElementById('refreshHint'),
    subtitle: document.getElementById('chartSubtitle'),
    inflow: document.getElementById('inflowList'),
    outflow: document.getElementById('outflowList'),
    breakdown: document.getElementById('breakdownList'),
    notice: document.getElementById('noticeCard'),
    refresh: document.getElementById('refreshBtn'),
    pause: document.getElementById('pauseBtn'),
    sort: document.getElementById('sortMode'),
    tabs: document.getElementById('scopeTabs'),
    mode: document.getElementById('chartMode'),
    timeTrack: document.getElementById('timeScrubTrack'),
    timeScale: document.querySelector('.time-scrubber-scale'),
    timeRange: document.getElementById('timeScrubRange'),
    timeLabel: document.getElementById('timeScrubLabel'),
    timeNow: document.getElementById('timeNowBtn')
  };
  els.mobileStrip = document.getElementById('mobileBoardStrip');

  const ctx = els.canvas.getContext('2d');

  function isCompactViewport() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function formatClock(date) {
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatMoney(value, signed = true) {
    const num = Number(value) || 0;
    const sign = signed && num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}亿`;
  }

  function formatPct(value) {
    const num = Number(value) || 0;
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  }

  function formatChartValue(value) {
    return activeMetric() === 'price'
      ? formatPct(value)
      : formatMoney(value).replace('亿', '');
  }

  function formatMetricValue(value, metric) {
    return metric === 'price' ? formatPct(value) : formatMoney(value).replace('亿', '');
  }

  function formatCompactMetricValue(value, metric) {
    const num = Number(value) || 0;
    const sign = num > 0 ? '+' : '';
    return metric === 'price' ? `${sign}${num.toFixed(1)}%` : `${sign}${Math.round(num)}`;
  }

  function colorClass(value) {
    return Number(value) >= 0 ? 'positive' : 'negative';
  }

  function currentValue(item) {
    return metricValue(item, activeMetric());
  }

  function metricValue(item, metric) {
    if (state.scrubMinute !== null) {
      const value = valueAtMinute(item, metric, state.scrubMinute);
      return value === null ? 0 : value;
    }
    return metric === 'price' ? Number(item.changePct) || 0 : Number(item.latest) || 0;
  }

  function currentPoints(item, metric = activeMetric()) {
    return metric === 'price'
      ? (Array.isArray(item.pricePoints) && item.pricePoints.length ? item.pricePoints : [])
      : item.points;
  }

  function activeMetric() {
    return state.chartMode === 'price' ? 'price' : 'flow';
  }

  function requestUrl(force = false) {
    const params = new URLSearchParams({
      scope: state.selectedScope,
      limit: '60'
    });
    if (force) {
      params.set('force', '1');
      params.set('t', String(Date.now()));
    }
    return `${API_PATH}?${params.toString()}`;
  }

  async function fetchData(force) {
    const now = Date.now();
    if (state.fetching) return;
    if (!force && document.hidden) return;
    if (!force && state.paused) return;
    if (!force && now < state.nextFetchAt) return;
    state.fetching = true;
    updateRefreshButton();
    setStatus('loading', '请求中');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), force ? REQUEST_TIMEOUT_MS + 3500 : REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(requestUrl(force), { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      applyData(data);
      saveClientCache(data);
      state.consecutiveErrors = 0;
      state.lastFetchAt = now;
      state.nextFetchAt = now + (data.refreshAfterMs || REQUEST_INTERVAL_MS);
    } catch (err) {
      const message = err.name === 'AbortError' ? '请求超时，沿用上一帧' : (err.message || '请求失败');
      if (!state.data) {
        const cached = loadClientCache();
        if (cached) applyData(markCachedData(cached.data, `服务器暂慢，先显示本机缓存：${message}`));
        else applyData(createEmptyData(`真实数据暂不可用：${message}`));
      } else {
        state.data.sourceStatus = {
          level: 'warn',
          text: '沿用旧数据',
          detail: message
        };
        renderAll();
      }
      state.consecutiveErrors += 1;
      state.nextFetchAt = now + retryDelayMs();
      updateStatus();
    } finally {
      clearTimeout(timeout);
      state.fetching = false;
      updateRefreshButton();
    }
  }

  function applyData(data) {
    state.data = normalizeClientData(data);
    state.hoverId = null;
    renderAll();
  }

  function loadCachedDataOnBoot() {
    const cached = loadClientCache();
    if (!cached) return false;
    applyData(markCachedData(cached.data, '正在后台更新，先显示上次可用数据。'));
    state.cacheLoaded = true;
    return true;
  }

  function loadClientCache() {
    try {
      const raw = localStorage.getItem(CLIENT_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached?.data?.series?.length || Date.now() - Number(cached.savedAt || 0) > CLIENT_CACHE_MAX_AGE_MS) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function saveClientCache(data) {
    if (!data?.series?.length) return;
    try {
      localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }

  function markCachedData(data, detail) {
    return {
      ...data,
      sourceStatus: {
        ...(data.sourceStatus || {}),
        level: 'warn',
        text: '缓存数据',
        detail
      }
    };
  }

  function retryDelayMs() {
    return Math.min(45000, REQUEST_INTERVAL_MS * Math.max(1, state.consecutiveErrors));
  }

  function normalizeClientData(data) {
    const fallback = createEmptyData('接口返回为空，未展示模拟走势。');
    const source = data && Array.isArray(data.series) ? data : fallback;
    const timeline = source.timeline || tradingTimeline(new Date(source.updatedAt || Date.now()));
    const series = source.series.map((item, index) => {
      const latest = Number(item.latest) || 0;
      const category = item.category || 'industry';
      const rawPoints = Array.isArray(item.points) && item.points.length
        ? item.points.map((point, pointIndex) => ({
            time: point.time || timeLabel(pointIndex, item.points.length, timeline.elapsed),
            value: Number(point.value) || 0
          }))
        : [{ time: minuteToTimeLabel(timeline.elapsed), value: latest }];
      const rawPricePoints = Array.isArray(item.pricePoints) && item.pricePoints.length
        ? item.pricePoints.map(point => ({
            time: point.time,
            value: Number(point.value) || 0,
            price: Number(point.price) || 0
          }))
        : [{ time: minuteToTimeLabel(timeline.elapsed), value: Number(item.changePct) || 0 }];
      const pricePoints = normalizeSeriesPoints(rawPricePoints, Number(item.changePct) || 0, timeline, 'price', item.pricePointSource || 'fallback');
      const pricePointSource = item.pricePointSource || ((Array.isArray(item.pricePoints) && item.pricePoints.length > 10) ? 'minute' : 'fallback');
      const hasRealFlowLine = item.pointSource === 'minute' && rawPoints.length > 1;
      const points = hasRealFlowLine
        ? normalizeSeriesPoints(rawPoints, latest, timeline, 'flow', 'minute')
        : normalizeSeriesPoints(rawPoints, latest, timeline, 'flow', item.pointSource || 'snapshot');
      return {
        id: item.id || `${category}-${index}`,
        name: item.name || `资金流${index + 1}`,
        category,
        sourceName: item.sourceName || '',
        sourceCategory: item.sourceCategory || '',
        sourceCode: item.sourceCode || '',
        pointSource: hasRealFlowLine ? 'minute' : (item.pointSource || 'snapshot'),
        pricePointSource,
        latest,
        rank: Number(item.rank) || index + 1,
        changePct: Number(item.changePct) || 0,
        points,
        pricePoints
      };
    });

    return {
      updatedAt: source.updatedAt || new Date().toISOString(),
      tradeDate: source.tradeDate || formatDate(new Date()),
      sourceStatus: source.sourceStatus || { level: 'error', text: '真实源不可用', detail: '未连接真实数据源' },
      refreshAfterMs: source.refreshAfterMs || REQUEST_INTERVAL_MS,
      timeline,
      series,
      leaders: source.leaders || buildLeaders(series),
      breakdown: Array.isArray(source.breakdown) && source.breakdown.length ? source.breakdown : buildBreakdown(series),
      note: source.note || ''
    };
  }

  function renderAll() {
    updateHeader();
    updateStatus();
    updateLists();
    updateMobileStrip();
    updateTimeScrubber();
    drawChart();
  }

  function updateHeader() {
    const now = new Date();
    els.clock.textContent = formatClock(now);
    els.tradeDate.textContent = state.data?.tradeDate || formatDate(now);
    const scopeLabel = CATEGORY_LABELS[state.selectedScope] || '重点大类';
    const endLabel = state.data?.timeline?.endLabel || tradingTimeline().endLabel;
    const viewingMinute = selectedMinute();
    const viewingLabel = minuteToTimeLabel(viewingMinute);
    const visible = currentSeries();
    const minuteCount = visible.filter(item => item.pointSource === 'minute').length;
    const priceTrendCount = visible.filter(item => (item.pricePoints || []).length > 10).length;
    const flowMode = minuteCount === visible.length && visible.length
      ? '资金分钟线'
      : minuteCount
        ? '资金分钟线/实时净额'
        : '资金实时净额';
    const priceMode = priceTrendCount
      ? '涨跌幅分时'
      : '涨跌幅当前方向';
    const mode = state.chartMode === 'dual'
      ? `${flowMode} + ${priceMode}`
      : state.chartMode === 'price'
        ? priceMode
        : flowMode;
    const unit = state.chartMode === 'dual' ? '亿元 / %' : state.chartMode === 'price' ? '%' : '亿元';
    const countText = visible.length
      ? `显示 ${visible.length} 条 · 真实资金分钟线 ${minuteCount}/${visible.length} · 分时 ${priceTrendCount}/${visible.length}`
      : '等待数据';
    const replayText = state.scrubMinute === null ? `至${endLabel}` : `回看 ${viewingLabel}`;
    els.subtitle.textContent = isCompactViewport() && visible.length
      ? `${scopeLabel} ${visible.length}条 · 资金${minuteCount}/${visible.length} · ${replayText}`
      : `${scopeLabel} · ${countText} · ${mode} · 09:30 至 ${endLabel} · ${state.scrubMinute === null ? '当前' : `回看 ${viewingLabel}`} · 单位：${unit}`;
  }

  function setStatus(level, text) {
    els.status.className = `meta-chip status ${level || ''}`;
    els.status.querySelector('strong').textContent = text;
  }

  function updateStatus() {
    const source = state.data?.sourceStatus || { level: 'warn', text: '未连接' };
    const level = source.level === 'live' ? 'ok' : source.level === 'error' ? 'error' : 'warn';
    setStatus(level, source.text || '未知');
    const visible = currentSeries();
    const minuteCount = visible.filter(item => item.pointSource === 'minute').length;
    const detail = source.detail || state.data?.note || 'UI 每秒心跳，真实请求分层限流。';
    const priceTrendCount = visible.filter(item => item.pricePointSource === 'minute' || (item.pricePoints || []).length > 10).length;
    const minuteHint = visible.length
      ? `当前显示全部 ${visible.length} 条重点大类；真实资金分钟线 ${minuteCount}/${visible.length}，涨跌幅真实分时 ${priceTrendCount}/${visible.length}。`
      : '';
    els.notice.innerHTML = `<strong>数据说明</strong><p>${escapeHtml(`${detail}${minuteHint ? ` ${minuteHint}` : ''}`)}</p>`;
    updateRefreshButton();
  }

  function updateRefreshButton() {
    if (!els.refresh) return;
    els.refresh.disabled = state.fetching;
    els.refresh.textContent = state.fetching ? '更新中' : '更新数据';
  }

  function updateLists() {
    const series = currentSeries();
    const inflow = [...series].filter(x => x.latest > 0).sort((a, b) => b.latest - a.latest).slice(0, 5);
    const outflow = [...series].filter(x => x.latest < 0).sort((a, b) => a.latest - b.latest).slice(0, 5);
    els.inflow.innerHTML = inflow.map((item, index) => rankItem(item, index)).join('');
    els.outflow.innerHTML = outflow.map((item, index) => rankItem(item, index)).join('');
    const breakdown = (state.data?.breakdown || []).slice(0, 4);
    els.breakdown.innerHTML = breakdown.map(breakdownItem).join('');
  }

  function updateTimeScrubber() {
    if (!els.timeRange || !els.timeLabel || !state.data) return;
    const maxMinute = availableEndMinute();
    const selected = selectedMinute();
    const scrubEndPct = clamp(maxMinute / TRADING_DAY_MINUTES, 0, 1);
    els.timeRange.max = String(TRADING_DAY_MINUTES);
    els.timeRange.value = String(selected);
    els.timeRange.disabled = maxMinute <= 0;
    els.timeTrack?.style.setProperty('--scrub-end', `${scrubEndPct * 100}%`);
    els.timeLabel.textContent = `${state.scrubMinute === null ? '当前' : '回看'} ${minuteToTimeLabel(selected)}`;
    els.timeNow?.classList.toggle('active', state.scrubMinute === null);
    updateScrubberScale(maxMinute);
  }

  function updateScrubberScale(maxMinute) {
    const labels = els.timeScale?.querySelectorAll('span') || [];
    if (labels.length < 3) return;
    const end = clamp(maxMinute, 0, TRADING_DAY_MINUTES);
    labels[0].textContent = '09:30';
    labels[1].textContent = minuteToTimeLabel(Math.round(end / 2));
    labels[2].textContent = minuteToTimeLabel(end);
    const trackRect = els.timeTrack?.getBoundingClientRect();
    const scaleRect = els.timeScale?.getBoundingClientRect();
    if (!trackRect || !scaleRect) return;
    const start = trackRect.left - scaleRect.left;
    const endX = start + trackRect.width * (end / TRADING_DAY_MINUTES);
    const midX = start + trackRect.width * ((end / 2) / TRADING_DAY_MINUTES);
    labels[0].style.left = `${start}px`;
    labels[1].style.left = `${midX}px`;
    labels[2].style.left = `${endX}px`;
  }

  function setScrubMinute(minute) {
    const maxMinute = availableEndMinute();
    const next = clamp(Math.round(Number(minute) || 0), 0, maxMinute);
    state.scrubMinute = next >= maxMinute ? null : next;
    renderAll();
  }

  function setScrubMinuteFast(minute) {
    const maxMinute = availableEndMinute();
    const next = clamp(Math.round(Number(minute) || 0), 0, maxMinute);
    state.scrubMinute = next >= maxMinute ? null : next;
    if (state.scrubFrame) return;
    state.scrubFrame = requestAnimationFrame(() => {
      state.scrubFrame = 0;
      updateTimeScrubber();
      updateHeader();
      drawChart();
    });
  }

  function setScrubFromPointer(event) {
    if (!els.timeRange || !state.data) return;
    const rect = els.timeRange.getBoundingClientRect();
    const pct = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    setScrubMinuteFast(TRADING_DAY_MINUTES * pct);
  }

  function updateMobileStrip() {
    if (!els.mobileStrip) return;
    const metric = activeMetric();
    els.mobileStrip.innerHTML = currentSeries().map(item => {
      const value = metricValue(item, metric);
      const active = state.lockedId === item.id ? ' active' : '';
      return `
        <button class="mobile-board-chip ${colorClass(value)}${active}" type="button" data-id="${escapeHtml(item.id)}">
          <span>${escapeHtml(item.name)}</span>
          <strong>${escapeHtml(formatMetricValue(value, metric))}</strong>
        </button>
      `;
    }).join('');
  }

  function rankItem(item, index) {
    return `
      <li data-id="${escapeHtml(item.id)}">
        <span class="rank-index">${index + 1}</span>
        <span class="rank-name">${escapeHtml(item.name)}<span class="rank-sub">${rankSubText(item)}</span></span>
        <span class="rank-value ${colorClass(metricValue(item, 'flow'))}">${formatMoney(metricValue(item, 'flow'))}<small class="${colorClass(metricValue(item, 'price'))}">${formatPct(metricValue(item, 'price'))}</small></span>
      </li>
    `;
  }

  function rankSubText(item) {
    const source = item.sourceName && item.sourceName !== item.name ? `来源：${item.sourceName}` : (CATEGORY_LABELS[item.category] || item.category);
    const suffix = item.pointSource === 'minute' ? ' · 分钟线' : '';
    return escapeHtml(`${source}${suffix}`);
  }

  function breakdownItem(item) {
    const rows = [
      ['主力', item.main],
      ['超大单', item.superLarge],
      ['大单', item.large],
      ['中单', item.medium],
      ['小单', item.small]
    ];
    return `
      <div class="breakdown-item">
        <div class="breakdown-head">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="${colorClass(item.main)}">${formatMoney(item.main)}</span>
        </div>
        ${rows.map(([label, value]) => barRow(label, value)).join('')}
      </div>
    `;
  }

  function barRow(label, value) {
    const width = Math.min(100, Math.abs(Number(value) || 0) / 1.2);
    const cls = Number(value) >= 0 ? '' : ' negative';
    return `
      <div class="bar-row">
        <span>${label}</span>
        <span class="bar-track"><span class="bar-fill${cls}" style="width:${width}%"></span></span>
        <span class="${colorClass(value)}">${formatMoney(value, false)}</span>
      </div>
    `;
  }

  function currentSeries() {
    if (!state.data) return [];
    const scoped = state.selectedScope === 'all'
      ? state.data.series
      : state.data.series.filter(item => item.category === state.selectedScope);
    const sortMetric = state.chartMode === 'price' ? 'price' : 'flow';
    const sorted = [...scoped].sort((a, b) => {
      const av = metricValue(a, sortMetric);
      const bv = metricValue(b, sortMetric);
      if (state.sortMode === 'inflow') return bv - av;
      if (state.sortMode === 'outflow') return av - bv;
      if (state.sortMode === 'rank') return a.rank - b.rank;
      return Math.abs(bv) - Math.abs(av);
    });
    return sorted;
  }

  function resizeCanvas() {
    const rect = els.wrap.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    els.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    els.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    updateTimeScrubber();
    drawChart();
  }

  function drawChart() {
    if (!state.data) return;
    const width = els.wrap.clientWidth;
    const height = els.wrap.clientHeight;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);

    const series = currentSeries();
    state.visibleSeries = series;
    const timeline = state.data.timeline || tradingTimeline();
    const plots = buildPlots(width, height, timeline);
    state.plot = { plots, primary: plots[0], endMinute: timeline.elapsed };
    plots.forEach(plotInfo => {
      drawGrid(plotInfo.plot, plotInfo.scale, width, height, timeline, plotInfo);
      drawPanelTitle(plotInfo);
      drawLines(series, plotInfo.plot, plotInfo.scale, plotInfo.metric);
      drawCurrentMarker(plotInfo.plot, timeline);
    });
    drawLabels(series, plots[0].plot, plots[0].scale, width, plots[0].metric);
    drawEmptyState(plots[0].plot);
    drawWatermark(plots[0].plot);
  }

  function buildPlots(width, height, timeline) {
    const compact = isCompactViewport();
    const labelReserve = state.chartMode === 'price'
      ? Math.min(compact ? 108 : 190, Math.max(compact ? 82 : 130, width * (compact ? 0.22 : 0.16)))
      : Math.min(compact ? 116 : 170, Math.max(compact ? 88 : 118, width * (compact ? 0.25 : 0.14)));
    const pad = compact
      ? { top: 30, right: labelReserve, bottom: 34, left: 42 }
      : { top: 40, right: labelReserve, bottom: 48, left: 76 };
    const plotWidth = width - pad.left - pad.right;
    if (state.chartMode !== 'dual') {
      const metric = state.chartMode === 'price' ? 'price' : 'flow';
      const plot = {
        x: pad.left,
        y: pad.top,
        width: plotWidth,
        height: height - pad.top - pad.bottom,
        endMinute: chartAxisEndMinute()
      };
      return [{ metric, title: metric === 'price' ? '板块分时涨跌幅' : '资金净流入', unit: metric === 'price' ? '%' : '亿', plot, pad, scale: computeScale(currentSeries(), metric), endMinute: timeline.elapsed }];
    }
    const usableHeight = height - pad.top - pad.bottom - 20;
    const flowHeight = Math.max(compact ? 180 : 210, Math.round(usableHeight * (compact ? 0.58 : 0.62)));
    const priceHeight = Math.max(compact ? 106 : 118, usableHeight - flowHeight);
    const flowPlot = { x: pad.left, y: pad.top, width: plotWidth, height: flowHeight, endMinute: chartAxisEndMinute() };
    const pricePlot = { x: pad.left, y: flowPlot.y + flowPlot.height + 20, width: plotWidth, height: priceHeight, endMinute: chartAxisEndMinute() };
    return [
      { metric: 'flow', title: '资金净流入', unit: '亿', plot: flowPlot, pad, scale: computeScale(currentSeries(), 'flow'), endMinute: timeline.elapsed },
      { metric: 'price', title: '板块分时涨跌幅', unit: '%', plot: pricePlot, pad, scale: computeScale(currentSeries(), 'price'), endMinute: timeline.elapsed }
    ];
  }

  function chartAxisEndMinute() {
    return TRADING_DAY_MINUTES;
  }

  function computeScale(series, metric = activeMetric()) {
    const values = series.flatMap(item => (
      hasDrawablePoints(item, metric) ? currentPoints(item, metric).map(point => Number(point.value) || 0) : []
    ));
    const base = metric === 'price' ? 1 : 10;
    const maxPositive = Math.max(base, ...values.filter(value => value > 0));
    const maxNegative = Math.max(base, ...values.filter(value => value < 0).map(value => Math.abs(value)));
    const maxAbs = niceScale(Math.max(maxPositive, maxNegative), metric);
    return {
      metric,
      positive: niceScale(maxPositive, metric),
      negative: niceScale(maxNegative, metric),
      maxAbs
    };
  }

  function niceScale(value, metric = activeMetric()) {
    if (metric === 'price') {
      if (value <= 1) return 1;
      if (value <= 3) return Math.ceil(value);
      if (value <= 8) return Math.ceil(value / 2) * 2;
      return Math.ceil(value / 5) * 5;
    }
    if (value <= 30) return Math.ceil(value / 10) * 10;
    if (value <= 120) return Math.ceil(value / 30) * 30;
    if (value <= 600) return Math.ceil(value / 100) * 100;
    return Math.ceil(value / 300) * 300;
  }

  function drawGrid(plot, scale, width, height, timeline, plotInfo = { metric: activeMetric() }) {
    const compact = isCompactViewport();
    ctx.save();
    ctx.font = `${compact ? 10.5 : 13}px "PingFang SC", Arial`;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e7ebf0';
    ctx.fillStyle = '#576171';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    axisValueTicks(scale, compact).forEach(value => {
      const y = yFor(value, plot, scale);
      ctx.beginPath();
      ctx.setLineDash(value === 0 ? [] : [5, 6]);
      ctx.strokeStyle = value === 0 ? '#adb7c4' : '#e4e9ef';
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = value === 0 ? '#333b46' : '#606b78';
      const label = plotInfo.metric === 'price'
        ? `${value === 0 ? '0' : value.toFixed(Math.abs(value) < 3 ? 1 : 0)}%`
        : `${value === 0 ? '0' : Math.round(value)}亿`;
      ctx.fillText(label, plot.x - (compact ? 6 : 12), y);
    });

    const endMinute = clamp(Number(plot.endMinute) || TRADING_DAY_MINUTES, 1, TRADING_DAY_MINUTES);
    const ticks = visibleTicks(endMinute, compact);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#48505b';
    ticks.forEach(({ label, minute }) => {
      const pct = endMinute > 0 ? minute / endMinute : 0;
      const x = plot.x + plot.width * pct;
      ctx.strokeStyle = '#eff2f6';
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.height);
      ctx.stroke();
      if (plotInfo.metric === 'price' || state.chartMode !== 'dual') ctx.fillText(label, x, height - (compact ? 26 : 36));
    });

    ctx.restore();
  }

  function drawPanelTitle(plotInfo) {
    const { plot, title, unit, metric } = plotInfo;
    const compact = isCompactViewport();
    ctx.save();
    ctx.fillStyle = metric === 'price' ? '#2364a5' : '#243142';
    ctx.font = `700 ${compact ? 11 : 13}px "PingFang SC", Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${title} (${unit})`, plot.x, plot.y - 22);
    ctx.restore();
  }

  function drawCurrentMarker(plot, timeline) {
    const elapsed = selectedMinute();
    if (!elapsed || elapsed >= TRADING_DAY_MINUTES) return;
    const x = plot.x + plot.width * (elapsed / TRADING_DAY_MINUTES);
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 72, 88, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.height);
    ctx.stroke();
    ctx.restore();
  }

  function drawLines(series, plot, scale, metric = activeMetric()) {
    if (!series.length) return;
    const activeId = state.lockedId || state.hoverId;
    const compact = isCompactViewport();
    series.forEach((item, index) => {
      const isActive = !activeId || activeId === item.id;
      const color = lineColor(item, index, metric);
      const points = screenPoints(item, plot, scale, metric);
      if (!points.length) return;
      ctx.save();
      ctx.globalAlpha = isActive ? 0.96 : 0.18;
      ctx.lineWidth = isActive ? (metric === 'price' ? (compact ? 1.8 : 2.3) : (compact ? 2.2 : 3.1)) : (compact ? 1.35 : 2.1);
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (metric === 'price' && item.pricePointSource !== 'minute') ctx.setLineDash([7, 6]);
      if (points.length > 1) {
        ctx.beginPath();
        points.forEach((point, pointIndex) => {
          if (pointIndex === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const last = points[points.length - 1];
      if (points.length <= 1) {
        ctx.beginPath();
        ctx.moveTo(Math.max(plot.x, last.x - 16), last.y);
        ctx.lineTo(Math.min(plot.x + plot.width, last.x + 16), last.y);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(last.x, last.y, isActive ? (compact ? 3.2 : 4.2) : (compact ? 2.2 : 3.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function normalizeSeriesPoints(points, latest, timeline, metric = 'flow', pointSource = 'minute') {
    const endMinute = clamp(Number(timeline?.elapsed) || 0, 0, TRADING_DAY_MINUTES);
    const endLabel = minuteToTimeLabel(endMinute);
    const byMinute = new Map();
    const hasRealTimeline = metric === 'flow'
      ? pointSource === 'minute'
      : pointSource === 'minute';

    if (metric === 'flow' && hasRealTimeline) byMinute.set(0, { time: '09:30', value: 0 });
    const normalizedPoints = hasRealTimeline ? points : latestOnlyPoints(points, latest, endMinute);
    normalizedPoints.forEach(point => {
      const parsedMinute = timeToMinute(point.time);
      if (!Number.isFinite(parsedMinute)) return;
      const minute = clamp(parsedMinute, 0, endMinute || TRADING_DAY_MINUTES);
      byMinute.set(minute, {
        time: minuteToTimeLabel(minute),
        value: Number(point.value) || 0
      });
    });
    if (hasRealTimeline) byMinute.set(endMinute, { time: endLabel, value: latest });

    return [...byMinute.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, point]) => point);
  }

  function latestOnlyPoints(points, latest, endMinute) {
    const rows = points
      .map(point => ({ ...point, minute: timeToMinute(point.time) }))
      .filter(point => Number.isFinite(point.minute))
      .sort((a, b) => a.minute - b.minute);
    const latestPoint = rows[rows.length - 1];
    if (latestPoint) {
      return [{ time: minuteToTimeLabel(clamp(latestPoint.minute, 0, endMinute || TRADING_DAY_MINUTES)), value: latestPoint.value }];
    }
    return [{ time: minuteToTimeLabel(endMinute), value: latest }];
  }

  function drawLabels(series, plot, scale, width, metric = activeMetric()) {
    if (!series.length) return;
    const compact = isCompactViewport();
    const activeId = state.lockedId || state.hoverId;
    const labels = series.map((item, index) => {
      const points = screenPoints(item, plot, scale, metric);
      if (!points.length) return null;
      const last = points[points.length - 1];
      const marker = pointAtMinute(item, metric, selectedMinute()) || last;
      if (!marker) return null;
      const height = compact ? 12 : 14;
      const labelText = compact ? compactLabelText(item, metric) : inlineLabelText(item, metric);
      return {
        item,
        index,
        x: marker.x,
        targetY: marker.y,
        y: marker.y - height / 2,
        width: compact ? Math.min(106, Math.max(50, labelText.length * 6.4 + 6)) : Math.min(132, Math.max(34, labelText.length * 7.2 + 4)),
        height
      };
    }).filter(Boolean);

    const visibleLabels = selectLabelsForPlot(labels, plot, activeId);
    layoutLabels(visibleLabels, plot);

    visibleLabels.forEach(label => {
      const { item } = label;
      const active = !activeId || activeId === item.id;
      const color = lineColor(item, label.index, metric);
      const boxX = clamp(label.x + (compact ? 4 : 6), plot.x + 4, width - label.width - 3);
      const boxY = label.y;
      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.62;
      ctx.fillStyle = color;
      ctx.font = `${active ? 700 : 600} ${compact ? 9 : 10.5}px "PingFang SC", Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labelValue = labelValueFor(item, metric);
      const text = compact ? compactLabelText(item, metric, labelValue) : inlineLabelText(item, metric, labelValue);
      const textX = boxX;
      const textY = boxY + label.height / 2;
      ctx.fillText(text, textX, textY, label.width);
      ctx.restore();
    });
  }

  function compactLabelText(item, metric, value = labelValueFor(item, metric)) {
    const limit = window.matchMedia('(max-width: 390px)').matches ? 2 : 3;
    const name = item.name.length > limit ? item.name.slice(0, limit) : item.name;
    return `${name} ${formatCompactMetricValue(value, metric)}`;
  }

  function inlineLabelText(item, metric, value = labelValueFor(item, metric)) {
    const name = item.name.length > 6 ? item.name.slice(0, 6) : item.name;
    return `${name} ${formatMetricValue(value, metric)}`;
  }

  function labelValueFor(item, metric) {
    const value = valueAtMinute(item, metric, selectedMinute());
    if (value !== null) return value;
    return metric === 'price' ? Number(item.changePct) || 0 : Number(item.latest) || 0;
  }

  function selectLabelsForPlot(labels, plot, activeId) {
    const compact = isCompactViewport();
    const gap = compact ? 4 : 5;
    const labelHeight = compact ? 12 : 14;
    const availableHeight = Math.max(labelHeight, plot.height - 18);
    const heightLimit = Math.floor((availableHeight + gap) / (labelHeight + gap));
    const maxLabels = compact
      ? Math.max(6, Math.min(labels.length, heightLimit, state.lockedId ? 18 : 15))
      : Math.max(6, Math.min(labels.length, heightLimit, 48));
    if (labels.length <= maxLabels) return [...labels].sort((a, b) => a.targetY - b.targetY);
    if (compact) return selectEvenLabels(labels, maxLabels, activeId);

    const keep = new Set();
    const add = label => {
      if (label && keep.size < maxLabels) keep.add(label.item.id);
    };
    const addMany = items => items.forEach(add);
    const byY = [...labels].sort((a, b) => a.targetY - b.targetY);
    const topCount = compact ? 3 : Math.max(2, Math.floor(maxLabels * 0.34));
    const bottomCount = compact ? Math.max(3, maxLabels - topCount - (activeId ? 1 : 0)) : Math.max(3, Math.floor(maxLabels * 0.44));

    addMany(byY.slice(0, topCount));
    addMany(byY.slice(-bottomCount));
    add(labels.find(label => label.item.id === activeId));
    addMany([...labels].sort((a, b) => Math.abs(b.item.latest) - Math.abs(a.item.latest)));

    return labels
      .filter(label => keep.has(label.item.id))
      .sort((a, b) => a.targetY - b.targetY);
  }

  function selectEvenLabels(labels, maxLabels, activeId) {
    const byY = [...labels].sort((a, b) => a.targetY - b.targetY);
    const keep = new Set();
    const add = label => {
      if (label) keep.add(label.item.id);
    };
    add(byY[0]);
    add(byY[byY.length - 1]);
    add(labels.find(label => label.item.id === activeId));

    const slots = Math.max(1, maxLabels - keep.size);
    for (let i = 1; i <= slots; i += 1) {
      const index = Math.round((i * (byY.length - 1)) / (slots + 1));
      add(byY[index]);
    }

    byY
      .sort((a, b) => Math.abs(b.item.latest) - Math.abs(a.item.latest))
      .forEach(label => {
        if (keep.size < maxLabels) add(label);
      });

    return labels
      .filter(label => keep.has(label.item.id))
      .sort((a, b) => a.targetY - b.targetY);
  }

  function layoutLabels(labels, plot) {
    const gap = 5;
    const top = plot.y + 6;
    const bottom = plot.y + plot.height - 6;
    labels.forEach(label => {
      label.y = clamp(label.targetY - label.height / 2, top, bottom - label.height);
    });
    for (let i = 1; i < labels.length; i += 1) {
      const prev = labels[i - 1];
      const cur = labels[i];
      if (cur.y < prev.y + prev.height + gap) cur.y = prev.y + prev.height + gap;
    }
    const last = labels[labels.length - 1];
    const overflow = last ? last.y + last.height - bottom : 0;
    if (overflow > 0) labels.forEach(label => {
      label.y -= overflow;
    });
    for (let i = labels.length - 2; i >= 0; i -= 1) {
      const next = labels[i + 1];
      const cur = labels[i];
      if (cur.y + cur.height + gap > next.y) cur.y = next.y - cur.height - gap;
    }
    labels.forEach(label => {
      label.y = clamp(label.y, top, bottom - label.height);
    });
  }

  function drawWatermark(plot) {
    if (isCompactViewport()) return;
    ctx.save();
    ctx.translate(plot.x + plot.width * 0.63, plot.y + plot.height * 0.52);
    ctx.rotate(-0.45);
    ctx.fillStyle = 'rgba(80, 96, 112, 0.055)';
    ctx.font = '700 24px "PingFang SC", Arial';
    ctx.fillText('资金流向观察', 0, 0);
    ctx.restore();
  }

  function drawEmptyState(plot) {
    if (state.visibleSeries.some(item => hasDrawablePoints(item, activeMetric()))) return;
    const compact = isCompactViewport();
    ctx.save();
    ctx.fillStyle = '#657183';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${compact ? 15 : 18}px "PingFang SC", Arial`;
    ctx.fillText('等待真实资金流数据', plot.x + plot.width / 2, plot.y + plot.height / 2 - 12);
    ctx.font = `${compact ? 11 : 13}px "PingFang SC", Arial`;
    ctx.fillStyle = '#8a96a8';
    ctx.fillText('请确认本地代理已启动，或稍后刷新。页面不会用模拟曲线冒充真实走势。', plot.x + plot.width / 2, plot.y + plot.height / 2 + 18);
    ctx.restore();
  }

  function screenPoints(item, plot, scale, metric = activeMetric()) {
    const endMinute = Math.max(1, clamp(Number(plot.endMinute) || TRADING_DAY_MINUTES, 0, TRADING_DAY_MINUTES));
    const targetMinute = clamp(selectedMinute(), 0, endMinute);
    const rows = pointRows(item, metric, endMinute)
      .filter(point => point.minute <= targetMinute);
    if (!rows.length) return [];

    const shouldInterpolate = hasTimelinePoints(item, metric);
    const exact = shouldInterpolate ? valueAtMinute(item, metric, targetMinute) : null;
    if (exact !== null && rows[rows.length - 1].minute < targetMinute) {
      rows.push({ minute: targetMinute, time: minuteToTimeLabel(targetMinute), value: exact });
    }

    const byMinute = new Map();
    rows.forEach(point => {
      const minute = clamp(point.minute, 0, endMinute);
      byMinute.set(minute, {
        x: plot.x + plot.width * (minute / endMinute),
        y: yFor(point.value, plot, scale),
        value: point.value,
        time: point.time || minuteToTimeLabel(minute)
      });
    });
    return [...byMinute.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, point]) => point);
  }

  function pointAtMinute(item, metric, minute) {
    if (!state.plot?.primary) return null;
    const plotInfo = (state.plot.plots || []).find(plotItem => plotItem.metric === metric) || state.plot.primary;
    const value = valueAtMinute(item, metric, minute);
    if (value === null) return null;
    const endMinute = Math.max(1, clamp(Number(plotInfo.plot.endMinute) || TRADING_DAY_MINUTES, 0, TRADING_DAY_MINUTES));
    return {
      x: plotInfo.plot.x + plotInfo.plot.width * (clamp(minute, 0, endMinute) / endMinute),
      y: yFor(value, plotInfo.plot, plotInfo.scale),
      value,
      time: minuteToTimeLabel(minute)
    };
  }

  function valueAtMinute(item, metric, minute) {
    const target = clamp(Number(minute) || 0, 0, availableEndMinute());
    const rows = pointRows(item, metric, availableEndMinute());
    if (!rows.length) return null;
    if (!hasTimelinePoints(item, metric)) {
      const usable = rows.filter(point => point.minute <= target);
      return usable.length ? round(usable[usable.length - 1].value) : null;
    }
    if (target <= rows[0].minute) return target === rows[0].minute ? round(rows[0].value) : null;
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const next = rows[i];
      if (target === next.minute) return round(next.value);
      if (target < next.minute) {
        const span = Math.max(1, next.minute - prev.minute);
        const progress = (target - prev.minute) / span;
        return round(prev.value + (next.value - prev.value) * progress);
      }
    }
    return round(rows[rows.length - 1].value);
  }

  function pointRows(item, metric, maxMinute = availableEndMinute()) {
    return currentPoints(item, metric)
      .map(point => ({
        minute: timeToMinute(point.time),
        time: point.time,
        value: Number(point.value) || 0
      }))
      .filter(point => Number.isFinite(point.minute) && point.minute <= maxMinute)
      .sort((a, b) => a.minute - b.minute);
  }

  function hasTimelinePoints(item, metric) {
    const source = metric === 'price' ? item.pricePointSource : item.pointSource;
    return source === 'minute' && currentPoints(item, metric).length > 1;
  }

  function hasDrawablePoints(item, metric) {
    return currentPoints(item, metric).some(point => Number.isFinite(timeToMinute(point.time)));
  }

  function yFor(value, plot, scale) {
    const num = Number(value) || 0;
    const max = Number(scale.positive) || 1;
    const min = -(Number(scale.negative) || 1);
    const range = Math.max(1, max - min);
    return plot.y + ((max - num) / range) * plot.height;
  }

  function axisValueTicks(scale, compact) {
    const steps = compact ? 4 : 5;
    const positive = Number(scale.positive) || 1;
    const negative = Number(scale.negative) || 1;
    const step = (Number(scale.maxAbs) || Math.max(positive, negative)) / steps;
    const values = new Set([0, positive, -negative]);
    for (let value = step; value < positive; value += step) values.add(round(value));
    for (let value = step; value < negative; value += step) values.add(round(-value));
    return [...values]
      .filter(value => value <= positive && value >= -negative)
      .sort((a, b) => b - a);
  }

  function lineColor(item, index, metric = activeMetric()) {
    const palette = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.industry;
    const value = metricValue(item, metric);
    if (value < 0) {
      const greens = ['#176f43', '#2d8253', '#3f9564', '#5f8f72', '#247a64'];
      return greens[index % greens.length];
    }
    if (Math.abs(value) < (metric === 'price' ? 0.2 : 4)) return '#66788d';
    return POSITIVE_COLORS[index % POSITIVE_COLORS.length] || palette[index % palette.length];
  }

  function handlePointer(event) {
    if (!state.visibleSeries.length || !state.plot) return;
    const rect = els.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    const plots = state.plot.plots || [state.plot.primary].filter(Boolean);
    plots.forEach(plotInfo => {
      state.visibleSeries.forEach(item => {
        const points = screenPoints(item, plotInfo.plot, plotInfo.scale, plotInfo.metric);
        points.forEach(point => {
          const dx = point.x - x;
          const dy = point.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (!nearest || dist < nearest.dist) nearest = { item, point, dist, metric: plotInfo.metric };
        });
      });
    });

    if (nearest && nearest.dist < 34) {
      state.hoverId = nearest.item.id;
      els.tooltip.hidden = false;
      els.tooltip.style.left = `${Math.min(rect.width - 230, x + 14)}px`;
      els.tooltip.style.top = `${Math.max(8, y - 18)}px`;
      const source = nearest.item.sourceName && nearest.item.sourceName !== nearest.item.name ? `来源：${nearest.item.sourceName} · ` : '';
      const metricLabel = nearest.metric === 'price' ? '涨跌幅' : '资金';
      els.tooltip.innerHTML = `<strong>${escapeHtml(nearest.item.name)} ${escapeHtml(metricLabel)} ${escapeHtml(formatMetricValue(nearest.point.value, nearest.metric))}</strong><span>${escapeHtml(source)}${escapeHtml(nearest.point.time)}</span>`;
    } else {
      state.hoverId = null;
      els.tooltip.hidden = true;
    }
    drawChart();
  }

  function handleClick() {
    if (state.hoverId) {
      state.lockedId = state.lockedId === state.hoverId ? null : state.hoverId;
      drawChart();
    }
  }

  function tick() {
    const now = Date.now();
    els.clock.textContent = formatClock(new Date());
    if (document.hidden) {
      els.countdown.textContent = '隐';
      els.hint.textContent = '页面在后台，已暂停自动请求；回到页面会立即更新。';
      return;
    }
    if (state.paused) {
      els.countdown.textContent = '停';
      els.hint.textContent = '已暂停自动请求，手动刷新仍可使用。';
      return;
    }
    const left = Math.max(0, Math.ceil((state.nextFetchAt - now) / 1000));
    els.countdown.textContent = String(left);
    els.hint.textContent = `上次更新：${state.data ? formatClock(new Date(state.data.updatedAt)) : '--'}；真实请求约 ${Math.round((state.data?.refreshAfterMs || REQUEST_INTERVAL_MS) / 1000)} 秒一次。`;
    fetchData(false);
  }

  function bindEvents() {
    window.addEventListener('resize', resizeCanvas);
    els.canvas.addEventListener('pointermove', handlePointer);
    els.canvas.addEventListener('pointerleave', () => {
      state.hoverId = null;
      els.tooltip.hidden = true;
      drawChart();
    });
    els.canvas.addEventListener('click', handleClick);
    els.refresh.addEventListener('click', () => {
      state.nextFetchAt = 0;
      fetchData(true);
    });
    els.pause.addEventListener('click', () => {
      state.paused = !state.paused;
      els.pause.textContent = state.paused ? '恢复' : '暂停';
      tick();
    });
    els.sort.addEventListener('change', () => {
      state.sortMode = els.sort.value;
      renderAll();
    });
    els.timeRange?.addEventListener('input', () => {
      if (state.scrubDragging) setScrubMinuteFast(els.timeRange.value);
      else setScrubMinute(els.timeRange.value);
    });
    els.timeRange?.addEventListener('pointerdown', event => {
      state.scrubDragging = true;
      els.timeRange.setPointerCapture?.(event.pointerId);
      setScrubFromPointer(event);
    });
    els.timeRange?.addEventListener('pointermove', event => {
      if (!state.scrubDragging) return;
      setScrubFromPointer(event);
    });
    window.addEventListener('pointerup', event => {
      if (!state.scrubDragging) return;
      state.scrubDragging = false;
      els.timeRange?.releasePointerCapture?.(event.pointerId);
      renderAll();
    });
    els.timeNow?.addEventListener('click', () => {
      state.scrubMinute = null;
      renderAll();
    });
    els.mode.addEventListener('click', event => {
      const button = event.target.closest('button[data-mode]');
      if (!button) return;
      state.chartMode = ['dual', 'flow', 'price'].includes(button.dataset.mode) ? button.dataset.mode : 'dual';
      [...els.mode.querySelectorAll('button')].forEach(item => item.classList.toggle('active', item === button));
      renderAll();
    });
    els.tabs.addEventListener('click', event => {
      const button = event.target.closest('button[data-scope]');
      if (!button) return;
      state.selectedScope = button.dataset.scope;
      [...els.tabs.querySelectorAll('button')].forEach(item => item.classList.toggle('active', item === button));
      renderAll();
      state.nextFetchAt = 0;
      fetchData(true);
    });
    els.mobileStrip?.addEventListener('click', event => {
      const button = event.target.closest('[data-id]');
      if (!button) return;
      state.lockedId = state.lockedId === button.dataset.id ? null : button.dataset.id;
      updateMobileStrip();
      drawChart();
    });
    document.addEventListener('mouseover', event => {
      const item = event.target.closest('[data-id]');
      if (!item) return;
      state.hoverId = item.dataset.id;
      drawChart();
    });
    document.addEventListener('mouseout', event => {
      if (!event.target.closest('[data-id]')) return;
      state.hoverId = null;
      drawChart();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      state.nextFetchAt = 0;
      fetchData(false);
      tick();
    });
  }

  function createEmptyData(reason) {
    const timeline = tradingTimeline();
    return {
      updatedAt: new Date().toISOString(),
      tradeDate: formatDate(new Date()),
      refreshAfterMs: REQUEST_INTERVAL_MS,
      sourceStatus: { level: 'error', text: '真实源不可用', detail: reason || '未取得真实资金流数据。' },
      timeline,
      series: [],
      leaders: { inflowTop: [], outflowTop: [] },
      breakdown: [],
      note: '未展示模拟走势。'
    };
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
      const anchored = current * 0.42 + latest * progress * 0.58;
      points.push(Number(anchored.toFixed(2)));
    }
    points[points.length - 1] = Number(latest.toFixed(2));
    return points;
  }

  function timeLabel(index, count = POINT_COUNT, endMinute = tradingTimeline().elapsed) {
    const total = Math.max(1, count - 1);
    const minutes = Math.round((index / total) * clamp(endMinute, 0, TRADING_DAY_MINUTES));
    return minuteToTimeLabel(minutes);
  }

  function minuteToTimeLabel(minutes) {
    const clamped = clamp(minutes, 0, TRADING_DAY_MINUTES);
    const morningMinutes = Math.min(clamped, 120);
    if (clamped <= 120) {
      const date = new Date(2026, 0, 1, 9, 30 + morningMinutes, 0);
      return date.toTimeString().slice(0, 5);
    }
    const date = new Date(2026, 0, 1, 13, clamped - 120, 0);
    return date.toTimeString().slice(0, 5);
  }

  function timeToMinute(label) {
    const match = String(label || '').match(/(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!match) return NaN;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
    const total = hour * 60 + minute;
    const open = 9 * 60 + 30;
    const morningClose = 11 * 60 + 30;
    const afternoonOpen = 13 * 60;
    if (total <= morningClose) return clamp(total - open, 0, 120);
    return clamp(120 + total - afternoonOpen, 120, TRADING_DAY_MINUTES);
  }

  function pointCountForTimeline(endMinute) {
    if (endMinute <= 0) return 1;
    return clamp(Math.ceil(endMinute / 5) + 1, 2, POINT_COUNT);
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
      elapsed = TRADING_DAY_MINUTES;
      session = 'closed';
    }
    return {
      elapsed,
      total: TRADING_DAY_MINUTES,
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

  function visibleTicks(endMinute, compact = false) {
    const anchors = compact ? [
      { label: '09:30', minute: 0 },
      { label: '11:30', minute: 120 },
      { label: '15:00', minute: 240 }
    ] : [
      { label: '09:30', minute: 0 },
      { label: '10:30', minute: 60 },
      { label: '11:30', minute: 120 },
      { label: '14:00', minute: 180 },
      { label: '15:00', minute: 240 }
    ];
    return anchors.filter(item => item.minute <= endMinute);
  }

  function availableEndMinute() {
    const dataElapsed = Number(state.data?.timeline?.elapsed);
    const localTimeline = tradingTimeline();
    const localElapsed = localTimeline.elapsed;
    const candidate = Number.isFinite(dataElapsed) ? dataElapsed : localElapsed;
    const today = formatDate(new Date());
    const sameTradeDate = !state.data?.tradeDate || state.data.tradeDate === today;
    const bounded = sameTradeDate && localElapsed < candidate ? localElapsed : candidate;
    return clamp(bounded, 0, TRADING_DAY_MINUTES);
  }

  function selectedMinute() {
    return state.scrubMinute === null ? availableEndMinute() : clamp(state.scrubMinute, 0, availableEndMinute());
  }

  function buildLeaders(series) {
    return {
      inflowTop: [...series].filter(x => x.latest > 0).sort((a, b) => b.latest - a.latest).slice(0, 8),
      outflowTop: [...series].filter(x => x.latest < 0).sort((a, b) => a.latest - b.latest).slice(0, 8)
    };
  }

  function buildBreakdown(series) {
    return [...series]
      .sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest))
      .slice(0, 8)
      .map((item, index) => ({
        name: item.name,
        main: round(item.latest * 0.62),
        superLarge: round(item.latest * (0.3 + (index % 3) * 0.04)),
        large: round(item.latest * 0.2),
        medium: round(item.latest * -0.08),
        small: round(item.latest * -0.12)
      }));
  }

  function round(value) {
    return Number(value.toFixed(2));
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  bindEvents();
  if (!loadCachedDataOnBoot()) applyData(createEmptyData('正在连接本地真实资金流接口。'));
  resizeCanvas();
  fetchData(true);
  setInterval(tick, 1000);
})();
