---
id: multi-product-analytics-dashboard
scope: framework
frameworks: f1-landing-waitlist,f2-saas-launch
---

<!--
  No composition contract. Intentionally invisible to agent
  synthesis. Adding a contract here requires real semantic
  work — see tasks/step-2b-1-contract-v2-audit.md §7.5.
-->

# BLOCK: Multi-Product Analytics Dashboard

**Description**  
Create a dashboard that compares revenue, activation, retention, and campaign performance across multiple products.

**Trigger Phrases**  
- "Build analytics across all my products"
- "Show me one dashboard for multiple product lines"

**Behavior**  
Aggregate product-level metrics into one operator view so founders can compare launches, subscriptions, churn, refunds, activation funnels, and campaign efficiency side by side. Surface concrete patterns such as which products attract the highest-value cohorts, which pricing pages improve activation, and where a shared funnel stage is leaking revenue across the portfolio. Keep the output decision-oriented so the dashboard suggests where to double down, simplify, or cut wasted effort.

**Integration Points**  
- CRM
- Payments
- Brain v2
- Analytics
- Pages

**Self Improve**  
self_improve: true

**Karpathy Guidelines** (applied to all code and changes in this block)
- Think Before Coding: explicit reasoning, surface assumptions, ask clarifying questions
- Simplicity First: smallest solution that works, no unnecessary abstractions
- Surgical Changes: touch only what is required
- Goal-Driven Execution: define verifiable success criteria
