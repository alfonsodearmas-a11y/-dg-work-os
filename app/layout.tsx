import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { MobileMenuButton } from "@/components/layout/MobileMenuButton";
import { BottomNav } from "@/components/layout/BottomNav";
import { HeaderDate } from "@/components/layout/HeaderDate";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["400", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DG Work OS",
  description: "Executive Work OS for the Director General — Ministry of Public Utilities & Aviation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a1628" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <SidebarProvider>
          <div className="min-h-screen flex">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 min-h-screen min-w-0">
              {/* Top Bar */}
              <header className="h-14 md:h-16 border-b border-[#2d3a52]/50 bg-[#0a1628] md:bg-[#0a1628]/80 md:backdrop-blur-sm sticky top-0 z-40">
                <div className="h-full px-3 md:px-8 flex items-center justify-between">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <MobileMenuButton />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/ministry-logo.png"
                      alt=""
                      className="w-7 h-7 rounded-full ring-1 ring-[#d4af37]/30 hidden sm:block"
                    />
                    {/* Desktop: full greeting */}
                    <div className="hidden md:block">
                      <h2 className="text-white/80 text-sm font-light tracking-wide">Welcome back,</h2>
                      <p className="text-[#d4af37] font-semibold tracking-tight">Director General</p>
                    </div>
                    {/* Mobile: compact title */}
                    <span className="md:hidden text-[#d4af37] font-semibold text-sm truncate">DG Work OS</span>
                  </div>
                  <div className="flex items-center space-x-3 md:space-x-4">
                    <HeaderDate />
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#0a1628] font-bold text-xs md:text-sm">AD</span>
                    </div>
                  </div>
                </div>
              </header>

              {/* Page Content */}
              <div className="p-3 md:p-8 pb-24 md:pb-8">
                {children}
              </div>
            </main>
          </div>

          {/* Mobile Bottom Navigation */}
          <BottomNav />
        </SidebarProvider>
      </body>
    </html>
  );
}
