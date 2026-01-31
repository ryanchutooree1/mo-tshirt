"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format, formatDistanceToNow } from "date-fns";
import { jsPDF } from "jspdf";
import {
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiMail,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiXCircle,
  FiUpload,
} from "react-icons/fi";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/data/work";

type QuoteStatus = "new" | "review" | "approved" | "sent";

type QuoteLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

type QuoteDraft = {
  currency: string;
  lines: QuoteLine[];
  deliveryFee: number;
  discount: number;
  notes: string;
  validUntil: string;
};

type QuoteRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  garments?: { garment?: string; quantity?: string | number }[];
  printMethod?: string;
  quantity?: string | number;
  deadline?: string;
  notes?: string;
  source?: string;
  delivery?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  deliveryPostCode?: string;
  deliveryPhone?: string;
  attachment?: { filename?: string; contentType?: string; size?: number | null; url?: string };
  status?: QuoteStatus;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  quote?: {
    currency?: string;
    lines?: QuoteLine[];
    deliveryFee?: number;
    discount?: number;
    notes?: string;
    validUntil?: string;
    subtotal?: number;
    total?: number;
  };
};

const STATUS_LABELS: Record<QuoteStatus, string> = {
  new: "New",
  review: "In review",
  approved: "Approved",
  sent: "Sent",
};

const STATUS_TONES: Record<QuoteStatus, string> = {
  new: "border-amber-200 bg-amber-50 text-amber-700",
  review: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sent: "border-slate-200 bg-slate-100 text-slate-700",
};

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseTimestamp = (value: any) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatMoney = (value: number, currency = "Rs") =>
  `${currency} ${Number(value || 0).toLocaleString()}`;

const buildDraftFromQuote = (quote: QuoteRecord): QuoteDraft => {
  if (quote.quote?.lines?.length) {
    return {
      currency: quote.quote.currency || "Rs",
      lines: quote.quote.lines.map((line) => ({
        description: line.description || "",
        quantity: safeNumber(line.quantity, 0),
        unitPrice: safeNumber(line.unitPrice, 0),
      })),
      deliveryFee: safeNumber(quote.quote.deliveryFee, 0),
      discount: safeNumber(quote.quote.discount, 0),
      notes: quote.quote.notes || "",
      validUntil: quote.quote.validUntil || "",
    };
  }

  const fromGarments =
    quote.garments?.map((entry) => ({
      description: entry.garment || "Custom item",
      quantity: safeNumber(entry.quantity, 0),
      unitPrice: 0,
    })) || [];

  const lines = fromGarments.length
    ? fromGarments
    : [
        {
          description: "Custom item",
          quantity: safeNumber(quote.quantity, 1),
          unitPrice: 0,
        },
      ];

  return {
    currency: "Rs",
    lines,
    deliveryFee: quote.delivery?.includes("Post Office") ? 100 : 0,
    discount: 0,
    notes: "",
    validUntil: "",
  };
};

function buildPdfDoc(quote: QuoteRecord, draft: QuoteDraft) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const now = new Date();
  const totals = draft.lines.reduce(
    (acc, line) => acc + safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
    0
  );
  const subtotal = totals;
  const total = subtotal + draft.deliveryFee - draft.discount;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Quotation", 40, 48);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Quote ID: ${quote.id}`, 40, 64);
  doc.text(`Date: ${format(now, "dd MMM yyyy")}`, 40, 78);

  doc.setFont("helvetica", "bold");
  doc.text("MO T-SHIRT", 400, 48);
  doc.setFont("helvetica", "normal");
  doc.text(CONTACT_EMAIL, 400, 64);
  doc.text(CONTACT_PHONE_DISPLAY, 400, 78);

  let y = 110;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Client", 40, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(quote.name || "—", 40, y);
  y += 14;
  doc.text(quote.email || "—", 40, y);
  y += 14;
  if (quote.phone) {
    doc.text(quote.phone, 40, y);
    y += 14;
  }

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Request", 40, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(`Print method: ${quote.printMethod || "n/a"}`, 40, y);
  y += 14;
  doc.text(`Deadline: ${quote.deadline || "n/a"}`, 40, y);
  y += 14;
  doc.text(`Delivery: ${quote.delivery || "n/a"}`, 40, y);

  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFillColor(245, 245, 245);
  doc.rect(40, y - 14, 515, 22, "F");
  doc.text("Description", 48, y);
  doc.text("Qty", 330, y, { align: "right" });
  doc.text("Unit", 430, y, { align: "right" });
  doc.text("Total", 540, y, { align: "right" });

  y += 20;
  doc.setFont("helvetica", "normal");
  draft.lines.forEach((line) => {
    const lineTotal = safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0);
    doc.text(line.description || "Item", 48, y);
    doc.text(String(safeNumber(line.quantity, 0)), 330, y, { align: "right" });
    doc.text(formatMoney(safeNumber(line.unitPrice, 0), draft.currency), 430, y, { align: "right" });
    doc.text(formatMoney(lineTotal, draft.currency), 540, y, { align: "right" });
    y += 18;
    if (y > 720) {
      doc.addPage();
      y = 60;
    }
  });

  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.line(360, y, 540, y);
  y += 18;
  doc.text("Subtotal", 430, y, { align: "right" });
  doc.text(formatMoney(subtotal, draft.currency), 540, y, { align: "right" });
  y += 16;
  if (draft.deliveryFee) {
    doc.text("Delivery", 430, y, { align: "right" });
    doc.text(formatMoney(draft.deliveryFee, draft.currency), 540, y, { align: "right" });
    y += 16;
  }
  if (draft.discount) {
    doc.text("Discount", 430, y, { align: "right" });
    doc.text(`- ${formatMoney(draft.discount, draft.currency)}`, 540, y, { align: "right" });
    y += 16;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Total", 430, y, { align: "right" });
  doc.text(formatMoney(total, draft.currency), 540, y, { align: "right" });
  doc.setFont("helvetica", "normal");

  if (draft.notes) {
    y += 28;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 40, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(draft.notes, 500);
    doc.text(lines, 40, y);
    y += lines.length * 12;
  }

  if (draft.validUntil) {
    y += 18;
    doc.text(`Valid until: ${draft.validUntil}`, 40, y);
  }

  return doc;
}

