import AdminChrome from "@/components/AdminChrome";
import { AdminDataProvider } from "@/admin/AdminDataContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      <div className="font-sans">
        <AdminChrome>{children}</AdminChrome>
      </div>
    </AdminDataProvider>
  );
}
