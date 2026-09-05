"use client";

import dynamic from "next/dynamic";
import { memo, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ClipboardList, PenTool } from "lucide-react";
import styles from "./HomeOrderWorkspace.module.css";

const DesignStudio = memo(dynamic(() => import("./PremiumDesignStudioClient"), {
  loading: () => <div className={styles.loading} role="status">Opening your studio…</div>,
}));
const QuoteForm = memo(dynamic(() => import("./QuoteForm"), {
  loading: () => <div className={styles.loading} role="status">Loading quote form…</div>,
}));

type OrderMode = "studio" | "quote";

export default function HomeOrderWorkspace() {
  const [mode, setMode] = useState<OrderMode>("studio");
  const [quoteVisited, setQuoteVisited] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const studioTabRef = useRef<HTMLButtonElement>(null);
  const quoteTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function followOrderLink() {
      const hash = window.location.hash;
      if (hash !== "#quote-form" && hash !== "#order") return;
      const nextMode = hash === "#quote-form" ? "quote" : "studio";
      setMode(nextMode);
      if (nextMode === "quote") setQuoteVisited(true);
      workspaceRef.current?.scrollIntoView({ block: "start" });
    }

    followOrderLink();
    window.addEventListener("hashchange", followOrderLink);
    return () => window.removeEventListener("hashchange", followOrderLink);
  }, []);

  function selectMode(nextMode: OrderMode) {
    setMode(nextMode);
    if (nextMode === "quote") setQuoteVisited(true);
    // Keep the workspace in place when switching, while preserving direct links.
    window.history.replaceState(window.history.state, "", nextMode === "quote" ? "#quote-form" : "#order");
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    let nextMode: OrderMode;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": nextMode = mode === "studio" ? "quote" : "studio"; break;
      case "Home": nextMode = "studio"; break;
      case "End": nextMode = "quote"; break;
      default: return;
    }
    event.preventDefault();
    selectMode(nextMode);
    (nextMode === "studio" ? studioTabRef : quoteTabRef).current?.focus({ preventScroll: true });
  }

  return (
    <section ref={workspaceRef} id="order" className={styles.workspace} aria-label="Design your apparel or request a quote">
      <div id="quote-form" className={styles.anchor} aria-hidden="true" />
      <header className={styles.workspaceHeader}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>MAKE IT YOURS</p>
          <h2>Start your order.</h2>
        </div>
        <div className={styles.choices} role="tablist" aria-label="Choose how to order">
          <button
            ref={studioTabRef}
            id="order-studio-tab"
            type="button"
            role="tab"
            aria-selected={mode === "studio"}
            aria-controls="order-studio-panel"
            tabIndex={mode === "studio" ? 0 : -1}
            onClick={() => selectMode("studio")}
            onKeyDown={navigateTabs}
          >
            <PenTool size={20} aria-hidden="true" />
            <span><strong>Design studio</strong><small>Create &amp; preview</small></span>
          </button>
          <span className={styles.or} aria-hidden="true">OR</span>
          <button
            ref={quoteTabRef}
            id="order-quote-tab"
            type="button"
            role="tab"
            aria-selected={mode === "quote"}
            aria-controls="order-quote-panel"
            tabIndex={mode === "quote" ? 0 : -1}
            onClick={() => selectMode("quote")}
            onKeyDown={navigateTabs}
          >
            <ClipboardList size={20} aria-hidden="true" />
            <span><strong>Quote form</strong><small>Send your requirements</small></span>
          </button>
        </div>
      </header>

      <div id="order-studio-panel" role="tabpanel" aria-labelledby="order-studio-tab" className={styles.panel} hidden={mode !== "studio"}>
        <div className={styles.studio}>
          <DesignStudio embedded appearance="editorial" requestSource="Homepage Design Studio" />
        </div>
      </div>

      <div id="order-quote-panel" role="tabpanel" aria-labelledby="order-quote-tab" className={styles.panel} hidden={mode !== "quote"}>
        {quoteVisited && (
          <div className={styles.quote}>
            <header className={styles.quoteHeading}>
              <p className={styles.eyebrow}>QUOTE FORM</p>
              <h2>Get pricing in hours.</h2>
              <p>Your garments, your artwork. We’ll take it from here.</p>
            </header>
            <QuoteForm source="Homepage" appearance="editorial" className={styles.form} />
          </div>
        )}
      </div>
    </section>
  );
}
