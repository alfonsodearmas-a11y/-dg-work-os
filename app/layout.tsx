import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { MobileMenuButton } from "@/components/layout/MobileMenuButton";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
      <body className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <SidebarProvider>
          <div className="min-h-screen flex">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 min-h-screen">
              {/* Top Bar */}
              <header className="h-16 border-b border-[#2d3a52]/50 bg-[#0a1628]/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="h-full px-4 md:px-8 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MobileMenuButton />
                    <div>
                      <h2 className="text-white/80 text-sm font-light tracking-wide">Welcome back,</h2>
                      <p className="text-[#d4af37] font-semibold tracking-tight">Director General</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-white/60 text-xs font-light tracking-wide">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center">
                      <span className="text-[#0a1628] font-bold text-sm">AD</span>
                    </div>
                  </div>
                </div>
              </header>

              {/* Page Content */}
              <div className="p-4 md:p-8">
                {children}
              </div>
            </main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
