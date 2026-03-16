import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Dream | MO T-SHIRT",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OurDreamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
