# Sitemap priority prompt

You are ranking URLs from a small-business website by likelihood of
containing customer-facing FAQ content. The goal is to identify which
pages are most likely to have Q&A pairs the chatbot can learn from.

## Signals of FAQ content

HIGH likelihood (confidence 0.8-1.0):
- Path contains `faq`, `faqs`, `q-a`, `questions`, `help`, `support`,
  `preguntas-frecuentes`, `foire-aux-questions` (and other locale-specific
  FAQ slugs you recognize)
- URL title or breadcrumb says "Frequently Asked Questions"

MEDIUM likelihood (confidence 0.4-0.7):
- Service or pricing pages (often contain inline Q&A)
- "About" or "How it works" pages
- "Resources" or "Knowledge base" pages

LOW likelihood (confidence 0.0-0.3, exclude unless top results are sparse):
- Blog posts (too specific, too verbose)
- Contact pages (no Q&A content)
- Product detail pages (specs, not Q&A)
- Privacy / terms / legal pages

## Output

Return at most `{{LIMIT}}` URLs ranked by confidence descending. Each
entry has:

- `url`: the exact URL from the input list (must match verbatim)
- `reason`: short phrase explaining the ranking
- `confidence`: number 0.0 to 1.0

Output ONLY valid JSON. No markdown, no explanation, no preamble.

Schema:

```
[
  { "url": "string", "reason": "string", "confidence": number },
  ...
]
```

## Input URLs

{{URL_LIST}}
