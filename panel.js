const vscode = require('vscode');
const { fetchRelevantArticles, fetchFinancialHeadlines } = require('./rss');
const { analyzeWithClaude, analyzeHeadlines } = require('./analyzer');

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
          await this._runTickerAnalysis(msg.ticker);
          break;
        case 'scanNews':
          await this._scanNews();
          break;
        case 'setApiKey':
          await vscode.commands.executeCommand('trade-signal.setApiKey');
          break;
        case 'checkApiKey': {
          const key = await this._context.secrets.get('anthropicApiKey');
          this._post({ type: 'apiKeyStatus', hasKey: !!key });
          break;
        }
        case 'openLink':
          if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
      }
    });

    if (this._pendingTicker) {
      this._runTickerAnalysis(this._pendingTicker);
      this._pendingTicker = null;
    }
  }

  notifyApiKeySet() {
    this._post({ type: 'apiKeyStatus', hasKey: true });
  }

  analyzeTicker(ticker) {
    if (this._view) this._runTickerAnalysis(ticker);
    else this._pendingTicker = ticker;
  }

  /** Scan general financial headlines → batch Claude analysis → signal array */
  async _scanNews() {
    const config = vscode.workspace.getConfiguration('tradeSignal');
    const feedUrls = config.get('rssFeeds') || [];

    this._post({ type: 'scanStatus', state: 'fetching', message: 'Fetching financial headlines...' });
    try {
      const apiKey = await this._context.secrets.get('anthropicApiKey') || config.get('anthropicApiKey');
      if (!apiKey) {
        this._post({ type: 'scanError', message: 'No API key set. Click ⚙ to configure your Anthropic API key.' });
        return;
      }
      const articles = await fetchFinancialHeadlines(feedUrls, 15);
      if (articles.length === 0) {
        this._post({ type: 'scanError', message: 'No headlines found. Check RSS feed settings.' });
        return;
      }
      this._post({ type: 'scanStatus', state: 'analyzing', message: `Analyzing ${articles.length} headlines with Claude...` });
      const signals = await analyzeHeadlines(articles, apiKey);
      this._post({ type: 'signals', signals });
    } catch (err) {
      this._post({ type: 'scanError', message: err.message || 'Unknown error occurred.' });
    }
  }

  /** Single-ticker analysis — kept for command palette compat */
  async _runTickerAnalysis(ticker) {
    const config = vscode.workspace.getConfiguration('tradeSignal');
    const feedUrls = config.get('rssFeeds') || [];
    const maxArticles = config.get('maxArticles') || 8;

    this._post({ type: 'scanStatus', state: 'fetching', message: `Scanning news for ${ticker}...` });
    try {
      const apiKey = await this._context.secrets.get('anthropicApiKey') || config.get('anthropicApiKey');
      if (!apiKey) { this._post({ type: 'scanError', message: 'No API key set.' }); return; }

      const articles = await fetchRelevantArticles(ticker, feedUrls, maxArticles);
      if (articles.length === 0) { this._post({ type: 'scanError', message: `No news found for ${ticker}.` }); return; }

      this._post({ type: 'scanStatus', state: 'analyzing', message: `Analyzing ${articles.length} articles...` });
      const rec = await analyzeWithClaude(ticker, articles, apiKey);

      const confMap = { HIGH: 85, MEDIUM: 62, LOW: 38 };
      const signal = {
        id: `ticker-${Date.now()}`,
        headline: `${ticker}: ${rec.summary?.slice(0, 100) || 'Ticker analysis complete'}`,
        source: `${articles.length} articles`,
        timestamp: new Date().toISOString(),
        sector: 'Equities',
        signal: rec.signal === 'WATCH' ? 'HOLD' : (rec.signal || 'HOLD'),
        confidence: confMap[rec.confidence] || 60,
        affectedTickers: [{ ticker, direction: rec.priceAction === 'Bullish' ? 'up' : rec.priceAction === 'Bearish' ? 'down' : 'neutral' }],
        marketImpact: rec.summary || '',
        tradeAction: rec.keyDrivers?.[0] || 'No specific trade action identified.',
        timeframe: rec.timeframe || 'Unknown',
      };
      this._post({ type: 'addSignal', signal });
    } catch (err) {
      this._post({ type: 'scanError', message: err.message || 'Unknown error occurred.' });
    }
  }

  _post(msg) { this._view?.webview.postMessage(msg); }

  _getHtml() {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SIGNAL//AI</title>
<style>
:root {
  --bg:         #07080b;
  --surf:       #0c0e13;
  --surf2:      #10131a;
  --card:       #0e1017;
  --border:     #181c26;
  --border2:    #222736;
  --fg:         #c2c8d8;
  --fg-dim:     #5a6478;
  --fg-muted:   #333a4a;
  --buy:        #00c896;
  --buy-bg:     rgba(0,200,150,.09);
  --buy-bd:     rgba(0,200,150,.22);
  --sell:       #e8334a;
  --sell-bg:    rgba(232,51,74,.09);
  --sell-bd:    rgba(232,51,74,.22);
  --hold:       #f0a50a;
  --hold-bg:    rgba(240,165,10,.09);
  --hold-bd:    rgba(240,165,10,.22);
  --accent:     #00c896;
  --purple:     #7c6af7;
  --mono: 'SF Mono','Cascadia Code','Fira Code','Consolas',monospace;
  --sans: var(--vscode-font-family,-apple-system,'Segoe UI',sans-serif);
  --radius: 5px;
}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:12px;line-height:1.4;}

