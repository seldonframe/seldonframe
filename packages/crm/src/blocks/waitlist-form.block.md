---
id: waitlist-form
scope: framework
frameworks: f1-landing-waitlist,f2-saas-launch
---

<!--
  No composition contract. Intentionally invisible to agent
  synthesis. Adding a contract here requires real semantic
  work — see tasks/step-2b-1-contract-v2-audit.md §7.5.
-->

# BLOCK: Waitlist Form

**Description**  
Create a simple waitlist capture flow that turns launch interest into qualified pre-release demand.

**Trigger Phrases**  
- "Add a waitlist form to my launch"
- "Capture early interest before product release"

**Behavior**  
Add a lightweight waitlist form to the main landing flow and collect name, email, company, and optional use-case details without creating unnecessary friction. Store submissions in CRM contacts with clear waitlist tagging so founders can segment demand, prioritize outreach, and validate which audiences are most ready to convert. Favor actionable patterns such as which landing messages pull the highest-intent signups, where form friction reduces completion, and which segments should receive first access or early activation follow-up.

**Integration Points**  
- CRM
- Forms
- Pages
- Brain v2
- Email

**Self Improve**  
self_improve: true

**Karpathy Guidelines** (applied to all code and changes in this block)
- Think Before Coding: explicit reasoning, surface assumptions, ask clarifying questions
- Simplicity First: smallest solution that works, no unnecessary abstractions
- Surgical Changes: touch only what is required
- Goal-Driven Execution: define verifiable success criteria
