"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  CheckCircle2,
  FileImage,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Save,
  ScanText,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { db } from "@/lib/firebase";

type PrescriptionFields = {
  patientName: string;
  age: string;
  date: string;
  medicine1Name: string;
  medicine1Dosage: string;
  medicine1Frequency: string;
  medicine1Duration: string;
  medicine1Notes: string;
  medicine2Name: string;
  medicine2Dosage: string;
  medicine2Frequency: string;
  medicine2Duration: string;
  medicine2Notes: string;
  rawOcrText: string;
};

type MedicineGuess = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
};

const EMPTY_FIELDS: PrescriptionFields = {
  patientName: "",
  age: "",
  date: "",
  medicine1Name: "",
  medicine1Dosage: "",
  medicine1Frequency: "",
  medicine1Duration: "",
  medicine1Notes: "",
  medicine2Name: "",
  medicine2Dosage: "",
  medicine2Frequency: "",
  medicine2Duration: "",
  medicine2Notes: "",
  rawOcrText: "",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";
const LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.08em] text-slate-500";
const PANEL_CLASS = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-24 resize-y leading-6`;

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/[|_]+/g, " ").trim();
}

function pickFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanLine(match[1]);
  }
  return "";
}

function findDate(text: string) {
  return pickFirstMatch(text, [
    /\bdate\s*[:\-]?\s*([0-3]?\d[\/.\-][01]?\d[\/.\-](?:\d{2}|\d{4}))/i,
    /\b([0-3]?\d[\/.\-][01]?\d[\/.\-](?:\d{2}|\d{4}))\b/,
  ]);
}

function findLabeledValue(lines: string[], labels: RegExp[]) {
  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(label);
      if (match?.[1]) return cleanLine(match[1]);
    }
  }
  return "";
}

function parseMedicineLine(line: string): MedicineGuess {
  const dosageMatch = line.match(
    /\b(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ml|l|iu|ui|%|units?|tabs?|tablets?|caps?|capsules?|drops?|puffs?|sachets?))\b/i
  );
  const frequencyMatch = line.match(
    /\b((?:\d+\s*(?:x|fois)\s*(?:\/|per)?\s*(?:day|jour|daily)?|once daily|twice daily|morning|night|noon|matin|midi|soir|bd|od|tds|qid|q\d+h))\b/i
  );
  const durationMatch = line.match(
    /\b(\d+\s*(?:days?|jours?|weeks?|semaines?|months?|mois))\b/i
  );
  const firstSplit = dosageMatch?.index ?? frequencyMatch?.index ?? durationMatch?.index;
  const name =
    typeof firstSplit === "number" && firstSplit > 1
      ? line.slice(0, firstSplit)
      : line.split(/\s[-:]\s/)[0] || line;

  return {
    name: cleanLine(name),
    dosage: dosageMatch?.[1] ? cleanLine(dosageMatch[1]) : "",
    frequency: frequencyMatch?.[1] ? cleanLine(frequencyMatch[1]) : "",
    duration: durationMatch?.[1] ? cleanLine(durationMatch[1]) : "",
    notes: cleanLine(line),
  };
}

function isLikelyMedicineLine(line: string) {
  if (line.length < 3) return false;
  if (/^(patient|nom|name|age|date|doctor|dr\.?|cabinet|telephone|tel|signature)\b/i.test(line)) {
    return false;
  }
  return (
    /\d/.test(line) ||
    /\b(mg|ml|tab|tablet|cap|capsule|drop|sachet|daily|day|jour|matin|soir|midi|bd|od|tds|qid)\b/i.test(line)
  );
}

function buildOcrGuesses(rawText: string): PrescriptionFields {
  const normalizedText = rawText.replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
  const joined = lines.join("\n");
  const medicineLines = lines.filter(isLikelyMedicineLine).slice(0, 2);
  const medicine1 = medicineLines[0] ? parseMedicineLine(medicineLines[0]) : null;
  const medicine2 = medicineLines[1] ? parseMedicineLine(medicineLines[1]) : null;

  return {
    ...EMPTY_FIELDS,
    patientName:
      findLabeledValue(lines, [
        /(?:nom(?:\s+du\s+patient)?|patient|name)\s*[:\-]?\s*(.+)$/i,
      ]) || "",
    age: findLabeledValue(lines, [/\bage\s*[:\-]?\s*(\d{1,3})\b/i]) || "",
    date: findDate(joined),
    medicine1Name: medicine1?.name ?? "",
    medicine1Dosage: medicine1?.dosage ?? "",
    medicine1Frequency: medicine1?.frequency ?? "",
    medicine1Duration: medicine1?.duration ?? "",
    medicine1Notes: medicine1?.notes ?? "",
    medicine2Name: medicine2?.name ?? "",
    medicine2Dosage: medicine2?.dosage ?? "",
    medicine2Frequency: medicine2?.frequency ?? "",
    medicine2Duration: medicine2?.duration ?? "",
    medicine2Notes: medicine2?.notes ?? "",
    rawOcrText: rawText,
  };
}

function formatPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function isHeicFile(file: File) {
  return /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function prepareImageForOcr(file: File) {
  if (!isHeicFile(file)) {
    return { blob: file, converted: false };
  }

  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;

  return { blob, converted: true };
}

export default function PrescriptionOcrPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fields, setFields] = useState<PrescriptionFields>(EMPTY_FIELDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convertedForOcr, setConvertedForOcr] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const imageMeta = useMemo(() => {
    if (!selectedFile) return "No image selected";
    const kb = Math.max(1, Math.round(selectedFile.size / 1024));
    return `${selectedFile.name} · ${kb} KB`;
  }, [selectedFile]);

  function updateField(key: keyof PrescriptionFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setSavedId(null);
  }

  async function runOcr(image: Blob) {
    setOcrState("running");
    setOcrStatus("Preparing OCR");
    setOcrProgress(0.04);
    setError(null);

    try {
      const Tesseract = await import("tesseract.js");
      const result = await Tesseract.recognize(image, "eng", {
        logger: (message) => {
          if (message.status) setOcrStatus(message.status);
          if (typeof message.progress === "number") setOcrProgress(message.progress);
        },
      });
      const rawText = result.data.text.trim();
      setFields(buildOcrGuesses(rawText));
      setOcrState("done");
      setOcrStatus(rawText ? "OCR complete" : "OCR complete with no readable text");
      setOcrProgress(1);
    } catch (err) {
      console.error("prescription OCR failed", err);
      setOcrState("error");
      setOcrStatus("OCR failed");
      setError(
        "OCR could not read this image. You can still type the fields manually and save the test record."
      );
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(null);
    setFields(EMPTY_FIELDS);
    setSavedId(null);
    setRotation(0);
    setConvertedForOcr(false);
    setOcrState("running");
    setOcrStatus(isHeicFile(file) ? "Converting HEIC image" : "Preparing image");
    setOcrProgress(0.02);
    setError(null);

    try {
      const prepared = await prepareImageForOcr(file);
      setConvertedForOcr(prepared.converted);
      setPreviewUrl(URL.createObjectURL(prepared.blob));
      await runOcr(prepared.blob);
    } catch (err) {
      console.error("prescription image preparation failed", err);
      setPreviewUrl(URL.createObjectURL(file));
      setOcrState("error");
      setOcrStatus("Image preparation failed");
      setError(
        isHeicFile(file)
          ? "HEIC conversion failed. Try uploading a JPG or PNG, or type the fields manually and save the test record."
          : "The image could not be prepared for OCR. You can still type the fields manually and save the test record."
      );
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0] ?? null);
  }

  async function saveRecord() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      const ref = await addDoc(collection(db, "prescriptionOcrTests"), {
        source: "admin-prescription-ocr-test",
        fileName: selectedFile?.name ?? null,
        fileType: selectedFile?.type || null,
        fileSize: selectedFile?.size ?? null,
        convertedForOcr,
        fields,
        rawOcrText: fields.rawOcrText,
        ocrState,
        createdAt: serverTimestamp(),
        createdAtIso: new Date().toISOString(),
      });
      setSavedId(ref.id);
    } catch (err) {
      console.error("prescription OCR save failed", err);
      setError("Save failed. Check Firebase access and try again.");
    } finally {
      setSaving(false);
    }
  }

  function clearTest() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setFields(EMPTY_FIELDS);
    setOcrState("idle");
    setOcrStatus("");
    setOcrProgress(0);
    setRotation(0);
    setSavedId(null);
    setError(null);
    setConvertedForOcr(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ScanText size={18} />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Prescription OCR Test
              </h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Suggestions only
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Upload a prescription image, review OCR guesses, correct every field, then save the test record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Upload size={16} />
              Upload image
            </button>
            <button
              type="button"
              onClick={clearTest}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <X size={16} />
              Clear
            </button>
          </div>
        </header>

        {(error || savedId || ocrState === "running") && (
          <section className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {ocrState === "running" && (
                <div className="flex items-center gap-3">
                  <LoaderCircle className="animate-spin text-emerald-600" size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                      <span className="truncate">{ocrStatus || "Running OCR"}</span>
                      <span>{formatPercent(ocrProgress)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: formatPercent(ocrProgress) }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
              {savedId && (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={17} />
                  Saved test record: {savedId}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
          <div className={`${PANEL_CLASS} min-h-[560px] overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <FileImage size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{imageMeta}</p>
                  <p className="text-xs text-slate-500">{ocrStatus || "Image preview"}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Rotate image left"
                  onClick={() => setRotation((value) => value - 90)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Rotate image right"
                  onClick={() => setRotation((value) => value + 90)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                >
                  <RotateCw size={16} />
                </button>
              </div>
            </div>

            <div
              className="flex min-h-[500px] items-center justify-center bg-slate-100 p-4"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleFile(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              {previewUrl ? (
                // Plain img is required here because the source is a browser object URL.
                <img
                  src={previewUrl}
                  alt="Uploaded prescription preview"
                  className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-lg transition-transform"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-72 w-full max-w-lg flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <Upload className="text-emerald-600" size={28} />
                  <span className="text-sm font-semibold text-slate-900">Drop or upload prescription image</span>
                  <span className="text-xs text-slate-500">JPG, PNG, WebP, HEIC where supported by the browser</span>
                </button>
              )}
            </div>
          </div>

          <form
            className={`${PANEL_CLASS} overflow-hidden`}
            onSubmit={(event) => {
              event.preventDefault();
              void saveRecord();
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Editable extracted fields</h2>
                <p className="text-xs text-slate-500">Correct the OCR guesses before saving.</p>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
                Save
              </button>
            </div>

            <div className="grid gap-5 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_100px_150px]">
                <label className="grid gap-1.5">
                  <span className={LABEL_CLASS}>Patient name</span>
                  <input
                    className={INPUT_CLASS}
                    value={fields.patientName}
                    onChange={(event) => updateField("patientName", event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className={LABEL_CLASS}>Age</span>
                  <input
                    className={INPUT_CLASS}
                    value={fields.age}
                    onChange={(event) => updateField("age", event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className={LABEL_CLASS}>Date</span>
                  <input
                    className={INPUT_CLASS}
                    value={fields.date}
                    onChange={(event) => updateField("date", event.target.value)}
                  />
                </label>
              </div>

              <MedicineFields
                title="Medicine 1"
                name={fields.medicine1Name}
                dosage={fields.medicine1Dosage}
                frequency={fields.medicine1Frequency}
                duration={fields.medicine1Duration}
                notes={fields.medicine1Notes}
                onChange={(field, value) => updateField(`medicine1${field}` as keyof PrescriptionFields, value)}
              />

              <MedicineFields
                title="Medicine 2"
                name={fields.medicine2Name}
                dosage={fields.medicine2Dosage}
                frequency={fields.medicine2Frequency}
                duration={fields.medicine2Duration}
                notes={fields.medicine2Notes}
                onChange={(field, value) => updateField(`medicine2${field}` as keyof PrescriptionFields, value)}
              />

              <label className="grid gap-1.5">
                <span className={LABEL_CLASS}>Raw OCR text</span>
                <textarea
                  className={`${TEXTAREA_CLASS} min-h-44 font-mono text-xs`}
                  value={fields.rawOcrText}
                  onChange={(event) => updateField("rawOcrText", event.target.value)}
                />
              </label>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function MedicineFields({
  title,
  name,
  dosage,
  frequency,
  duration,
  notes,
  onChange,
}: {
  title: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
  onChange: (field: "Name" | "Dosage" | "Frequency" | "Duration" | "Notes", value: string) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 p-3">
      <legend className="px-2 text-sm font-semibold text-slate-900">{title}</legend>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className={LABEL_CLASS}>{title} name</span>
          <input className={INPUT_CLASS} value={name} onChange={(event) => onChange("Name", event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASS}>{title} dosage</span>
            <input
              className={INPUT_CLASS}
              value={dosage}
              onChange={(event) => onChange("Dosage", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASS}>{title} frequency</span>
            <input
              className={INPUT_CLASS}
              value={frequency}
              onChange={(event) => onChange("Frequency", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASS}>{title} duration</span>
            <input
              className={INPUT_CLASS}
              value={duration}
              onChange={(event) => onChange("Duration", event.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASS}>{title} notes</span>
          <textarea
            className={TEXTAREA_CLASS}
            value={notes}
            onChange={(event) => onChange("Notes", event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}
