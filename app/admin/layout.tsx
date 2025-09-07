import AdminChrome from "@/components/AdminChrome";
import { AdminDataProvider } from "@/admin/AdminDataContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminChrome>{children}</AdminChrome>
    </AdminDataProvider>
  );
}
