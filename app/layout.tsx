import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MO T-SHIRT — Premium Custom Printing (Mauritius)',
  description: 'DTF & Vinyl printing for T-Shirts, Polos & Caps. Corporate-ready. Surinam pickup & Post delivery.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}