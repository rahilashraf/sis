import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: {
    default: "AIOK EduSIS",
    template: "%s | AIOK EduSIS",
  },
  description: "AIOK (Darul Ilm) Student Information System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