/* ── HEADER ─────────────────────────────────────────────── */
.app-header{
  display:flex;align-items:center;gap:10px;
  padding:0 10px;height:42px;flex-shrink:0;
  background:var(--surf);border-bottom:1px solid var(--border);
}
.brand{display:flex;align-items:center;gap:7px;flex-shrink:0;}
.brand-icon{
  width:22px;height:22px;border-radius:4px;flex-shrink:0;
  background:linear-gradient(135deg,var(--accent),var(--purple));
  display:flex;align-items:center;justify-content:center;
  font-size:9px;font-weight:900;color:#000;letter-spacing:-.5px;
}
.brand-name{
  font-family:var(--mono);font-size:13px;font-weight:700;
  letter-spacing:.04em;white-space:nowrap;
  color:var(--fg);
}
.brand-slash{color:var(--accent);}

/* Market strip */
.market-strip{
  display:flex;align-items:center;gap:0;flex:1;
  overflow:hidden;border-left:1px solid var(--border);
  border-right:1px solid var(--border);
  margin:0 6px;height:100%;
}
.mkt-item{
  display:flex;align-items:center;gap:5px;
  padding:0 10px;height:100%;border-right:1px solid var(--border);
  flex-shrink:0;cursor:default;
}
.mkt-item:last-child{border-right:none;}
.mkt-sym{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--fg-dim);letter-spacing:.04em;}
.mkt-price{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--fg);}
.mkt-chg{font-family:var(--mono);font-size:10px;font-weight:600;}
.mkt-chg.up{color:var(--buy);}
.mkt-chg.dn{color:var(--sell);}

.header-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.btn-scan{
  background:var(--accent);color:#000;border:none;
  font-size:10px;font-weight:800;letter-spacing:.06em;
  padding:5px 10px;border-radius:var(--radius);cursor:pointer;
  white-space:nowrap;transition:opacity .15s;
}
.btn-scan:hover{opacity:.85;}
.btn-scan:disabled{opacity:.4;cursor:not-allowed;}
.btn-key{
  background:transparent;border:1px solid var(--border2);
  color:var(--fg-dim);font-size:13px;width:26px;height:26px;
  border-radius:var(--radius);cursor:pointer;display:flex;
  align-items:center;justify-content:center;transition:border-color .15s,color .15s;
  line-height:1;padding:0;
}
.btn-key:hover{border-color:var(--accent);color:var(--accent);}

/* ── STATS BAR ───────────────────────────────────────────── */
.stats-bar{
  display:flex;align-items:center;
  padding:0 12px;height:30px;flex-shrink:0;
  background:var(--surf);border-bottom:1px solid var(--border);
  gap:0;
}
.stat{display:flex;align-items:center;gap:5px;padding:0 10px;border-right:1px solid var(--border);}
.stat:first-child{padding-left:0;}
.stat:last-child{border-right:none;margin-left:auto;}
.stat-label{font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--fg-dim);text-transform:uppercase;}
.stat-val{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--fg);}
.stat-val.buy{color:var(--buy);}
.stat-val.sell{color:var(--sell);}
.stat-val.hold{color:var(--hold);}
.api-dot{width:6px;height:6px;border-radius:50%;background:var(--fg-muted);flex-shrink:0;}
.api-dot.online{background:var(--buy);}
.api-label{font-size:9px;color:var(--fg-dim);}

/* ── FILTER BAR ──────────────────────────────────────────── */
.filter-bar{
  display:flex;align-items:center;gap:4px;
  padding:5px 10px;flex-shrink:0;
  border-bottom:1px solid var(--border);
  overflow-x:auto;scrollbar-width:none;
}
.filter-bar::-webkit-scrollbar{display:none;}
.chip{
  font-size:9px;font-weight:700;letter-spacing:.06em;
  padding:3px 8px;border-radius:3px;border:1px solid var(--border2);
  background:transparent;color:var(--fg-dim);cursor:pointer;
  white-space:nowrap;transition:all .12s;text-transform:uppercase;
  flex-shrink:0;
}
.chip:hover{border-color:var(--fg-dim);color:var(--fg);}
.chip.active{background:var(--border2);border-color:var(--border2);color:var(--fg);}
.chip.chip-buy.active,.chip.chip-buy:hover{border-color:var(--buy-bd);background:var(--buy-bg);color:var(--buy);}
.chip.chip-sell.active,.chip.chip-sell:hover{border-color:var(--sell-bd);background:var(--sell-bg);color:var(--sell);}
.chip.chip-hold.active,.chip.chip-hold:hover{border-color:var(--hold-bd);background:var(--hold-bg);color:var(--hold);}

