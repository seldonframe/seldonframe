"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type WizardStep = 1 | 2 | 3 | 4 | 5;

type BlockType = "page" | "form" | "email" | "booking";

type BlockOption = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  templateType: BlockType;
};

const NICHES = [
  "coaching",
  "agency",
  "therapy",
  "fitness",
  "real-estate",
  "saas",
  "education",
  "other",
] as const;

const FONTS = ["DM Sans", "Inter", "Poppins", "Space Grotesk", "Playfair Display"];

const FEED_TYPES = ["URL", "YouTube", "Text", "Testimonial"];

export default function NewSoulStudioPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [niche, setNiche] = useState<(typeof NICHES)[number]>("coaching");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [price, setPrice] = useState("0");

  const [feedType, setFeedType] = useState<(typeof FEED_TYPES)[number]>("URL");
  const [feedInput, setFeedInput] = useState("");
  const [feedItems, setFeedItems] = useState<Array<{ type: string; value: string }>>([]);

  const [primaryColor, setPrimaryColor] = useState("#14b8a6");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [fontFamily, setFontFamily] = useState(FONTS[0]);
  const [borderRadius, setBorderRadius] = useState(8);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [logoUrl, setLogoUrl] = useState("");

  const [blockOptions, setBlockOptions] = useState<BlockOption[]>([
    { id: "landing", label: "Landing Page", description: "Main marketing page", enabled: true, templateType: "page" },
    { id: "intake", label: "Intake Form", description: "Lead capture / qualification quiz", enabled: true, templateType: "form" },
    { id: "welcome-email", label: "Welcome Email", description: "Sent to new contacts", enabled: true, templateType: "email" },
    { id: "booking", label: "Booking Page", description: "Schedule calls or sessions", enabled: false, templateType: "booking" },
    { id: "services", label: "Services Page", description: "Detailed service listings", enabled: false, templateType: "page" },
    { id: "faq", label: "FAQ Page", description: "Common questions", enabled: false, templateType: "page" },
  ]);

  const [compileProgress, setCompileProgress] = useState(0);
  const [listingId, setListingId] = useState("");
  const [publishError, setPublishError] = useState("");

  const includedBlocks = useMemo(() => blockOptions.filter((b) => b.enabled), [blockOptions]);

  const canGoNext =
    (step === 1 && name.trim().length > 1 && description.trim().length > 0) ||
    (step === 2 && feedItems.length > 0) ||
    (step === 3 && primaryColor && accentColor) ||
    (step === 4 && includedBlocks.length > 0) ||
    step === 5;

  function toggleBlock(id: string) {
    setBlockOptions((prev) => prev.map((block) => (block.id === id ? { ...block, enabled: !block.enabled } : block)));
  }

  function addFeedItem() {
    const value = feedInput.trim();
    if (!value) {
      return;
    }

    setFeedItems((prev) => [...prev, { type: feedType, value }]);
    setFeedInput("");
  }

  function removeFeedItem(index: number) {
    setFeedItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function runCompileSimulation() {
    setCompileProgress(0);
    for (let i = 1; i <= 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      setCompileProgress(i);
    }
  }

  async function saveListingDraft() {
    const templatePayload = includedBlocks.map((block, index) => ({
      type: block.templateType,
      name: block.label,
      slug: `${slugify(name)}-${slugify(block.id)}-${index + 1}`,
      description: block.description,
      data: {
        generatedBy: "studio-wizard",
        summary: `${block.label} template for ${name}`,
      },
    }));

    const response = await fetch("/api/v1/marketplace/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        niche,
        description,
        longDescription,
        price: Number(price || 0),
        tags: [niche, ...feedItems.map((item) => item.type.toLowerCase())],
        soulPackage: {
          version: "1.0",
          meta: {
            name,
            slug: slugify(name),
            description,
            longDescription,
            niche,
            tags: [niche],
            creatorName: "Creator",
            previewImages: [],
          },
          soul: {
            industry: niche,
            customContext: `Knowledge sources: ${feedItems.map((item) => `${item.type}: ${item.value}`).join(" | ")}`,
            framework: niche,
          },
          wiki: {
            articles: [
              {
                slug: "identity",
                title: `${name} Identity`,
                category: "identity",
                content: `# ${name}\n\n${description}`,
              },
            ],
          },
          theme: {
            primaryColor,
            accentColor,
            fontFamily,
            borderRadius: `${borderRadius}px`,
            mode,
            ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
          },
          blocks: {
            templates: templatePayload,
          },
        },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || "Failed to create listing");
    }

    const listing = (await response.json()) as { id: string };
    return listing.id;
  }

  function next() {
    if (!canGoNext) {
      return;
    }

    if (step < 5) {
      setStep((prev) => (prev + 1) as WizardStep);
    }
  }

  function previous() {
    if (step > 1) {
      setStep((prev) => (prev - 1) as WizardStep);
    }
  }

  function publish() {
    startTransition(async () => {
      try {
        setPublishError("");
        await runCompileSimulation();
        const id = listingId || (await saveListingDraft());
        setListingId(id);

        const publishRes = await fetch(`/api/v1/marketplace/listings/${id}/publish`, {
          method: "POST",
        });

        if (!publishRes.ok) {
          const payload = (await publishRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Failed to publish listing");
        }

        router.push("/studio");
      } catch (error) {
        setPublishError(error instanceof Error ? error.message : "Failed to publish soul");
      }
    });
  }

  return (
    <section className="animate-page-enter space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Create New Soul</h1>
        <p className="text-sm sm:text-base text-muted-foreground">A simple wizard to build and publish a marketplace-ready soul package.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-3">
            <h2 className="text-card-title">Step 1: Basics</h2>
            <input className="crm-input h-10 w-full px-3" placeholder="Soul Name" value={name} onChange={(event) => setName(event.target.value)} />
            <select className="crm-input h-10 w-full px-3" value={niche} onChange={(event) => setNiche(event.target.value as (typeof NICHES)[number])}>
              {NICHES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input className="crm-input h-10 w-full px-3" placeholder="One-line description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <textarea className="crm-input min-h-24 w-full p-3" placeholder="Long description (optional)" value={longDescription} onChange={(event) => setLongDescription(event.target.value)} />
            <input className="crm-input h-10 w-full px-3" type="number" min="0" step="1" placeholder="Price (USD)" value={price} onChange={(event) => setPrice(event.target.value)} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <h2 className="text-card-title">Step 2: Feed It</h2>
            <p className="text-sm text-muted-foreground">Paste websites, videos, and text examples for this niche.</p>
            <div className="flex gap-2">
              {FEED_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`crm-button-secondary h-8 px-3 ${feedType === type ? "border-primary text-foreground" : ""}`}
                  onClick={() => setFeedType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="crm-input h-10 flex-1 px-3" placeholder={`Add ${feedType} source`} value={feedInput} onChange={(event) => setFeedInput(event.target.value)} />
              <button type="button" className="crm-button-primary h-10 px-4" onClick={addFeedItem}>
                Add
              </button>
            </div>
            <div className="space-y-2">
              {feedItems.map((item, index) => (
                <div key={`${item.type}-${index}`} className="rounded-md border p-2 text-sm flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{item.type}:</span>
                  <span className="flex-1 truncate">{item.value}</span>
                  <button type="button" className="crm-button-ghost h-7 px-2" onClick={() => removeFeedItem(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {compileProgress > 0 ? (
              <p className="text-xs text-muted-foreground">Compiling knowledge... {compileProgress}/8 articles done</p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <h2 className="text-card-title">Step 3: Theme</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                Primary Color
                <input type="color" className="mt-1 h-10 w-full" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} />
              </label>
              <label className="text-sm text-muted-foreground">
                Accent Color
                <input type="color" className="mt-1 h-10 w-full" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
              </label>
              <label className="text-sm text-muted-foreground">
                Font
                <select className="crm-input mt-1 h-10 w-full px-3" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
                  {FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Mode
                <select className="crm-input mt-1 h-10 w-full px-3" value={mode} onChange={(event) => setMode(event.target.value as "light" | "dark")}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
            <label className="text-sm text-muted-foreground block">
              Border Radius: {borderRadius}px
              <input type="range" min={0} max={16} value={borderRadius} onChange={(event) => setBorderRadius(Number(event.target.value))} className="mt-1 w-full" />
            </label>
            <input className="crm-input h-10 w-full px-3" placeholder="Logo URL (optional)" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} />
            <div className="rounded-lg border p-4" style={{ borderColor: primaryColor }}>
              <p className="text-sm" style={{ color: mode === "dark" ? "#e2e8f0" : "#0f172a", fontFamily }}>
                Mini Preview — {name || "Your Soul"}
              </p>
              <button type="button" className="mt-3 rounded px-3 py-1 text-xs text-white" style={{ backgroundColor: accentColor, borderRadius: `${borderRadius}px` }}>
                Call to Action
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <h2 className="text-card-title">Step 4: Generate Blocks</h2>
            <p className="text-sm text-muted-foreground">Choose which blocks this soul should include.</p>
            <div className="space-y-2">
              {blockOptions.map((block) => (
                <label key={block.id} className="rounded-md border p-3 flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={block.enabled} onChange={() => toggleBlock(block.id)} className="mt-1" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{block.label}</p>
                    <p className="text-xs text-muted-foreground">{block.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3">
            <h2 className="text-card-title">Step 5: Preview & Publish</h2>
            <div className="rounded-md border p-3 text-sm text-muted-foreground space-y-1">
              <p>
                <span className="text-foreground font-medium">Name:</span> {name}
              </p>
              <p>
                <span className="text-foreground font-medium">Niche:</span> {niche}
              </p>
              <p>
                <span className="text-foreground font-medium">Price:</span> ${Number(price || 0).toFixed(0)}
              </p>
              <p>
                <span className="text-foreground font-medium">Blocks:</span> {includedBlocks.map((b) => b.label).join(", ")}
              </p>
            </div>
            {publishError ? <p className="text-sm text-destructive">{publishError}</p> : null}
            <button type="button" className="crm-button-primary h-10 px-5" disabled={pending} onClick={publish}>
              {pending ? "Publishing..." : "Publish to Marketplace"}
            </button>
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          <button type="button" className="crm-button-secondary h-9 px-3" onClick={previous} disabled={step === 1 || pending}>
            Back
          </button>
          <button type="button" className="crm-button-primary h-9 px-3" onClick={next} disabled={!canGoNext || step === 5 || pending}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}
