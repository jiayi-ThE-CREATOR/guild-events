import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SiteHeader from "@/components/SiteHeader";

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
        {/* スマホ＝1枚のカード、PC＝上部ヘッダー＋広い作業領域 */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white shadow-[0_0_60px_rgba(22,32,74,0.08)] md:max-w-none md:bg-transparent md:shadow-none">
          <SiteHeader />
          <main className="flex-1 pb-24 md:pb-16">
            <div className="md:mx-auto md:max-w-[1080px] md:px-6 md:pt-8">
              {children}
            </div>
          </main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
