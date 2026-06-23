import type { Metadata } from "next";
import CbePortalClient from "./CbePortalClient";

export const metadata: Metadata = {
  title: "CBE Client Portal | MO T-SHIRT",
  description: "Private CBE workspace for information and project management.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CbePage() {
  return <CbePortalClient />;
}
