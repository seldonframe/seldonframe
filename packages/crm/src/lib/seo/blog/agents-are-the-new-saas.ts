// Blog-loop article — mined from a real YouTube transcript (see sourceVideo).
// Every specific number, company name, and quote below traces to an exact
// transcript snippet (see reports/2026-07-13-blog-loop-run.md for the
// claim→snippet table). Nothing here is invented; anything the transcript
// didn't say verbatim was dropped rather than approximated.

import type { BlogArticle } from "./types";

export const article: BlogArticle = {
  slug: "agents-are-the-new-saas",
  title: "Agents Are the New SaaS: The Playbook for Selling AI Labor, Not Software",
  description:
    "Greg Isenberg's argument for why AI agents are a bigger opportunity than SaaS ever was: the product is the job, not the tool. Here's the workflow-picking, spec, eval, and pricing playbook, straight from the source.",
  dek: "Greg Isenberg's pitch is a one-line mindset flip: a SaaS product hands someone a tool; an agent SaaS product removes a job from their to-do list entirely. Here's his actual playbook for finding the workflow, building the smallest useful version, proving it works, and pricing it like labor.",
  targetKeyword: "agents are the new saas",
  date: "2026-07-13",
  sourceVideo: {
    url: "https://www.youtube.com/watch?v=83fWzQSWB10",
    title: "AI Agents are the new SaaS",
    channel: "Greg Isenberg — The Startup Ideas Podcast",
    thumbnail: "https://img.youtube.com/vi/83fWzQSWB10/maxresdefault.jpg",
  },
  heroStats: [
    { value: 1000, display: "$1,000/mo", label: "for one workflow, one promise (plus a $1,500 setup)" },
    { value: 42, display: "42 / 50", label: "maintenance requests routed correctly in the pilot eval" },
    { value: 500, display: "500 tickets", label: "handled per month on the $3,000/mo outcome tier" },
  ],
  sections: [
    {
      h2: "The product is the job, not the tool",
      body:
        "Greg Isenberg opens with a claim he doesn't hedge: \"building agents is the new SAS.\" Not an adjacent trend — the successor. His reasoning is about market size, not hype: SaaS sold software, but agent-first companies sell *work*, and the addressable market for work is human labor itself, which he calls a \"multi-trillion dollar market.\"\n\nThe mental model he gives is the whole thesis in one line: **\"SAS sells software, agent SAS sells work.\"** A normal SaaS pitch says *here is a tool your team could use*. An agent-first pitch says *here is a job your team no longer has to do by hand* — and then you sell that as a service, not a seat.\n\nHe grounds it in two real companies. For restaurants missing reservations and private-dining calls during dinner rush, he points to **Slang AI**, described as an \"AI superhost for restaurants\" that answers inbound calls, handles guest questions, manages reservations, routes VIPs, alerts staff to high-priority topics, and integrates with OpenTable and Yelp. For home-services businesses — plumbing, HVAC, roofing, pest control — missing calls and overwhelmed dispatchers, he points to **Same Day**, which sells AI dispatchers and receptionists that answer calls, respond to texts, book jobs, and reschedule. Same underlying claim both times: the product is the job, and the founder mental model he offers is blunt — *\"I handle this one annoying job better than a junior employee, faster than an agency, and it's cheaper than adding headcount.\"*",
    },
    {
      h2: "Picking a workflow with a paycheck already attached",
      body:
        "Isenberg's second step is where the idea search actually starts: \"pick a workflow with a paycheck attached.\" If a business is already paying a human — an employee, an agency, a receptionist, a dispatcher — to do the work, there's a wedge to sell the same outcome cheaper.\n\nHe lays out five traits of a good agent workflow, and they double as a filter against building the wrong thing. It has to happen constantly (\"daily is good but hourly is better\"). It needs a clear finish line — the job got booked, the ticket got categorized, the refund got approved. It has to touch existing software (Gmail, Slack, Shopify, HubSpot, Stripe) so the agent has tools and context to read from. The edge cases have to be \"annoying but learnable\" — too simple and a Zapier-style automation already handles it; too much pure judgment and the first version breaks. And the buyer has to *feel* the loss: missed calls, slow replies, dropped leads, empty calendar slots.\n\nHis suggested first move is concrete rather than abstract: pick one niche, write down twenty jobs people complain about — for roofers, that's missed calls, financing questions, insurance paperwork; for med spas, lead qualification and no-show recovery — then score each on frequency, pain, how clearly \"done\" is defined, tool access, and who already owns the budget.",
    },
    {
      h2: "Shadow the human, then write a seven-part spec",
      body:
        "Before any prompting or coding, Isenberg's advice is to shadow the person currently doing the job: watch them work through it \"10 to 20 times,\" have them screen-record and narrate, and ask what makes a case easy, what makes it weird, and where mistakes actually happen. His example is a restaurant host fielding \"what time are you open?\" — the real workflow underneath that question includes knowing when the kitchen closes, which tables suit a stroller, when the patio is closed, and how to route a VIP. As he puts it, *\"the detail is the product.\"*\n\nOut of that shadowing comes what he calls a seven-part agent spec: what wakes the agent up, what context it needs, what tools it can use, what it's allowed to do on its own, where it needs approval, when it should escalate to a human, and what success looks like. Skip that structure, he warns, and \"you're not just going to build agent slop\" — the goal is an agent that does the work as well as or better than a human, consistently, because consistency is what people actually pay for.",
      callout: {
        kind: "tip",
        text: "Before you write a single prompt, watch the human do the job 10-20 times — screen-recorded and narrated. The seven-part spec (trigger, context, tools, autonomy, approvals, escalation, success) comes straight out of that shadowing, not out of guessing.",
      },
    },
    {
      h2: "Build the smallest useful agent, not a fake autonomous employee",
      body:
        "Isenberg pushes back directly on the Twitter-demo version of \"agent\" — the fully autonomous employee that looks impressive and doesn't really work. His recommended starting point is what he calls the **minimal useful agent (MUA)**, and he names four legitimate first versions: a *draft-and-approve* agent that reads context and drafts a reply, quote, or next step for a human to approve; a *triage* agent that classifies and routes inbound work (a maintenance request, a billing issue, a refund); a *coordinator* agent that moves between systems and people — checking availability, sending reminders, chasing missing info; and a *bounded-action* agent that can take one narrow action under clear rules, like booking an appointment or processing a refund under $50.\n\nHe cites Anthropic's own agent guidance to back the restraint: many agent problems should start as a **workflow** — a predictable path — with autonomy earned only once the predictable version is proven, adding judgment where it creates value rather than starting fully open-ended. His practical version: launch with one workflow and one promise, something as narrow as \"we answer missed calls for roofers and book qualified jobs,\" because early customers buying an agent for the first time don't want everything at once.",
      callout: {
        kind: "warning",
        text: "Skip the seven-part spec and Isenberg's warning is blunt: you're not building an agent, you're building agent slop. Start as a workflow with one promise — autonomy gets earned once the predictable version is proven, not assumed on day one.",
      },
      diagram: {
        type: "stack",
        title: "Four legitimate first versions (the MUA)",
        layers: [
          { label: "Draft-and-approve", sub: "Reads context, drafts a reply/quote/next step for a human to approve" },
          { label: "Triage", sub: "Classifies and routes inbound work — a maintenance request, a billing issue, a refund" },
          { label: "Coordinator", sub: "Moves between systems and people — checks availability, sends reminders, chases missing info" },
          { label: "Bounded-action", sub: "Takes one narrow action under clear rules, e.g. booking an appointment or a refund under $50" },
        ],
      },
    },
    {
      h2: "The wrapper is the SaaS, and evals are how you sell trust",
      body:
        "Isenberg's fifth step names the part that actually turns an automation into a company: *\"the agent does the work but the wrapper creates the trust.\"* Customers need to see logs, approvals, handoff rules, and a way to test the agent before it goes live — a dashboard that can be simple, but has to function as a control room. For a restaurant phone agent, that's call summaries, reservation outcomes, and missed-human handoffs; for a property-maintenance agent, it's tickets created, vendor routes, and owner approvals.\n\nThat's also where he introduces evals as more than an engineering habit — they're a sales asset. His example: take 50 real maintenance requests, mark the correct answers, and run the agent against them. Then you can tell a property manager something concrete: *\"We tested this on 50 of your old maintenance requests. It routed 42 correctly, flagged 6 for human review, and made 2 mistakes. Here are the two mistakes and here's how we fix them.\"* That specificity, he argues, is what builds trust with operators of \"boring businesses\" who are cautious about agents but can genuinely use them. It's the same logic behind grounding an agent's answers and forcing a [read-back before anything irreversible happens](/guides/how-to-make-an-ai-agent-reliable) — the wrapper's job is proving the work, not just doing it.",
    },
    {
      h2: "Sell the pilot like labor, price it like a job, then productize",
      body:
        "Isenberg's advice on go-to-market is to run a pilot manually first — doing the work with AI assistance — and then productize whatever repeats. Start with three customers in one niche, same workflow, same pain, and sell the outcome plainly: \"we will answer and qualify your missed calls,\" not a feature list.\n\nOn pricing, he offers real anchor numbers rather than a formula: a **$1,500 setup and $1,000 a month** for one workflow; a **$2,000 setup plus $30 per qualified appointment** as a more outcome-based version; or **$3,000 a month up to 500 handled tickets**. He's explicit that the exact number matters less than what you learn from charging it — where the agent breaks, what needs human approval, what the customer would miss if you took it away. He calls outcome pricing \"the future of how these agent-first businesses get priced,\" since the customer isn't buying another seat, but he's just as clear that you earn your way there with patience rather than starting there.\n\nThe productization signal is repetition: if every roofer needs the same emergency-call script, service-area check, and financing question, or every med spa needs the same lead-scoring and no-show recovery flow, that repeated pattern is the product. As he puts it, \"you earn the software by doing the work first.\"",
    },
    {
      h2: "Distribution is the workflow teardown, and the 30-day plan",
      body:
        "For getting the agent in front of buyers, Isenberg's distribution bet is the **workflow teardown**: show the old way — a call comes in, nobody answers, the customer calls a competitor, or a CSR fields five questions, checks a calendar, books the job, and forgets the follow-up — next to the agent way, where the same call gets answered, qualified, booked, logged, and flagged for a human only on the edge cases. \"You want to be in the business of selling painkillers, not vitamins,\" he says — pick one workflow and let the internet associate you with it.\n\nHe closes with a four-week plan: day one, pick a niche where missed work costs money; day two, interview ten operators and watch them work; day three, pick one workflow with frequency, pain, and a clear success metric; day four, write the seven-part spec; day five, run it manually with AI to prove it helps before writing software; day six, build the smallest useful version; day seven, build the 50-example eval set. Week two is selling two pilots in the same niche; week three is building the wrapper — logs, approvals, settings, analytics — and he specifically suggests using AI tools to build that software itself; week four is publishing the teardown content and turning pilots into proof.\n\nHis closing line makes the argument's shape explicit: software is moving \"from 'help me do the work' to 'do the work with me,'\" and the opportunity sits with whoever finds the smallest painful, repeating workflow in a niche they understand — and makes it disappear.",
      diagram: {
        type: "flow",
        title: "The agent way (the teardown's after side)",
        steps: [
          { label: "Call comes in" },
          { label: "Agent answers + qualifies" },
          { label: "Books the job" },
          { label: "Updates the CRM" },
          { label: "Flags edge cases", sub: "Only the rare case reaches a human" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "What does 'agents are the new SaaS' actually mean?",
      a: "Greg Isenberg's framing: traditional SaaS sells a tool a team uses to do work themselves; an agent-first product sells the outcome of the work directly, removing the job rather than assisting with it. The addressable market shifts from software budgets to the much larger market of human labor.",
    },
    {
      q: "What is a 'minimal useful agent'?",
      a: "Isenberg's term for the smallest legitimate first version of an agent, as opposed to a fully autonomous demo that doesn't hold up in production. He names four types: draft-and-approve, triage, coordinator, and bounded-action (a narrow, rule-bound action like booking an appointment or a small refund).",
    },
    {
      q: "How does Isenberg say to price an agent-first product?",
      a: "He gives three real examples from the video: a $1,500 setup plus $1,000/month for one workflow, a $2,000 setup plus $30 per qualified appointment (outcome-based), or $3,000/month up to 500 handled tickets. He treats outcome pricing as the eventual direction but says to earn it with a flat setup-plus-monthly model first.",
    },
  ],
  relatedGuide: "/guides/how-to-make-an-ai-agent-reliable",
  sources: [
    { label: "AI Agents are the new SaaS — Greg Isenberg, The Startup Ideas Podcast (YouTube)", url: "https://www.youtube.com/watch?v=83fWzQSWB10" },
  ],
};
