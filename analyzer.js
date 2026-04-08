const https = require('https');

/**
 * Call Claude API with news articles and return a structured trade recommendation
 */
async function analyzeWithClaude(ticker, articles, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Run "Trade Signal: Set Anthropic API Key" first.');
  if (articles.length === 0) throw new Error(`No relevant news found for ${ticker} in the configured RSS feeds.`);

  const articleText = articles.map((a, i) =>
    `[${i + 1}] SOURCE: ${a.source}\nDATE: ${a.pubDate || 'Unknown'}\nHEADLINE: ${a.title}\nSUMMARY: ${a.description?.replace(/<[^>]*>/g, '').slice(0, 400) || 'N/A'}`
  ).join('\n\n---\n\n');

  const systemPrompt = `You are a sell-side equity analyst specializing in news-driven trade signals. Your job is to analyze recent news sentiment for a specific stock and produce a structured trade recommendation.

Always respond with ONLY a valid JSON object in this exact format:
{
  "ticker": "TICKER",
  "signal": "BUY" | "SELL" | "HOLD" | "WATCH",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "timeframe": "Intraday" | "1-3 Days" | "1-2 Weeks" | "1+ Month",
  "priceAction": "Bullish" | "Bearish" | "Neutral" | "Mixed",
  "summary": "2-3 sentence plain English rationale for the recommendation",
  "keyDrivers": ["driver 1", "driver 2", "driver 3"],
  "risks": ["risk 1", "risk 2"],
  "sentimentScore": <integer from -100 (extremely bearish) to +100 (extremely bullish)>,
  "articlesAnalyzed": <number of articles>,
  "disclaimer": "This is not financial advice. For informational purposes only."
}

Base your analysis strictly on the news provided. Do not fabricate price targets or earnings estimates. Be direct and opinionated based on the sentiment evidence.`;

  const userPrompt = `Analyze the following recent news articles for ${ticker} and generate a trade signal:\n\n${articleText}`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
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
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'Claude API error'));
            return;
          }
          const content = parsed.content?.[0]?.text || '';
          // Strip markdown fences if present
          const clean = content.replace(/```json|```/g, '').trim();
          const recommendation = JSON.parse(clean);
          recommendation.articles = articles; // attach raw articles
          resolve(recommendation);
        } catch (e) {
          reject(new Error('Failed to parse Claude response: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API request timed out')); });
    req.setTimeout(30000);
    req.write(body);
    req.end();
  });
}

module.exports = { analyzeWithClaude };
