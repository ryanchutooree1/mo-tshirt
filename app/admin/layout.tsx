import AdminChrome from "@/components/AdminChrome";
import { AdminDataProvider } from "@/admin/AdminDataContext";
import { AdminThemeProvider } from "@/admin/AdminThemeContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminThemeProvider>
        <div className="font-sans">
          <AdminChrome>{children}</AdminChrome>
        </div>
      </AdminThemeProvider>
    </AdminDataProvider>
  );
}
