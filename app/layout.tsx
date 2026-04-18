import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MyImmoHub",
    template: "%s | MyImmoHub",
  },
  description: "MyImmoHub ist das Property-Management-Tool für deutsche Privatvermieter.",
  icons: {
    icon: [
      { url: "/icon.svg?v=2", type: "image/svg+xml" },
    ],
    shortcut: ["/icon.svg?v=2"],
    apple: ["/icon.svg?v=2"],
  },
};

// Inline script: sets .dark on <html> before first paint to avoid flash.
// Empty catch: localStorage throws in some environments (Safari private mode, strict CSP).
const themeScript = `(function(){try{var s=localStorage.getItem('theme');if(s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
