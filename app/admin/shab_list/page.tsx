import { redirect } from "next/navigation";

export default function ShabbanazListPage() {
  redirect("/admin/workspace?partner=shabanaz");
}
