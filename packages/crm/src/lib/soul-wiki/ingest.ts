type IngestInput = {
  type: "url" | "youtube" | "text" | "testimonial";
  url?: string;
  text?: string;
  title?: string;
};

export async function ingestSource(
  _orgId: string,
  input: IngestInput
): Promise<{ rawContent: string; title: string; metadata: Record<string, unknown> }> {
  switch (input.type) {
    case "url": {
      const url = String(input.url ?? "").trim();
      if (!url) {
        throw new Error("URL is required");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL (${response.status})`);
      }

      const html = await response.text();
      const markdown = htmlToMarkdown(html);
      const title = extractTitle(html) || input.title || url;

      return {
        rawContent: markdown,
        title,
        metadata: {
          url,
          extractedAt: new Date().toISOString(),
          wordCount: markdown.split(/\s+/).filter(Boolean).length,
        },
      };
    }

    case "youtube": {
      const url = String(input.url ?? "").trim();
      if (!url) {
        throw new Error("YouTube URL is required");
      }

      const videoId = extractYouTubeId(url);
      const transcript = await fetchYouTubeTranscript(videoId);
      const title = input.title || `YouTube: ${videoId}`;

      return {
        rawContent: transcript,
        title,
        metadata: {
          url,
          videoId,
          extractedAt: new Date().toISOString(),
          wordCount: transcript.split(/\s+/).filter(Boolean).length,
        },
      };
    }

    case "text": {
      const content = String(input.text ?? "").trim();
      if (!content) {
        throw new Error("Text is required");
      }

      return {
        rawContent: content,
        title: input.title || "Pasted Content",
        metadata: {
          wordCount: content.split(/\s+/).filter(Boolean).length,
        },
      };
    }

    case "testimonial": {
      const content = String(input.text ?? "").trim();
      if (!content) {
        throw new Error("Testimonial text is required");
      }

      return {
        rawContent: content,
        title: input.title || "Client Testimonial",
        metadata: {
          type: "testimonial",
          wordCount: content.split(/\s+/).filter(Boolean).length,
        },
      };
    }

    default:
      throw new Error(`Unknown source type: ${String((input as { type?: unknown }).type ?? "")}`);
  }
}

function htmlToMarkdown(html: string): string {
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

  clean = clean
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractYouTubeId(url: string): string {
  const match = url.match(/(?:v=|\/)([\w-]{11})/);
  return match ? match[1] : url;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  try {
    const response = await fetch(`https://youtubetranscript.com/?server_vid2=${videoId}`);
    if (!response.ok) {
      throw new Error(`Transcript fetch failed (${response.status})`);
    }

    const xml = await response.text();
    const texts = xml.match(/<text[^>]*>(.*?)<\/text>/g)?.map((node) => node.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'")) ?? [];

    return texts.join(" ").trim();
  } catch {
    return `[YouTube transcript for ${videoId} could not be extracted. Visit: https://youtube.com/watch?v=${videoId}]`;
  }
}
