/** @type {import('next-sitemap').IConfig} */
const siteUrl =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

module.exports = {
  siteUrl,
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [{ userAgent: "*", allow: "/" }],
  },
  exclude: ["/login", "/api/*"],
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
      lastmod: new Date().toISOString(),
      alternateRefs: config.alternateRefs ?? [],
    };
  },
};
