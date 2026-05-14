// packages/crm/src/lib/soul-compiler/service.ts
//
// 2026-05-14 — URL branch removed (moved to CC client via the new
// /extract-instructions endpoint + repurposed create_workspace_from_url
// MCP tool). compileSoulService now only handles description input.
// scrape_failed error code removed (no scraping possible).
//
// Spec: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md

import { compileSoulWithTwoCallPattern, createByokAnthropicClient } from "./anthropic";
import { type RoutingResult, type SoulV4 } from "./schema";

export type SoulCompileServiceResult =
  | {
      status: "ready";
      routing: RoutingResult;
      soul: SoulV4;
      attempts: number;
      sourceText: string;
      pagesUsed: string[];
    }
  | {
      status: "split_required";
      routing: RoutingResult;
      message: string;
      suggestedFirstWorkspace: {
        business_name: string;
        audience_type: string;
      };
    }
  | {
      status: "error";
      code: "invalid_input" | "compile_failed";
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
      message: "Input (description) is required",
    };
  }

  // URL inputs are no longer accepted on this service. They're routed at
  // the MCP-tool layer (create_workspace_from_url → extract-instructions →
  // Claude WebFetch → create_workspace_v2). Reject explicitly so older
  // callers get a clear error rather than a soul compiled from a URL string.
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return {
      status: "error",
      code: "invalid_input",
      message:
        "URL inputs are no longer supported by compileSoulService. The URL flow moved to the MCP client; this service compiles description text only.",
    };
  }

  const sourceText = input.trim();

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
        message:
          "Your business appears to have both service and product elements. Which one would you like to start with first?",
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
      pagesUsed: [],
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to compile soul. Please try again or simplify the description.";

    return {
      status: "error",
      code: "compile_failed",
      message,
    };
  }
}
