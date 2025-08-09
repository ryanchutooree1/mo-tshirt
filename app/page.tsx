export default function Home() {
  return (
    <main className="px-6 py-12 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-4">
        Premium Custom Printing for <span className="text-orange-500">T-Shirts, Polos & Caps</span>
      </h1>
      <p className="text-lg mb-6">
        Mauritius-based print studio specialising in DTF & Vinyl. Perfect for companies, schools, clubs and events. Pick-up in Surinam or delivery via Post.
      </p>

      <div className="flex gap-4">
        <a href="https://wa.me/23054237630" className="px-6 py-3 bg-black text-white rounded-full">
          Get a Quote on WhatsApp
        </a>
        <a href="/work" className="px-6 py-3 border border-black rounded-full">
          See Our Work
        </a>
      </div>
    </main>
  );
}
