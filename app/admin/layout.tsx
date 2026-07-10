import type { Metadata } from "next";
import AdminChrome from "@/components/AdminChrome";
import { AdminThemeProvider } from "@/admin/AdminThemeContext";
import { getAdminRequestSession } from "@/lib/admin-request";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminRequestSession();
  const initialSession = session
    ? {
        displayName: session.isOwner ? "Ryan Chutooree" : session.displayName,
        email: session.email,
        allowedPages: session.allowedPages,
        isOwner: session.isOwner,
      }
    : null;

  return (
    <AdminThemeProvider>
      <div className="font-sans">
        <AdminChrome initialSession={initialSession}>{children}</AdminChrome>
      </div>
    </AdminThemeProvider>
  );
}
