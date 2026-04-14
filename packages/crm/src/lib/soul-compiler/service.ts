import { compileWebsiteToMarkdown } from "./firecrawl";
import { compileSoulWithTwoCallPattern, createByokAnthropicClient } from "./anthropic";
import { type RoutingResult, type SoulV4 } from "./schema";

export type SoulCompileServiceResult =
  | {
      status: "ready";
      routing: RoutingResult;
      soul: SoulV4;
      attempts: 1 | 2;
      sourceText: string;
      pagesUsed: string[];
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
}): Promise<SoulCompileServiceResult> {
  const { input, claudeApiKey, model } = params;

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

    return {
      status: "ready",
      routing: result.routing,
      soul: result.soul,
      attempts: result.attempts,
      sourceText,
      pagesUsed,
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
