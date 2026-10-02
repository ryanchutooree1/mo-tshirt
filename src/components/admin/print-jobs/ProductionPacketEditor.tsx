"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, FileText, Save } from "lucide-react";
import ProductionArtworkUpload from "./ProductionArtworkUpload";
import type { HandoffView } from "@/lib/print-job-handoff";
import styles from "./tanvi-workflow.module.css";

type ArtworkDraft = {
  fileKey: string;
  useForPrint: boolean;
  selectedVariant: "source" | "processed";
  placement: string;
  targetProductIndexes: number[];
  widthCm: string;
  heightCm: string;
};
type Draft = { printMethod: string; deadline: string; artworks: ArtworkDraft[] };

function initialDraft(view: HandoffView): Draft {
  const packet = view.productionPacket;
  const specs = view.productionSpecs;
  return {
    printMethod: packet.printMethod,
    deadline: packet.deadline.date || "",
    artworks: packet.artworks.map((artwork) => {
      const saved = specs?.artworks.find((entry) => entry.fileKey === artwork.key);
      return {
        fileKey: artwork.key,
        useForPrint: saved?.useForPrint ?? artwork.useForPrint,
        selectedVariant: saved?.selectedVariant || artwork.selectedVariant,
        placement: saved?.placement ?? artwork.placement,
        targetProductIndexes: saved?.targetProductIndexes ?? artwork.targetProductIndexes,
        widthCm: (saved?.widthCm ?? artwork.widthCm)?.toString() || "",
        heightCm: (saved?.heightCm ?? artwork.heightCm)?.toString() || "",
      };
    }),
  };
}