/* ── MAIN LAYOUT ─────────────────────────────────────────── */
.app-body{display:flex;flex-direction:column;height:calc(100vh - 42px - 30px - 34px);min-height:0;}
.main-panel{display:grid;grid-template-columns:268px 1fr;flex:1;overflow:hidden;min-height:0;}

/* ── FEED COLUMN ─────────────────────────────────────────── */
.feed-col{
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;overflow:hidden;
}
.col-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:6px 10px;border-bottom:1px solid var(--border);flex-shrink:0;
  background:var(--surf);
}
.col-title{font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--fg-dim);text-transform:uppercase;}
.col-sub{font-size:9px;color:var(--fg-muted);font-family:var(--mono);}
.feed-list{overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;}

/* ── SIGNAL CARD ─────────────────────────────────────────── */
.sig-card{
  padding:9px 10px;border-bottom:1px solid var(--border);
  cursor:pointer;transition:background .1s;position:relative;
}
.sig-card:hover{background:var(--surf);}
.sig-card.selected{background:var(--surf2);border-left:2px solid var(--accent);}
.sig-card.selected.BUY{border-left-color:var(--buy);}
.sig-card.selected.SELL{border-left-color:var(--sell);}
.sig-card.selected.HOLD{border-left-color:var(--hold);}
.sig-card.filtered-out{display:none;}

.card-row1{display:flex;align-items:center;gap:5px;margin-bottom:4px;}
.sig-badge{
  font-family:var(--mono);font-size:8px;font-weight:800;letter-spacing:.06em;
  padding:2px 5px;border-radius:2px;flex-shrink:0;
}
.BUY .sig-badge,.badge-BUY{background:var(--buy-bg);color:var(--buy);border:1px solid var(--buy-bd);}
.SELL .sig-badge,.badge-SELL{background:var(--sell-bg);color:var(--sell);border:1px solid var(--sell-bd);}
.HOLD .sig-badge,.badge-HOLD{background:var(--hold-bg);color:var(--hold);border:1px solid var(--hold-bd);}

.sector-tag{
  font-size:8px;font-weight:600;letter-spacing:.04em;padding:2px 5px;
  border-radius:2px;background:var(--surf2);color:var(--fg-dim);
  border:1px solid var(--border2);flex-shrink:0;
}
.card-meta{margin-left:auto;font-size:9px;color:var(--fg-muted);white-space:nowrap;font-family:var(--mono);}
.card-headline{
  font-size:11px;line-height:1.4;color:var(--fg);margin-bottom:5px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.card-row3{display:flex;align-items:center;gap:6px;}
.conf-bar-wrap{display:flex;align-items:center;gap:4px;flex:1;}
.conf-track{height:3px;background:var(--border2);border-radius:2px;flex:1;overflow:hidden;}
.conf-fill{height:100%;border-radius:2px;transition:width .4s;}
.BUY .conf-fill{background:var(--buy);}
.SELL .conf-fill{background:var(--sell);}
.HOLD .conf-fill{background:var(--hold);}
.conf-num{font-family:var(--mono);font-size:9px;color:var(--fg-dim);white-space:nowrap;}
.tickers-mini{display:flex;gap:3px;flex-wrap:nowrap;overflow:hidden;}
.ticker-mini{
  font-family:var(--mono);font-size:8px;font-weight:700;
  padding:1px 4px;border-radius:2px;border:1px solid var(--border2);
  color:var(--fg-dim);background:var(--surf2);white-space:nowrap;
}
.ticker-mini.up{color:var(--buy);border-color:var(--buy-bd);}
.ticker-mini.dn{color:var(--sell);border-color:var(--sell-bd);}

/* ── DETAIL COLUMN ───────────────────────────────────────── */
.detail-col{overflow-y:auto;display:flex;flex-direction:column;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;}
.detail-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;padding:40px 20px;text-align:center;
}
.empty-icon{font-size:28px;opacity:.2;}
.empty-title{font-size:12px;color:var(--fg-dim);}
.empty-sub{font-size:10px;color:var(--fg-muted);line-height:1.6;max-width:200px;}

.detail-panel{padding:14px 14px 20px;display:flex;flex-direction:column;gap:14px;}

