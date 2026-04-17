import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "やることリスト",
  description: "シンプルで使いやすい日本語のToDo管理アプリ",
  applicationName: "やることリスト",
  keywords: ["ToDo", "タスク管理", "Next.js", "日本語"],
  icons: {
    icon: "/icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#edf3f1"
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
