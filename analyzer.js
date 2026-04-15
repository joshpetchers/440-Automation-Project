const https = require('https');

/**
 * Shared Claude API call. Accepts key explicitly so both functions can use it.
 */
function callClaude(systemPrompt, userPrompt, maxTokens, apiKey, parseResponse) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { reject(new Error(parsed.error.message || 'Claude API error')); return; }
          const content = parsed.content?.[0]?.text || '';
          resolve(parseResponse(content));
        } catch (e) {
          reject(new Error('Failed to parse Claude response: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API request timed out')); });
    req.setTimeout(60000);
    req.write(body);
    req.end();
  });
}

/**
 * Single-ticker analysis — kept for command palette compat.
 */
async function analyzeWithClaude(ticker, articles, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Run "Trade Signal: Set Anthropic API Key" first.');
  if (articles.length === 0) throw new Error(`No relevant news found for ${ticker}.`);

  const articleText = articles.map((a, i) =>
    `[${i + 1}] SOURCE: ${a.source}\nDATE: ${a.pubDate || 'Unknown'}\nHEADLINE: ${a.title}\nSUMMARY: ${a.description?.replace(/<[^>]*>/g, '').slice(0, 400) || 'N/A'}`
  ).join('\n\n---\n\n');

  const system = `You are a sell-side equity analyst. Analyze recent news for a stock and return ONLY a valid JSON object:
{
  "ticker": "TICKER",
  "signal": "BUY"|"SELL"|"HOLD"|"WATCH",
  "confidence": "HIGH"|"MEDIUM"|"LOW",
  "timeframe": "Intraday"|"1-3 Days"|"1-2 Weeks"|"1+ Month",
  "priceAction": "Bullish"|"Bearish"|"Neutral"|"Mixed",
  "summary": "2-3 sentence rationale",
  "keyDrivers": ["driver 1","driver 2","driver 3"],
  "risks": ["risk 1","risk 2"],
  "sentimentScore": <-100 to +100>,
  "articlesAnalyzed": <count>,
  "disclaimer": "Not financial advice."
}`;

  return callClaude(system, `Analyze news for ${ticker}:\n\n${articleText}`, 1000, apiKey, (content) => {
    const rec = JSON.parse(content.replace(/```json|```/g, '').trim());
    rec.articles = articles;
    return rec;
  });
}

/**
 * Batch headline analysis — primary entry point for the SIGNAL//AI dashboard.
 * Takes an array of article objects, returns an array of structured signal objects.
 * To swap in a different model or provider, only this function needs to change.
 *
 * @param {Array<{title,source,pubDate,link}>} articles
 * @param {string} apiKey
 * @returns {Promise<Array>} signal objects
 */
async function analyzeHeadlines(articles, apiKey) {
  if (!apiKey) throw new Error('No API key configured.');
  if (articles.length === 0) throw new Error('No articles to analyze.');

  const articlesText = articles.map((a, i) =>
    `[${i + 1}] HEADLINE: ${a.title}\nSOURCE: ${a.source}\nDATE: ${a.pubDate || 'Unknown'}`
  ).join('\n\n');

  const system = `You are a quantitative news analyst at a top-tier hedge fund. Analyze financial headlines and return ONLY a valid JSON array of signal objects:
[{
  "id": "sig-N",
  "headline": "exact headline",
  "source": "source name",
  "timestamp": "ISO 8601 string",
  "sector": "Technology"|"Finance"|"Healthcare"|"Energy"|"Consumer"|"Macro"|"Currency"|"Real Estate"|"Other",
  "signal": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "affectedTickers": [{"ticker":"SYMBOL","direction":"up"|"down"|"neutral"}],
  "marketImpact": "2-3 sentence analysis",
  "tradeAction": "specific instrument, direction, rough target",
  "timeframe": "Intraday"|"1-3 Days"|"1-2 Weeks"|"1+ Month"
}]
Rules: BUY=clear upside catalyst. SELL=clear downside risk. HOLD=ambiguous/priced-in. Confidence 80+=high. Skip irrelevant headlines. Return only the JSON array.`;

  return callClaude(system, `Analyze these ${articles.length} headlines:\n\n${articlesText}`, 4096, apiKey, (content) => {
    const signals = JSON.parse(content.replace(/```json|```/g, '').trim());
    if (!Array.isArray(signals)) throw new Error('Expected a JSON array from Claude');
    signals.forEach((s, i) => { if (!s.id) s.id = `sig-${Date.now()}-${i}`; });
    return signals;
  });
}

module.exports = { analyzeWithClaude, analyzeHeadlines };
