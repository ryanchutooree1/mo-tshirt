import type { Metadata } from "next";
import MobSettingsPage from "@/components/mob/MobSettingsPage";

export const metadata: Metadata = {
  title: "Settings",
};

export default function MobSettingsRoute() {
  return <MobSettingsPage />;
}
