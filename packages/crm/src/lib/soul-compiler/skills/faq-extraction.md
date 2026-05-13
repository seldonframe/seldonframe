# FAQ extraction prompt

You are extracting customer-facing FAQ Q&A pairs from a scraped business
website. The markdown below has been concatenated from multiple pages on
the site; each page is delimited by `=== SOURCE: <url> ===` headers.

## Your task

For each clear question-answer pair in the markdown, output a JSON object
with these exact fields:

- `q`: the question, as a complete sentence ending in `?`. 3-200 characters.
- `a`: the answer, as one or more complete sentences. 3-800 characters.
- `sourceUrl`: the exact URL from the `=== SOURCE: ===` header of the page
  the pair was extracted from. Must be one of the URLs listed below.

## What counts as an FAQ pair

INCLUDE:
- Explicit `Q: ... A: ...` patterns
- `<details>` / accordion sections with question-shaped headings
- Bold or heading-formatted questions immediately followed by an answer
- Numbered "Frequently asked" sections

EXCLUDE:
- Service descriptions paraphrased as questions ("What is drain cleaning?
  Drain cleaning is...") — these are services pages, not FAQ
- Marketing copy phrased as rhetorical questions ("Tired of clogged drains?
  Call us!") — these have no real answer content
- Contact-form prompts ("Have a question? Get in touch.")
- Generic placeholder text that doesn't address a specific topic

## Constraints

- DO NOT invent questions or answers not present in the markdown.
- DO NOT paraphrase the source — quote answers verbatim or with minimal
  reformatting only.
- DO NOT include `sourceUrl` values not present in the `=== SOURCE: ===`
  headers below.
- If you find no FAQ-shaped content, return `[]`.

## Output format

Output ONLY valid JSON. No markdown fences, no explanation, no preamble.

Schema:

```
[
  { "q": "string", "a": "string", "sourceUrl": "string" },
  ...
]
```

## Source markdown

{{MARKDOWN}}
