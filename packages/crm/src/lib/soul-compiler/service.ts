import { compileWebsiteToMarkdown, scrapeUrlListToMap } from "./firecrawl";
import { compileSoulWithTwoCallPattern, createByokAnthropicClient } from "./anthropic";
import { type RoutingResult, type SoulV4 } from "./schema";
import { extractFaqsFromMarkdown, type ExtractedFaq } from "./faq-extractor";
import { rankUrlsForFaqRelevance } from "./sitemap-priority";
import { stripUnsourcedFacts } from "./fact-validator";

export type SoulCompileServiceResult =
  | {
      status: "ready";
      routing: RoutingResult;
      soul: SoulV4;
      attempts: 1 | 2;
      sourceText: string;
      pagesUsed: string[];
      extractedFaqs: ExtractedFaq[];
    }
  | {
      status: "split_required";
      routing: RoutingResult;
      message: string;
      suggestedFirstWorkspace: {
        business_name: string;
        audience_type: "service" | "product";
      };
    }
  | {
      status: "error";
      code: "invalid_input" | "scrape_failed" | "compile_failed";
      message: string;
    };

export async function compileSoulService(params: {
  input: string;
  claudeApiKey: string;
  model?: string;
  autoExtractFaq?: boolean;
  /**
   * v1.47 — when true, the soul-compile prompt instructs Claude to
   * SKIP landing_page_sections, intelligence_hooks, and custom_blocks
   * generation. Used by the lean URL flow where the agency's client
   * already has a website. Default false (full mode unchanged).
   */
  lightMode?: boolean;
}): Promise<SoulCompileServiceResult> {
  const { input, claudeApiKey, model, autoExtractFaq, lightMode } = params;

  if (!input.trim()) {
    return {
      status: "error",
      code: "invalid_input",
      message: "Input (URL or description) is required",
    };
  }

  let sourceText = input.trim();
  let pagesUsed: string[] = [];

  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const compiled = await compileWebsiteToMarkdown(input);
      sourceText = compiled.markdown;
      pagesUsed = compiled.pagesUsed;

      if (
        sourceText ===
        "I couldn’t read your website automatically. Try sending me a clear description of your business instead and I’ll create the workspace from that."
      ) {
        return {
          status: "error",
          code: "scrape_failed",
          message: sourceText,
        };
      }
    } catch {
      return {
        status: "error",
        code: "scrape_failed",
        message: "Failed to scrape the provided URL. Please try a description instead.",
      };
    }
  }

  try {
    const client = createByokAnthropicClient(claudeApiKey);

    const result = await compileSoulWithTwoCallPattern({
      inputTextOrScrapedContent: sourceText,
      client,
      model,
      lightMode,
    });

    if (result.routing.split_recommendation) {
      return {
        status: "split_required",
        routing: result.routing,
        message: "Your business appears to have both service and product elements. Which one would you like to start with first?",
        suggestedFirstWorkspace: {
          business_name: result.routing.business_name,
          audience_type: result.routing.audience_type,
        },
      };
    }

    // ── FAQ-from-URL extraction (v1.45) ─────────────────────────────
    // When autoExtractFaq is requested AND the input was a URL, run a
    // three-step pipeline: sitemap-priority rank → scrape → extract.
    // Failures are tolerated (return [] FAQs rather than failing the
    // whole compile).
    let extractedFaqs: ExtractedFaq[] = [];
    if (autoExtractFaq && (input.startsWith("http://") || input.startsWith("https://"))) {
      try {
        const domain = new URL(input).hostname;
        const ranked = await rankUrlsForFaqRelevance({
          domain,
          apiKey: claudeApiKey,
          limit: 10,
        });
        const markdownByUrl = await scrapeUrlListToMap(ranked.map((r) => r.url));
        if (Object.keys(markdownByUrl).length > 0) {
          extractedFaqs = await extractFaqsFromMarkdown({
            markdownByUrl,
            apiKey: claudeApiKey,
          });
        }
      } catch {
        // tolerate; ship with empty extracted FAQ
        extractedFaqs = [];
      }
    }

    // v1.47 — strip hallucinated license numbers / review counts that
    // don't appear in the source. Conservative: only targets 3+ digit
    // numbers in tagline + soul_description. Pricing in booking_config /
    // pricing_config stays untouched (legitimate operator data).
    const scrubbed = stripUnsourcedFacts({
      tagline: result.soul.tagline,
      soulDescription: result.soul.soul_description,
      sourceMarkdown: sourceText,
    });

    const scrubbedSoul = {
      ...result.soul,
      tagline: scrubbed.tagline,
      soul_description: scrubbed.soulDescription,
    };

    return {
      status: "ready",
      routing: result.routing,
      soul: extractedFaqs.length > 0
        ? { ...scrubbedSoul, faqs: extractedFaqs }
        : scrubbedSoul,
      attempts: result.attempts,
      sourceText,
      pagesUsed,
      extractedFaqs,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compile soul. Please try again or simplify the description.";

    return {
      status: "error",
      code: "compile_failed",
      message,
    };
  }
}
