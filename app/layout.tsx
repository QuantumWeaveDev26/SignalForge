import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalForge — Research into advantage",
  description: "Find the evidence. Form your strategy. Move with conviction. Brand and business research, pitch intelligence, and monitoring in one workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

const themeScript = "try{var t=localStorage.getItem('sf-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Root App Router layout, so the font applies to every route. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400..700&family=Sofia+Sans+Extra+Condensed:wght@500..700&family=Sofia+Sans:ital,wght@0,400..700;1,400..700&display=swap" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
