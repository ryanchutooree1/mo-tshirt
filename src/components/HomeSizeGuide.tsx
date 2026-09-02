"use client";

import Image from "next/image";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { Ruler, X, ZoomIn } from "lucide-react";
import styles from "./HomeSizeGuide.module.css";

const guides = {
  tshirt: {
    label: "T-Shirt",
    adult: "/T-Shirt%20Measurement.webp",
    kids: "/Kids%20T-Shirt%20Measurement.webp",
  },
  polo: {
    label: "Polo Shirt",
    adult: "/Polo-Shirt-Measurement.webp",
    kids: "/Kids-Polo-Shirt-Measurement.webp",
  },
};
type Garment = keyof typeof guides;
type Audience = "adult" | "kids";
const audiences: { key: Audience; label: string; sizes: string }[] = [
  { key: "adult", label: "Adults", sizes: "XS — 4XL" },
  { key: "kids", label: "Kids", sizes: "1 — 14 years" },
];

export default function HomeSizeGuide() {
  const [garment, setGarment] = useState<Garment>("tshirt");
  const [enlarged, setEnlarged] = useState<Audience | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const guide = guides[garment];
  const zoomPercent = Math.round(zoom * 100);

  useEffect(() => {
    if (!enlarged) return;
    const dialog = dialogRef.current;
    const imageViewport = imageViewportRef.current;
    if (!dialog || !imageViewport) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    // All four charts are 1536 × 1024. Fit both dimensions before applying zoom.
    const resizeObserver = new ResizeObserver(([entry]) => {
      setFitWidth(Math.min(entry.contentRect.width, entry.contentRect.height * 1.5));
    });
    resizeObserver.observe(imageViewport);
    return () => {
      resizeObserver.disconnect();
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [enlarged]);

  function openGuide(audience: Audience) {
    dragRef.current = null;
    setIsDragging(false);
    setZoom(1);
    setEnlarged(audience);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    // Touch keeps native scrolling, including momentum and pinch gestures.
    if (event.pointerType === "touch" || event.button !== 0 || !event.isPrimary) return;
    const viewport = event.currentTarget;
    const bounds = viewport.getBoundingClientRect();
    // Leave native scrollbar interactions alone.
    if (event.clientX - bounds.left >= viewport.clientWidth || event.clientY - bounds.top >= viewport.clientHeight) return;
    if (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight) return;

    event.preventDefault();
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = drag.scrollLeft + drag.x - event.clientX;
    event.currentTarget.scrollTop = drag.scrollTop + drag.y - event.clientY;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section id="size-guide" className={styles.section} aria-labelledby="size-guide-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}><Ruler size={16} aria-hidden="true" /> SIZE GUIDE</p>
          <h2 id="size-guide-title">Find your fit.</h2>
        </div>
        <div className={styles.switcher} role="group" aria-label="Size guide garment">
          {(Object.keys(guides) as Garment[]).map((key) => (
            <button key={key} type="button" aria-pressed={garment === key} onClick={() => setGarment(key)}>
              {guides[key].label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.cards}>
        {audiences.map((audience) => (
          <button
            key={audience.key}
            type="button"
            className={styles.card}
            onClick={() => openGuide(audience.key)}
            aria-label={`Enlarge ${audience.label.toLowerCase()} ${guide.label} size guide`}
          >
            <span className={styles.cardHeading}>
              <span className={styles.audience}>{audience.label}<span>{audience.sizes}</span></span>
              <span className={styles.zoomLink}><ZoomIn size={17} aria-hidden="true" /> Zoom</span>
            </span>
            <Image src={guide[audience.key]} alt={`${audience.label} ${guide.label} measurements in centimetres`} width={1536} height={1024} sizes="(max-width: 700px) 94vw, 47vw" className={styles.chart} />
          </button>
        ))}
      </div>
      <p className={styles.note}>Measurements in cm. Compare with a garment laid flat.</p>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="enlarged-size-guide-title"
        onClose={() => setEnlarged(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        {enlarged && (
          <>
            <div className={styles.dialogHeading}>
              <h3 id="enlarged-size-guide-title">{enlarged === "adult" ? "Adults" : "Kids"} <span>— {guide.label}</span></h3>
              <button type="button" className={styles.iconButton} aria-label="Close size guide" onClick={() => dialogRef.current?.close()} autoFocus><X size={22} /></button>
            </div>
            <div
              ref={imageViewportRef}
              className={styles.imageViewport}
              data-pannable={zoom > 1}
              data-dragging={isDragging}
              tabIndex={0}
              role="region"
              aria-label="Enlarged measurements. Drag or scroll to explore when zoomed in."
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
            >
              <div className={styles.chartStage}>
                <div style={{ width: fitWidth * zoom }}>
                  <Image src={guide[enlarged]} alt={`${enlarged === "adult" ? "Adults" : "Kids"} ${guide.label} measurements in centimetres`} width={1536} height={1024} unoptimized className={styles.chart} draggable={false} />
                </div>
              </div>
            </div>
            <div className={styles.dialogFooter}>
              <span>Measurements in cm</span>
              <div className={styles.zoomControls} role="group" aria-label="Chart zoom">
                <label htmlFor="size-guide-zoom">Zoom</label>
                <input
                  id="size-guide-zoom"
                  className={styles.zoomSlider}
                  type="range"
                  min={100}
                  max={300}
                  step={1}
                  value={zoomPercent}
                  aria-valuetext={`${zoomPercent}%`}
                  onChange={(event) => setZoom(Number(event.target.value) / 100)}
                  style={{ "--zoom-progress": `${(zoomPercent - 100) / 2}%` } as CSSProperties}
                />
                <output htmlFor="size-guide-zoom">{zoomPercent}%</output>
              </div>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
