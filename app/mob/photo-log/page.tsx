import type { Metadata } from "next";
import InventoryPhotoLogPage from "@/components/admin/InventoryPhotoLogPage";

export const metadata: Metadata = {
  title: "Inventory Photo Log",
};

export default function MobPhotoLogPage() {
  return <InventoryPhotoLogPage />;
}
