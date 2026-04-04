import type { Metadata } from "next";
import IotMobileSetupPage from "@/components/iot/IotMobileSetupPage";

export const metadata: Metadata = {
  title: "MO Smart Breaker",
  description: "Pair, link, and control a Tuya Wi-Fi breaker from the MO T-SHIRT app.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function IotPage() {
  return <IotMobileSetupPage />;
}
