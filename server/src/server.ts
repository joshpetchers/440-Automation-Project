import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const sentiment = new Sentiment();
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

interface Article {
  title: string;
  url: string;
  site: string;
  publishedDate: string;
  text: string;
  sentimentScore: number;
  analysis?: string;
}

const sampleNews: Array<Omit<Article, "sentimentScore">> = [
  {
    title: "Technology earnings beat expectations as AI demand stays strong",
    url: "https://example.com/tech-ai-earnings",
    site: "MarketPulse",
    publishedDate: new Date().toISOString(),
    text: "Several large-cap technology companies reported better-than-expected revenue this quarter, driven by artificial intelligence product demand and enterprise spending.",
  },
  {
    title: "Energy stocks dip after inventory report surprises traders",
    url: "https://example.com/energy-inventory",
    site: "EnergyWire",
    publishedDate: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    text: "Oil and gas producers felt pressure after the latest inventory release showed higher stockpiles than projected, weighing on short-term energy sentiment.",
  },
  {
    title: "Consumer confidence lifts retail outlook for the holiday season",
    url: "https://example.com/consumer-confidence",
    site: "RetailBrief",
    publishedDate: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    text: "Retailers are revising guidance upward after data showed consumers are more willing to spend, especially on discretionary and travel-related categories.",
  },
];

const analyzeArticle = async (article: Article): Promise<Article> => {
  const score = sentiment.analyze(article.text).comparative;
  if (!openai) {
    return { ...article, sentimentScore: score, analysis: "Configure OPENAI_API_KEY to unlock AI news analysis." };
  }

  try {
    const prompt = `Provide a concise investment impact summary for the following market news article. Focus on sentiment, sector momentum, and whether this story is likely to matter for investors:\n\nTitle: ${article.title}\nSource: ${article.site}\nPublished: ${article.publishedDate}\nText: ${article.text}`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      maxTokens: 180,
    });

    const summary = response.output_text?.trim() ?? "AI analysis is unavailable.";
    return { ...article, sentimentScore: score, analysis: summary };
  } catch (error) {
    return { ...article, sentimentScore: score, analysis: "Unable to generate analysis right now." };
  }
};

app.get("/api/news", async (req, res) => {
  const symbol = String(req.query.symbol ?? "SPY").toUpperCase();
  let articles: Array<Omit<Article, "sentimentScore">> = sampleNews;

  if (NEWS_API_KEY) {
    try {
      const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${encodeURIComponent(symbol)}&limit=8&apikey=${NEWS_API_KEY}`;
      const response = await axios.get(url);
      const rawArticles = Array.isArray(response.data) ? response.data : [];
      articles = rawArticles.map((item: any) => ({
        title: item.title || item.headline || "Market news",
        url: item.url || item.link || "#",
        site: item.site || item.source || "Financial News",
        publishedDate: item.publishedDate || item.date || new Date().toISOString(),
        text: item.text || item.summary || item.description || "Latest market update.",
      }));
    } catch (error) {
      console.warn("Could not fetch external news, falling back to sample content.", error);
    }
  }

  const enriched = await Promise.all(articles.map((article) => analyzeArticle({ ...article, sentimentScore: 0 })));
  res.json({ symbol, articles: enriched });
});

app.post("/api/assistant", async (req, res) => {
  const { question, symbol } = req.body as { question?: string; symbol?: string };
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Question text is required." });
  }

  if (!openai) {
    return res.json({ answer: "Configure OPENAI_API_KEY in .env to enable the AI assistant." });
  }

  try {
    const prompt = `You are a professional financial research assistant. Provide a thoughtful, risk-aware answer to the user question below, referencing the ticker symbol ${symbol ?? "N/A"} when relevant. Keep recommendations clear and grounded.`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: `${prompt}\n\nQuestion: ${question}`,
      maxTokens: 320,
    });

    const answer = response.output_text?.trim() ?? "I could not generate an answer.";
    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ answer: "AI assistant is temporarily unavailable." });
  }
});

app.listen(PORT, () => {
  console.log(`Financial research API listening on http://localhost:${PORT}`);
});
