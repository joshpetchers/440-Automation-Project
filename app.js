/**
 * SIGNAL//AI — app.js
 *
 * Pure browser JavaScript. No build step, no framework, no vscode.
 * All VS Code message-passing has been replaced with:
 *   - fetch('/api/scan')  for live signal generation
 *   - localStorage        for API key persistence
 *   - direct DOM updates  in place of window.postMessage handlers
 */

(function () {
  'use strict';

  /* ── STATE ─────────────────────────────────────────────── */
  let signals     = [];
  let selectedId  = null;
  let activeFilter = 'all';
  let toastTimer  = null;

  /* ── MOCK SIGNALS ──────────────────────────────────────── */
  // Rendered immediately on load so the dashboard looks complete
  // even before a real scan is run. Replaced when Scan News completes.
  const MOCK = [
    {
      id: 'm1',
      headline: 'Fed signals potential pause in rate hike cycle as CPI cools to 3.2%',
      source: 'Reuters', timestamp: ago(12),
      sector: 'Macro', signal: 'BUY', confidence: 82,
      affectedTickers: [
        { ticker: 'SPY', direction: 'up' },
        { ticker: 'QQQ', direction: 'up' },
        { ticker: 'TLT', direction: 'up' }
      ],
      marketImpact: 'A Fed pause removes the primary headwind for equity valuations. The 3.2% CPI reading gives the Fed cover to hold, easing financial conditions that support growth stocks. Historically, the six months following a Fed pause average 14% S&P 500 gains.',
      tradeAction: 'Buy SPY on any intraday weakness. Add TLT for a duration play. Scale into QQQ for growth exposure.',
      timeframe: '1-2 Weeks'
    },
    {
      id: 'm2',
      headline: 'NVIDIA Q4 earnings miss consensus by 8%; data center growth slows sharply to 22% YoY',
      source: 'Bloomberg', timestamp: ago(28),
      sector: 'Technology', signal: 'SELL', confidence: 78,
      affectedTickers: [
        { ticker: 'NVDA', direction: 'down' },
        { ticker: 'AMD',  direction: 'down' },
        { ticker: 'SMH',  direction: 'down' }
      ],
      marketImpact: "NVIDIA's miss signals deceleration in AI infrastructure spending. Data center revenue at 22% YoY vs. 31% consensus implies enterprise customers are re-evaluating capex budgets. A broader semiconductor sector rotation is likely.",
      tradeAction: 'Short NVDA or buy puts. Reduce semi exposure via SMH. Watch AMD for a guidance revision downward.',
      timeframe: 'Intraday'
    },
    {
      id: 'm3',
      headline: 'Apple reports record services revenue of $24.2B, beating estimates by 6.3%',
      source: 'WSJ', timestamp: ago(45),
      sector: 'Technology', signal: 'BUY', confidence: 91,
      affectedTickers: [
        { ticker: 'AAPL', direction: 'up' },
        { ticker: 'QQQ',  direction: 'up' }
      ],
      marketImpact: "Apple's services segment is now its highest-margin business at 73%+ gross margins. The $24.2B beat confirms pricing power and ecosystem lock-in that insulates against hardware cyclicality. Services represent 28% of revenue and are accelerating.",
      tradeAction: 'Buy AAPL. Target $210 over 2-3 weeks. Stop at $188. High conviction on margin expansion thesis.',
      timeframe: '1-3 Days'
    },
    {
      id: 'm4',
      headline: 'OPEC+ extends production cuts through Q3; oil holds near $87/bbl on supply discipline',
      source: 'FT', timestamp: ago(67),
      sector: 'Energy', signal: 'HOLD', confidence: 58,
      affectedTickers: [
        { ticker: 'XOM', direction: 'neutral' },
        { ticker: 'CVX', direction: 'neutral' },
        { ticker: 'USO', direction: 'neutral' }
      ],
      marketImpact: 'The OPEC+ extension was largely priced in, leaving oil range-bound. Demand uncertainty from China and weak European growth offsets supply constraints. Energy majors generate strong FCF at current levels but face limited near-term catalysts.',
      tradeAction: 'Hold existing energy positions. No new entries until demand picture clarifies. Monitor the IEA monthly report.',
      timeframe: '1-2 Weeks'
    },
    {
      id: 'm5',
      headline: 'Microsoft Azure cloud revenue surges 31% YoY; Copilot commercial adoption accelerates',
      source: 'CNBC', timestamp: ago(92),
      sector: 'Technology', signal: 'BUY', confidence: 89,
      affectedTickers: [
        { ticker: 'MSFT', direction: 'up' },
        { ticker: 'AMZN', direction: 'up' }
      ],
      marketImpact: 'Azure at 31% growth confirms enterprise AI adoption is accelerating rather than plateauing. Copilot uptake suggests enterprises will pay for productivity AI, validating the cloud-AI infrastructure thesis. AWS and GCP will likely show similar trends next quarter.',
      tradeAction: 'Buy MSFT. Add AMZN for AWS leverage. Both names have room to run as cloud capex translates to revenue.',
      timeframe: '1-3 Days'
    },
    {
      id: 'm6',
      headline: 'Regional banks face mounting CRE loan losses; KRE drops 4.2% pre-market',
      source: 'Bloomberg', timestamp: ago(110),
      sector: 'Finance', signal: 'SELL', confidence: 72,
      affectedTickers: [
        { ticker: 'KRE', direction: 'down' },
        { ticker: 'BAC', direction: 'down' },
        { ticker: 'JPM', direction: 'neutral' }
      ],
      marketImpact: 'Commercial real estate exposure is the key risk for regional banks. Rising office vacancy forces CRE portfolio markdowns that squeeze net interest margins. JPM and WFC are better insulated through diversified revenue streams.',
      tradeAction: 'Short KRE or buy puts. Avoid regional bank exposure. Rotate financials into large-cap JPM.',
      timeframe: '1-2 Weeks'
    },
    {
      id: 'm7',
      headline: 'Eli Lilly GLP-1 drug shows 40% reduction in cardiovascular events in landmark trial',
      source: 'Reuters', timestamp: ago(135),
      sector: 'Healthcare', signal: 'BUY', confidence: 86,
      affectedTickers: [
        { ticker: 'LLY',  direction: 'up' },
        { ticker: 'NVO',  direction: 'up' },
        { ticker: 'ABBV', direction: 'neutral' }
      ],
      marketImpact: 'The cardiovascular benefit data dramatically expands the GLP-1 TAM beyond obesity and diabetes. A 40% CV event reduction could make these drugs standard of care for a broader patient population, potentially doubling the commercial opportunity to $150B+.',
      tradeAction: 'Buy LLY calls or shares. Add NVO as a paired trade. Multi-year structural growth story with near-term catalyst momentum.',
      timeframe: '1+ Month'
    },
    {
      id: 'm8',
      headline: 'US retail sales fall 0.8% in March, worst reading in 8 months; consumer spending cracks',
      source: 'WSJ', timestamp: ago(155),
      sector: 'Consumer', signal: 'SELL', confidence: 67,
      affectedTickers: [
        { ticker: 'XRT',  direction: 'down' },
        { ticker: 'AMZN', direction: 'neutral' },
        { ticker: 'WMT',  direction: 'neutral' }
      ],
      marketImpact: 'The -0.8% retail print is the worst in eight months and signals consumer exhaustion from persistent inflation and depleted savings buffers. Discretionary spending bears the brunt while essentials remain resilient. Recession probability rises in consumer-facing models.',
      tradeAction: 'Short XRT or reduce discretionary. Rotate to defensive WMT and cost-plus retailers. Avoid high-beta consumer names.',
      timeframe: '1-2 Weeks'
    }
  ];

  function ago(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }

  /* ── MOCK MARKET DATA ──────────────────────────────────── */
  const MARKET = [
    { sym: 'SPY', price: 444.21, chg:  0.08 },
    { sym: 'QQQ', price: 381.56, chg: -0.21 },
    { sym: 'VIX', price:  18.43, chg:  3.77 },
    { sym: 'BTC', price: 67420,  chg:  1.87 },
    { sym: 'DXY', price: 104.23, chg: -0.17 },
  ];

  function renderMarket() {
    const strip = document.getElementById('marketStrip');
    strip.innerHTML = MARKET.map(m => {
      const up   = m.chg >= 0;
      const sign = up ? '+' : '';
      const fmt  = m.sym === 'BTC'
        ? m.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : m.price.toFixed(2);
      return (
        '<div class="mkt-item">' +
          '<span class="mkt-sym">'  + m.sym + '</span>' +
          '<span class="mkt-price">' + fmt + '</span>' +
          '<span class="mkt-chg ' + (up ? 'up' : 'dn') + '">' +
            sign + m.chg.toFixed(2) + '%' +
          '</span>' +
        '</div>'
      );
    }).join('');
  }

  function jitterMarket() {
    MARKET.forEach(m => {
      m.price = parseFloat(
        (m.price * (1 + (Math.random() - 0.49) * 0.0004))
          .toFixed(m.sym === 'BTC' ? 0 : 2)
      );
      m.chg = parseFloat((m.chg + (Math.random() - 0.5) * 0.04).toFixed(2));
    });
    renderMarket();
  }

  /* ── SECTOR COLORS ─────────────────────────────────────── */
  const SECTOR_COLORS = {
    Technology:   '#6366f1',
    Finance:      '#f59e0b',
    Healthcare:   '#14b8a6',
    Energy:       '#f97316',
    Consumer:     '#ec4899',
    Macro:        '#64748b',
    Currency:     '#8b5cf6',
    'Real Estate':'#84cc16',
    Other:        '#94a3b8',
  };

  function sectorStyle(sector) {
    const c = SECTOR_COLORS[sector] || '#94a3b8';
    return 'color:' + c + ';border-color:' + c + '33;background:' + c + '11';
  }

  /* ── TIME FORMAT ───────────────────────────────────────── */
  function relTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  /* ── HTML ESCAPE ───────────────────────────────────────── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── RENDER CARD ───────────────────────────────────────── */
  function renderCard(sig) {
    const sel     = sig.id === selectedId ? ' selected' : '';
    const tickers = (sig.affectedTickers || []).slice(0, 3).map(t => {
      const cls   = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'dn' : '';
      const arrow = t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '—';
      return '<span class="ticker-mini ' + cls + '">' + esc(t.ticker) + ' ' + arrow + '</span>';
    }).join('');

    return (
      '<div class="sig-card ' + sig.signal + sel + '" id="card-' + sig.id + '" onclick="selectSignal(\'' + sig.id + '\')">' +
        '<div class="card-row1">' +
          '<span class="sig-badge">' + sig.signal + '</span>' +
          '<span class="sector-tag" style="' + sectorStyle(sig.sector) + '">' + esc(sig.sector) + '</span>' +
          '<span class="card-meta">' + esc(sig.source) + ' · ' + relTime(sig.timestamp) + '</span>' +
        '</div>' +
        '<div class="card-headline">' + esc(sig.headline) + '</div>' +
        '<div class="card-row3">' +
          '<div class="conf-bar-wrap">' +
            '<div class="conf-track"><div class="conf-fill" style="width:' + sig.confidence + '%"></div></div>' +
            '<span class="conf-num">' + sig.confidence + '%</span>' +
          '</div>' +
          '<div class="tickers-mini">' + tickers + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── RENDER DETAIL ─────────────────────────────────────── */
  function renderDetail(sig) {
    const tickers = (sig.affectedTickers || []).map(t => {
      const cls   = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'dn' : '';
      const arrow = t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '—';
      return '<div class="ticker-chip ' + cls + '"><span>' + esc(t.ticker) + '</span><span class="dir">' + arrow + '</span></div>';
    }).join('');

    document.getElementById('detailEmpty').style.display = 'none';
    document.getElementById('detailContent').innerHTML =
      '<div class="detail-panel ' + sig.signal + '">' +

        '<div class="detail-top">' +
          '<div class="detail-badge ' + sig.signal + '">' + sig.signal + '</div>' +
          '<div class="detail-top-right">' +
            '<div class="detail-conf ' + sig.signal + '">' + sig.confidence + '% Confidence</div>' +
            '<div class="detail-conf-bar"><div class="detail-conf-fill" style="width:' + sig.confidence + '%"></div></div>' +
            '<div class="detail-meta">' +
              '<span>' + esc(sig.source) + '</span>' +
              '<span>·</span>' +
              '<span style="' + sectorStyle(sig.sector) + '">' + esc(sig.sector) + '</span>' +
              '<span>·</span>' +
              '<span>' + relTime(sig.timestamp) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="detail-headline">' + esc(sig.headline) + '</div>' +

        '<div class="detail-section">' +
          '<div class="section-label">Market Impact</div>' +
          '<div class="section-body">' + esc(sig.marketImpact || '') + '</div>' +
        '</div>' +

        (tickers
          ? '<div class="detail-section"><div class="section-label">Affected Tickers</div><div class="tickers-list">' + tickers + '</div></div>'
          : '') +

        '<div class="detail-section">' +
          '<div class="section-label">Trade Action</div>' +
          '<div class="section-body trade-action">' + esc(sig.tradeAction || '') + '</div>' +
        '</div>' +

        '<div class="detail-section" style="flex-direction:row;align-items:center;gap:8px;">' +
          '<div class="section-label" style="margin-bottom:0">Timeframe</div>' +
          '<div class="timeframe-badge">⏱ ' + esc(sig.timeframe || '') + '</div>' +
        '</div>' +

        '<div class="disclaimer">For educational and informational purposes only. Not financial advice.</div>' +
      '</div>';
  }

  /* ── SELECT SIGNAL ─────────────────────────────────────── */
  window.selectSignal = function (id) {
    const prev = document.getElementById('card-' + selectedId);
    if (prev) prev.classList.remove('selected');
    selectedId = id;
    const curr = document.getElementById('card-' + id);
    if (curr) curr.classList.add('selected');
    const sig = signals.find(s => s.id === id);
    if (sig) renderDetail(sig);
  };

  /* ── RENDER FEED ───────────────────────────────────────── */
  function renderFeed() {
    const list  = document.getElementById('feedList');
    const empty = document.getElementById('feedEmpty');

    if (signals.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = '';
      document.getElementById('feedCount').textContent = '0 signals';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = signals.map(s => renderCard(s)).join('');

    signals.forEach(s => {
      const el = document.getElementById('card-' + s.id);
      if (el) el.classList.toggle('filtered-out', activeFilter !== 'all' && s.signal !== activeFilter);
    });

    const visible = signals.filter(s => activeFilter === 'all' || s.signal === activeFilter);
    document.getElementById('feedCount').textContent =
      visible.length + ' signal' + (visible.length !== 1 ? 's' : '');
  }

  /* ── UPDATE STATS ──────────────────────────────────────── */
  function updateStats() {
    const buy  = signals.filter(s => s.signal === 'BUY').length;
    const sell = signals.filter(s => s.signal === 'SELL').length;
    const hold = signals.filter(s => s.signal === 'HOLD').length;
    const avg  = signals.length
      ? Math.round(signals.reduce((a, s) => a + (s.confidence || 0), 0) / signals.length)
      : null;

    document.getElementById('sSig').textContent  = signals.length;
    document.getElementById('sBuy').textContent  = buy;
    document.getElementById('sSell').textContent = sell;
    document.getElementById('sHold').textContent = hold;
    document.getElementById('sConf').textContent = avg !== null ? avg + '%' : '—';
  }

  /* ── SECTOR FILTER CHIPS ───────────────────────────────── */
  function updateSectorChips() {
    const bar = document.getElementById('filterBar');
    bar.querySelectorAll('.chip-sector').forEach(el => el.remove());
    const sectors = [...new Set(signals.map(s => s.sector).filter(Boolean))].sort();
    sectors.forEach(sector => {
      const btn = document.createElement('button');
      btn.className = 'chip chip-sector';
      btn.textContent = sector.toUpperCase();
      btn.dataset.filter = 'sector-' + sector;
      btn.onclick = () => setFilter(btn, 'sector-' + sector);
      bar.appendChild(btn);
    });
  }

  /* ── FILTER ────────────────────────────────────────────── */
  window.setFilter = function (el, filter) {
    document.querySelectorAll('.filter-bar .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    if (filter.startsWith('sector-')) {
      const sector = filter.replace('sector-', '');
      signals.forEach(s => {
        const card = document.getElementById('card-' + s.id);
        if (card) card.classList.toggle('filtered-out', s.sector !== sector);
      });
      const visible = signals.filter(s => s.sector === sector);
      document.getElementById('feedCount').textContent =
        visible.length + ' signal' + (visible.length !== 1 ? 's' : '');
    } else {
      activeFilter = filter;
      renderFeed();
    }
  };

  /* ── OVERLAY ───────────────────────────────────────────── */
  function showOverlay(ticker, msg) {
    document.getElementById('overlayTicker').textContent = ticker || '';
    document.getElementById('overlayMsg').textContent    = msg || 'Scanning...';
    document.getElementById('scanOverlay').style.display = 'flex';
    document.getElementById('scanBtn').disabled = true;
  }
  function hideOverlay() {
    document.getElementById('scanOverlay').style.display = 'none';
    document.getElementById('scanBtn').disabled = false;
  }

  /* ── TOAST ─────────────────────────────────────────────── */
  function showToast(msg, success) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    toast.className = 'toast show' + (success ? ' success' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 7000);
  }
  window.dismissToast = function () {
    clearTimeout(toastTimer);
    document.getElementById('toast').classList.remove('show');
  };

  /* ── API KEY — localStorage persistence ────────────────── */
  const KEY_STORE = 'signal_ai_key';

  function initApiKey() {
    const key = localStorage.getItem(KEY_STORE) || '';
    const dot = document.getElementById('apiDot');
    const lbl = document.getElementById('apiLabel');
    if (key) {
      dot.classList.add('online');
      lbl.textContent = 'API Ready';
    } else {
      dot.classList.remove('online');
      lbl.textContent = 'No Key';
    }
  }

  window.showApiKeyModal = function () {
    document.getElementById('apiKeyInput').value = localStorage.getItem(KEY_STORE) || '';
    document.getElementById('apiModal').style.display = 'flex';
    setTimeout(() => document.getElementById('apiKeyInput').focus(), 50);
  };

  window.closeApiModal = function () {
    document.getElementById('apiModal').style.display = 'none';
  };

  window.closeApiModalOnOverlay = function (e) {
    if (e.target === document.getElementById('apiModal')) closeApiModal();
  };

  window.saveApiKey = function () {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
      localStorage.setItem(KEY_STORE, key);
      closeApiModal();
      initApiKey();
      showToast('API key saved. Click ⚡ SCAN NEWS to generate live signals.', true);
    } else {
      showToast('Please enter a valid API key (sk-ant-...).');
    }
  };

  window.clearApiKey = function () {
    localStorage.removeItem(KEY_STORE);
    document.getElementById('apiKeyInput').value = '';
    closeApiModal();
    initApiKey();
    showToast('API key removed. Dashboard will show mock signals.');
  };

  /* ── SCAN NEWS ─────────────────────────────────────────── */
  // Calls /api/scan (Vercel serverless function).
  // The function handles RSS fetching + Claude analysis server-side.
  // API key is sent as x-api-key header (from localStorage) or read
  // from ANTHROPIC_API_KEY env var on the server.
  window.scanNews = async function () {
    const apiKey = localStorage.getItem(KEY_STORE) || '';
    showOverlay('', 'Fetching financial headlines...');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
        hideOverlay();
        showToast(err.error || 'Scan failed (HTTP ' + res.status + ').');
        return;
      }

      const data = await res.json();

      if (data.useMock) {
        // Server returned: no API key configured
        hideOverlay();
        showToast(data.error || 'No API key configured — showing mock signals. Click ⚙ to add your key.');
        return;
      }

      if (data.error) {
        hideOverlay();
        showToast(data.error);
        return;
      }

      signals = (data.signals || []).map((s, i) => ({
        id: s.id || ('live-' + Date.now() + '-' + i),
        ...s
      }));

      hideOverlay();
      renderFeed();
      updateStats();
      updateSectorChips();
      if (signals.length > 0) selectSignal(signals[0].id);
      showToast(signals.length + ' live signals generated.', true);

    } catch (err) {
      hideOverlay();
      // fetch() throws if the server isn't reachable (e.g. running index.html
      // directly as a file:// URL without vercel dev running)
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        showToast('Cannot reach /api/scan. Run "vercel dev" locally, or deploy to Vercel first.');
      } else {
        showToast('Error: ' + err.message);
      }
    }
  };

  /* ── INIT ──────────────────────────────────────────────── */
  renderMarket();
  setInterval(jitterMarket, 4000);

  signals = MOCK;
  renderFeed();
  updateStats();
  updateSectorChips();
  selectSignal(signals[0].id);

  initApiKey();

})();
