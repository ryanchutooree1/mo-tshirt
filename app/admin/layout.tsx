import AdminChrome from "@/components/AdminChrome";
import { Inter, Playfair_Display } from "next/font/google";
import { AdminDataProvider } from "@/admin/AdminDataContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-admin-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-admin-serif" });

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      <div className={`${inter.variable} ${playfair.variable}`}>
        <AdminChrome>{children}</AdminChrome>
      </div>
    </AdminDataProvider>
  );
}