.detail-top{display:flex;align-items:flex-start;gap:10px;}
.detail-badge{
  font-family:var(--mono);font-size:22px;font-weight:800;letter-spacing:.02em;flex-shrink:0;
}
.detail-badge.BUY{color:var(--buy);}
.detail-badge.SELL{color:var(--sell);}
.detail-badge.HOLD{color:var(--hold);}
.detail-top-right{flex:1;}
.detail-conf{
  font-family:var(--mono);font-size:11px;font-weight:700;margin-bottom:4px;
}
.detail-conf.BUY{color:var(--buy);}
.detail-conf.SELL{color:var(--sell);}
.detail-conf.HOLD{color:var(--hold);}
.detail-conf-bar{height:4px;background:var(--border2);border-radius:2px;overflow:hidden;margin-bottom:5px;}
.detail-conf-fill{height:100%;border-radius:2px;}
.BUY .detail-conf-fill{background:var(--buy);}
.SELL .detail-conf-fill{background:var(--sell);}
.HOLD .detail-conf-fill{background:var(--hold);}
.detail-meta{font-size:9px;color:var(--fg-muted);display:flex;gap:6px;flex-wrap:wrap;}
.detail-meta span{display:flex;align-items:center;gap:2px;}

.detail-headline{
  font-size:13px;font-weight:600;line-height:1.45;color:var(--fg);
  padding-bottom:10px;border-bottom:1px solid var(--border);
}

.detail-section{display:flex;flex-direction:column;gap:6px;}
.section-label{font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--fg-muted);text-transform:uppercase;}
.section-body{font-size:11px;line-height:1.6;color:var(--fg);}
.section-body.trade-action{
  background:var(--surf2);border:1px solid var(--border2);
  border-radius:var(--radius);padding:8px 10px;
  border-left:2px solid var(--accent);
  font-style:italic;
}
.BUY .section-body.trade-action{border-left-color:var(--buy);}
.SELL .section-body.trade-action{border-left-color:var(--sell);}
.HOLD .section-body.trade-action{border-left-color:var(--hold);}

.tickers-list{display:flex;gap:5px;flex-wrap:wrap;}
.ticker-chip{
  display:flex;align-items:center;gap:4px;
  font-family:var(--mono);font-size:10px;font-weight:700;
  padding:3px 8px;border-radius:3px;border:1px solid var(--border2);
  background:var(--surf2);color:var(--fg);
}
.ticker-chip .dir{font-size:9px;}
.ticker-chip.up{border-color:var(--buy-bd);background:var(--buy-bg);color:var(--buy);}
.ticker-chip.dn{border-color:var(--sell-bd);background:var(--sell-bg);color:var(--sell);}

.timeframe-badge{
  display:inline-flex;align-items:center;gap:4px;
  font-size:9px;font-weight:700;letter-spacing:.06em;
  padding:3px 8px;border-radius:3px;
  background:var(--surf2);border:1px solid var(--border2);color:var(--fg-dim);
}

.disclaimer{font-size:9px;color:var(--fg-muted);line-height:1.5;opacity:.7;}

/* ── OVERLAY ─────────────────────────────────────────────── */
.scan-overlay{
  position:fixed;inset:0;background:rgba(7,8,11,.85);backdrop-filter:blur(2px);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  z-index:100;
}
.scan-spinner{
  width:28px;height:28px;border:2px solid var(--border2);
  border-top-color:var(--accent);border-radius:50%;
  animation:spin .7s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg);}}
.scan-msg{font-size:11px;color:var(--fg-dim);text-align:center;}
.scan-ticker-label{
  font-family:var(--mono);font-size:13px;font-weight:700;color:var(--accent);
}

/* ── ERROR TOAST ─────────────────────────────────────────── */
.toast{
  position:fixed;bottom:12px;left:12px;right:12px;
  background:rgba(232,51,74,.12);border:1px solid rgba(232,51,74,.3);
  border-radius:var(--radius);padding:8px 10px;
  font-size:10px;color:#ff7a8a;line-height:1.5;
  display:none;z-index:200;
}
.toast.show{display:flex;align-items:flex-start;gap:8px;}
.toast-close{margin-left:auto;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0;opacity:.7;}
.toast-close:hover{opacity:1;}

/* ── EMPTY FEED ──────────────────────────────────────────── */
.feed-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:8px;padding:30px 16px;text-align:center;
}
.feed-empty-icon{font-size:22px;opacity:.2;}
.feed-empty-text{font-size:11px;color:var(--fg-dim);}
.feed-empty-sub{font-size:10px;color:var(--fg-muted);line-height:1.6;}
</style>
</head>
<body>

