import { useEffect, useMemo, useState } from "react";
import AssistantPanel from "./components/AssistantPanel";
import NewsPanel from "./components/NewsPanel";
import { AssistantMessage, NewsArticle } from "./types";

const initialPrompt =
  "Ask the AI assistant for research ideas, risk analysis, sentiment signals, or investment insights based on the latest market news.";

function App() {
  const [symbol, setSymbol] = useState("AAPL");
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: "system",
      role: "assistant",
      content:
        "Welcome to the financial research dashboard. Enter a symbol and ask your assistant for investment insights.",
    },
  ]);
  const [assistantLoading, setAssistantLoading] = useState(false);

  const overallSentiment = useMemo(() => {
    if (!news.length) return 0;
    return news.reduce((sum, article) => sum + article.sentimentScore, 0) / news.length;
  }, [news]);

  const sentimentLabel = useMemo(() => {
    if (overallSentiment > 0.2) return "Positive";
    if (overallSentiment < -0.2) return "Negative";
    return "Neutral";
  }, [overallSentiment]);

  const fetchNews = async (querySymbol = symbol) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/news?symbol=${encodeURIComponent(querySymbol)}`);
      if (!response.ok) {
        throw new Error("Unable to fetch news feed.");
      }
      const data = await response.json();
      setNews(data.articles ?? []);
    } catch (err) {
      setError((err as Error).message || "Could not load news.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const askAssistant = async (question: string) => {
    const userMessage: AssistantMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: question,
    };
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, symbol }),
      });
      const data = await response.json();
      const assistantMessage: AssistantMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: data.answer || "The assistant did not return an answer.",
      };
      setAssistantMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      setAssistantMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant-error`,
          role: "assistant",
          content:
            "There was a problem contacting the AI assistant. Please check your backend and API configuration.",
        },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Financial research dashboard</p>
          <h1>Real-time news, sentiment, and AI insights</h1>
          <p className="subtitle">
            Track symbol-level headlines, sentiment scoring, and ask the conversational assistant for smart investment ideas.
          </p>
        </div>
        <div className="hero-actions">
          <div className="stat-card">
            <span className="stat-label">Current symbol</span>
            <strong>{symbol.toUpperCase()}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">News sentiment</span>
            <strong>{sentimentLabel}</strong>
          </div>
          <button className="refresh-button" onClick={() => fetchNews(symbol)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh news"}
          </button>
        </div>
      </header>

      <section className="symbol-form">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            fetchNews(symbol);
          }}
        >
          <label htmlFor="symbol-input">Search symbol</label>
          <div className="symbol-controls">
            <input
              id="symbol-input"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="AAPL"
            />
            <button type="submit">Analyze</button>
          </div>
        </form>
      </section>

      <div className="dashboard-grid">
        <NewsPanel symbol={symbol.toUpperCase()} articles={news} loading={loading} error={error} onRefresh={() => fetchNews(symbol)} />
        <AssistantPanel messages={assistantMessages} loading={assistantLoading} onAsk={askAssistant} initialPrompt={initialPrompt} />
      </div>
    </div>
  );
}

export default App;
