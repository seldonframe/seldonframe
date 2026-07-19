import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-add-online-booking-to-your-website",
  title: "How to Add Online Booking to Your Website (Without Rebuilding It)",
  description:
    "A practical guide to adding online booking to your existing website — embed widget, booking link, or a dedicated page — plus where to put the button and why speed matters.",
  targetKeyword: "add online booking to website",
  intent: "informational",
  cluster: "booking",
  relatedTool: "/tools/booking-friction-grader",
  relatedBest: "/best/booking-system-for-small-business",
  dek: "Adding online booking to your website almost never means rebuilding the site. It usually means dropping in a link or a small widget from a booking tool and putting the button where people already look. Here's how, and what to watch for.",
  sections: [
    {
      h2: "You don't need a new website",
      body: "Small businesses often put off online booking because they think it means a website overhaul. It doesn't.\n\nA booking tool handles the calendar, the time slots, and the confirmations. Your job is just to **point customers at it** from wherever they already find you.\n\nThat \"pointing\" can be as light as a link. You don't have to touch your site's design, hosting, or structure to add a working booking flow.\n\nAnd if you don't even have a website yet, a **standalone booking link still works on its own** — from your Google Business Profile, social media, or a text.",
    },
    {
      h2: "Three ways to add it",
      body: "There are three common approaches, from simplest to most integrated.\n\nThe first is a **booking link**: your tool gives you a URL, and you attach it to a button or menu item. Clicking it opens the booking page. This takes minutes and works on any website builder.\n\nThe second is an **embedded widget**: you paste a small snippet of code the tool provides, and the calendar appears directly inside one of your existing pages. Customers never leave your site.\n\nThe third is a **dedicated booking page** on your own domain that hosts the whole flow. Most small businesses are well served by the link or the widget — the dedicated page is worth it mainly if booking is central to how you get customers.",
      callout: {
        kind: "analogy",
        text: "An embedded *widget* is a TV mounted into your wall versus a booking link, which is more like handing someone a remote to a TV in the next room — both show the same show, but one never makes them leave the couch.",
      },
      diagram: {
        type: "compare",
        title: "Booking link vs. embedded widget",
        left: {
          heading: "Booking link",
          items: ["Minutes to set up", "Works on any site builder", "Opens on the tool's own page"],
        },
        right: {
          heading: "Embedded widget",
          items: ["A short code snippet", "Calendar shows inside your page", "Customer never leaves your site"],
        },
      },
    },
    {
      h2: "Put the button where people already look",
      body: "Where you place the booking button matters as much as having one.\n\nThe reliable spots are the ones people already check for action: a prominent button in your header or navigation, a clear call-to-action near the top of your homepage, and a repeat of it on your services and contact pages.\n\nIf someone has to scroll and hunt for how to book, **some of them just won't**.\n\nUse plain, action-first wording — \"Book online\" or \"Book an appointment\" — rather than something clever. And make sure the button is just as reachable on a phone as on a desktop, since that's where most people will tap it.\n\nOn mobile, keep it visible without pinching or scrolling past a wall of other content. See [how to let customers book online](/guides/how-to-let-customers-book-online) for more on the flow itself, not just the button.",
    },
    {
      h2: "Make sure it loads fast on a phone",
      body: "A booking button only helps if the page behind it actually loads before the customer loses patience.\n\nThis is where a heavy widget on a slow page can quietly undercut everything else. Google has reported that **53% of mobile visitors leave a page** that doesn't load within about three seconds — a small delay is enough to cost you the booking you worked to earn.\n\nSo after you add booking, test the flow on your own phone on a normal connection and time it.\n\nIf the widget makes the page crawl, a **lightweight booking link that opens a fast, purpose-built page** can convert better than an embedded calendar that bogs down your site.\n\nOnce it's live, walk the whole flow as a customer would. Our [booking friction grader](/tools/booking-friction-grader) steps through it and flags the specific points — including slow or clunky mobile screens — where people are most likely to give up.",
      diagram: {
        type: "flow",
        title: "Test the flow like a customer would",
        steps: [
          { label: "Add the button or widget" },
          { label: "Open it on your own phone", sub: "normal connection, not wifi" },
          { label: "Time the load" },
          { label: "Fix or swap if it's slow" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "Do I need a developer to add online booking to my site?",
      a: "Usually not. Adding a booking link is just attaching a URL to a button, which every website builder supports. Embedding a widget means pasting a snippet the booking tool gives you. A developer is only really needed for deeper custom integration, which most small businesses don't require.",
    },
    {
      q: "Where should the \"Book\" button go on my website?",
      a: "Somewhere obvious and repeated: in the header or main navigation, near the top of your homepage, and on your services and contact pages. Use clear wording like \"Book online,\" and make sure it's easy to tap on a phone, since that's where most customers will use it.",
    },
    {
      q: "What if I don't have a website at all?",
      a: "You can still take online bookings. A booking tool gives you a shareable link that works on its own — put it in your Google Business Profile, social media bios, email signature, or text it to customers directly. A website just adds another place to display the button.",
    },
  ],
  sources: [
    {
      label: "Nielsen Norman Group — “Website Forms Usability: Top 10 Recommendations” (single-column, mobile-friendly forms)",
      url: "https://www.nngroup.com/articles/web-form-design/",
    },
    {
      label: "Marketing Dive — “Google: 53% of mobile users abandon sites that take over 3 seconds to load”",
      url: "https://www.marketingdive.com/news/google-53-of-mobile-users-abandon-sites-that-take-over-3-seconds-to-load/426070/",
    },
  ],
};
