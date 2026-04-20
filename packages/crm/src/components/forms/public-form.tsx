"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { submitPublicIntakeAction } from "@/lib/forms/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type Field = { key: string; label: string; type: string; required: boolean; options?: string[] };

type Step = { kind: "welcome" } | { kind: "question"; index: number } | { kind: "done" };

// Basic RFC-5322-ish email regex. Not strict; good enough to catch typos
// like "missing @" without rejecting real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAnswerValid(field: Field, value: string): boolean {
  const trimmed = value.trim();
  if (field.required && !trimmed) return false;
  if (!trimmed) return true; // optional + empty → fine
  if (field.type === "email") return EMAIL_PATTERN.test(trimmed);
  return true;
}

export function PublicForm({
  orgSlug,
  formSlug,
  formName,
  fields,
}: {
  orgSlug: string;
  formSlug: string;
  formName: string;
  fields: Field[];
}) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>({ kind: "welcome" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const { showDemoToast } = useDemoToast();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const totalQuestions = fields.length;
  const estimatedMinutes = useMemo(() => Math.max(1, Math.round(totalQuestions * 0.25)), [totalQuestions]);

  const currentField = step.kind === "question" ? fields[step.index] : null;
  const currentAnswer = currentField ? answers[currentField.key] ?? "" : "";

  // Auto-focus the active input when a question step mounts.
  useEffect(() => {
    if (step.kind !== "question") return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [step]);

  const submitAll = useCallback(() => {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }
        const payload: Record<string, unknown> = {};
        for (const field of fields) {
          payload[field.key] = answers[field.key] ?? "";
        }
        await submitPublicIntakeAction({ orgSlug, formSlug, data: payload });
        setStep({ kind: "done" });
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }
        throw error;
      }
    });
  }, [answers, fields, formSlug, orgSlug, showDemoToast, startTransition]);

  function goNext() {
    if (!currentField) return;
    const valid = isAnswerValid(currentField, currentAnswer);
    if (!valid) {
      setErrorFor(currentField.key);
      return;
    }
    setErrorFor(null);
    const nextIndex = (step.kind === "question" ? step.index : 0) + 1;
    if (nextIndex >= totalQuestions) {
      submitAll();
      return;
    }
    setStep({ kind: "question", index: nextIndex });
  }

  function goBack() {
    if (step.kind !== "question") return;
    setErrorFor(null);
    if (step.index === 0) {
      setStep({ kind: "welcome" });
      return;
    }
    setStep({ kind: "question", index: step.index - 1 });
  }

  // Enter to advance on non-textarea; Cmd/Ctrl+Enter to advance on textarea.
  function handleKeyDown(event: React.KeyboardEvent, fieldType: string) {
    if (event.key === "Enter") {
      const isTextarea = fieldType === "textarea";
      if (isTextarea) {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          goNext();
        }
        return;
      }
      event.preventDefault();
      goNext();
    }
    if (event.key === "Escape" && step.kind === "question" && step.index > 0) {
      event.preventDefault();
      goBack();
    }
  }

  // ────── Welcome ──────
  if (step.kind === "welcome") {
    return (
      <div className="crm-card flex min-h-[420px] flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--sf-text)" }}>
            {formName}
          </h1>
          <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
            {totalQuestions === 0
              ? "This form has no questions yet."
              : `${totalQuestions} ${totalQuestions === 1 ? "question" : "questions"} · about ${estimatedMinutes} ${estimatedMinutes === 1 ? "minute" : "minutes"}`}
          </p>
        </div>
        <button
          type="button"
          className="crm-button-primary h-11 px-6 text-sm font-semibold"
          disabled={totalQuestions === 0}
          onClick={() => setStep({ kind: "question", index: 0 })}
        >
          Start →
        </button>
        <p className="text-[11px]" style={{ color: "var(--sf-muted)" }}>
          Press <kbd className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--sf-border)" }}>Enter</kbd> to continue
        </p>
      </div>
    );
  }

  // ────── Done ──────
  if (step.kind === "done") {
    return (
      <div className="crm-card flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div
          className="inline-flex size-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--sf-primary, #21a38b) 15%, transparent)" }}
        >
          <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--sf-primary, #21a38b)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--sf-text)" }}>
            Thanks!
          </h1>
          <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
            Your response has been submitted.
          </p>
        </div>
      </div>
    );
  }

  // ────── Question ──────
  if (!currentField) return null;

  const progressPct = Math.round(((step.index + 1) / Math.max(1, totalQuestions)) * 100);
  const answerValid = isAnswerValid(currentField, currentAnswer);
  const errorMessage =
    errorFor === currentField.key
      ? currentField.required && !currentAnswer.trim()
        ? "This question is required."
        : currentField.type === "email"
          ? "Enter a valid email address."
          : "Please check your answer."
      : null;

  return (
    <div className="crm-card overflow-hidden p-0">
      {/* Progress bar */}
      <div className="h-1 w-full" style={{ backgroundColor: "var(--sf-border)" }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progressPct}%`, backgroundColor: "var(--sf-primary, #21a38b)" }}
        />
      </div>
      <div className="flex items-center justify-between px-6 py-3 text-xs" style={{ color: "var(--sf-muted)" }}>
        <span className="tabular-nums">
          Question {step.index + 1} of {totalQuestions}
        </span>
        <span>
          <kbd className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--sf-border)" }}>
            Esc
          </kbd>{" "}
          back
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step.index}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-col gap-5 p-6 pt-2"
        >
          <div className="space-y-1">
            <label htmlFor={currentField.key} className="block text-lg font-medium leading-snug" style={{ color: "var(--sf-text)" }}>
              {currentField.label}
              {currentField.required ? (
                <span className="ml-1 text-sm" style={{ color: "var(--sf-muted)" }}>
                  *
                </span>
              ) : null}
            </label>
          </div>

          <QuestionInput
            field={currentField}
            value={currentAnswer}
            onChange={(value) => {
              setAnswers((prev) => ({ ...prev, [currentField.key]: value }));
              if (errorFor === currentField.key) setErrorFor(null);
            }}
            onKeyDown={(event) => handleKeyDown(event, currentField.type)}
            inputRef={inputRef}
            onSelect={(value) => {
              setAnswers((prev) => ({ ...prev, [currentField.key]: value }));
              setErrorFor(null);
              // Auto-advance on pill/button select — feels Typeform-native.
              window.setTimeout(() => {
                const nextIndex = step.index + 1;
                if (nextIndex >= totalQuestions) {
                  submitAll();
                } else {
                  setStep({ kind: "question", index: nextIndex });
                }
              }, 120);
            }}
          />

          {errorMessage ? (
            <p className="text-sm" style={{ color: "var(--sf-negative, hsl(0 72% 51%))" }}>
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium disabled:opacity-40"
              style={{ color: "var(--sf-muted)" }}
              onClick={goBack}
              disabled={step.index === 0}
            >
              ← Back
            </button>
            <button
              type="button"
              className="crm-button-primary h-10 px-5 text-sm font-semibold disabled:opacity-60"
              onClick={goNext}
              disabled={pending || !answerValid}
            >
              {pending ? "Submitting…" : step.index + 1 === totalQuestions ? "Submit" : "Continue →"}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function QuestionInput({
  field,
  value,
  onChange,
  onKeyDown,
  onSelect,
  inputRef,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onSelect: (value: string) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const common = {
    id: field.key,
    name: field.key,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown,
    required: field.required,
  };

  if (field.type === "textarea") {
    return (
      <textarea
        {...common}
        ref={(el) => {
          inputRef.current = el;
        }}
        rows={4}
        className="crm-input min-h-24 w-full rounded-lg p-3 text-base"
        placeholder="Type your answer (Cmd/Ctrl+Enter to continue)"
      />
    );
  }

  if (field.type === "select") {
    const options = field.options ?? [];
    // Button-group style for short option lists; falls back to native
    // <select> if the list is long enough that pills would wrap awkwardly.
    if (options.length > 0 && options.length <= 6) {
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = value === option;
            return (
              <button
                key={option}
                type="button"
                className="h-11 rounded-lg border px-4 text-sm font-medium transition-all"
                style={{
                  borderColor: selected ? "var(--sf-primary, #21a38b)" : "var(--sf-border)",
                  backgroundColor: selected
                    ? "color-mix(in srgb, var(--sf-primary, #21a38b) 12%, transparent)"
                    : "transparent",
                  color: selected ? "var(--sf-primary, #21a38b)" : "var(--sf-text)",
                }}
                onClick={() => onSelect(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select
        id={field.key}
        name={field.key}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
        onKeyDown={onKeyDown}
        className="crm-input h-12 w-full rounded-lg px-3 text-base"
      >
        <option value="">Select one…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  const inputType = field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
  const placeholder =
    field.type === "email" ? "you@example.com" : field.type === "tel" ? "+1 555 000 0000" : "Type your answer";

  return (
    <input
      {...common}
      ref={(el) => {
        inputRef.current = el;
      }}
      type={inputType}
      className="crm-input h-12 w-full rounded-lg px-3 text-base"
      placeholder={placeholder}
      autoComplete={
        field.type === "email"
          ? "email"
          : field.type === "tel"
            ? "tel"
            : field.key.toLowerCase().includes("name")
              ? "name"
              : "off"
      }
    />
  );
}