export default function QuotationApprovalPage() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "quotes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            ...data,
            createdAt: parseTimestamp(data.createdAt),
            updatedAt: parseTimestamp(data.updatedAt),
          } as QuoteRecord;
        });
        setQuotes(next);
        setLoading(false);
        setError(null);
      },
      () => {
        setError("Failed to load quotations.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!quotes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !quotes.find((q) => q.id === selectedId)) {
      setSelectedId(quotes[0].id);
    }
  }, [quotes, selectedId]);

  const selected = useMemo(
    () => quotes.find((quote) => quote.id === selectedId) || null,
    [quotes, selectedId]
  );

  const attachment = selected?.attachment;
  const attachmentIsImage = Boolean(attachment?.contentType?.startsWith("image/"));

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(buildDraftFromQuote(selected));
  }, [selected?.id]);

  const filtered = useMemo(() => {
    return quotes.filter((quote) => {
      if (statusFilter !== "all" && quote.status !== statusFilter) return false;
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        quote.name?.toLowerCase().includes(query) ||
        quote.email?.toLowerCase().includes(query) ||
        quote.phone?.toLowerCase().includes(query) ||
        quote.source?.toLowerCase().includes(query)
      );
    });
  }, [quotes, search, statusFilter]);

  const stats = useMemo(() => {
    const base = { total: quotes.length, new: 0, review: 0, approved: 0, sent: 0 };
    quotes.forEach((quote) => {
      const status = quote.status || "new";
      base[status] += 1;
    });
    return base;
  }, [quotes]);

  const totals = useMemo(() => {
    if (!draft) return { subtotal: 0, total: 0 };
    const subtotal = draft.lines.reduce(
      (acc, line) => acc + safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
      0
    );
    const total = subtotal + draft.deliveryFee - draft.discount;
    return { subtotal, total };
  }, [draft]);

  const updateDraftLine = (index: number, patch: Partial<QuoteLine>) => {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = prev.lines.slice();
      if (!next[index]) return prev;
      next[index] = {
        ...next[index],
        ...patch,
      };
      return { ...prev, lines: next };
    });
  };

  const addDraftLine = () => {
    if (!draft) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: [...prev.lines, { description: "Custom item", quantity: 1, unitPrice: 0 }],
          }
        : prev
    );
  };

  const removeDraftLine = (index: number) => {
    if (!draft) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index),
          }
        : prev
    );
  };

  const saveDraft = async (nextStatus?: QuoteStatus) => {
    if (!selected || !draft) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        currency: draft.currency,
        lines: draft.lines,
        deliveryFee: draft.deliveryFee,
        discount: draft.discount,
        notes: draft.notes,
        validUntil: draft.validUntil,
        subtotal: totals.subtotal,
        total: totals.total,
      };
      await updateDoc(doc(db, "quotes", selected.id), {
        status: nextStatus || selected.status || "review",
        quote: payload,
        updatedAt: serverTimestamp(),
      });
      setNotice("Quote saved.");
    } catch {
      setNotice("Failed to save quote.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selected || !draft) return;
    const doc = buildPdfDoc(selected, draft);
    doc.save(`quotation-${selected.id}.pdf`);
  };

  const handleSend = async () => {
    if (!selected || !draft) return;
    setSending(true);
    setNotice(null);
    try {
      const pdfDoc = buildPdfDoc(selected, draft);
      const pdfDataUri = pdfDoc.output("datauristring");
      const clientName = selected.name || "there";
      const payload = {
        quoteId: selected.id,
        to: selected.email,
        subject: `Your quotation from MO T-SHIRT`,
        message: draft.notes?.trim()
          ? `Hi ${clientName},\n\nPlease find your quotation attached.\n\n${draft.notes}\n\n— MO T-SHIRT`
          : `Hi ${clientName},\n\nPlease find your quotation attached.\n\n— MO T-SHIRT`,
        pdfBase64: pdfDataUri,
        quote: {
          currency: draft.currency,
          lines: draft.lines,
          deliveryFee: draft.deliveryFee,
          discount: draft.discount,
          notes: draft.notes,
          validUntil: draft.validUntil,
          subtotal: totals.subtotal,
          total: totals.total,
        },
      };

      const res = await fetch("/api/admin/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to send");
      }
      setNotice("Quote sent to client.");
    } catch {
      setNotice("Could not send quote.");
    } finally {
      setSending(false);
    }
  };

  const handleAttachmentUpload = async (file: File) => {
    if (!selected) return;
    setUploadingAttachment(true);
    setNotice(null);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const uploadRef = ref(storage, `quotes/${selected.id}/${Date.now()}-${safeName}`);
      const snap = await uploadBytes(uploadRef, file);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "quotes", selected.id), {
        attachment: {
          url,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        },
        updatedAt: serverTimestamp(),
      });
      setNotice("Attachment uploaded.");
    } catch {
      setNotice("Failed to upload attachment.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7fb] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-28 top-[-10rem] h-64 w-64 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="pointer-events-none absolute right-[-6rem] top-8 h-80 w-80 rounded-full bg-zinc-200/60 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-slate-100/70 blur-3xl" />

        <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">MO Admin</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Quotation Approval
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Approve quotes fast, generate PDFs, and send them straight to clients.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <FiRefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total", value: stats.total },
              { label: "New", value: stats.new },
              { label: "In review", value: stats.review },
              { label: "Sent", value: stats.sent },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-4 rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <FiSearch className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="Search name, email, phone..."
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                {(["all", "new", "review", "approved", "sent"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-full border px-3 py-1 transition ${
                      statusFilter === status
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {status === "all" ? "All" : STATUS_LABELS[status]}
                  </button>
                ))}
              </div>

              {loading && <p className="text-xs text-slate-500">Loading quotations...</p>}
              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="space-y-3">
                {filtered.map((quote) => {
                  const createdAt = quote.createdAt ? formatDistanceToNow(quote.createdAt, { addSuffix: true }) : "—";
                  const status = quote.status || "new";
                  return (
                    <button
                      key={quote.id}
                      type="button"
                      onClick={() => setSelectedId(quote.id)}
                      className={`w-full rounded-[22px] border px-4 py-3 text-left shadow-sm transition ${
                        selectedId === quote.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{quote.name || "Unnamed client"}</p>
                          <p className={`text-xs ${selectedId === quote.id ? "text-slate-200" : "text-slate-500"}`}>
                            {quote.email}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                            selectedId === quote.id ? "border-white/30 bg-white/10 text-white" : STATUS_TONES[status]
                          }`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </div>
                      <div className={`mt-3 flex items-center justify-between text-xs ${selectedId === quote.id ? "text-slate-200" : "text-slate-400"}`}>
                        <span>{createdAt}</span>
                        <span>{quote.source || "Website"}</span>
                      </div>
                    </button>
                  );
                })}
                {!filtered.length && !loading && (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                    No quotations match those filters.
                  </div>
                )}
              </div>
            </aside>

            <section className="space-y-6">
              {selected && draft ? (
                <>
                  <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Client</p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selected.name}</h2>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1"><FiMail /> {selected.email}</span>
                          {selected.phone && <span className="inline-flex items-center gap-1"><FiPhone /> {selected.phone}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_TONES[selected.status || "new"]}`}>
                          {STATUS_LABELS[selected.status || "new"]}
                        </span>
                        {selected.attachment?.filename && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                            <FiFileText /> {selected.attachment.filename}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Request</p>
                        <p className="mt-3 text-sm text-slate-700">
                          <span className="font-semibold">Garments:</span>{" "}
                          {(selected.garments || [])
                            .map((g) => `${g.garment || "Item"} x ${g.quantity || "0"}`)
                            .join(", ") || "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Print:</span> {selected.printMethod || "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Deadline:</span> {selected.deadline || "n/a"}
                        </p>
                        <div className="mt-4 space-y-2">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Attachment</p>
                          {attachment?.url ? (
                            <>
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                              >
                                <FiFileText /> Open file
                              </a>
                              {attachmentIsImage && (
                                <div className="relative h-40 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                  <Image
                                    src={attachment.url}
                                    alt={attachment.filename || "Attachment"}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                              )}
                            </>
                          ) : attachment?.filename ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
                              Attachment received via email: {attachment.filename}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
                              No attachment uploaded yet.
                            </div>
                          )}
                          <label
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              uploadingAttachment
                                ? "border-slate-200 bg-slate-100 text-slate-400"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <FiUpload /> {uploadingAttachment ? "Uploading..." : attachment?.url ? "Replace file" : "Upload file"}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              disabled={uploadingAttachment}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAttachmentUpload(file);
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Delivery</p>
                        <p className="mt-3 text-sm text-slate-700">{selected.delivery || "n/a"}</p>
                        <p className="mt-2 text-sm text-slate-700">{selected.deliveryAddress || "Address not provided"}</p>
                        <p className="mt-2 text-sm text-slate-700">{selected.deliveryPhone || "Phone not provided"}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Timeline</p>
                        <p className="mt-3 text-sm text-slate-700">
                          Created {selected.createdAt ? format(selected.createdAt, "dd MMM yyyy") : "—"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          Updated {selected.updatedAt ? format(selected.updatedAt, "dd MMM yyyy") : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quotation Draft</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          Price, approve, and send in minutes
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={addDraftLine}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                      >
                        <FiPlus className="h-4 w-4" /> Add line
                      </button>
                    </div>

                    <div className="mt-5 space-y-3">
                      {draft.lines.map((line, index) => (
                        <div
                          key={`${line.description}-${index}`}
                          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[1fr_110px_120px_120px_auto] sm:items-center"
                        >
                          <input
                            value={line.description}
                            onChange={(e) => updateDraftLine(index, { description: e.target.value })}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder="Description"
                          />
                          <input
                            type="number"
                            min={0}
                            value={line.quantity}
                            onChange={(e) => updateDraftLine(index, { quantity: safeNumber(e.target.value, 0) })}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right"
                          />
                          <input
                            type="number"
                            min={0}
                            value={line.unitPrice}
                            onChange={(e) => updateDraftLine(index, { unitPrice: safeNumber(e.target.value, 0) })}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right"
                          />
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right font-semibold text-slate-800">
                            {formatMoney(line.quantity * line.unitPrice, draft.currency)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDraftLine(index)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 transition hover:bg-slate-100"
                          >
                            <FiXCircle />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-600">
                            Currency
                            <input
                              value={draft.currency}
                              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Valid until
                            <input
                              type="date"
                              value={draft.validUntil}
                              onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Delivery fee
                            <input
                              type="number"
                              min={0}
                              value={draft.deliveryFee}
                              onChange={(e) => setDraft({ ...draft, deliveryFee: safeNumber(e.target.value, 0) })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Discount
                            <input
                              type="number"
                              min={0}
                              value={draft.discount}
                              onChange={(e) => setDraft({ ...draft, discount: safeNumber(e.target.value, 0) })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                        <label className="text-xs font-medium text-slate-600">
                          Notes to client
                          <textarea
                            value={draft.notes}
                            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                            rows={4}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder="Add any extra details or inclusions..."
                          />
                        </label>
                      </div>

                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Totals</p>
                        <div className="mt-4 space-y-2 text-sm text-slate-700">
                          <div className="flex items-center justify-between">
                            <span>Subtotal</span>
                            <span className="font-semibold">{formatMoney(totals.subtotal, draft.currency)}</span>
                          </div>
                          {draft.deliveryFee > 0 && (
                            <div className="flex items-center justify-between">
                              <span>Delivery</span>
                              <span className="font-semibold">{formatMoney(draft.deliveryFee, draft.currency)}</span>
                            </div>
                          )}
                          {draft.discount > 0 && (
                            <div className="flex items-center justify-between text-rose-600">
                              <span>Discount</span>
                              <span className="font-semibold">- {formatMoney(draft.discount, draft.currency)}</span>
                            </div>
                          )}
                          <div className="mt-4 flex items-center justify-between text-base font-semibold text-slate-900">
                            <span>Total</span>
                            <span>{formatMoney(totals.total, draft.currency)}</span>
                          </div>
                        </div>
                        <div className="mt-5 space-y-2">
                          <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            <FiDownload /> Download PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => saveDraft("review")}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <FiEdit2 /> {saving ? "Saving..." : "Save draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveDraft("approved")}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <FiCheckCircle /> Mark approved
                    </button>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !selected.email}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      <FiSend /> {sending ? "Sending..." : "Approve & send"}
                    </button>
                    {notice && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        <FiClock /> {notice}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center text-sm text-slate-500">
                  Select a quote to begin approval.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