<!-- APP HEADER -->
<div class="app-header">
  <div class="brand">
    <div class="brand-icon">S</div>
    <span class="brand-name">SIGNAL<span class="brand-slash">//</span>AI</span>
  </div>
  <div class="market-strip" id="marketStrip"></div>
  <div class="header-actions">
    <button class="btn-scan" id="scanBtn" onclick="scanNews()">⚡ SCAN NEWS</button>
    <button class="btn-key" onclick="setApiKey()" title="Configure API Key">⚙</button>
  </div>
</div>

<!-- STATS BAR -->
<div class="stats-bar">
  <div class="stat"><span class="stat-label">Signals</span><span class="stat-val" id="sSig">0</span></div>
  <div class="stat"><span class="stat-label">Buy</span><span class="stat-val buy" id="sBuy">0</span></div>
  <div class="stat"><span class="stat-label">Sell</span><span class="stat-val sell" id="sSell">0</span></div>
  <div class="stat"><span class="stat-label">Hold</span><span class="stat-val hold" id="sHold">0</span></div>
  <div class="stat"><span class="stat-label">Avg Conf</span><span class="stat-val" id="sConf">—</span></div>
  <div class="stat">
    <div class="api-dot" id="apiDot"></div>
    <span class="api-label" id="apiLabel">No Key</span>
  </div>
</div>

<!-- FILTER BAR -->
<div class="filter-bar" id="filterBar">
  <button class="chip active" data-filter="all" onclick="setFilter(this,'all')">ALL</button>
  <button class="chip chip-buy" data-filter="BUY" onclick="setFilter(this,'BUY')">BUY</button>
  <button class="chip chip-sell" data-filter="SELL" onclick="setFilter(this,'SELL')">SELL</button>
  <button class="chip chip-hold" data-filter="HOLD" onclick="setFilter(this,'HOLD')">HOLD</button>
</div>

<!-- MAIN PANEL -->
<div class="app-body">
  <div class="main-panel">
    <!-- FEED -->
    <div class="feed-col">
      <div class="col-header">
        <span class="col-title">Signals Feed</span>
        <span class="col-sub" id="feedCount">0 signals</span>
      </div>
      <div class="feed-list" id="feedList">
        <div class="feed-empty" id="feedEmpty">
          <div class="feed-empty-icon">◎</div>
          <div class="feed-empty-text">No signals yet</div>
          <div class="feed-empty-sub">Click ⚡ SCAN NEWS to fetch and analyze recent financial headlines</div>
        </div>
      </div>
    </div>
    <!-- DETAIL -->
    <div class="detail-col" id="detailCol">
      <div class="detail-empty" id="detailEmpty">
        <div class="empty-icon">◈</div>
        <div class="empty-title">Select a signal</div>
        <div class="empty-sub">Click any card in the feed to see the full market impact analysis and trade recommendation.</div>
      </div>
      <div id="detailContent"></div>
    </div>
  </div>
</div>

<!-- SCAN OVERLAY -->
<div class="scan-overlay" id="scanOverlay" style="display:none">
  <div class="scan-spinner"></div>
  <div class="scan-ticker-label" id="overlayTicker"></div>
  <div class="scan-msg" id="overlayMsg">Scanning...</div>
</div>

