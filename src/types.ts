export interface NewsArticle {
  title: string;
  url: string;
  site: string;
  publishedDate: string;
  text: string;
  sentimentScore: number;
  analysis?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
