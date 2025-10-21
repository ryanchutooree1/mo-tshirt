"use client";

import { useState } from "react";
import MapCard from "@/components/MapCard";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(
    null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const body = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: body?.message || "Message sent." });
        setName("");
        setEmail("");
        setMessage("");
      } else {
        setResult({ ok: false, msg: body?.error || "Something went wrong." });
      }
    } catch {
      setResult({ ok: false, msg: "Network error." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="px-6 md:px-8 py-20 mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold mb-4">Contact us</h1>
      <p className="text-gray-700 mb-6">
        Send us your artwork or questions. We reply quickly. Or message us on
        WhatsApp.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="you@example.com"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 min-h-[120px]"
              placeholder="Tell us what you need (logo, quantity, sizes, deadline)"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-orange-500 text-white rounded-full shadow hover:bg-orange-600 transition"
            >
              {loading ? "Sending..." : "Send message"}
            </button>

            <a
              href="https://wa.me/23059883880"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-orange-500 rounded-full hover:bg-orange-50 transition"
            >
              WhatsApp
            </a>
          </div>

          {result && (
            <div
              role="status"
              className={`mt-3 text-sm ${
                result.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {result.msg}
            </div>
          )}
        </form>

        <aside className="p-4 border rounded-lg bg-white">
          <h3 className="font-semibold mb-2">Visit / Pickup</h3>
          <p className="text-sm text-gray-600 mb-3">
            Pickup location: Surinam, Mauritius. Delivery via Mauritius Post.
          </p>

          <h3 className="font-semibold mb-2">Business hours</h3>
          <p className="text-sm text-gray-600">Mon–Fri: 9:00 — 17:00</p>

          <h3 className="font-semibold mt-4 mb-2">Quick contact</h3>
          <p className="text-sm text-gray-600">Phone / WhatsApp: +230 5988 3880</p>
          <p className="text-sm text-gray-600">Email: hello@mo-tshirt.example</p>
        </aside>
      </div>

      <div className="mt-10">
        <MapCard />
      </div>
    </section>
  );
}
