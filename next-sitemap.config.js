/** @type {import('next-sitemap').IConfig} */
const siteUrl = "https://www.mo-tshirt.mu";
const servicePages = new Set([
  "/t-shirt-printing-mauritius",
  "/polo-uniforms-mauritius",
  "/hoodie-printing-mauritius",
  "/event-shirts-mauritius",
  "/dtf-printing-mauritius",
  "/screen-printing-mauritius",
  "/rush-order-printing-mauritius",
]);

module.exports = {
  siteUrl,
  generateRobotsTxt: true,
  // Avoid daily diffs by omitting dynamic lastmod timestamps
  autoLastmod: false,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
        // Private routes are excluded from the sitemap and return auth/noindex responses.
        // Do not block them in robots.txt, otherwise Google cannot see the noindex/redirect.
      },
    ],
  },
  exclude: [
    "/login",
    "/api/*",
    "/admin",
    "/admin/*",
    "/cbe",
    "/design-studio",
    "/iot",
    "/our-dream",
    "/icon.png",
  ],
  changefreq: "weekly",
  priority: 0.7,
  sitemapSize: 5000,
  additionalPaths: async (config) =>
    Promise.all([
      config.transform(config, "/shop"),
      config.transform(config, "/ready-made-uniforms"),
    ]),
  transform: async (config, path) => {
    const normalized = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
    let priority = 0.7;
    if (normalized === "/") priority = 1.0;
    else if (normalized === "/contact") priority = 0.9;
    else if (normalized === "/shop") priority = 0.85;
    else if (servicePages.has(normalized)) priority = 0.85;
    return {
      loc: path,
      changefreq: config.changefreq ?? "weekly",
      priority,
      alternateRefs: config.alternateRefs ?? [],
    };
  },
};
