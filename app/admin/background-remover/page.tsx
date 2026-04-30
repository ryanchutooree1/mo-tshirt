import type { Metadata } from "next";
import BackgroundRemoverPage from "@/components/admin/BackgroundRemoverPage";

export const metadata: Metadata = {
  title: "Background Remover | MO Admin",
  description: "Internal tool for removing image backgrounds.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminBackgroundRemoverPage() {
  return <BackgroundRemoverPage />;
}
