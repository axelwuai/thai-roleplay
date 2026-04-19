import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "泰语开口练习",
  applicationName: "泰语开口练习",
  description:
    "面向中文用户的 AI 泰语口语练习应用：输入生活场景即可开始角色扮演对话，获得泰文、罗马音和中文提示，并保存练习记录继续练习。",
  keywords: ["Thai", "Chinese learners", "AI roleplay", "spoken practice", "Next.js", "Qwen"],
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "泰语开口练习",
    description:
      "面向中文用户的 AI 泰语口语练习应用：输入生活场景即可开始角色扮演对话，获得泰文、罗马音和中文提示，并保存练习记录继续练习。",
    type: "website",
    locale: "zh_CN",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f0e8",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
