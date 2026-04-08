const vscode = require('vscode');
const { fetchRelevantArticles } = require('./rss');
const { analyzeWithClaude } = require('./analyzer');

class TradeSignalPanel {
  constructor(context) {
    this._context = context;
    this._view = null;
    this._pendingTicker = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'analyze':
          await this._runAnalysis(msg.ticker);
          break;
        case 'setApiKey':
          await vscode.commands.executeCommand('trade-signal.setApiKey');
          break;
        case 'checkApiKey':
          const key = await this._context.secrets.get('anthropicApiKey');
          this._post({ type: 'apiKeyStatus', hasKey: !!key });
          break;
        case 'openLink':
          if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
      }
    });

    // If a ticker was queued before the panel opened
    if (this._pendingTicker) {
      this._runAnalysis(this._pendingTicker);
      this._pendingTicker = null;
    }
  }

  notifyApiKeySet() {
    this._post({ type: 'apiKeyStatus', hasKey: true });
  }

  analyzeTicker(ticker) {
    if (this._view) {
      this._runAnalysis(ticker);
    } else {
      this._pendingTicker = ticker;
    }
  }

  async _runAnalysis(ticker) {
    const config = vscode.workspace.getConfiguration('tradeSignal');
    const feedUrls = config.get('rssFeeds');
    const maxArticles = config.get('maxArticles') || 8;

    this._post({ type: 'status', state: 'fetching', ticker });

    try {
      // 1. Get API key
      const apiKey = await this._context.secrets.get('anthropicApiKey')
        || config.get('anthropicApiKey');

      if (!apiKey) {
        this._post({ type: 'error', message: 'No API key set. Click "Set API Key" to configure.' });
        return;
      }

      // 2. Fetch RSS articles
      this._post({ type: 'status', state: 'fetching', ticker, message: `Scanning ${feedUrls.length} RSS feeds...` });
      const articles = await fetchRelevantArticles(ticker, feedUrls, maxArticles);

      if (articles.length === 0) {
        this._post({
          type: 'error',
          message: `No news found for ${ticker} in the configured feeds. Try adding more RSS sources in settings, or check the ticker symbol.`
        });
        return;
      }

      // 3. Analyze with Claude
      this._post({ type: 'status', state: 'analyzing', ticker, message: `Analyzing ${articles.length} articles with Claude...` });
      const recommendation = await analyzeWithClaude(ticker, articles, apiKey);

      this._post({ type: 'result', recommendation });

    } catch (err) {
      this._post({ type: 'error', message: err.message || 'Unknown error occurred.' });
    }
  }

  _post(msg) {
    this._view?.webview.postMessage(msg);
  }

  _getHtml() {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trade Signal</title>
<style>
  :root {
    --bg: var(--vscode-sideBar-background, #0d0d0f);
    --surface: var(--vscode-editor-background, #141416);
    --border: var(--vscode-panel-border, #2a2a30);
    --fg: var(--vscode-foreground, #e8e8ec);
    --fg-dim: var(--vscode-descriptionForeground, #888);
    --accent: #00d4aa;
    --accent-dim: rgba(0,212,170,0.12);
    --buy: #00d4aa;
    --sell: #ff4d6d;
    --hold: #f0a500;
    --watch: #7c6af7;
    --radius: 8px;
    --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    --font: var(--vscode-font-family, -apple-system, sans-serif);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    font-size: 12px;
    line-height: 1.5;
    overflow-x: hidden;
  }
  .header {
    padding: 14px 14px 10px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo {
    width: 20px; height: 20px;
    background: linear-gradient(135deg, var(--accent), #7c6af7);
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800; color: #000;
    flex-shrink: 0;
  }
  .header-title { font-weight: 700; font-size: 13px; letter-spacing: 0.02em; }
  .header-sub { font-size: 10px; color: var(--fg-dim); margin-left: auto; }

  .body { padding: 12px 14px; }

  .search-row {
    display: flex; gap: 6px; margin-bottom: 12px;
  }
  .ticker-input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 7px 10px;
    text-transform: uppercase;
    outline: none;
    transition: border-color 0.15s;
  }
  .ticker-input:focus { border-color: var(--accent); }
  .ticker-input::placeholder { color: var(--fg-dim); font-weight: 400; letter-spacing: 0; text-transform: none; font-size: 11px; }
  .btn {
    background: var(--accent);
    color: #000;
    border: none;
    border-radius: var(--radius);
    font-weight: 700;
    font-size: 11px;
    padding: 7px 12px;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg-dim);
    border-radius: var(--radius);
    font-size: 10px;
    padding: 4px 8px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

  /* Status / Loading */
  .status-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    text-align: center;
    display: none;
  }
  .status-box.visible { display: block; }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin: 0 auto 10px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status-label { font-size: 11px; color: var(--fg-dim); }
  .status-ticker { font-family: var(--font-mono); font-weight: 700; color: var(--accent); font-size: 13px; }

  /* Error */
  .error-box {
    background: rgba(255,77,109,0.08);
    border: 1px solid rgba(255,77,109,0.3);
    border-radius: var(--radius);
    padding: 12px;
    font-size: 11px;
    color: #ff7a8a;
    display: none;
    line-height: 1.6;
  }
  .error-box.visible { display: block; }

  /* Result Card */
  .result { display: none; }
  .result.visible { display: block; }

  .signal-card {
    border-radius: var(--radius);
    padding: 14px;
    margin-bottom: 10px;
    border: 1px solid;
    position: relative;
    overflow: hidden;
  }
  .signal-card::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.07;
  }
  .signal-card.BUY { border-color: var(--buy); background: rgba(0,212,170,0.05); }
  .signal-card.SELL { border-color: var(--sell); background: rgba(255,77,109,0.05); }
  .signal-card.HOLD { border-color: var(--hold); background: rgba(240,165,0,0.05); }
  .signal-card.WATCH { border-color: var(--watch); background: rgba(124,106,247,0.05); }

  .signal-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
  }
  .signal-badge {
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .BUY .signal-badge { color: var(--buy); }
  .SELL .signal-badge { color: var(--sell); }
  .HOLD .signal-badge { color: var(--hold); }
  .WATCH .signal-badge { color: var(--watch); }

  .signal-ticker {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 13px;
    color: var(--fg);
  }
  .signal-meta { margin-left: auto; text-align: right; }
  .confidence-pill {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .HIGH { background: rgba(0,212,170,0.15); color: var(--buy); }
  .MEDIUM { background: rgba(240,165,0,0.15); color: var(--hold); }
  .LOW { background: rgba(255,77,109,0.15); color: var(--sell); }

  .timeframe { font-size: 10px; color: var(--fg-dim); margin-top: 2px; }

  /* Sentiment bar */
  .sentiment-bar-wrap { margin-bottom: 10px; }
  .sentiment-label { display: flex; justify-content: space-between; font-size: 10px; color: var(--fg-dim); margin-bottom: 4px; }
  .sentiment-track {
    height: 5px; background: var(--border); border-radius: 3px; position: relative; overflow: visible;
  }
  .sentiment-fill {
    position: absolute;
    top: 0; height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease;
  }
  .sentiment-dot {
    position: absolute;
    width: 10px; height: 10px;
    border-radius: 50%;
    top: 50%; transform: translate(-50%, -50%);
    border: 2px solid var(--bg);
  }

  /* Summary */
  .summary-text {
    font-size: 11px;
    line-height: 1.65;
    color: var(--fg);
    margin-bottom: 10px;
    padding: 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 5px;
    border-left: 2px solid var(--accent);
  }

  /* Drivers / Risks */
  .section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .tag-list { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
  .tag {
    font-size: 10px;
    padding: 3px 7px;
    border-radius: 3px;
    line-height: 1.4;
  }
  .tag-driver { background: var(--accent-dim); color: var(--accent); }
  .tag-risk { background: rgba(255,77,109,0.1); color: #ff7a8a; }

  /* Articles */
  .articles-toggle {
    font-size: 10px;
    color: var(--fg-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
    margin-top: 4px;
    user-select: none;
  }
  .articles-toggle:hover { color: var(--accent); }
  .articles-list { display: none; }
  .articles-list.open { display: block; }
  .article-item {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  .article-item:last-child { border-bottom: none; }
  .article-title {
    font-size: 11px;
    color: var(--fg);
    line-height: 1.4;
    margin-bottom: 3px;
  }
  .article-title:hover { color: var(--accent); }
  .article-meta { font-size: 10px; color: var(--fg-dim); }

  .disclaimer {
    font-size: 9px;
    color: var(--fg-dim);
    margin-top: 8px;
    opacity: 0.6;
    line-height: 1.5;
  }

  .apikey-bar {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(124,106,247,0.08);
    border: 1px solid rgba(124,106,247,0.25);
    border-radius: var(--radius);
    padding: 8px 10px;
    margin-bottom: 10px;
    font-size: 10px;
    color: #a89af7;
  }
  .apikey-bar.hidden { display: none; }
  .apikey-ok { display: flex; align-items: center; gap: 5px; }
  .dot-green { width: 6px; height: 6px; border-radius: 50%; background: var(--buy); }
  #news-ticker {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 28px;
  background: #0d1117;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  overflow: hidden;
  z-index: 999;
}
.ticker-label {
  background: #f85149;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  margin-right: 10px;
  flex-shrink: 0;
  border-radius: 2px;
}
.ticker-track { overflow: hidden; flex: 1; }
.ticker-content {
  display: inline-block;
  white-space: nowrap;
  animation: ticker-scroll 40s linear infinite;
  color: #c9d1d9;
  font-size: 11px;
}
@keyframes ticker-scroll {
  0%   { transform: translateX(100vw); }
  100% { transform: translateX(-100%); }
}
</style>
</head>
<body>

<div class="header">
  <div class="logo">TS</div>
  <span class="header-title">Trade Signal</span>
  <span class="header-sub">AI · News · Equities</span>
</div>

<div class="body">

  <!-- API Key Status Bar -->
  <div class="apikey-bar" id="apikeyBar">
    <span>API key not configured</span>
    <button class="btn-ghost" onclick="setApiKey()">Set Key</button>
  </div>

  <!-- Search -->
  <div class="search-row">
    <input
      class="ticker-input"
      id="tickerInput"
      type="text"
      placeholder="Enter ticker (e.g. AAPL)"
      maxlength="10"
      autocomplete="off"
    />
    <button class="btn" id="analyzeBtn" onclick="analyze()">Analyze</button>
  </div>

  <!-- Status / Loading -->
  <div class="status-box" id="statusBox">
    <div class="spinner"></div>
    <div class="status-ticker" id="statusTicker"></div>
    <div class="status-label" id="statusLabel">Initializing...</div>
  </div>

  <!-- Error -->
  <div class="error-box" id="errorBox"></div>

  <!-- Result -->
  <div class="result" id="result"></div>

</div>
async function fetchTickerNews() {
  try {
    const feeds = [
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=MSFT&region=US&lang=en-US',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US'
    ];
    const results = await Promise.all(feeds.map(url => fetch(url).then(r => r.text())));
    const headlines = [];
    results.forEach(xml => {
      const matches = xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
      for (const m of matches) headlines.push(m[1]);
    });
    if (headlines.length > 0) {
      document.getElementById('ticker-content').textContent = headlines.slice(0, 20).join('     •     ');
    }
  } catch(e) {
    document.getElementById('ticker-content').textContent = 'Unable to load live news.';
  }
}
fetchTickerNews();
setInterval(fetchTickerNews, 5 * 60 * 1000);
<script>
  const vscode = acquireVsCodeApi();

  // Check API key on load
  vscode.postMessage({ type: 'checkApiKey' });

  document.getElementById('tickerInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') analyze();
  });

  function analyze() {
    const ticker = document.getElementById('tickerInput').value.trim().toUpperCase();
    if (!ticker) return;
    vscode.postMessage({ type: 'analyze', ticker });
  }

  function setApiKey() {
    vscode.postMessage({ type: 'setApiKey' });
  }

  function toggleArticles() {
    const list = document.getElementById('articlesList');
    const arrow = document.getElementById('articlesArrow');
    if (list.classList.toggle('open')) {
      arrow.textContent = '▾';
    } else {
      arrow.textContent = '▸';
    }
  }

  function openLink(url) {
    vscode.postMessage({ type: 'openLink', url });
  }

  function setLoading(state, ticker, message) {
    hide('result'); hide('errorBox');
    show('statusBox');
    document.getElementById('statusTicker').textContent = ticker || '';
    document.getElementById('statusLabel').textContent = message || (state === 'fetching' ? 'Fetching news...' : 'Analyzing with Claude...');
    document.getElementById('analyzeBtn').disabled = true;
  }

  function showError(msg) {
    hide('statusBox'); hide('result');
    const el = document.getElementById('errorBox');
    el.textContent = msg;
    show('errorBox');
    document.getElementById('analyzeBtn').disabled = false;
  }

  function showResult(rec) {
    hide('statusBox'); hide('errorBox');
    const signal = rec.signal || 'HOLD';
    const score = rec.sentimentScore || 0;

    // Sentiment bar
    const pct = ((score + 100) / 200 * 100).toFixed(1);
    const fillColor = score > 20 ? 'var(--buy)' : score < -20 ? 'var(--sell)' : 'var(--hold)';

    const drivers = (rec.keyDrivers || []).map(d =>
      \`<span class="tag tag-driver">\${escHtml(d)}</span>\`).join('');
    const risks = (rec.risks || []).map(r =>
      \`<span class="tag tag-risk">\${escHtml(r)}</span>\`).join('');

    const articles = (rec.articles || []).map(a => \`
      <div class="article-item" onclick="openLink('\${escAttr(a.link)}')">
        <div class="article-title">\${escHtml(a.title)}</div>
        <div class="article-meta">\${escHtml(a.source)} · \${formatDate(a.pubDate)}</div>
      </div>
    \`).join('');

    document.getElementById('result').innerHTML = \`
      <div class="signal-card \${signal}">
        <div class="signal-header">
          <span class="signal-badge">\${signal}</span>
          <span class="signal-ticker">\${escHtml(rec.ticker || '')}</span>
          <div class="signal-meta">
            <span class="confidence-pill \${rec.confidence}">\${rec.confidence}</span>
            <div class="timeframe">\${escHtml(rec.timeframe || '')}</div>
          </div>
        </div>

        <div class="sentiment-bar-wrap">
          <div class="sentiment-label">
            <span>Bearish</span>
            <span style="color:var(--fg)">Sentiment: \${score > 0 ? '+' : ''}\${score}</span>
            <span>Bullish</span>
          </div>
          <div class="sentiment-track">
            <div class="sentiment-fill" style="
              left: \${score >= 0 ? '50%' : pct + '%'};
              width: \${Math.abs(score) / 2}%;
              background: \${fillColor};
            "></div>
            <div class="sentiment-dot" style="left:\${pct}%; background:\${fillColor};"></div>
          </div>
        </div>

        <div class="summary-text">\${escHtml(rec.summary || '')}</div>

        \${drivers ? \`<div class="section-label">Key Drivers</div><div class="tag-list">\${drivers}</div>\` : ''}
        \${risks ? \`<div class="section-label">Risks</div><div class="tag-list">\${risks}</div>\` : ''}

        <div class="articles-toggle" onclick="toggleArticles()">
          <span id="articlesArrow">▸</span>
          \${rec.articlesAnalyzed || (rec.articles || []).length} articles analyzed
        </div>
        <div class="articles-list" id="articlesList">
          \${articles}
        </div>

        <div class="disclaimer">\${escHtml(rec.disclaimer || 'Not financial advice.')}</div>
      </div>
    \`;
    show('result');
    document.getElementById('analyzeBtn').disabled = false;
  }

  function show(id) { document.getElementById(id).classList.add('visible'); }
  function hide(id) { document.getElementById(id).classList.remove('visible'); }
  function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s) { return String(s || '').replace(/"/g,'&quot;'); }
  function formatDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return ''; }
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    switch(msg.type) {
      case 'status':
        setLoading(msg.state, msg.ticker, msg.message);
        break;
      case 'result':
        showResult(msg.recommendation);
        break;
      case 'error':
        showError(msg.message);
        break;
      case 'apiKeyStatus':
        const bar = document.getElementById('apikeyBar');
        if (msg.hasKey) {
          bar.innerHTML = \`<span class="apikey-ok"><span class="dot-green"></span> API key configured</span><button class="btn-ghost" onclick="setApiKey()">Update</button>\`;
          bar.classList.add('hidden');
          // hide after 2s if key is good
          setTimeout(() => bar.classList.add('hidden'), 1500);
        } else {
          bar.classList.remove('hidden');
        }
        break;
    }
  });
</script>
<div id="news-ticker">
  <span class="ticker-label">LIVE</span>
  <div class="ticker-track">
    <div class="ticker-content" id="ticker-content">Loading news...</div>
  </div>
</div>
</body>
</html>`;
  }
}

module.exports = { TradeSignalPanel };
