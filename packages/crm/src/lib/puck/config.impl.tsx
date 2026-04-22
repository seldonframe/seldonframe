"use client";

// Puck editor component config — the React rendering layer. Uses
// client-only hooks (useState, useEffect) inside component render
// functions, so this file is a client boundary per Next.js App Router.
//
// Server-runtime importers must NOT reach this file. Use
// `./config-fields.ts` instead — it mirrors the fields structure as
// pure data (no React) so server code can validate Puck payloads
// without pulling React hooks into the server bundle.
//
// Fix landed 2026-04-21 after the Turbopack build flagged the
// transitive import chain: self-service/route.ts → seldon-actions.ts →
// landing/actions.ts → landing/api.ts → puck/validator.ts →
// puck/config.impl.tsx. Breaking the chain: validator.ts + generate-
// with-claude.ts now import from config-fields.ts; `"use client"` on
// this file is the explicit boundary marker so a future accidental
// server import fails with a clear "cannot import client module" error
// at the importing file, not a confusing hook-in-server error here.

import React, { useState, useEffect } from "react";
import type { Config } from "@puckeditor/core";
import {
  Check,
  Star,
  ArrowRight,
  Heart,
  Shield,
  Zap,
  Clock,
  MapPin,
  Mail,
  Phone,
  ChevronRight,
  Play,
  Users,
  Calendar,
  CreditCard,
  Lock,
  Loader2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";


import { componentFieldRegistry } from "./config-fields";

const icons = {
  check: Check,
  star: Star,
  arrow: ArrowRight,
  heart: Heart,
  shield: Shield,
  zap: Zap,
  clock: Clock,
  mapPin: MapPin,
  mail: Mail,
  phone: Phone,
  chevronRight: ChevronRight,
  play: Play,
  users: Users,
  calendar: Calendar,
  creditCard: CreditCard,
  lock: Lock,
};

type IconName = keyof typeof icons;

const subtleBg = (varName: string) => ({
  backgroundColor: `color-mix(in srgb, var(${varName}), transparent 90%)`,
});

export const puckConfig: Config = {
  categories: {
    layout: { components: ["Hero", "Section", "TwoColumn", "Grid", "Divider"] },
    content: { components: ["Heading", "RichText", "Image", "Video", "Spacer", "IconText"] },
    forms: {
      components: ["FormContainer", "TextInput", "EmailInput", "TextAreaInput", "SelectInput", "ScoreSelect", "CheckboxInput"],
    },
    business: {
      components: ["ServiceCard", "PricingTable", "TestimonialCard", "FAQ", "TeamMember", "ContactInfo", "LogoBar", "CountdownTimer"],
    },
    interactive: { components: ["BookingWidget", "PaymentButton", "ProgressBar", "ConditionalBlock", "GatedContent", "QuizResults"] },
  },

  components: {
    Hero: {
      label: "Hero",
      fields: componentFieldRegistry.Hero.fields,
      defaultProps: {
        headline: "Premium Business OS",
        subheadline: "Build your entire service business on a foundation of speed and elegance.",
        ctaText: "Get Started",
        ctaLink: "#",
        alignment: "center",
        showCta: "yes",
      },
      render: ({ headline, subheadline, ctaText, ctaLink, alignment, showCta }) => (
        <section
          className={`py-24 md:py-32 px-6 flex flex-col ${alignment === "center" ? "items-center text-center" : "items-start text-left"}`}
          style={{ fontFamily: "var(--sf-font)", color: "var(--sf-text)" }}
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">{headline}</h1>
          <p className="max-w-2xl text-xl md:text-2xl mb-10 opacity-80" style={{ color: "var(--sf-muted)" }}>
            {subheadline}
          </p>
          {showCta === "yes" && (
            <Button size="lg" className="px-8 h-12 text-lg" style={{ backgroundColor: "var(--sf-primary)", borderRadius: "var(--sf-radius)" }}>
              <a href={ctaLink}>{ctaText}</a>
            </Button>
          )}
        </section>
      ),
    },

    Section: {
      label: "Section",
      fields: componentFieldRegistry.Section.fields,
      defaultProps: {
        heading: "Section Heading",
        description: "Add a brief description.",
        backgroundColor: "transparent",
        paddingY: "py-16",
      },
      render: ({ heading, description, backgroundColor, paddingY, content }) => {
        const bgStyle =
          backgroundColor === "subtle"
            ? subtleBg("--sf-muted")
            : backgroundColor === "primary"
              ? { backgroundColor: "var(--sf-primary)", color: "white" }
              : {};
        return (
          <section className={`${paddingY} px-6`} style={bgStyle}>
            <div className="max-w-7xl mx-auto">
              {(heading || description) && (
                <div className="mb-12 text-center">
                  <span
                    className="uppercase tracking-widest text-xs font-semibold"
                    style={{ color: backgroundColor === "primary" ? "white" : "var(--sf-primary)" }}
                  >
                    {heading}
                  </span>
                  <p className="mt-4 text-lg max-w-2xl mx-auto opacity-70">{description}</p>
                </div>
              )}
              {content}
            </div>
          </section>
        );
      },
    },

    TwoColumn: {
      label: "Two Column",
      fields: componentFieldRegistry.TwoColumn.fields,
      defaultProps: { ratio: "md:grid-cols-2", gap: "gap-8", reverseOnMobile: "" },
      render: ({ ratio, gap, reverseOnMobile, left, right }) => (
        <div className={`grid grid-cols-1 ${ratio} ${gap} ${reverseOnMobile} items-center py-8`}>
          <div>{left}</div>
          <div>{right}</div>
        </div>
      ),
    },

    Grid: {
      label: "Grid",
      fields: componentFieldRegistry.Grid.fields,
      defaultProps: { columns: "md:grid-cols-3", gap: "gap-8" },
      render: ({ columns, gap, content }) => <div className={`grid grid-cols-1 ${columns} ${gap} py-8`}>{content}</div>,
    },

    Divider: {
      label: "Divider",
      fields: componentFieldRegistry.Divider.fields,
      defaultProps: { style: "border-solid", spacing: "my-8" },
      render: ({ style, spacing }) =>
        style === "gradient" ? (
          <div className={`${spacing} h-[1px] w-full`} style={{ background: "linear-gradient(to right, transparent, var(--sf-border), transparent)" }} />
        ) : (
          <hr className={`${spacing} ${style} border-t`} style={{ borderColor: "var(--sf-border)" }} />
        ),
    },

    Heading: {
      label: "Heading",
      fields: componentFieldRegistry.Heading.fields,
      defaultProps: { text: "Headline", level: "h2", alignment: "text-left" },
      render: ({ text, level, alignment }) => {
        const Tag = level as React.ElementType;
        const sizes = {
          h1: "text-4xl md:text-5xl font-bold",
          h2: "text-3xl font-semibold",
          h3: "text-2xl font-semibold",
          h4: "text-xl font-medium",
        };
        return (
          <Tag className={`${sizes[level as keyof typeof sizes]} ${alignment}`} style={{ color: "var(--sf-text)" }}>
            {text}
          </Tag>
        );
      },
    },

    RichText: {
      label: "Rich Text",
      fields: componentFieldRegistry.RichText.fields,
      defaultProps: { content: "<p>Standard body text...</p>" },
      render: ({ content }) => (
        <div
          className="prose prose-slate max-w-none prose-a:text-[var(--sf-primary)]"
          style={{ color: "var(--sf-text)", lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ),
    },

    Image: {
      label: "Image",
      fields: componentFieldRegistry.Image.fields,
      defaultProps: {
        src: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1000",
        alt: "Office",
        width: "max-w-2xl",
        rounded: "yes",
      },
      render: ({ src, alt, caption, width, rounded }) => (
        <div className={`mx-auto ${width}`}>
          <img src={src} alt={alt} className="w-full h-auto" style={{ borderRadius: rounded === "yes" ? "var(--sf-radius)" : "0" }} />
          {caption && (
            <p className="mt-2 text-center text-sm" style={{ color: "var(--sf-muted)" }}>
              {caption}
            </p>
          )}
        </div>
      ),
    },

    Video: {
      label: "Video",
      fields: componentFieldRegistry.Video.fields,
      defaultProps: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Product Walkthrough", aspectRatio: "aspect-video" },
      render: ({ url, title, aspectRatio }) => {
        const id = url.split("v=")[1]?.split("&")[0] || url.split("/").pop();
        const embed = url.includes("youtube") ? `https://www.youtube.com/embed/${id}` : url;
        return (
          <div className="w-full">
            {title && (
              <p className="mb-2 text-sm font-medium" style={{ color: "var(--sf-muted)" }}>
                {title}
              </p>
            )}
            <iframe src={embed} className={`w-full ${aspectRatio} shadow-lg`} style={{ borderRadius: "var(--sf-radius)" }} allowFullScreen />
          </div>
        );
      },
    },

    Spacer: {
      label: "Spacer",
      fields: componentFieldRegistry.Spacer.fields,
      defaultProps: { height: "h-12" },
      render: ({ height }) => <div className={height} />,
    },

    IconText: {
      label: "Icon Text",
      fields: componentFieldRegistry.IconText.fields,
      defaultProps: { icon: "zap", title: "Feature Title", description: "Feature description goes here.", layout: "flex-row" },
      render: ({ icon, title, description, layout }) => {
        const Icon = icons[icon as IconName] || Zap;
        return (
          <div className={`flex ${layout} ${layout === "flex-row" ? "items-start gap-4" : "items-center text-center gap-3"} py-4`}>
            <div className="p-3 shrink-0" style={{ ...subtleBg("--sf-primary"), borderRadius: "var(--sf-radius)", color: "var(--sf-primary)" }}>
              <Icon size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-lg">{title}</h4>
              <p className="mt-1" style={{ color: "var(--sf-muted)" }}>
                {description}
              </p>
            </div>
          </div>
        );
      },
    },

    FormContainer: {
      label: "Form Container",
      fields: componentFieldRegistry.FormContainer.fields,
      defaultProps: {
        formName: "Lead Capture",
        submitButtonText: "Submit",
        successMessage: "Sent!",
        enableScoring: "none",
        scoreThreshold: 10,
        qualifiedRedirectUrl: "",
        unqualifiedRedirectUrl: "",
      },
      render: ({ formName, submitButtonText, successMessage, enableScoring, scoreThreshold, qualifiedRedirectUrl, unqualifiedRedirectUrl, content, puck }) => {
        const [loading, setLoading] = useState(false);
        const [done, setDone] = useState(false);

        const withScoreParam = (url: string, score: number) => {
          try {
            const parsed = new URL(url, window.location.origin);
            parsed.searchParams.set("score", String(score));
            return url.startsWith("http") ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
          } catch {
            return url;
          }
        };

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setLoading(true);
          const form = e.target as HTMLFormElement;
          const formData = new FormData(form);
          const data = Object.fromEntries(formData.entries()) as Record<string, unknown>;

          for (const element of Array.from(form.elements)) {
            if (!(element instanceof HTMLSelectElement)) {
              continue;
            }

            if (!element.name) {
              continue;
            }

            const selected = element.selectedOptions?.[0];
            const rawPoints = selected?.getAttribute("data-points");

            if (!rawPoints) {
              continue;
            }

            const points = Number(rawPoints);
            if (!Number.isFinite(points)) {
              continue;
            }

            data[element.name] = {
              value: element.value,
              points,
            };
          }

          try {
            const response = await fetch("/api/v1/forms/submit", {
              method: "POST",
              body: JSON.stringify({ formName, data, orgId: (puck as { metadata?: { orgId?: string } } | undefined)?.metadata?.orgId }),
              headers: { "Content-Type": "application/json" },
            });

            const payload = (await response.json().catch(() => ({}))) as { score?: number };
            const score = Number(payload?.score ?? 0);

            if (enableScoring === "score") {
              const target = score >= Number(scoreThreshold ?? 0) ? qualifiedRedirectUrl : unqualifiedRedirectUrl;
              if (typeof target === "string" && target.trim().length > 0) {
                window.location.assign(withScoreParam(target.trim(), score));
                return;
              }
            }

            setDone(true);
          } catch (err) {
            console.error(err);
          } finally {
            setLoading(false);
          }
        };

        if (done) return <div className="p-8 text-center font-bold text-green-600">{successMessage}</div>;

        return (
          <Card className="w-full border shadow-sm" style={{ borderRadius: "var(--sf-radius)", backgroundColor: "var(--sf-card-bg)" }}>
            <CardContent className="pt-6">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {content}
                <Button disabled={loading} className="w-full mt-6 h-11" style={{ backgroundColor: "var(--sf-primary)" }}>
                  {loading ? <Loader2 className="animate-spin" /> : submitButtonText}
                </Button>
              </form>
            </CardContent>
          </Card>
        );
      },
    },

    TextInput: {
      label: "Text Input",
      fields: componentFieldRegistry.TextInput.fields,
      defaultProps: { label: "Label", placeholder: "Enter text...", fieldName: "field", required: "no" },
      render: ({ label, placeholder, fieldName, required }) => (
        <div className="space-y-2">
          <Label>
            {label} {required === "yes" && "*"}
          </Label>
          <Input name={fieldName} placeholder={placeholder} required={required === "yes"} />
        </div>
      ),
    },

    EmailInput: {
      label: "Email Input",
      fields: componentFieldRegistry.EmailInput.fields,
      defaultProps: { label: "Email", fieldName: "email" },
      render: ({ label, fieldName }) => (
        <div className="space-y-2">
          <Label>{label}</Label>
          <Input type="email" name={fieldName} placeholder="you@example.com" required />
        </div>
      ),
    },

    TextAreaInput: {
      label: "TextArea Input",
      fields: componentFieldRegistry.TextAreaInput.fields,
      defaultProps: { label: "Message", fieldName: "message", rows: 4 },
      render: ({ label, fieldName, rows }) => (
        <div className="space-y-2">
          <Label>{label}</Label>
          <Textarea name={fieldName} rows={rows} />
        </div>
      ),
    },

    SelectInput: {
      label: "Select Input",
      fields: componentFieldRegistry.SelectInput.fields,
      defaultProps: { label: "Choose", fieldName: "choice", options: [{ label: "Option 1", value: "1" }] },
      render: ({ label, fieldName, options }) => (
        <div className="space-y-2">
          <Label>{label}</Label>
          <Select name={fieldName}>
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options?.map((o: { label: string; value: string }, i: number) => (
                <SelectItem key={i} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },

    ScoreSelect: {
      label: "Score Select",
      fields: componentFieldRegistry.ScoreSelect.fields,
      defaultProps: {
        label: "How ready are you?",
        fieldName: "readiness",
        required: "yes",
        options: [
          { label: "Not ready", value: "not_ready", points: 0 },
          { label: "Somewhat ready", value: "somewhat_ready", points: 5 },
          { label: "Very ready", value: "very_ready", points: 10 },
        ],
      },
      render: ({ label, fieldName, required, options }) => (
        <div className="space-y-2">
          <Label>
            {label}
            {required === "yes" ? " *" : ""}
          </Label>
          <select name={fieldName} required={required === "yes"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Select...</option>
            {options?.map((o: { label: string; value: string; points: number }, i: number) => (
              <option key={i} value={o.value} data-points={o.points}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ),
    },

    CheckboxInput: {
      label: "Checkbox",
      fields: componentFieldRegistry.CheckboxInput.fields,
      render: ({ label, description, fieldName }) => (
        <div className="flex items-start gap-3">
          <Checkbox name={fieldName} id={fieldName} />
          <div className="grid gap-1.5 leading-none">
            <label htmlFor={fieldName} className="text-sm font-medium">
              {label}
            </label>
            <p className="text-sm opacity-60">{description}</p>
          </div>
        </div>
      ),
    },

    ServiceCard: {
      label: "Service Card",
      fields: componentFieldRegistry.ServiceCard.fields,
      defaultProps: { name: "Service", description: "Details...", price: "$99", duration: "1hr", ctaText: "Book" },
      render: ({ name, description, price, duration, ctaText }) => (
        <Card style={{ backgroundColor: "var(--sf-card-bg)" }}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle>{name}</CardTitle>
              <Badge>{duration}</Badge>
            </div>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" style={{ color: "var(--sf-primary)" }}>
              {price}
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" style={{ backgroundColor: "var(--sf-primary)" }}>
              {ctaText}
            </Button>
          </CardFooter>
        </Card>
      ),
    },

    PricingTable: {
      label: "Pricing Table",
      fields: componentFieldRegistry.PricingTable.fields,
      render: ({ plans = [] }) => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
          {plans.map((p: any, i: number) => (
            <Card key={i} className={p.highlighted === "yes" ? "border-2" : ""} style={{ borderColor: p.highlighted === "yes" ? "var(--sf-primary)" : "var(--sf-border)" }}>
              <CardHeader className="text-center">
                <CardTitle>{p.name}</CardTitle>
                <div className="text-3xl font-bold mt-2">
                  {p.price}
                  <span className="text-sm opacity-50">{p.period}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {p.features?.map((f: any, j: number) => (
                    <li key={j} className="text-sm flex gap-2">
                      <Check size={14} className="text-green-500" />
                      {f.text}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={p.highlighted === "yes" ? "default" : "outline"} style={p.highlighted === "yes" ? { backgroundColor: "var(--sf-primary)" } : {}}>
                  {p.ctaText}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ),
    },

    TestimonialCard: {
      label: "Testimonial",
      fields: componentFieldRegistry.TestimonialCard.fields,
      render: ({ quote, authorName, authorRole, rating }) => (
        <Card className="border-none shadow-sm" style={{ backgroundColor: "var(--sf-card-bg)" }}>
          <CardContent className="pt-8">
            <div className="flex gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} fill={i < (rating || 5) ? "var(--sf-primary)" : "none"} stroke="var(--sf-primary)" />
              ))}
            </div>
            <p className="text-lg italic mb-6">"{quote}"</p>
            <div>
              <p className="font-semibold">{authorName}</p>
              <p className="text-sm opacity-60">{authorRole}</p>
            </div>
          </CardContent>
        </Card>
      ),
    },

    FAQ: {
      label: "FAQ",
      fields: componentFieldRegistry.FAQ.fields,
      render: ({ items = [] }) => (
        <Accordion className="w-full">
          {items.map((item: any, i: number) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ),
    },

    TeamMember: {
      label: "Team Member",
      fields: componentFieldRegistry.TeamMember.fields,
      render: ({ name, role, photoUrl }) => (
        <div className="text-center p-6 border shadow-sm rounded-xl bg-card">
          <div className="w-24 h-24 mx-auto mb-4 overflow-hidden rounded-full bg-slate-100 flex items-center justify-center">
            {photoUrl ? <img src={photoUrl} className="w-full h-full object-cover" /> : <Users size={40} className="text-slate-300" />}
          </div>
          <h4 className="font-bold">{name}</h4>
          <p className="text-sm" style={{ color: "var(--sf-primary)" }}>
            {role}
          </p>
        </div>
      ),
    },

    ContactInfo: {
      label: "Contact Info",
      fields: componentFieldRegistry.ContactInfo.fields,
      render: ({ email, phone, address }) => (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail style={{ color: "var(--sf-primary)" }} />
            <span>{email}</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone style={{ color: "var(--sf-primary)" }} />
            <span>{phone}</span>
          </div>
          <div className="flex items-start gap-3">
            <MapPin style={{ color: "var(--sf-primary)" }} />
            <span>{address}</span>
          </div>
        </div>
      ),
    },

    LogoBar: {
      label: "Logo Bar",
      fields: componentFieldRegistry.LogoBar.fields,
      render: ({ heading, logos = [] }) => (
        <div className="py-12 text-center">
          <p className="uppercase text-xs font-bold tracking-widest mb-8 opacity-50">{heading}</p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-40 grayscale">
            {logos.map((l: any, i: number) => (
              <img key={i} src={l.src} className="h-8" />
            ))}
          </div>
        </div>
      ),
    },

    CountdownTimer: {
      label: "Countdown",
      fields: componentFieldRegistry.CountdownTimer.fields,
      render: ({ targetDate, heading }) => {
        const [time, setTime] = useState({ d: 0, h: 0, m: 0, s: 0 });
        useEffect(() => {
          const interval = setInterval(() => {
            const diff = new Date(targetDate).getTime() - Date.now();
            if (diff <= 0) {
              clearInterval(interval);
              return;
            }
            setTime({
              d: Math.floor(diff / 8.64e7),
              h: Math.floor((diff % 8.64e7) / 3.6e6),
              m: Math.floor((diff % 3.6e6) / 6e4),
              s: Math.floor((diff % 6e4) / 1000),
            });
          }, 1000);
          return () => clearInterval(interval);
        }, [targetDate]);
        return (
          <div className="text-center py-8">
            <h3 className="text-xl font-bold mb-6">{heading}</h3>
            <div className="flex justify-center gap-4">
              {[ ["Days", time.d], ["Hours", time.h], ["Mins", time.m], ["Secs", time.s] ].map(([l, v], i) => (
                <div key={i}>
                  <div className="w-16 h-16 flex items-center justify-center text-2xl font-bold rounded-lg border bg-card">{v as number}</div>
                  <span className="text-xs uppercase mt-2 block opacity-50">{l as string}</span>
                </div>
              ))}
            </div>
          </div>
        );
      },
    },

    BookingWidget: {
      label: "Booking",
      fields: componentFieldRegistry.BookingWidget.fields,
      render: ({ heading, bookingUrl, buttonText }) => (
        <Card className="text-center p-8 border-2 border-dashed">
          <Calendar className="mx-auto mb-4" size={40} style={{ color: "var(--sf-primary)" }} />
          <h3 className="text-xl font-bold mb-6">{heading}</h3>
          <Button size="lg" style={{ backgroundColor: "var(--sf-primary)" }}>
            <a href={bookingUrl}>{buttonText}</a>
          </Button>
        </Card>
      ),
    },

    PaymentButton: {
      label: "Payment",
      fields: componentFieldRegistry.PaymentButton.fields,
      render: ({ amount, paymentUrl }) => (
        <Card className="p-6 text-center">
          <CreditCard className="mx-auto mb-4" style={{ color: "var(--sf-primary)" }} />
          <div className="text-2xl font-bold mb-6">{amount}</div>
          <Button className="w-full h-12" style={{ backgroundColor: "var(--sf-primary)" }}>
            <a href={paymentUrl}>Pay Securely</a>
          </Button>
        </Card>
      ),
    },

    ProgressBar: {
      label: "Progress Bar",
      fields: componentFieldRegistry.ProgressBar.fields,
      render: ({ currentStep, totalSteps }) => (
        <div className="w-full py-4">
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {[...Array(totalSteps)].map((_, i) => (
              <div key={i} className="flex-1 border-r border-white last:border-0" style={{ backgroundColor: i < currentStep ? "var(--sf-primary)" : "var(--sf-border)" }} />
            ))}
          </div>
        </div>
      ),
    },

    ConditionalBlock: {
      label: "Conditional Block",
      fields: componentFieldRegistry.ConditionalBlock.fields,
      render: ({ condition, threshold, content, fallbackContent, puck }) => {
        const [isMet, setIsMet] = useState(false);
        const [loading, setLoading] = useState(condition !== "always");

        useEffect(() => {
          if (puck?.isEditing || condition === "always") return;
          const orgId = (puck as { metadata?: { orgId?: string } } | undefined)?.metadata?.orgId;
          const params = new URLSearchParams({
            condition: String(condition),
            threshold: String(threshold ?? 0),
            ...(orgId ? { orgId } : {}),
          });

          fetch(`/api/v1/access-check?${params.toString()}`)
            .then((res) => res.json())
            .then((data) => setIsMet(Boolean(data.allowed)))
            .catch(() => setIsMet(false))
            .finally(() => setLoading(false));
        }, [condition, threshold, puck]);

        if (puck?.isEditing) {
          return (
            <div className="border p-2 rounded">
              <strong>Condition: {condition}</strong>
              <div className="opacity-50">IF MET:</div>
              {content}
              <div className="opacity-50">ELSE:</div>
              {fallbackContent}
            </div>
          );
        }
        if (loading) return <div className="h-24 w-full animate-pulse bg-slate-100 rounded" />;
        return isMet ? <div>{content}</div> : <div>{fallbackContent}</div>;
      },
    },

    GatedContent: {
      label: "Gated Content",
      fields: componentFieldRegistry.GatedContent.fields,
      render: ({ content, loginHeading, puck }) => {
        const [isAuth, setIsAuth] = useState(false);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
          if (puck?.isEditing) return;
          fetch("/api/v1/access-check?condition=auth")
            .then((res) => res.json())
            .then((data) => setIsAuth(Boolean(data.allowed)))
            .finally(() => setLoading(false));
        }, [puck?.isEditing]);

        if (puck?.isEditing) return <div className="border-2 border-indigo-200 p-4 rounded bg-indigo-50/20">{content}</div>;
        if (loading) return <div className="h-20 animate-pulse bg-slate-50" />;

        return isAuth ? (
          <div>{content}</div>
        ) : (
          <div className="p-8 text-center border rounded-xl bg-card">
            <Lock className="mx-auto mb-4 opacity-20" size={32} />
            <h3 className="font-bold mb-4">{loginHeading}</h3>
            <Button style={{ backgroundColor: "var(--sf-primary)" }}>Sign In to Access</Button>
          </div>
        );
      },
    },

    QuizResults: {
      label: "Quiz Results",
      fields: componentFieldRegistry.QuizResults.fields,
      defaultProps: {
        qualifiedHeadline: "You're a great fit!",
        qualifiedMessage: "Based on your answers, we recommend booking a discovery call.",
        qualifiedCtaText: "Book Your Discovery Call",
        qualifiedCtaLink: "#",
        unqualifiedHeadline: "Thanks for your interest",
        unqualifiedMessage: "You're not quite ready yet, but we can still help with resources.",
        unqualifiedCtaText: "Join Our Newsletter",
        unqualifiedCtaLink: "#",
        threshold: 10,
      },
      render: ({
        qualifiedHeadline,
        qualifiedMessage,
        qualifiedCtaText,
        qualifiedCtaLink,
        unqualifiedHeadline,
        unqualifiedMessage,
        unqualifiedCtaText,
        unqualifiedCtaLink,
        threshold,
        puck,
      }) => {
        const [score, setScore] = useState<number | null>(null);

        useEffect(() => {
          if (puck?.isEditing) {
            setScore(threshold ?? 0);
            return;
          }

          const urlScore = new URLSearchParams(window.location.search).get("score");
          const cookieScore = document.cookie
            .split("; ")
            .find((row) => row.startsWith("sf_score="))
            ?.split("=")[1];

          const raw = urlScore || cookieScore;
          if (!raw) {
            setScore(null);
            return;
          }

          const parsed = parseInt(raw, 10);
          setScore(Number.isFinite(parsed) ? parsed : null);
        }, [puck?.isEditing]);

        if (score === null) {
          return <div className="p-8 text-center">Loading results...</div>;
        }

        const normalizedThreshold = threshold || 0;
        const isQualified = score >= normalizedThreshold;
        const current = isQualified
          ? { h: qualifiedHeadline, m: qualifiedMessage, cta: qualifiedCtaText, link: qualifiedCtaLink, icon: <Check className="text-green-600" /> }
          : { h: unqualifiedHeadline, m: unqualifiedMessage, cta: unqualifiedCtaText, link: unqualifiedCtaLink, icon: <XCircle className="text-red-600" /> };

        return (
          <div className="p-8 text-center border-2" style={{ borderColor: isQualified ? "var(--sf-primary)" : "var(--sf-border)", borderRadius: "var(--sf-radius)" }}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6 bg-slate-50">{current.icon}</div>
            <h2 className="text-3xl font-bold mb-4">{current.h}</h2>
            <p className="opacity-70 mb-8 max-w-lg mx-auto">{current.m}</p>
            <a href={current.link || "#"}>
              <Button size="lg" style={{ backgroundColor: "var(--sf-primary)" }}>
                {current.cta}
              </Button>
            </a>
            <p className="mt-8 text-xs opacity-50">Your score: {score} / {normalizedThreshold}+</p>
          </div>
        );
      },
    },
  },
};
