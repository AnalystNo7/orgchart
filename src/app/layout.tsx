import type { Metadata } from "next";
import { Inter, PT_Sans_Narrow } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "./client-layout";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const ptSansNarrow = PT_Sans_Narrow({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-pt-sans-narrow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OrgChart Modeler",
  description: "Инструмент моделирования организационной структуры",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${inter.variable} ${ptSansNarrow.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
