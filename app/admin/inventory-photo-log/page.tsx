import type { Metadata } from "next";
import InventoryPhotoLogPage from "@/components/admin/InventoryPhotoLogPage";

export const metadata: Metadata = {
  title: "Inventory Photo Log | MO Admin",
  description: "Capture inventory photos now and complete stock details later.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminInventoryPhotoLogPage() {
  return <InventoryPhotoLogPage />;
}
