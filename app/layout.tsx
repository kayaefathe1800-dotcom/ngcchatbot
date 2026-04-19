import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "社長資料チャットボット",
  description: "社内資料だけを根拠に回答する、日本語対応の資料ベースチャットボット",
  applicationName: "社長資料チャットボット",
  keywords: ["社内チャットボット", "資料検索", "Next.js", "Vercel", "日本語"],
  icons: {
    icon: "/icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#dff6dd"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
