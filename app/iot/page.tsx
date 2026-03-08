import type { Metadata } from "next";
import IotControlCenterPage from "@/components/admin/IotControlCenterPage";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function IotPage() {
  return (
    <main className="min-h-screen bg-[#F5F5F7] px-4 py-8 sm:px-6 lg:px-8">
      <IotControlCenterPage />
    </main>
  );
}
