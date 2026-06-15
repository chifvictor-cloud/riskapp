import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RISK — Torneos 1v1 de Fortnite",
  description: "Compite en torneos 1v1 de Fortnite por dinero real. Plataforma de torneos competitivos.",
  keywords: ["fortnite", "torneos", "1v1", "esports", "dinero real"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} min-h-full bg-[#0a0a0f] text-[#f5f5f5] antialiased`}>
        {children}
      </body>
    </html>
  );
}
