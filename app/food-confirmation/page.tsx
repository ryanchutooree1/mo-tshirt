import type { Metadata } from "next";
import FoodConfirmationClient from "@/components/FoodConfirmationClient";

export const metadata: Metadata = {
  title: "Confirm tonight's dinner",
  description: "Confirm or update today's food plan.",
  robots: { index: false, follow: false },
};

export default async function FoodConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : "";

  return (
    <FoodConfirmationClient
      day={read(params.day)}
      expires={read(params.expires)}
      token={read(params.token)}
    />
  );
}
