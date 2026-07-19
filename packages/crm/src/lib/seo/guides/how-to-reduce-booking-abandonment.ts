import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-reduce-booking-abandonment",
  title: "How to Reduce Booking Abandonment (Why People Quit Before They Finish)",
  description:
    "Booking abandonment is when someone starts to book and gives up partway. Here's why it happens, what checkout research teaches us, and how to cut it.",
  targetKeyword: "booking abandonment",
  intent: "informational",
  cluster: "booking",
  relatedTool: "/tools/booking-friction-grader",
  relatedBest: "/best/booking-system-for-small-business",
  dek: "Booking abandonment is when someone starts to book an appointment and quits before they finish. It's invisible — no message, no missed call, just a warm customer who slipped away mid-form. Here's why it happens and how to lose fewer of them.",
  sections: [
    {
      h2: "What booking abandonment is, and what it isn't",
      body: "Booking abandonment is the appointment version of an abandoned shopping cart. Someone was interested enough to start. Then they dropped out somewhere between the first click and the confirmation.\n\nThat's different from someone who was never going to book. These are people who showed **real intent** — and then hit a wall.\n\nThat distinction matters. **Abandonment is fixable in a way that indifference isn't.** You can't manufacture demand, but you can remove the specific obstacles that make interested people give up.\n\nAnd because abandonment is silent, it's easy to under-count. The customer never tells you they quit. The loss just shows up as a slightly disappointing week — with no obvious cause.",
      callout: {
        kind: "analogy",
        text: "A customer who abandons a booking is like someone who walks up to your storefront, opens the door, and turns around without saying a word — no complaint, no exit survey, just an empty chair where a booking should be.",
      },
    },
    {
      h2: "What checkout research tells us about why people quit",
      body: "There isn't a clean industry benchmark for appointment-booking abandonment specifically. But online retail has been studied heavily, and the friction points transfer.\n\nThe **Baymard Institute**, aggregating 50 studies, puts the average online shopping cart abandonment rate at about 70% — a reminder that even motivated buyers routinely bail when a flow gets in their way.\n\nMore useful than the headline number are Baymard's reasons. Among people who abandoned during checkout, the top causes were **unexpected extra costs** (about 39%), being forced to create an account (about 19%), and a checkout that was too long or complicated (about 18%).\n\nEvery one of those has a direct booking equivalent: a surprise fee at the end, a mandatory login before you can pick a time, or a form that asks ten questions when three would do.",
    },
    {
      h2: "Cut the form, show the times, kill the surprises",
      body: "The fixes follow straight from the causes.\n\n**Kill the surprises.** Be upfront about price, deposit, and cancellation terms before the final step — not after. Nothing kills a booking like a fee that appears at checkout.\n\n**Cut the form.** Ask for the fewest fields you genuinely need, and let people book as a guest instead of forcing an account.\n\nThen **shorten the path**. Show real, clickable time slots rather than a \"request a callback\" form. Make the whole thing finish on a phone, in a single column, and don't bury the booking button where people have to hunt for it. Each removed step is one fewer place for a warm customer to reconsider.",
      callout: {
        kind: "tip",
        text: "If you do collect a deposit, say so before the customer picks a time — not after. A price that shows up late feels like a trick, even when it isn't.",
      },
    },
    {
      h2: "Measure where people actually drop off",
      body: "You can't fix what you can't see, and abandonment hides by default.\n\nIf your booking tool offers any analytics, watch for the step where the biggest share of people leave. That's your worst offender, and it's often something small and specific — like a confusing time-zone field or a required note.\n\nIf you don't have that visibility, walk your own booking flow as a stranger would, on a phone. Count the moments where you'd plausibly quit if you weren't the owner.\n\nOur [booking friction grader](/tools/booking-friction-grader) does exactly that in a structured way. It steps through your flow and flags the specific points — hidden costs, extra fields, mobile snags, account walls — most likely to be quietly costing you bookings.",
      diagram: {
        type: "flow",
        title: "Where booking abandonment usually happens",
        steps: [
          { label: "Sees the booking button", sub: "still just curious" },
          { label: "Starts the form", sub: "warm — real intent now" },
          { label: "Hits price or account wall", sub: "the biggest drop-off point" },
          { label: "Picks a time slot", sub: "fewer clicks from here" },
          { label: "Confirms", sub: "booking complete" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "What's a normal booking abandonment rate?",
      a: "There's no reliable published benchmark for appointment booking specifically, so treat any single number with caution. Online retail checkout abandonment averages around **70%** across studies, which is a useful reminder that even interested people drop off easily — but your own numbers depend heavily on your flow and audience.",
    },
    {
      q: "Does asking for a deposit increase abandonment?",
      a: "It usually adds some friction, yes. A deposit can be worth it when no-shows are costly or slots are hard to fill, because it filters for serious bookings. But if no-shows aren't hurting you, requiring payment upfront will lose some bookings you'd otherwise have kept.",
    },
    {
      q: "How do I know where people are abandoning?",
      a: "Start with whatever step-by-step analytics your booking tool provides and look for the biggest drop. If you have none, test the flow yourself on a phone and note every point of hesitation. A [friction audit tool](/tools/booking-friction-grader) can also map the flow and point at the highest-risk steps for you.",
    },
  ],
  sources: [
    {
      label: "Baymard Institute — “50 Cart Abandonment Rate Statistics” (average ~70% across 50 studies; top checkout abandonment reasons)",
      url: "https://baymard.com/lists/cart-abandonment-rate",
    },
  ],
};
