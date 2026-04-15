/**
 * api/_lib/rss.js
 *
 * RSS feed fetching and parsing for the serverless scan endpoint.
 * Files in api/_lib/ are private — Vercel does NOT expose them as endpoints.
 *
 * Adapted from the root rss.js (which remains for VS Code extension use).
 */

'use strict';

const https = require('https');
const http  = require('http');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false });

/* ── URL FETCHER ───────────────────────────────────────── */
function fetchUrl(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SignalAIBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 10000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        return fetchUrl(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

/* ── RSS/ATOM PARSER ───────────────────────────────────── */
function parseFeed(xml, feedUrl) {
  try {
    const result   = parser.parse(xml);
    const articles = [];
    const hostname = new URL(feedUrl).hostname
      .replace('www.', '')
      .replace('feeds.', '')
      .replace('rss.', '');

    // RSS 2.0
    const channel = result?.rss?.channel;
    if (channel) {
      const items = Array.isArray(channel.item)
        ? channel.item
        : channel.item ? [channel.item] : [];
      for (const item of items) {
        articles.push({
          title:       item.title || '',
          description: item.description || item.summary || '',
          link:        item.link || item.guid || '',
          pubDate:     item.pubDate || item.date || '',
          source:      hostname,
        });
      }
      return articles;
    }

    // Atom
    const feed = result?.feed;
    if (feed) {
      const entries = Array.isArray(feed.entry)
        ? feed.entry
        : feed.entry ? [feed.entry] : [];
      for (const entry of entries) {
        const link = Array.isArray(entry.link)
          ? (entry.link.find(l => l['@_rel'] === 'alternate') || entry.link[0])?.['@_href'] || ''
          : entry.link?.['@_href'] || entry.link || '';
        articles.push({
          title:       entry.title?.['#text'] || entry.title || '',
          description: entry.summary?.['#text'] || entry.summary || entry.content?.['#text'] || '',
          link,
          pubDate:     entry.updated || entry.published || '',
          source:      hostname,
        });
      }
      return articles;
    }

    return [];
  } catch {
    return [];
  }
}

/* ── FETCH GENERAL FINANCIAL HEADLINES ─────────────────── */
/**
 * Fetches all articles from the configured feeds, dedupes, sorts by recency.
 * No ticker filtering — returns broad financial news for batch signal analysis.
 *
 * @param {string[]} feedUrls
 * @param {number}   maxArticles
 * @returns {Promise<Array<{title,source,pubDate,link,description}>>}
 */
async function fetchFinancialHeadlines(feedUrls, maxArticles = 20) {
  if (!feedUrls || feedUrls.length === 0) return [];

  const results = await Promise.allSettled(
    feedUrls.map(url =>
      fetchUrl(url)
        .then(xml => parseFeed(xml, url))
        .catch(() => [])
    )
  );

  const allArticles = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

  const seen = new Set();
  return allArticles
    .filter(a => {
      if (!a.title || a.title.trim().length < 10) return false;
      const key = a.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate) : new Date(0);
      const db = b.pubDate ? new Date(b.pubDate) : new Date(0);
      return db - da;
    })
    .slice(0, maxArticles);
}

module.exports = { fetchFinancialHeadlines };
