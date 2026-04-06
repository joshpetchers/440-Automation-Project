import { NewsArticle } from "../types";

type NewsPanelProps = {
  symbol: string;
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sentimentBadge(score: number) {
  if (score > 0.2) return { label: "Positive", style: "badge-positive" };
  if (score < -0.2) return { label: "Negative", style: "badge-negative" };
  return { label: "Neutral", style: "badge-neutral" };
}

export default function NewsPanel({ symbol, articles, loading, error, onRefresh }: NewsPanelProps) {
  return (
    <section className="panel news-panel">
      <div className="section-heading">
        <h2>{symbol} news feed</h2>
        <button className="refresh-button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? <div className="error-message">{error}</div> : null}

      {articles.length === 0 && !loading ? (
        <p>No news available yet. Try a new symbol or refresh the feed.</p>
      ) : null}

      {articles.map((article) => {
        const badge = sentimentBadge(article.sentimentScore);
        return (
          <article key={article.url}>
            <div className="article-title">
              <a href={article.url} target="_blank" rel="noreferrer">
                {article.title}
              </a>
            </div>
            <div className="article-meta">
              {article.site} • {formatDate(article.publishedDate)} •
              <span className={`badge ${badge.style}`}>{badge.label}</span>
            </div>
            <p className="article-summary">{article.analysis || article.text}</p>
          </article>
        );
      })}
    </section>
  );
}
