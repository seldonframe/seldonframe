"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { runClaudeWithCustomizationTools } from "@/lib/ai/engine";
import { withSoulContext } from "@/lib/ai/prompts";
import { getOrgId } from "@/lib/auth/helpers";
import { getSoul } from "@/lib/soul/server";
import { assertAiCallLimit, incrementAiCallUsage } from "@/lib/tier/limits";

async function runClaude(prompt: string, orgId?: string | null) {
  if (orgId) {
    await assertAiCallLimit(orgId);
  }

  return runClaudeWithCustomizationTools(prompt);
}

async function getSoulLearningContext() {
  const orgId = await getOrgId();

  if (!orgId) {
    return "";
  }

  const [org] = await db
    .select({ soulLearning: organizations.soulLearning })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.soulLearning) {
    return "";
  }

  return `\n\nUse learned behavior patterns for recommendations:\n${JSON.stringify(org.soulLearning)}`;
}

export async function smartContactSummary(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const result = await runClaude(withSoulContext(`Summarize this contact context for the next call: ${input}`, soul), orgId);
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function draftMessage(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const learning = await getSoulLearningContext();
  const result = await runClaude(
    withSoulContext(
      `Draft a follow-up message. Use bestSubjectPhrases and bestSendTimes when relevant. Input: ${input}${learning}`,
      soul
    ),
    orgId
  );
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function scoreLead(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const learning = await getSoulLearningContext();
  const result = await runClaude(
    withSoulContext(
      `Score this lead from 0-100 and explain why. Use highValueLeadSignals and bestSources. Input: ${input}${learning}`,
      soul
    ),
    orgId
  );
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function autoCategorize(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const result = await runClaude(withSoulContext(`Suggest tags, status, and pipeline stage from this intake data: ${input}`, soul), orgId);
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function renewalFollowupAlert(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const learning = await getSoulLearningContext();
  const result = await runClaude(
    withSoulContext(
      `Create a renewal/follow-up alert and re-engagement message. Use churnRiskSignals for risk and follow-up prioritization. Input: ${input}${learning}`,
      soul
    ),
    orgId
  );
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function predictNoShowRisk(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const learning = await getSoulLearningContext();
  const result = await runClaude(
    withSoulContext(
      `Predict no-show risk and provide mitigation steps. Use noShowRiskFactors from learned patterns. Input: ${input}${learning}`,
      soul
    ),
    orgId
  );
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function draftProposal(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const result = await runClaude(withSoulContext(`Draft a proposal outline using this context: ${input}`, soul), orgId);
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}

export async function generateSoulFromNarrative(input: string) {
  const soul = await getSoul();
  const orgId = await getOrgId();
  const result = await runClaude(withSoulContext(`Generate a complete OrgSoul JSON from this narrative: ${input}`, soul), orgId);
  if (orgId) await incrementAiCallUsage(orgId);
  return result;
}
