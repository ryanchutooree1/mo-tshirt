/** @type {import('next-sitemap').IConfig} */
const siteUrl = "https://www.mo-tshirt.mu";

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
        disallow: ["/admin", "/admin/*", "/login", "/design-studio", "/iot"],
      },
    ],
  },
  exclude: ["/login", "/api/*", "/admin", "/admin/*", "/design-studio", "/iot", "/icon.png"],
  changefreq: "weekly",
  priority: 0.7,
  sitemapSize: 5000,
  transform: async (config, path) => {
    const normalized = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
    let priority = 0.7;
    if (normalized === "/") priority = 1.0;
    else if (normalized === "/contact") priority = 0.9;
    else if (normalized === "/work" || normalized === "/our-work") priority = 0.9;
    else if (normalized === "/products" || normalized === "/shop") priority = 0.8;
    return {
      loc: path,
      changefreq: config.changefreq ?? "weekly",
      priority,
      alternateRefs: config.alternateRefs ?? [],
    };
  },
};
