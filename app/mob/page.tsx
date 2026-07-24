import type { Metadata } from "next";
import MobOwnerDashboard from "@/components/mob/MobOwnerDashboard";

export const metadata: Metadata = {
  title: "Owner Dashboard",
};

export default function MobHomePage() {
  return <MobOwnerDashboard />;
}
