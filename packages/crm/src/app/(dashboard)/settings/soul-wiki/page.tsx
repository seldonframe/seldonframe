"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Globe, Play, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Source = {
  id: string;
  type: string;
  title: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

type WikiArticle = {
  id: string;
  title: string;
  content: string;
  lastCompiledAt: string | null;
};

type SourceTab = "url" | "youtube" | "text" | "testimonial";

function getWordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function formatDate(value: string | null) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function markdownToHtml(markdown: string) {
  return markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
    .replace(/^[-*]\s+(.*)$/gm, "<li>$1</li>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "<br/><br/>");
}

export default function SoulWikiSettingsPage() {
  const [activeTab, setActiveTab] = useState<SourceTab>("url");
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [articles, setArticles] = useState<WikiArticle[]>([]);

  const [urlInput, setUrlInput] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [testimonialAuthor, setTestimonialAuthor] = useState("");
  const [testimonialText, setTestimonialText] = useState("");

  const sourceCount = sources.length;
  const articleCount = articles.length;

  const isBusy = loading;

  async function loadSources() {
    const response = await fetch("/api/v1/soul/sources", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as Source[];
    setSources(Array.isArray(data) ? data : []);
  }

  async function loadWiki() {
    const response = await fetch("/api/v1/soul/wiki", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as WikiArticle[];
    setArticles(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void loadSources();
    void loadWiki();
  }, []);

  async function handleIngest(type: SourceTab, value?: string, text?: string, title?: string) {
    setLoading(true);

    try {
      const response = await fetch("/api/v1/soul/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          ...(value ? { url: value } : {}),
          ...(text ? { text } : {}),
          ...(title ? { title } : {}),
        }),
      });

      if (!response.ok) {
        return;
      }

      setUrlInput("");
      setYoutubeInput("");
      setTextInput("");
      setTextTitle("");
      setTestimonialAuthor("");
      setTestimonialText("");

      await Promise.all([loadSources(), loadWiki()]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(sourceId: string) {
    setLoading(true);
    try {
      await fetch("/api/v1/soul/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      await Promise.all([loadSources(), loadWiki()]);
    } finally {
      setLoading(false);
    }
  }

  async function recompile() {
    setLoading(true);
    try {
      await fetch("/api/v1/soul/wiki", { method: "POST" });
      await loadWiki();
    } finally {
      setLoading(false);
    }
  }

  const tabButtons = useMemo(
    () => [
      { key: "url" as const, label: "Website URL" },
      { key: "youtube" as const, label: "YouTube" },
      { key: "text" as const, label: "Paste Text" },
      { key: "testimonial" as const, label: "Testimonial" },
    ],
    []
  );

  return (
    <section className="animate-page-enter space-y-8">
      <div className="space-y-2">
        <h1 className="text-page-title">Soul Knowledge</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Feed your soul with real source material so Seldon creates content in your actual business voice.
        </p>
        <p className="text-xs text-zinc-500">
          {sourceCount} sources · {articleCount} compiled articles
        </p>
      </div>

      <article className="rounded-xl border bg-card p-5 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-1">Feed Your Soul</h3>
          <p className="text-sm text-zinc-500">
            Add your website, videos, testimonials, and content. Seldon will learn your business language and details.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabButtons.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm border ${activeTab === tab.key ? "border-zinc-600 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "url" ? (
          <div className="space-y-3">
            <Input placeholder="https://yourwebsite.com/about" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            <p className="text-xs text-zinc-500">Paste any page — About, Services, blog posts, etc.</p>
            <Button disabled={isBusy || !urlInput.trim()} onClick={() => void handleIngest("url", urlInput.trim())}>
              {isBusy ? "Extracting..." : "Add to Soul"}
            </Button>
          </div>
        ) : null}

        {activeTab === "youtube" ? (
          <div className="space-y-3">
            <Input placeholder="https://youtube.com/watch?v=..." value={youtubeInput} onChange={(e) => setYoutubeInput(e.target.value)} />
            <p className="text-xs text-zinc-500">Paste a YouTube URL — interviews, podcasts, workshops, etc.</p>
            <Button disabled={isBusy || !youtubeInput.trim()} onClick={() => void handleIngest("youtube", youtubeInput.trim())}>
              {isBusy ? "Transcribing..." : "Add to Soul"}
            </Button>
          </div>
        ) : null}

        {activeTab === "text" ? (
          <div className="space-y-3">
            <Input placeholder="Title (optional)" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} />
            <Textarea rows={8} placeholder="Paste your content here..." value={textInput} onChange={(e) => setTextInput(e.target.value)} />
            <Button disabled={isBusy || !textInput.trim()} onClick={() => void handleIngest("text", undefined, textInput.trim(), textTitle.trim())}>
              Add to Soul
            </Button>
          </div>
        ) : null}

        {activeTab === "testimonial" ? (
          <div className="space-y-3">
            <Input placeholder="Client name" value={testimonialAuthor} onChange={(e) => setTestimonialAuthor(e.target.value)} />
            <Textarea rows={4} placeholder="What they said about working with you..." value={testimonialText} onChange={(e) => setTestimonialText(e.target.value)} />
            <Button
              disabled={isBusy || !testimonialText.trim()}
              onClick={() =>
                void handleIngest(
                  "testimonial",
                  undefined,
                  `"${testimonialText.trim()}" — ${testimonialAuthor.trim() || "Client"}`,
                  `Testimonial from ${testimonialAuthor.trim() || "Client"}`
                )
              }
            >
              Add Testimonial
            </Button>
          </div>
        ) : null}

        <div className="space-y-2 mt-6">
          <h4 className="text-sm font-medium text-zinc-300">Sources ({sources.length})</h4>
          {sources.map((source) => {
            const wordCount = Number((source.metadata ?? {})["wordCount"] ?? 0);
            return (
              <div key={source.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-3">
                  {source.type === "url" ? <Globe className="h-4 w-4 text-blue-400" /> : null}
                  {source.type === "youtube" ? <Play className="h-4 w-4 text-red-400" /> : null}
                  {source.type === "text" ? <FileText className="h-4 w-4 text-zinc-400" /> : null}
                  {source.type === "testimonial" ? <Star className="h-4 w-4 text-yellow-400" /> : null}
                  {!['url', 'youtube', 'text', 'testimonial'].includes(source.type) ? <FileText className="h-4 w-4 text-zinc-400" /> : null}
                  <div>
                    <p className="text-sm text-zinc-200">{source.title || "Untitled source"}</p>
                    <p className="text-xs text-zinc-500">{wordCount} words · {source.status}</p>
                  </div>
                </div>
                <button type="button" onClick={() => void handleDelete(source.id)} className="text-xs text-zinc-600 hover:text-red-400 inline-flex items-center gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            );
          })}
          {sources.length === 0 ? <p className="text-xs text-zinc-500">No sources yet.</p> : null}
        </div>
      </article>

      <article className="rounded-xl border bg-card p-5 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-1">What Seldon Knows About You</h3>
          <p className="text-sm text-zinc-500">Compiled from your sources and used during page/email/content generation.</p>
          {articles.length > 0 ? (
            <Button variant="outline" size="sm" className="mt-3" disabled={isBusy} onClick={() => void recompile()}>
              Recompile All
            </Button>
          ) : null}
        </div>

        {articles.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">No knowledge compiled yet. Add sources above and Seldon will compile your business context.</p>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <details key={article.id} className="group border border-zinc-800 rounded-lg">
                <summary className="flex items-center justify-between p-4 cursor-pointer">
                  <span className="text-sm font-medium text-zinc-200">{article.title}</span>
                  <span className="text-xs text-zinc-500">
                    {getWordCount(article.content)} words · Last compiled {formatDate(article.lastCompiledAt)}
                  </span>
                </summary>
                <div className="px-4 pb-4 prose prose-sm prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content) }} />
                </div>
              </details>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