<!-- ERROR TOAST -->
<div class="toast" id="toast">
  <span id="toastMsg"></span>
  <span class="toast-close" onclick="dismissToast()">✕</span>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  let signals = [];
  let selectedId = null;
  let activeFilter = 'all';
  let toastTimer = null;

  // ── MOCK DATA ────────────────────────────────────────────
  const MOCK = [
    {
      id:'m1', headline:'Fed signals potential pause in rate hike cycle as CPI cools to 3.2%',
      source:'Reuters', timestamp: ago(12),
      sector:'Macro', signal:'BUY', confidence:82,
      affectedTickers:[{ticker:'SPY',direction:'up'},{ticker:'QQQ',direction:'up'},{ticker:'TLT',direction:'up'}],
      marketImpact:'A Fed pause removes the primary headwind for equity valuations. The 3.2% CPI gives the Fed cover to hold, easing financial conditions that support growth stocks. Historically the six months following a Fed pause average 14% S&P gains.',
      tradeAction:'Buy SPY on any intraday weakness. Add TLT for a duration play. Scale into QQQ for growth exposure.',
      timeframe:'1-2 Weeks'
    },
    {
      id:'m2', headline:'NVIDIA Q4 earnings miss consensus by 8%; data center growth slows sharply to 22% YoY',
      source:'Bloomberg', timestamp: ago(28),
      sector:'Technology', signal:'SELL', confidence:78,
      affectedTickers:[{ticker:'NVDA',direction:'down'},{ticker:'AMD',direction:'down'},{ticker:'SMH',direction:'down'}],
      marketImpact:'NVIDIA\'s miss signals deceleration in AI infrastructure spending. Data center revenue at 22% YoY vs. 31% consensus implies enterprise customers are re-evaluating capex. A broader semi sector rotation is likely.',
      tradeAction:'Short NVDA or buy puts. Reduce semi exposure via SMH. Watch AMD for guidance revision.',
      timeframe:'Intraday'
    },
    {
      id:'m3', headline:'Apple reports record services revenue of $24.2B, beating estimates by 6.3%',
      source:'WSJ', timestamp: ago(45),
      sector:'Technology', signal:'BUY', confidence:91,
      affectedTickers:[{ticker:'AAPL',direction:'up'},{ticker:'QQQ',direction:'up'}],
      marketImpact:'Apple\'s services segment is now the company\'s highest-margin business at 73%+ gross margins. The $24.2B beat confirms pricing power and ecosystem lock-in that insulates against hardware cyclicality. Services represent 28% of revenue and are accelerating.',
      tradeAction:'Buy AAPL. Target $210 over 2-3 weeks. Stop at $188. High conviction on margin expansion thesis.',
      timeframe:'1-3 Days'
    },
    {
      id:'m4', headline:'OPEC+ extends production cuts through Q3; oil holds near $87/bbl on supply discipline',
      source:'FT', timestamp: ago(67),
      sector:'Energy', signal:'HOLD', confidence:58,
      affectedTickers:[{ticker:'XOM',direction:'neutral'},{ticker:'CVX',direction:'neutral'},{ticker:'USO',direction:'neutral'}],
      marketImpact:'The OPEC+ extension was largely priced in, leaving oil range-bound. Demand uncertainty from China and weak European growth offsets supply constraints. Energy majors generate strong FCF at current levels but face limited near-term catalysts.',
      tradeAction:'Hold existing energy positions. No new entries until demand picture clarifies. Watch IEA monthly report.',
      timeframe:'1-2 Weeks'
    },
    {
      id:'m5', headline:'Microsoft Azure cloud revenue surges 31% YoY; Copilot commercial adoption accelerates',
      source:'CNBC', timestamp: ago(92),
      sector:'Technology', signal:'BUY', confidence:89,
      affectedTickers:[{ticker:'MSFT',direction:'up'},{ticker:'AMZN',direction:'up'}],
      marketImpact:'Azure at 31% growth confirms enterprise AI adoption is accelerating. Copilot uptake suggests enterprises will pay for productivity AI, validating the cloud-AI infrastructure thesis. AWS and GCP are likely to show similar trends next quarter.',
      tradeAction:'Buy MSFT. Add AMZN for AWS leverage. Both have room to run as cloud capex translates to revenue.',
      timeframe:'1-3 Days'
    },
    {
      id:'m6', headline:'Regional banks face mounting CRE loan losses; KRE drops 4.2% pre-market',
      source:'Bloomberg', timestamp: ago(110),
      sector:'Finance', signal:'SELL', confidence:72,
      affectedTickers:[{ticker:'KRE',direction:'down'},{ticker:'BAC',direction:'down'},{ticker:'JPM',direction:'neutral'}],
      marketImpact:'Commercial real estate exposure is the key risk for regional banks. Rising office vacancy forces CRE portfolio markdowns that squeeze net interest margins. JPM and WFC are better insulated via diversified revenue streams.',
      tradeAction:'Short KRE or buy puts. Avoid regional bank exposure. Rotate financials exposure to large-cap JPM.',
      timeframe:'1-2 Weeks'
    },
    {
      id:'m7', headline:'Eli Lilly GLP-1 drug shows 40% reduction in cardiovascular events in landmark trial',
      source:'Reuters', timestamp: ago(135),
      sector:'Healthcare', signal:'BUY', confidence:86,
      affectedTickers:[{ticker:'LLY',direction:'up'},{ticker:'NVO',direction:'up'},{ticker:'ABBV',direction:'neutral'}],
      marketImpact:'The cardiovascular benefit data dramatically expands the GLP-1 TAM beyond obesity and diabetes. A 40% CV event reduction could make these drugs standard of care for a broader patient population, potentially doubling the commercial opportunity to $150B+.',
      tradeAction:'Buy LLY calls or shares. Add NVO as paired trade. Multi-year structural growth story with near-term catalyst momentum.',
      timeframe:'1+ Month'
    },
    {
      id:'m8', headline:'US retail sales fall 0.8% in March, worst reading in 8 months; consumer spending cracks',
      source:'WSJ', timestamp: ago(155),
      sector:'Consumer', signal:'SELL', confidence:67,
      affectedTickers:[{ticker:'XRT',direction:'down'},{ticker:'AMZN',direction:'neutral'},{ticker:'WMT',direction:'neutral'}],
      marketImpact:'The -0.8% retail print is the worst in eight months and signals consumer exhaustion from persistent inflation and depleted savings buffers. Discretionary spending bears the brunt while essentials remain resilient. Recession probability rises in consumer-facing models.',
      tradeAction:'Short XRT or reduce discretionary. Rotate to defensive WMT and cost-plus retailers. Avoid high-beta consumer names.',
      timeframe:'1-2 Weeks'
    }
  ];

  function ago(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }

  // ── MARKET STRIP ──────────────────────────────────────────
  const MARKET = [
    { sym:'SPY',  price:444.21, chg:+0.08 },
    { sym:'QQQ',  price:381.56, chg:-0.21 },
    { sym:'VIX',  price:18.43,  chg:+3.77 },
    { sym:'BTC',  price:67420,  chg:+1.87 },
    { sym:'DXY',  price:104.23, chg:-0.17 },
  ];

  function renderMarket() {
    const strip = document.getElementById('marketStrip');
    strip.innerHTML = MARKET.map(m => {
      const up = m.chg >= 0;
      const sign = up ? '+' : '';
      const fmt = m.sym === 'BTC'
        ? m.price.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
        : m.price.toFixed(2);
      return '<div class="mkt-item">' +
        '<span class="mkt-sym">' + m.sym + '</span>' +
        '<span class="mkt-price">' + fmt + '</span>' +
        '<span class="mkt-chg ' + (up?'up':'dn') + '">' + sign + m.chg.toFixed(2) + '%</span>' +
        '</div>';
    }).join('');
  }

  function jitterMarket() {
    MARKET.forEach(m => {
      const jitter = (Math.random() - 0.49) * 0.04;
      m.price = parseFloat((m.price * (1 + jitter / 100)).toFixed(m.sym === 'BTC' ? 0 : 2));
      m.chg = parseFloat((m.chg + (Math.random() - 0.5) * 0.04).toFixed(2));
    });
    renderMarket();
  }

  // ── SECTOR COLORS ─────────────────────────────────────────
  const SECTOR_COLORS = {
    Technology:'#6366f1',Finance:'#f59e0b',Healthcare:'#14b8a6',
    Energy:'#f97316',Consumer:'#ec4899',Macro:'#64748b',
    Currency:'#8b5cf6','Real Estate':'#84cc16',Other:'#94a3b8'
  };

  function sectorStyle(sector) {
    const c = SECTOR_COLORS[sector] || '#94a3b8';
    return 'color:' + c + ';border-color:' + c + '33;background:' + c + '11';
  }

  // ── TIME FORMAT ───────────────────────────────────────────
  function relTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // ── RENDER CARD ───────────────────────────────────────────
  function renderCard(sig) {
    const sel = sig.id === selectedId ? ' selected' : '';
    const tickers = (sig.affectedTickers || []).slice(0, 3).map(t => {
      const cls = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'dn' : '';
      const arrow = t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '—';
      return '<span class="ticker-mini ' + cls + '">' + esc(t.ticker) + ' ' + arrow + '</span>';
    }).join('');

    return '<div class="sig-card ' + sig.signal + sel + '" id="card-' + sig.id + '" onclick="selectSignal(\'' + sig.id + '\')">' +
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
    '</div>';
  }

  // ── RENDER DETAIL ─────────────────────────────────────────
  function renderDetail(sig) {
    const tickers = (sig.affectedTickers || []).map(t => {
      const cls = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'dn' : '';
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

        (tickers ? '<div class="detail-section"><div class="section-label">Affected Tickers</div><div class="tickers-list">' + tickers + '</div></div>' : '') +

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

  // ── SELECT SIGNAL ─────────────────────────────────────────
  window.selectSignal = function(id) {
    const prev = document.getElementById('card-' + selectedId);
    if (prev) prev.classList.remove('selected');
    selectedId = id;
    const curr = document.getElementById('card-' + id);
    if (curr) curr.classList.add('selected');
    const sig = signals.find(s => s.id === id);
    if (sig) renderDetail(sig);
  };

  // ── RENDER FEED ───────────────────────────────────────────
  function renderFeed() {
    const list = document.getElementById('feedList');
    const empty = document.getElementById('feedEmpty');
    const visible = signals.filter(s => activeFilter === 'all' || s.signal === activeFilter);

    document.getElementById('feedCount').textContent = visible.length + ' signal' + (visible.length !== 1 ? 's' : '');

    if (signals.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = signals.map(s => renderCard(s)).join('');

    // Apply filter visibility
    signals.forEach(s => {
      const el = document.getElementById('card-' + s.id);
      if (el) el.classList.toggle('filtered-out', activeFilter !== 'all' && s.signal !== activeFilter);
    });
  }

  // ── UPDATE STATS ──────────────────────────────────────────
  function updateStats() {
    const buy = signals.filter(s => s.signal === 'BUY').length;
    const sell = signals.filter(s => s.signal === 'SELL').length;
    const hold = signals.filter(s => s.signal === 'HOLD').length;
    const avgConf = signals.length
      ? Math.round(signals.reduce((a, s) => a + (s.confidence || 0), 0) / signals.length)
      : null;

    document.getElementById('sSig').textContent = signals.length;
    document.getElementById('sBuy').textContent = buy;
    document.getElementById('sSell').textContent = sell;
    document.getElementById('sHold').textContent = hold;
    document.getElementById('sConf').textContent = avgConf !== null ? avgConf + '%' : '—';
  }

  // ── SECTOR CHIPS ──────────────────────────────────────────
  function updateSectorChips() {
    const bar = document.getElementById('filterBar');
    // Remove existing sector chips
    bar.querySelectorAll('.chip-sector').forEach(el => el.remove());
    // Build set of sectors
    const sectors = [...new Set(signals.map(s => s.sector).filter(Boolean))].sort();
    sectors.forEach(sector => {
      const btn = document.createElement('button');
      btn.className = 'chip chip-sector';
      btn.dataset.filter = 'sector-' + sector;
      btn.textContent = sector.toUpperCase();
      btn.style.setProperty('--sector-color', SECTOR_COLORS[sector] || '#94a3b8');
      btn.onclick = () => setFilter(btn, 'sector-' + sector);
      bar.appendChild(btn);
    });
  }

  // ── FILTER ────────────────────────────────────────────────
  window.setFilter = function(el, filter) {
    document.querySelectorAll('.filter-bar .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    if (filter.startsWith('sector-')) {
      const sector = filter.replace('sector-', '');
      activeFilter = 'all';
      signals.forEach(s => {
        const card = document.getElementById('card-' + s.id);
        if (card) card.classList.toggle('filtered-out', s.sector !== sector);
      });
      const visible = signals.filter(s => s.sector === sector);
      document.getElementById('feedCount').textContent = visible.length + ' signal' + (visible.length !== 1 ? 's' : '');
    } else {
      activeFilter = filter;
      renderFeed();
    }
  };

  // ── SCAN NEWS ─────────────────────────────────────────────
  window.scanNews = function() {
    vscode.postMessage({ type: 'scanNews' });
  };

  window.setApiKey = function() {
    vscode.postMessage({ type: 'setApiKey' });
  };

  // ── TOAST ─────────────────────────────────────────────────
  function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 6000);
  }

  window.dismissToast = function() {
    clearTimeout(toastTimer);
    document.getElementById('toast').classList.remove('show');
  };

  // ── OVERLAY ───────────────────────────────────────────────
  function showOverlay(ticker, msg) {
    document.getElementById('overlayTicker').textContent = ticker || '';
    document.getElementById('overlayMsg').textContent = msg || 'Scanning...';
    document.getElementById('scanOverlay').style.display = 'flex';
    document.getElementById('scanBtn').disabled = true;
  }

  function hideOverlay() {
    document.getElementById('scanOverlay').style.display = 'none';
    document.getElementById('scanBtn').disabled = false;
  }

  // ── VS CODE MESSAGE HANDLER ───────────────────────────────
  window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {

      case 'signals':
        signals = msg.signals || [];
        hideOverlay();
        renderFeed();
        updateStats();
        updateSectorChips();
        if (signals.length > 0 && !selectedId) selectSignal(signals[0].id);
        else if (signals.length > 0) selectSignal(signals[0].id);
        break;

      case 'addSignal': {
        const existing = signals.findIndex(s => s.id === msg.signal.id);
        if (existing >= 0) signals[existing] = msg.signal;
        else signals.unshift(msg.signal);
        hideOverlay();
        renderFeed();
        updateStats();
        updateSectorChips();
        selectSignal(msg.signal.id);
        break;
      }

      case 'scanStatus':
        showOverlay(msg.ticker || '', msg.message || 'Scanning...');
        break;

      case 'scanError':
        hideOverlay();
        showToast(msg.message || 'An error occurred.');
        break;

      case 'apiKeyStatus':
        const dot = document.getElementById('apiDot');
        const lbl = document.getElementById('apiLabel');
        if (msg.hasKey) {
          dot.classList.add('online');
          lbl.textContent = 'API Ready';
        } else {
          dot.classList.remove('online');
          lbl.textContent = 'No Key';
        }
        break;
    }
  });

  // ── ESCAPE ────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── INIT ──────────────────────────────────────────────────
  renderMarket();
  setInterval(jitterMarket, 4000);

  signals = MOCK;
  renderFeed();
  updateStats();
  updateSectorChips();
  selectSignal(signals[0].id);

  vscode.postMessage({ type: 'checkApiKey' });

})();
</script>
</body>
</html>`;
  }
}

module.exports = { TradeSignalPanel };
