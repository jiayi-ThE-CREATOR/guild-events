import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "GUILD イベント",
  description: "阪大 × 京大 AIコミュニティのイベント申込",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e2a5a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full">
      <body className="bg-canvas text-ink min-h-full antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white shadow-[0_0_60px_rgba(22,32,74,0.08)]">
          <main className="flex-1 pb-24">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
