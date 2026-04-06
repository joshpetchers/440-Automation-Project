import { useState } from "react";
import { AssistantMessage } from "../types";

type AssistantPanelProps = {
  messages: AssistantMessage[];
  loading: boolean;
  onAsk: (question: string) => Promise<void>;
  initialPrompt: string;
};

export default function AssistantPanel({ messages, loading, onAsk, initialPrompt }: AssistantPanelProps) {
  const [draft, setDraft] = useState("");

  return (
    <section className="panel assistant-panel">
      <h2>Conversational AI assistant</h2>
      <p className="article-summary">{initialPrompt}</p>

      <div className="message-list">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-meta">
              <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
            </div>
            <div className="message-content">{message.content}</div>
          </div>
        ))}
      </div>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          await onAsk(draft.trim());
          setDraft("");
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about risk, valuation, sentiment, or what the latest news means for this ticker..."
        />
        <button type="submit" disabled={loading || draft.trim().length === 0}>
          {loading ? "Thinking..." : "Send question"}
        </button>
      </form>
    </section>
  );
}
