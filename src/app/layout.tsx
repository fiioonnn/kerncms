import type { Metadata } from "next";
import { Inter, Averia_Serif_Libre } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const averiaSerifLibre = Averia_Serif_Libre({
  variable: "--font-averia",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "kerncms",
  description: "Content Management System",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${averiaSerifLibre.variable} h-full antialiased overscroll-none`}
    >
      <body className="h-full overflow-hidden flex flex-col">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              color: "var(--color-foreground)",
              fontSize: "13px",
              borderRadius: "0.75rem",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            },
          }}
        />
      </body>
    </html>
  );
}
