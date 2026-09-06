import { redirect } from "next/navigation";
export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(`/admin/quotation-approval${id ? `?quoteId=${encodeURIComponent(id)}` : ""}`);
}
