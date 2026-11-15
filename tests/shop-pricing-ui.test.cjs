const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");
const React = require("react");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/shop", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver", "getComputedStyle"]) global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, within, cleanup } = require("@testing-library/react");
const modules = new Map();
const anchor = { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, window, document, URL, setTimeout, clearTimeout,
    fetch: (...args) => global.fetch(...args),
    require(name) {
      if (name.endsWith(".css")) return { default: {} };
      if (name === "next/image") return { default: ({ alt }) => React.createElement("img", { alt }) };
      if (name === "next/link" || name === "@/components/TrackedWhatsAppLink") return anchor;
      if (name === "@/lib/analytics") return { trackProductInterest() {}, trackWhatsAppClick() {} };
      if (name === "@/data/ready-made-uniforms") return { READY_MADE_UNIFORMS_PATH: "/uniforms" };
      if (name === "@/data/work") return { getWhatsAppUrl: (message) => "https://example.invalid/send?text=" + encodeURIComponent(message) };
      if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
      return require(name);
    },
  }, { filename: file });
  modules.set(file, mod.exports);
  return mod.exports;
}
const ShopClient = load("app/shops/ShopClient.tsx").default;
const { mapPublicShopItem } = load("src/lib/shops-public-api.ts");
const fixture = (id, title, colors, sizes, poloMaterial) => mapPublicShopItem(id, {
  title, colors, sizes, poloMaterial, inStock: true, basePrice: 175,
  sizePrices: sizes.map((size) => ({ size, price: 175, buyingPrice: 95, profit: 80 })),
});
test("size and colour selection, cart, and unopened WhatsApp order use public selling prices only", async () => {
  global.fetch = async (url) => {
    assert.equal(url, "/api/shops");
    return Response.json({ items: [
      fixture("tee", "Plain T-Shirt", ["Red", "Aqua"], ["XS", "2XL"]),
      fixture("kid", "Plain T-Shirt", ["White"], ["1 Yr"]),
      fixture("unknown", "Plain Poloshirt", ["Royal Blue"], ["XS"]),
      fixture("known", "Plain Poloshirt", ["Black"], ["XS"], "cotton-single-pique"),
    ] });
  };
  const card = async (color) => within((await screen.findByRole("heading", { name: new RegExp(color) })).closest("article"));
  const shown = (scope, amount) => assert.ok(scope.getByText(new RegExp("Rs\\s+" + amount + "$")));
  try {
    render(React.createElement(ShopClient, { uniforms: [] }));
    const tee = await card("Red"), kid = await card("White"), unknown = await card("Royal Blue"), known = await card("Black");
    shown(tee, 200); shown(kid, 150); shown(known, 375);
    assert.ok(unknown.getByText("Price to confirm"));
    assert.equal(unknown.getByRole("button", { name: "Add to order" }).disabled, true);
    fireEvent.click(tee.getByRole("button", { name: "Add to order" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(tee.getByRole("button", { name: "2XL" }));
    fireEvent.change(tee.getByLabelText("Color"), { target: { value: "Aqua" } });
    shown(tee, 300);
    fireEvent.click(tee.getByRole("button", { name: "Add to order" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(kid.getByRole("button", { name: "Add to order" }));
    const order = within(screen.getByRole("dialog", { name: "Order list" }));
    assert.ok(order.getAllByText(/Rs\s+650\.00/).length >= 1);
    const draft = new URL(order.getByRole("link", { name: "Send Order on WhatsApp" }).href).searchParams.get("text");
    assert.match(draft, /Color: Red \| Size: XS \| Qty: 1 \| Price: Rs 200\.00/);
    assert.match(draft, /Color: Aqua \| Size: 2XL \| Qty: 1 \| Price: Rs 300\.00/);
    assert.match(draft, /Color: White \| Size: 1 Yr \| Qty: 1 \| Price: Rs 150\.00/);
    assert.match(draft, /Total: Rs 650\.00/);
    assert.doesNotMatch(draft, /buyingPrice|profit|Rs (95|80)\b/);
  } finally { cleanup(); }
});
