/**
 * api/_lib/analyzer.js
 *
 * Claude API integration for the serverless scan endpoint.
 * Files in api/_lib/ are private — Vercel does NOT expose them as endpoints.
 *
 * To swap the model or provider, change only this file.
 */

'use strict';

const https = require('https');

/**
 * Analyze a batch of financial news articles and return structured trade signals.
 *
 * @param {Array<{title, source, pubDate}>} articles
 * @param {string} apiKey  - Anthropic API key
 * @returns {Promise<Array>} array of signal objects
 */
async function analyzeHeadlines(articles, apiKey) {
  if (!apiKey) throw new Error('No API key provided.');
  if (articles.length === 0) throw new Error('No articles to analyze.');

  const articlesText = articles
    .map((a, i) => `[${i + 1}] HEADLINE: ${a.title}\nSOURCE: ${a.source}\nDATE: ${a.pubDate || 'Unknown'}`)
    .join('\n\n');

  const system = `You are a quantitative news analyst at a top-tier hedge fund. Analyze financial news headlines and return ONLY a valid JSON array of trade signal objects. Each object must follow this exact schema:

[{
  "id": "sig-N",
  "headline": "exact headline text",
  "source": "source name",
  "timestamp": "ISO 8601 date string (use the article date, or today if unknown)",
  "sector": "Technology" | "Finance" | "Healthcare" | "Energy" | "Consumer" | "Macro" | "Currency" | "Real Estate" | "Other",
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": integer 0-100,
  "affectedTickers": [{"ticker": "SYMBOL", "direction": "up" | "down" | "neutral"}],
  "marketImpact": "2-3 sentence market impact analysis",
  "tradeAction": "specific recommended trade: instrument, direction, rough target or stop",
  "timeframe": "Intraday" | "1-3 Days" | "1-2 Weeks" | "1+ Month"
}]

Rules:
- BUY = clear positive catalyst with measurable upside trigger
- SELL = clear negative catalyst with measurable downside risk
- HOLD = ambiguous, wait-and-see, or catalyst already priced in
- Confidence 80-100 = high conviction, 50-79 = moderate, <50 = speculative
- affectedTickers: list 1-4 most directly impacted symbols
- tradeAction must name a specific instrument and direction
- Skip any headline with zero market relevance
- Return ONLY the JSON array, no markdown, no explanation`;

  const user = `Analyze these ${articles.length} financial headlines and generate trade signals:\n\n${articlesText}`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'Claude API error'));
              return;
            }
            const content = parsed.content?.[0]?.text || '';
            const clean   = content.replace(/```json|```/g, '').trim();
            const signals = JSON.parse(clean);
            if (!Array.isArray(signals)) throw new Error('Expected JSON array from Claude');
            signals.forEach((s, i) => { if (!s.id) s.id = 'sig-' + Date.now() + '-' + i; });
            resolve(signals);
          } catch (e) {
            reject(new Error('Failed to parse Claude response: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API request timed out')); });
    req.setTimeout(60000);
    req.write(body);
    req.end();
  });
}

module.exports = { analyzeHeadlines };
