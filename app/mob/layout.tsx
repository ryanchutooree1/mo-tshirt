import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminThemeProvider } from "@/admin/AdminThemeContext";
import MobShell from "@/components/mob/MobShell";
import { getAdminRequestSession } from "@/lib/admin-request";

export const metadata: Metadata = {
  title: {
    default: "MO Mobile Shop",
    template: "%s | MO Mobile Shop",
  },
  description: "Mobile stock capture and inventory operations for MO T-SHIRT.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MobLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, headerStore] = await Promise.all([
    getAdminRequestSession(),
    headers(),
  ]);
  const hostname = (headerStore.get("host") || "").split(":")[0].toLowerCase();
  const externalBasePath = hostname === "mob.mo-tshirt.mu" ? "" : "/mob";

  return (
    <AdminThemeProvider>
      <MobShell
        session={
          session
            ? {
                displayName: session.displayName,
                isOwner: session.isOwner,
              }
            : null
        }
        externalBasePath={externalBasePath}
      >
        {children}
      </MobShell>
    </AdminThemeProvider>
  );
}
