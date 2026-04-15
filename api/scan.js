/**
 * api/scan.js — POST /api/scan
 *
 * Vercel serverless function: fetches financial RSS headlines,
 * sends them to Claude for batch analysis, returns structured signals.
 *
 * API key priority:
 *   1. process.env.ANTHROPIC_API_KEY  — set in Vercel dashboard (production)
 *   2. req.headers['x-api-key']       — sent by browser from localStorage (dev / personal use)
 *
 * If neither is present, responds with { useMock: true } so the frontend
 * keeps its mock data and shows a friendly prompt to configure a key.
 */

'use strict';

const { fetchFinancialHeadlines } = require('./_lib/rss');
const { analyzeHeadlines }        = require('./_lib/analyzer');

// Default RSS feeds — financial news from reliable public sources.
// Users can extend this via feedUrls in the request body.
const DEFAULT_FEEDS = [
  'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,MSFT,NVDA,META,GOOGL,TSLA,JPM,GS,XOM,LLY&region=US&lang=en-US',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',      // CNBC Markets
  'https://feeds.marketwatch.com/marketwatch/topstories/',       // MarketWatch
  'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',              // WSJ Markets
];

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // ── API KEY ───────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY || req.headers['x-api-key'];

  if (!apiKey) {
    // Return useMock:true so the frontend knows to keep its mock data
    // and prompt the user to configure a key — not an error state.
    return res.status(200).json({
      useMock: true,
      error:
        'No API key configured. ' +
        'Add your Anthropic API key via the ⚙ button in the dashboard, ' +
        'or set ANTHROPIC_API_KEY as a Vercel environment variable for production.',
    });
  }

  // ── FEEDS ─────────────────────────────────────────────────
  const feedUrls =
    Array.isArray(req.body?.feedUrls) && req.body.feedUrls.length > 0
      ? req.body.feedUrls
      : DEFAULT_FEEDS;

  // ── PIPELINE ──────────────────────────────────────────────
  try {
    const articles = await fetchFinancialHeadlines(feedUrls, 15);

    if (articles.length === 0) {
      return res.status(200).json({
        error:
          'No headlines were returned from the RSS feeds. ' +
          'The feeds may be temporarily unavailable. Try again in a moment.',
      });
    }

    const signals = await analyzeHeadlines(articles, apiKey);
    return res.status(200).json({ signals });

  } catch (err) {
    console.error('[/api/scan] error:', err.message);
    return res.status(500).json({ error: err.message || 'An unexpected error occurred.' });
  }
};
