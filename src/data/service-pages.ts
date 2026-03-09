export type ServiceFaq = {
  question: string;
  answer: string;
};

export type ServiceHighlight = {
  title: string;
  copy: string;
};

export type ServicePageContent = {
  slug: string;
  label: string;
  title: string;
  description: string;
  heroTitle: string;
  heroBody: string;
  eyebrow: string;
  summary: string;
  heroImage: string;
  badges: string[];
  intro: string[];
  highlights: ServiceHighlight[];
  bestFor: string[];
  faqs: ServiceFaq[];
  relatedSlugs: string[];
  extraAction?: {
    href: string;
    label: string;
  };
};

export const servicePages: ServicePageContent[] = [
  {
    slug: "t-shirt-printing-mauritius",
    label: "T-Shirt Printing",
    title: "T-Shirt Printing Mauritius | Custom Business & Event Tees",
    description:
      "Custom T-shirt printing in Mauritius for brands, events, staff uniforms, and merchandise. Fast local production, clear artwork guidance, and island-wide delivery.",
    heroTitle: "Custom T-shirt printing in Mauritius that is built for real orders.",
    heroBody:
      "MO T-SHIRT helps businesses, teams, and events move from artwork to finished tees fast. We guide the print method, confirm sizing, and deliver island-wide.",
    eyebrow: "Commercial printing",
    summary: "Custom tees for staff, campaigns, merch, and events with fast local turnaround.",
    heroImage: "/work/work-01.JPG",
    badges: ["Business uniforms", "Event merch", "Island-wide delivery"],
    intro: [
      "If you need custom T-shirts in Mauritius, the main decision is not just the shirt. It is the right print method, the right garment weight, and the right timeline for the job you are actually running.",
      "We work best with business orders, event kits, launch drops, and repeat staff uniforms where quality and speed both matter. We can quote small runs, but the strongest value starts when the order is planned properly.",
    ],
    highlights: [
      {
        title: "Clear print guidance",
        copy: "We recommend vinyl, DTF, or screen print based on artwork detail, quantity, and budget.",
      },
      {
        title: "Mauritius-friendly logistics",
        copy: "Pickup is available in Surinam and we ship island-wide through Mauritius Post.",
      },
      {
        title: "Business-ready output",
        copy: "Good fit for uniforms, restaurant teams, launches, school groups, and branded campaigns.",
      },
    ],
    bestFor: [
      "Restaurant and retail staff uniforms",
      "Corporate activations and marketing teams",
      "Event crews, volunteers, and branded giveaways",
      "Merch runs for gyms, clubs, and local brands",
    ],
    faqs: [
      {
        question: "What is the normal turnaround for T-shirt printing in Mauritius?",
        answer: "Standard production is usually 5 to 7 working days. Rush slots can be possible when artwork and quantities are confirmed quickly.",
      },
      {
        question: "What artwork do you need for custom tees?",
        answer: "AI, EPS, and PDF are best. High-resolution PNG files are also usable for many jobs, especially DTF prints.",
      },
      {
        question: "Can you help me choose the print method?",
        answer: "Yes. We normally recommend screen print for bulk simple designs, DTF for full-color artwork, and vinyl for names, numbers, and clean logo placements.",
      },
    ],
    relatedSlugs: ["screen-printing-mauritius", "dtf-printing-mauritius", "event-shirts-mauritius"],
  },
  {
    slug: "polo-uniforms-mauritius",
    label: "Polo Uniforms",
    title: "Polo Uniform Printing Mauritius | Staff & Corporate Uniforms",
    description:
      "Polo uniform printing in Mauritius for restaurants, sales teams, customer-facing staff, and corporate uniforms. Professional finishing, logo placement advice, and reliable turnaround.",
    heroTitle: "Printed polo uniforms that look organised, not improvised.",
    heroBody:
      "For customer-facing teams, polos need to feel sharper than standard tees. We help businesses choose the right fabric, logo size, and print method so the final uniform looks consistent across the whole team.",
    eyebrow: "Uniform systems",
    summary: "Professional polo shirts for teams that need a cleaner and more durable uniform look.",
    heroImage: "/work/work-02.JPG",
    badges: ["Team uniforms", "Customer-facing staff", "Logo placement advice"],
    intro: [
      "Polo uniforms are usually chosen when the brand needs something more structured than a T-shirt. Restaurants, sales teams, front-desk staff, and service businesses often need that extra polish.",
      "The mistake most businesses make is treating polos like tees. The collar, placket, and fabric weight change how logos should be placed and how different print methods perform over time.",
    ],
    highlights: [
      {
        title: "Better for premium presentation",
        copy: "Polos work well when your staff speak directly with customers and the uniform has to carry the brand properly.",
      },
      {
        title: "Simple logo systems",
        copy: "Left chest, sleeve, back, and name placements can be quoted clearly before production starts.",
      },
      {
        title: "Repeat-order friendly",
        copy: "We can help standardise the look so future uniform top-ups stay consistent.",
      },
    ],
    bestFor: [
      "Restaurants, cafes, and hospitality teams",
      "Sales staff and showroom teams",
      "Security, field, and service crews",
      "Corporate uniforms with front-chest branding",
    ],
    faqs: [
      {
        question: "Is polo printing better with vinyl or DTF?",
        answer: "For many polo jobs, vinyl works very well for clean logos and names. DTF can be better for more detailed or full-color artwork.",
      },
      {
        question: "Can polos be ordered in mixed sizes?",
        answer: "Yes. Most business orders mix several staff sizes in one run, and we can quote them in the same order.",
      },
      {
        question: "Do you print names or roles on polos?",
        answer: "Yes. We can handle staff names, departments, and numbered pieces when the order needs personalization.",
      },
    ],
    relatedSlugs: ["t-shirt-printing-mauritius", "screen-printing-mauritius", "rush-order-printing-mauritius"],
  },
  {
    slug: "hoodie-printing-mauritius",
    label: "Hoodie Printing",
    title: "Hoodie Printing Mauritius | Custom Hoodies for Teams & Brands",
    description:
      "Custom hoodie printing in Mauritius for clubs, leavers, brand merch, and cooler-season teamwear. Good for back prints, front chest logos, and premium merch runs.",
    heroTitle: "Custom hoodie printing for brands, clubs, and premium teamwear.",
    heroBody:
      "Hoodies carry larger graphics well and feel closer to merch than standard uniforms. We help you choose placements and print methods that suit thicker garments and higher perceived value.",
    eyebrow: "Premium merch",
    summary: "Custom hoodies for clubs, leavers, branded merch, and premium staff kits.",
    heroImage: "/work/work-08.JPG",
    badges: ["Club merch", "Leavers", "Front and back prints"],
    intro: [
      "Hoodies usually need more planning than T-shirts because the garment cost is higher and customers expect a cleaner finish. That makes the artwork, placement, and quantity decision more important.",
      "This page is best for schools, clubs, gyms, creators, and businesses that want a more premium branded piece than a standard uniform top.",
    ],
    highlights: [
      {
        title: "Higher-value garment",
        copy: "Hoodies are strong for merch, limited runs, and premium team identity pieces.",
      },
      {
        title: "Large graphic potential",
        copy: "Back prints, centre chest prints, and smaller chest logos all work well with the right setup.",
      },
      {
        title: "Small-run suitable",
        copy: "DTF can be a good fit when the artwork is detailed and the quantity is not large enough for classic bulk production.",
      },
    ],
    bestFor: [
      "School leavers and club groups",
      "Brand merch drops and creator merch",
      "Gym, fitness, and coaching apparel",
      "Premium internal teamwear for cooler periods",
    ],
    faqs: [
      {
        question: "Do hoodies need a different print method than T-shirts?",
        answer: "Sometimes, yes. Hoodie fabric and garment thickness affect the best print method, so we usually confirm the artwork before recommending the setup.",
      },
      {
        question: "Can you print front and back on hoodies?",
        answer: "Yes. Front chest, full front, and back prints are all possible depending on the design and garment choice.",
      },
      {
        question: "Are hoodies suitable for small merch runs?",
        answer: "Yes. Hoodies are often used for smaller premium runs where the perceived value matters more than hitting the lowest unit cost.",
      },
    ],
    relatedSlugs: ["dtf-printing-mauritius", "event-shirts-mauritius", "t-shirt-printing-mauritius"],
  },
  {
    slug: "event-shirts-mauritius",
    label: "Event Shirts",
    title: "Event Shirt Printing Mauritius | Fast T-Shirts for Events & Campaigns",
    description:
      "Event shirt printing in Mauritius for launches, corporate activations, school events, sports days, roadshows, and volunteer teams. Fast quoting, size coordination, and deadline-first production.",
    heroTitle: "Event shirts for launches, crews, volunteers, and branded moments.",
    heroBody:
      "Event jobs are usually deadline-led. We focus on what matters most: fast approval, clear size breakdowns, and a print method that can actually meet the timeline you have.",
    eyebrow: "Deadline-driven jobs",
    summary: "Printed shirts for activations, schools, volunteer teams, and branded events with time pressure.",
    heroImage: "/work/work-03.JPG",
    badges: ["Volunteer kits", "School events", "Brand activations"],
    intro: [
      "Event shirt orders are rarely only about the shirts. They are tied to launch dates, staff arrival, venue setup, and sponsor visibility. That means the quoting and approval flow needs to stay simple.",
      "We can help organise garment type, quantity, and sizing so the production plan fits the deadline instead of creating last-minute confusion.",
    ],
    highlights: [
      {
        title: "Built around the date",
        copy: "We prioritise artwork approval and production realism so the event team knows what is possible early.",
      },
      {
        title: "Good for mixed roles",
        copy: "Different shirt colours or print details can be used for crew, volunteers, staff, and VIP groups.",
      },
      {
        title: "Fast communication",
        copy: "WhatsApp is often the fastest route for event jobs that need a quick answer and artwork check.",
      },
    ],
    bestFor: [
      "Corporate events and activations",
      "Sports days, races, and school functions",
      "Volunteer and crew coordination",
      "Launches, fairs, expos, and roadshows",
    ],
    faqs: [
      {
        question: "How early should I book event shirts?",
        answer: "As early as possible. Standard timing is 5 to 7 working days, but event jobs get much easier when artwork and size counts are locked earlier.",
      },
      {
        question: "Can you help if I do not have the final size count yet?",
        answer: "Yes. We can usually start by quoting the garment and print setup, then finalise the size breakdown once your team list is confirmed.",
      },
      {
        question: "Are rush event jobs possible?",
        answer: "Yes, when capacity is open and the artwork is ready. Rush jobs work best when the brief is simple and decision-making is fast.",
      },
    ],
    relatedSlugs: ["rush-order-printing-mauritius", "t-shirt-printing-mauritius", "screen-printing-mauritius"],
  },
  {
    slug: "dtf-printing-mauritius",
    label: "DTF Printing",
    title: "DTF Printing Mauritius | Full-Color Apparel Transfers",
    description:
      "DTF printing in Mauritius for full-color logos, gradients, detailed graphics, and smaller custom apparel runs. Best for complex artwork that is not ideal for simple vinyl or bulk screen print.",
    heroTitle: "DTF printing for full-color artwork, gradients, and detailed logos.",
    heroBody:
      "When the artwork has color blends, shading, or detail that would be awkward for simple vinyl, DTF becomes the cleaner option. It is especially useful for smaller runs with complex graphics.",
    eyebrow: "Detail-friendly printing",
    summary: "Best for detailed, full-color artwork and smaller runs where screen setup is not ideal.",
    heroImage: "/work/work-04.JPG",
    badges: ["Full color logos", "Complex artwork", "Smaller runs"],
    intro: [
      "DTF printing is a strong choice when the design is too detailed for simple cut vinyl and the order size does not justify classic screen print setup. It gives businesses more freedom with logos and brand graphics.",
      "This is often the right route for promo shirts, merch graphics, school art, and designs with gradients, outlines, or photographic elements.",
    ],
    highlights: [
      {
        title: "More artwork freedom",
        copy: "DTF handles gradients, multiple colors, and complex shapes better than a basic one-color setup.",
      },
      {
        title: "Smarter for limited runs",
        copy: "It is often more practical than screen print when quantities are lower but artwork detail is high.",
      },
      {
        title: "Good for brand consistency",
        copy: "Multi-color logos can stay visually closer to the original artwork without oversimplifying them.",
      },
    ],
    bestFor: [
      "Detailed brand logos",
      "Merch graphics with multiple colors",
      "Small and medium custom runs",
      "Art-led designs that need visual fidelity",
    ],
    faqs: [
      {
        question: "When should I choose DTF instead of vinyl?",
        answer: "Choose DTF when the artwork is multi-color, detailed, or includes gradients. Vinyl is better for simple shapes, names, and limited-color logos.",
      },
      {
        question: "Is DTF good for small orders?",
        answer: "Yes. DTF is often chosen for smaller runs because it avoids the heavier setup logic of screen print while still handling detailed artwork well.",
      },
      {
        question: "Can DTF be used on hoodies and polos?",
        answer: "In many cases, yes. The garment and artwork still need to be checked first, but DTF can work across several apparel types.",
      },
    ],
    relatedSlugs: ["screen-printing-mauritius", "hoodie-printing-mauritius", "t-shirt-printing-mauritius"],
  },
  {
    slug: "screen-printing-mauritius",
    label: "Screen Printing",
    title: "Screen Printing Mauritius | Bulk Apparel Printing for Teams & Brands",
    description:
      "Screen printing in Mauritius for bulk T-shirt orders, teamwear, event kits, and business uniforms. Best value for larger quantities with simple artwork and repeatable branding.",
    heroTitle: "Screen printing for bulk apparel orders that need clean, repeatable results.",
    heroBody:
      "When the order size is higher and the design is relatively simple, screen print is usually the strongest value. It gives a sharp finish and makes the most sense for repeat team or event orders.",
    eyebrow: "Bulk-value printing",
    summary: "Best for larger quantities, simpler artwork, and orders that need repeatability.",
    heroImage: "/work/work-05.JPG",
    badges: ["Bulk orders", "Simple logos", "Repeat uniforms"],
    intro: [
      "Screen printing makes the most sense when quantity is high enough to spread the setup across the run. That is why it is often the best option for team uniforms, campaign tees, and large event orders.",
      "It works especially well when the artwork is clean, limited in color count, and expected to be repeated again in future orders.",
    ],
    highlights: [
      {
        title: "Stronger bulk economics",
        copy: "The larger the run, the better screen print tends to compare when the design stays simple.",
      },
      {
        title: "Sharp repeat output",
        copy: "Great for recurring uniforms and event shirts where consistency matters across many pieces.",
      },
      {
        title: "Simple designs perform best",
        copy: "Bold logos, text, and limited-color artwork usually fit this method best.",
      },
    ],
    bestFor: [
      "50+ piece runs with simple artwork",
      "Team shirts and corporate campaigns",
      "Repeat uniform programs",
      "Large event batches with strong deadline planning",
    ],
    faqs: [
      {
        question: "Is screen printing the cheapest option?",
        answer: "Usually only when the quantity is high enough and the design is simple. For smaller or more detailed jobs, DTF or vinyl can be more practical.",
      },
      {
        question: "What kind of artwork suits screen print best?",
        answer: "Simple logos, bold text, and limited-color designs are usually the best fit for screen printing.",
      },
      {
        question: "Can screen print work for uniforms?",
        answer: "Yes. It is often one of the best methods for repeating the same logo across a larger set of shirts for staff or teams.",
      },
    ],
    relatedSlugs: ["t-shirt-printing-mauritius", "event-shirts-mauritius", "dtf-printing-mauritius"],
  },
  {
    slug: "rush-order-printing-mauritius",
    label: "Rush Orders",
    title: "Rush T-Shirt Printing Mauritius | Fast Turnaround for Urgent Orders",
    description:
      "Rush T-shirt printing in Mauritius for urgent jobs, last-minute events, missing staff kits, and fast reorders. Best handled through quick approval, ready artwork, and fast WhatsApp coordination.",
    heroTitle: "Rush order printing when the deadline is close and the decision still has to be right.",
    heroBody:
      "Urgent printing only works well when the brief stays simple and communication stays fast. We can handle rush jobs when slots are open, but they need ready artwork, quick approvals, and realistic expectations.",
    eyebrow: "Urgent production",
    summary: "Fast-turnaround printing for urgent business, team, and event orders when capacity allows.",
    heroImage: "/work/work-06.JPG",
    badges: ["48h rush slots", "WhatsApp-first", "Ready artwork helps"],
    intro: [
      "Rush printing is not just normal printing with less time. It is a different workflow. The art file, quantity, garment availability, and print method all need to support the timeline from the start.",
      "If your event is close, a staff top-up is missing, or a client deadline moved forward, this page is the fastest route to finding out what is still realistic.",
    ],
    highlights: [
      {
        title: "Speed starts with the brief",
        copy: "Clear quantities, ready artwork, and quick approvals are what make a rush slot workable.",
      },
      {
        title: "Best for simpler setups",
        copy: "Rush jobs are easier when the garment choice and print approach are straightforward.",
      },
      {
        title: "WhatsApp is fastest",
        copy: "Urgent jobs should come through WhatsApp first so artwork and timing can be checked quickly.",
      },
    ],
    bestFor: [
      "Last-minute event kits",
      "Missing uniform top-ups",
      "Urgent client reorders",
      "Simple high-priority branded apparel needs",
    ],
    faqs: [
      {
        question: "How fast can a rush order be produced?",
        answer: "Rush timing depends on capacity and the brief, but 48-hour slots can be possible when artwork and garment choices are ready to go.",
      },
      {
        question: "What makes a rush order easier to accept?",
        answer: "Ready artwork, clear quantity, limited revisions, and a simple print method make urgent jobs much more realistic.",
      },
      {
        question: "Should I use the form or WhatsApp for urgent jobs?",
        answer: "For rush jobs, WhatsApp is the best first step. The form is still useful, but urgent jobs move faster when the conversation starts immediately.",
      },
    ],
    relatedSlugs: ["event-shirts-mauritius", "t-shirt-printing-mauritius", "plain-t-shirts-mauritius"],
  },
  {
    slug: "plain-t-shirts-mauritius",
    label: "Plain T-Shirts",
    title: "Plain T-Shirts Mauritius | Buy Blank T-Shirts by Size and Color",
    description:
      "Buy plain T-shirts in Mauritius with color, size, and delivery options. Good for fast blank stock orders, samples, team basics, and orders that may later move into printing.",
    heroTitle: "Plain T-shirts in Mauritius for fast stock orders and easy reorders.",
    heroBody:
      "Not every job needs printing. If you need blank tees first, this page points you to our plain-stock ordering flow so you can choose color, size, and quantity quickly.",
    eyebrow: "Blank stock",
    summary: "Blank T-shirts for stock orders, samples, reorders, and projects that do not need printing yet.",
    heroImage: "/all_products.jpg",
    badges: ["Blank stock", "Size and color selection", "WhatsApp ordering"],
    intro: [
      "Some customers need a simple blank-stock order before they need print. That can be for team basics, resale, events, samples, or a later branding phase.",
      "Our plain T-shirt flow is better for these cases because it lets you browse available items, check sizes, and send a structured WhatsApp order without filling a full print brief.",
    ],
    highlights: [
      {
        title: "Fastest route to plain stock",
        copy: "If you do not need branding yet, the plain-shop flow is a better fit than a printing quote form.",
      },
      {
        title: "Useful for samples and top-ups",
        copy: "Good for size checking, stock planning, and simple repeat orders.",
      },
      {
        title: "Easy handoff into printing later",
        copy: "Plain orders can still become branded orders once the artwork and plan are ready.",
      },
    ],
    bestFor: [
      "Blank T-shirt purchases without printing",
      "Sampling colours and sizes before production",
      "Fast stock top-ups for teams and sellers",
      "Orders that may move into branded print later",
    ],
    faqs: [
      {
        question: "Can I order plain shirts without printing?",
        answer: "Yes. This page is specifically for customers who want blank stock and do not need printing yet.",
      },
      {
        question: "Where do I choose colors and sizes?",
        answer: "Use the plain-shop ordering flow to browse available products, colors, and size options, then send the order via WhatsApp.",
      },
      {
        question: "Can a plain order turn into a printed order later?",
        answer: "Yes. Many customers start with blanks, then come back for branding once the artwork and quantity are confirmed.",
      },
    ],
    relatedSlugs: ["t-shirt-printing-mauritius", "rush-order-printing-mauritius", "polo-uniforms-mauritius"],
    extraAction: {
      href: "/shops",
      label: "Browse plain stock",
    },
  },
];

export const servicePageSlugs = servicePages.map((page) => page.slug);

export const servicePageCards = servicePages.map(({ slug, label, summary }) => ({
  slug,
  label,
  summary,
}));

export function getServicePageBySlug(slug: string) {
  return servicePages.find((page) => page.slug === slug) || null;
}
