import type { Metadata } from "next";
import QuotationResponseClient from "./QuotationResponseClient";
import { isQuoteResponseAction } from "@/lib/quote-response-links";

export const metadata: Metadata = {
  title: "Quotation response | MO T-SHIRT",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function QuotationResponsePage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const actionValue = first(query.action);

  return (
    <QuotationResponseClient
      quoteId={id}
      action={isQuoteResponseAction(actionValue) ? actionValue : ""}
      expires={first(query.expires)}
      token={first(query.token)}
    />
  );
}
