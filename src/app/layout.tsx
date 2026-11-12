import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "kerncms",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Explicit light/dark choice (see components/layout/theme.ts); otherwise the system decides.
  const theme = (await cookies()).get("kern-theme")?.value;
  const themeClass = theme === "dark" || theme === "light" ? theme : "";
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${themeClass}`}
      // The theme switch changes the class on the client.
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
