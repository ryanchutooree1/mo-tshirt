import type { Metadata } from "next";
import MobInventoryPage from "@/components/mob/MobInventoryPage";

export const metadata: Metadata = {
  title: "Inventory",
};

export default function MobInventoryRoute() {
  return <MobInventoryPage />;
}
