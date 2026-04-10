import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
