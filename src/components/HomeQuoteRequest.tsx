"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Plus } from "lucide-react";

const QuoteForm = dynamic(() => import("@/components/QuoteForm"), {
  loading: () => <p role="status">Preparing your project form…</p>,
});

export default function HomeQuoteRequest({
  className,
  formClassName,
}: {
  className: string;
  formClassName: string;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>
        Or send us your project details <Plus size={18} />
      </summary>
      {opened ? (
        <div className={formClassName}>
          <QuoteForm source="Homepage" />
        </div>
      ) : null}
    </details>
  );
}