export default function ProductionPacketEditor({ view, blocked, onDirtyChange, onSave, onUploaded, onUploadBusyChange }: {
  view: HandoffView;
  blocked: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (specs: Record<string, unknown>) => Promise<boolean>;
  onUploaded: () => void;
  onUploadBusyChange: (busy: boolean) => void;
}) {
  const [baseline] = useState(() => initialDraft(view));
  const [draft, setDraft] = useState<Draft>(baseline);
  const [opened, setOpened] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange(false); }, [onDirtyChange]);
  const packet = view.productionPacket;
  const readiness = view.productionReadiness;
  const updateArtwork = (index: number, patch: Partial<ArtworkDraft>) => setDraft((current) => ({
    ...current,
    artworks: current.artworks.map((entry, position) => position === index ? { ...entry, ...patch } : entry),
  }));

  return <details className={styles.productionDetails} open={opened} onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary><span>Production details &amp; print files</span><span className={styles.packetBadge} data-ready={readiness.ready}>{readiness.ready ? "Ready to review" : `${readiness.blockers.length} to check`}</span></summary>
    <form aria-label="Production specifications" onSubmit={(event) => {
      event.preventDefault();
      if (blocked || !dirty) return;
      void onSave({
        version: 1,
        printMethod: draft.printMethod,
        deadline: draft.deadline,
        artworks: draft.artworks.map((entry) => ({ ...entry, widthCm: entry.widthCm.trim() ? Number(entry.widthCm) : null, heightCm: entry.heightCm.trim() ? Number(entry.heightCm) : null })),
      });
    }}>
      <p className={styles.packetHelp}>Check the exact garments, dimensions and files Yan should use. Saving this does not send an email or start printing. Changed specifications need a renewed client price confirmation.</p>
      <ul className={styles.packetProducts} aria-label="Garments for production">{packet.products.map((row, index) => <li key={index}>{row.product || "Product missing"} · {row.color || "Colour missing"} · {row.size || "Size missing"} <strong>× {row.quantity ?? "Quantity missing"}</strong></li>)}</ul>
      <p className={styles.packetHelp}>Correct garments, sizes or quantities under Edit garments &amp; price before confirming the client price.</p>
      <label className={styles.field}>Confirmed print method<input value={draft.printMethod} maxLength={160} disabled={blocked} onChange={(event) => setDraft((current) => ({ ...current, printMethod: event.target.value }))} placeholder="e.g. DTF, screen printing, or no printing" /></label>
      <label className={styles.field}>Confirmed required date<input type="date" value={draft.deadline} disabled={blocked} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} />{packet.deadline.label && !packet.deadline.date && <span>Original request: {packet.deadline.label}. Confirm a calendar date with the client.</span>}</label>
      <ProductionArtworkUpload quoteId={view.quoteId} expectedVersion={view.version} packetFingerprint={view.productionPacketFingerprint} disabled={blocked || dirty} onUploaded={onUploaded} onBusyChange={onUploadBusyChange} />
      {!packet.artworks.length && <p className={styles.hint}><CircleAlert size={15} />No print-file candidate is saved. A finished mockup alone cannot release a printed job.</p>}
      {packet.artworks.map((artwork, index) => {
        const entry = draft.artworks[index];
        if (!entry) return null;
        return <fieldset key={artwork.key} className={styles.packetArtwork} disabled={blocked}>
          <legend>{artwork.label || `Artwork ${index + 1}`}</legend>
          <div className={styles.packetFiles}>
            {artwork.source && <a href={artwork.source.url} target="_blank" rel="noopener noreferrer"><FileText size={14} />Saved source: {artwork.source.name}</a>}
            {artwork.processed && <a href={artwork.processed.url} target="_blank" rel="noopener noreferrer"><FileText size={14} />Processed: {artwork.processed.name}</a>}
            {!artwork.source && !artwork.processed && <span>File unavailable. Request the original before sending.</span>}
          </div>
          <label className={styles.confirm}><input type="checkbox" checked={entry.useForPrint} disabled={blocked || !artwork.source && !artwork.processed} onChange={(event) => updateArtwork(index, { useForPrint: event.target.checked })} /><span>Use this artwork for printing</span></label>
          {entry.useForPrint && <>
            <label className={styles.field}>Print file version<select value={entry.selectedVariant} onChange={(event) => updateArtwork(index, { selectedVariant: event.target.value as ArtworkDraft["selectedVariant"] })}>
              {artwork.source && <option value="source">Saved source</option>}
              {artwork.processed && <option value="processed">Processed file</option>}
            </select></label>
            <div className={styles.packetTargets} role="group" aria-label={`Garments for ${artwork.label}`}><p>Apply this artwork to these garment rows</p>{packet.products.map((row, productIndex) => <label className={styles.confirm} key={productIndex}><input type="checkbox" checked={entry.targetProductIndexes.includes(productIndex)} onChange={(event) => updateArtwork(index, { targetProductIndexes: event.target.checked ? [...entry.targetProductIndexes, productIndex].sort((a, b) => a - b) : entry.targetProductIndexes.filter(value => value !== productIndex) })} /><span>{row.product || "Product missing"} · {row.color || "Colour missing"} · {row.size || "Size missing"} × {row.quantity ?? "Quantity missing"}</span></label>)}<p className={styles.packetHelp}>If only some pieces in a row use this artwork, split that row under Edit garments &amp; price first.</p></div>
            <label className={styles.field}>Exact print placement<input value={entry.placement} maxLength={250} onChange={(event) => updateArtwork(index, { placement: event.target.value })} placeholder="e.g. Front chest, centred 8 cm below collar" /></label>
            <div className={styles.fieldPair}>
              <label className={styles.field}>Print width (cm)<input type="number" min="0.1" max="500" step="0.1" value={entry.widthCm} onChange={(event) => updateArtwork(index, { widthCm: event.target.value })} /></label>
              <label className={styles.field}>Print height (cm)<input type="number" min="0.1" max="500" step="0.1" value={entry.heightCm} onChange={(event) => updateArtwork(index, { heightCm: event.target.value })} /></label>
            </div>
          </>}
        </fieldset>;
      })}
      {readiness.blockers.length > 0 ? <div className={styles.blockers}><CircleAlert size={15} /><ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : <p className={styles.hint}><CheckCircle2 size={15} />The saved production details are complete. Review the packet before sending.</p>}
      <div className={styles.packetActions}>
        <button type="submit" className={styles.primary} disabled={blocked || !dirty}><Save size={15} />Save production details</button>
        {dirty && <button type="button" className={styles.secondary} disabled={blocked} onClick={() => setDraft(baseline)}>Discard changes</button>}
      </div>
    </form>
  </details>;
}
