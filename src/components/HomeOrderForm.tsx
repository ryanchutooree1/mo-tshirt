"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { trackQuoteSubmit } from "@/lib/analytics";
import styles from "../../app/founder-home.module.css";

export default function HomeOrderForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const payload = new FormData(event.currentTarget);
    const brief = String(payload.get("brief") || "").trim();
    const orderType = String(payload.get("type") || "");
    const name = String(payload.get("name") || "").trim();
    const phone = String(payload.get("phone") || "").trim();

    if (!name || !phone || !brief) {
      setError("Please add your name, contact number and order details.");
      return;
    }

    payload.set("name", name);
    payload.set("phone", phone);
    payload.set("email", "");
    payload.set("message", `Order type: ${orderType}\n${brief}`);
    payload.set("notes", `Order type: ${orderType}\n${brief}`);
    payload.set("source", "Homepage");
    payload.set("printMethod", "Not sure");
    payload.set("garment", "");
    payload.set("color", "");
    payload.set("size", "");
    payload.delete("brief");
    payload.delete("type");

    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result?.error || "We couldn’t send your request. Please try again.",
        );
        return;
      }
      setSent(true);
      trackQuoteSubmit({
        form_source: "Homepage",
        total_quantity: Number(payload.get("quantity")),
      });
    } catch {
      setError(
        "We couldn’t send your request. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.successCard} role="status">
        <Check size={32} aria-hidden="true" />
        <h3>Request received.</h3>
        <p>
          We’ll review your details and contact you on the number you provided.
        </p>
        <button type="button" onClick={() => setSent(false)}>
          Start another request
        </button>
      </div>
    );
  }

  return (
    <form
      className={styles.quoteForm}
      onSubmit={handleSubmit}
      aria-busy={pending}
    >
      <label>
        Your name
        <input
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Name or business"
          maxLength={120}
          required
          disabled={pending}
        />
      </label>
      <label>
        Contact number
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="WhatsApp number"
          maxLength={40}
          required
          disabled={pending}
        />
      </label>
      <div className={styles.formRow}>
        <label>
          Quantity
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 25"
            required
            disabled={pending}
          />
        </label>
        <label>
          Order type
          <select name="type" defaultValue="" required disabled={pending}>
            <option value="" disabled>
              Select one
            </option>
            <option>Business uniform</option>
            <option>Event or team</option>
            <option>Clothing brand</option>
            <option>Personal</option>
          </select>
        </label>
      </div>
      <label>
        What are you making?
        <textarea
          name="brief"
          placeholder="Tell us about the shirt, colour, print and deadline."
          rows={4}
          maxLength={1800}
          required
          disabled={pending}
        />
      </label>
      <div className={styles.trap} aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.submitButton} type="submit" disabled={pending}>
        {pending ? "Sending…" : "Request a quote"}{" "}
        <ArrowRight size={20} aria-hidden="true" />
      </button>
    </form>
  );
}
