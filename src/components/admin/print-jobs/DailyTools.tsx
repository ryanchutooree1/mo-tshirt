"use client";

import { useState } from "react";
import { Banknote, Check, Clipboard, Download, MessageCircle, Phone, Ruler } from "lucide-react";
import { CONTACT_TEL } from "@/data/work";
import { BUSINESS_PAYMENT_DETAILS } from "@/lib/business-payment-details";
import { JUICE_PHONE, PAYMENT_WHATSAPP_PHONE } from "@/lib/quotation-payment";
import styles from "./print-jobs.module.css";

const charts = [
  { label: "Adult T-shirt", href: "/T-Shirt%20Measurement.webp" },
  { label: "Adult polo", href: "/Polo-Shirt-Measurement.webp" },
  { label: "Kids T-shirt", href: "/Kids%20T-Shirt%20Measurement.webp" },
  { label: "Kids polo", href: "/Kids-Polo-Shirt-Measurement.webp" },
];

const messages = [
  {
    label: "Send a size chart",
    value: "Hello, please find our size chart attached. Please confirm the sizes and quantities you need.",
  },
  {
    label: "Send payment details",
    value: `Hello, payment can be made by MCB Juice on ${JUICE_PHONE}. Please send the payment proof on WhatsApp ${PAYMENT_WHATSAPP_PHONE} with your quotation number.`,
  },
];

export default function DailyTools() {
  const [copied, setCopied] = useState("");

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(current => current === label ? "" : current), 1800);
    } catch {
      setCopied("");
    }
  }

  const details = [
    { label: "Bank", value: BUSINESS_PAYMENT_DETAILS.bankName, icon: Banknote },
    { label: "Account holder", value: BUSINESS_PAYMENT_DETAILS.payee, icon: Banknote },
    { label: "Bank account number", value: BUSINESS_PAYMENT_DETAILS.accountNumber, icon: Banknote },
    { label: "MCB Juice", value: JUICE_PHONE, icon: Phone },
    { label: "Business phone", value: CONTACT_TEL, icon: Phone },
    { label: "Payment proof WhatsApp", value: PAYMENT_WHATSAPP_PHONE, icon: MessageCircle },
  ];

  return <section className={styles.dailyTools} aria-labelledby="daily-tools-title">
    <header className={styles.tabHeading}>
      <p className={styles.eyebrow}>TANVI · QUICK ACCESS</p>
      <h1 id="daily-tools-title">Daily tools<span>.</span></h1>
      <p>Download, copy and send the details you use every day.</p>
    </header>

    <div className={styles.dailyToolsGrid}>
      <section className={styles.toolPanel} aria-labelledby="size-chart-tools">
        <div className={styles.toolPanelHeading}><Ruler size={20} /><div><h2 id="size-chart-tools">Size charts</h2><p>Download the right chart, then attach it in WhatsApp.</p></div></div>
        <div className={styles.downloadList}>{charts.map(chart => <a key={chart.href} href={chart.href} download className={styles.downloadRow}><span>{chart.label}</span><Download size={17} aria-hidden="true" /></a>)}</div>
      </section>

      <section className={styles.toolPanel} aria-labelledby="business-details-tools">
        <div className={styles.toolPanelHeading}><Banknote size={20} /><div><h2 id="business-details-tools">Business details</h2><p>One click copies the exact saved detail.</p></div></div>
        <div className={styles.copyList}>{details.map(({ label, value, icon: Icon }) => <div key={label} className={styles.copyRow}><Icon size={16} aria-hidden="true" /><span><small>{label}</small><strong>{value}</strong></span><button type="button" onClick={() => void copy(label, value)} aria-label={`Copy ${label}`}>{copied === label ? <Check size={16} /> : <Clipboard size={16} />}{copied === label ? "Copied" : "Copy"}</button></div>)}</div>
      </section>

      <section className={`${styles.toolPanel} ${styles.messagePanel}`} aria-labelledby="message-tools">
        <div className={styles.toolPanelHeading}><MessageCircle size={20} /><div><h2 id="message-tools">Ready WhatsApp messages</h2><p>Copy, paste and send. You can edit the message before sending.</p></div></div>
        <div className={styles.messageList}>{messages.map(message => <article key={message.label}><div><h3>{message.label}</h3><button type="button" onClick={() => void copy(message.label, message.value)}>{copied === message.label ? <Check size={15} /> : <Clipboard size={15} />}{copied === message.label ? "Copied" : "Copy message"}</button></div><p>{message.value}</p></article>)}</div>
      </section>
    </div>
  </section>;
}
