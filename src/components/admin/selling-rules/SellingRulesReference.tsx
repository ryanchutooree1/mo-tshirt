"use client";

import { useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import dynamic from "next/dynamic";
const SellingRulesWorkspace = dynamic(() => import("./SellingRulesWorkspace"), { loading: () => <p style={{ padding: 24 }}>Loading selling rules…</p> });
import styles from "./selling-rules.module.css";

/** Read-only calculator beside a quote. Closing never mutates the quote draft. */
export default function SellingRulesReference() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={styles.referenceButton} onClick={() => { setOpen(true); dialog.current?.showModal(); }}><BookOpen size={16}/> Selling rules</button>
    <dialog ref={dialog} className={styles.referenceDialog} aria-label="Selling rules reference" onClose={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className={styles.referenceBar}><span>Price reference · your quotation stays open</span><button type="button" className={styles.secondary} onClick={() => dialog.current?.close()}><X size={16}/> Back to quote</button></div>
      {open && <SellingRulesWorkspace embedded />}
    </dialog>
  </>;
}
