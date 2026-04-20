export const READY_MADE_UNIFORMS_PATH = "/ready-made-uniforms";

export type ReadyMadeUniform = {
  code: string;
  title: string;
  audience: string;
  description: string;
  features: string[];
  imageSrc: string;
  accentClass: string;
  badgeClass: string;
  message: string;
};

export type ReadyMadeUniformStep = {
  title: string;
  copy: string;
};

export type ReadyMadeUniformFaq = {
  question: string;
  answer: string;
};

export const readyMadeUniforms: ReadyMadeUniform[] = [
  {
    code: "SEC-01",
    title: "Security Poloshirts",
    audience: "For guards, supervisors, and patrol teams",
    description:
      "A sharp polo layout with chest logo placement, strong contrast zones, and a serious corporate look that works across sites.",
    features: ["Add company logo", "Black, navy, or grey base", "Built for repeat orders"],
    imageSrc: "/mockups/polo-front.png",
    accentClass: "from-slate-950 via-slate-800 to-slate-700",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    message:
      "Hi! I want the ready-made uniform SEC-01 Security Poloshirt. Can you customize it with my logo?",
  },
  {
    code: "STAFF-02",
    title: "Staff Poloshirts",
    audience: "For office teams, sales staff, and shop crews",
    description:
      "A clean business polo that makes staff look coordinated without needing a custom design process for every new order.",
    features: ["Simple logo setup", "Works across departments", "Easy to restock later"],
    imageSrc: "/mockups/polo-back.png",
    accentClass: "from-orange-500 via-amber-500 to-yellow-400",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
    message:
      "Hi! I want the ready-made uniform STAFF-02 Staff Poloshirt. Can you customize it with my logo?",
  },
  {
    code: "REST-03",
    title: "Restaurant Uniforms",
    audience: "For waiters, kitchen staff, and delivery teams",
    description:
      "Designed to feel tidy and branded in front-of-house settings while staying practical for fast-moving restaurant teams.",
    features: ["Front and back branding", "Good for team roles", "Professional hospitality look"],
    imageSrc: "/mockups/tshirt-front.png",
    accentClass: "from-red-600 via-orange-500 to-amber-300",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    message:
      "Hi! I want the ready-made uniform REST-03 Restaurant Uniform. Can you customize it with my logo?",
  },
  {
    code: "SPORT-04",
    title: "Organisation & Sport Teams",
    audience: "For clubs, event crews, and company teams",
    description:
      "A proven teamwear format for events, sports days, associations, and branded community groups that need fast coordination.",
    features: ["Strong team identity", "Names and numbers possible", "Best for bulk quantities"],
    imageSrc: "/mockups/tshirt-back.png",
    accentClass: "from-blue-600 via-cyan-500 to-sky-300",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    message:
      "Hi! I want the ready-made uniform SPORT-04 Organisation & Sport Team design. Can you customize it with my logo?",
  },
  {
    code: "NGO-05",
    title: "Donation & NGO Shirts",
    audience: "For charity drives, fundraisers, and outreach teams",
    description:
      "A ready layout for campaign visibility with space for sponsor logos, event names, and messaging that still looks organized.",
    features: ["Great for campaigns", "Sponsor-friendly placement", "Fast to launch"],
    imageSrc: "/mockups/hoodie-front.png",
    accentClass: "from-emerald-600 via-green-500 to-lime-300",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    message:
      "Hi! I want the ready-made uniform NGO-05 Donation & NGO Shirt. Can you customize it with my logo?",
  },
  {
    code: "SYN-06",
    title: "Syndic & Corporate Teams",
    audience: "For syndics, maintenance teams, and formal organisations",
    description:
      "A stable branded uniform offer for property teams and organised groups that want a serious, repeatable, long-term identity.",
    features: ["Corporate-ready look", "Ideal for recurring orders", "Suitable for mixed teams"],
    imageSrc: "/mockups/hoodie-back.png",
    accentClass: "from-violet-700 via-fuchsia-600 to-pink-400",
    badgeClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    message:
      "Hi! I want the ready-made uniform SYN-06 Syndic & Corporate Team design. Can you customize it with my logo?",
  },
];

export const readyMadeUniformSteps: ReadyMadeUniformStep[] = [
  {
    title: "Choose a style code",
    copy: "Pick a ready-made design like SEC-01 or REST-03 instead of starting from zero.",
  },
  {
    title: "Send your logo",
    copy: "We apply your brand, color direction, and role text to the chosen layout.",
  },
  {
    title: "Approve the mockup",
    copy: "You confirm the final look quickly because the structure is already proven.",
  },
  {
    title: "Reorder anytime",
    copy: "Use the same design again later for new staff, new branches, or a bigger team.",
  },
];

export const readyMadeUniformHighlights = [
  "Security",
  "Restaurants",
  "Staff teams",
  "Sport clubs",
  "NGOs",
  "Syndics",
];

export const readyMadeUniformFaqs: ReadyMadeUniformFaq[] = [
  {
    question: "Can I use one of these designs with my own logo?",
    answer:
      "Yes. The point of this offer is to start from a proven layout, then customize it with your logo, colors, and team wording.",
  },
  {
    question: "Do I have to order a completely new design each time?",
    answer:
      "No. Once your uniform setup is approved, you can repeat the same style code for future staff and branch orders.",
  },
  {
    question: "Which teams are these designs best for?",
    answer:
      "They work well for security companies, restaurants, staff teams, associations, NGOs, sports groups, syndic teams, and other repeat uniform buyers.",
  },
  {
    question: "How do I request pricing?",
    answer:
      "Send the style code you want, your logo, the quantity, and any role text. We can quote fast because the structure is already defined.",
  },
];
