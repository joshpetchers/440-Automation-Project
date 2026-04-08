const https = require('https');
const http = require('http');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false });

// Known company name mappings for better article matching
const COMPANY_ALIASES = {
  AAPL: ['apple', 'apple inc'],
  MSFT: ['microsoft'],
  GOOGL: ['google', 'alphabet'],
  GOOG: ['google', 'alphabet'],
  AMZN: ['amazon'],
  TSLA: ['tesla'],
  META: ['meta', 'facebook'],
  NVDA: ['nvidia'],
  JPM: ['jpmorgan', 'jp morgan', 'chase'],
  GS: ['goldman sachs', 'goldman'],
  MS: ['morgan stanley'],
  BAC: ['bank of america', 'bofa'],
  WFC: ['wells fargo'],
  C: ['citigroup', 'citi'],
  JNJ: ['johnson & johnson', 'j&j'],
  UNH: ['unitedhealth'],
  PFE: ['pfizer'],
  XOM: ['exxon', 'exxonmobil'],
  CVX: ['chevron'],
  WMT: ['walmart'],
  NFLX: ['netflix'],
  DIS: ['disney'],
  V: ['visa'],
  MA: ['mastercard'],
  PYPL: ['paypal'],
  AMD: ['amd', 'advanced micro devices'],
  INTC: ['intel'],
  CRM: ['salesforce'],
  ORCL: ['oracle'],
};

/**
 * Fetch raw text from a URL, follows redirects
 */
function fetchUrl(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeSignalBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 10000
    }, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        return fetchUrl(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

/**
 * Parse an RSS/Atom feed XML string into a list of articles
 */
function parseFeed(xml, feedUrl) {
  try {
    const result = parser.parse(xml);
    const articles = [];

    // RSS 2.0
    const channel = result?.rss?.channel;
    if (channel) {
      const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
      for (const item of items) {
        articles.push({
          title: item.title || '',
          description: item.description || item.summary || '',
          link: item.link || item.guid || '',
          pubDate: item.pubDate || item.date || '',
          source: new URL(feedUrl).hostname.replace('www.', '').replace('feeds.', '').replace('rss.', '')
        });
      }
      return articles;
    }

    // Atom
    const feed = result?.feed;
    if (feed) {
      const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
      for (const entry of entries) {
        const link = Array.isArray(entry.link)
          ? (entry.link.find(l => l['@_rel'] === 'alternate') || entry.link[0])?.['@_href'] || ''
          : entry.link?.['@_href'] || entry.link || '';
        articles.push({
          title: entry.title?.['#text'] || entry.title || '',
          description: entry.summary?.['#text'] || entry.summary || entry.content?.['#text'] || '',
          link,
          pubDate: entry.updated || entry.published || '',
          source: new URL(feedUrl).hostname.replace('www.', '').replace('feeds.', '')
        });
      }
      return articles;
    }

    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Check if an article mentions the ticker or company name
 */
function articleMentionsTicker(article, ticker) {
  const tickerUpper = ticker.toUpperCase();
  const aliases = COMPANY_ALIASES[tickerUpper] || [];
  const searchTargets = [tickerUpper, ...aliases];

  const text = `${article.title} ${article.description}`.toLowerCase();
  const textUpper = text.toUpperCase();

  return searchTargets.some(term => {
    if (term === tickerUpper) {
      // Match ticker as whole word (e.g. "AAPL" not inside "GAAPLX")
      return new RegExp(`\\b${tickerUpper}\\b`).test(textUpper);
    }
    return text.includes(term.toLowerCase());
  });
}

/**
 * Main function: fetch all RSS feeds and return articles relevant to ticker
 */
async function fetchRelevantArticles(ticker, feedUrls, maxArticles = 8) {
  const results = await Promise.allSettled(
    feedUrls.map(url =>
      fetchUrl(url)
        .then(xml => parseFeed(xml, url))
        .catch(() => [])
    )
  );

  const allArticles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Filter relevant, dedupe by title, sort by date
  const seen = new Set();
  const relevant = allArticles
    .filter(a => {
      if (!articleMentionsTicker(a, ticker)) return false;
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

  return relevant;
}

module.exports = { fetchRelevantArticles };
