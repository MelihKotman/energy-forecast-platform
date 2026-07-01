import type { Metadata } from "next";
import { Raleway, Space_Grotesk } from 'next/font/google';
import "./globals.css"; 
import Link from "next/link";

const raleway = Raleway({ 
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
});

// Space Grotesk fontunu CSS değişkeni olarak sisteme dahil ediyoruz
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: "Sentix AI | Enerji Platformu",
  description: "Gerçek Zamanlı AI Tüketim Analizi",
};

const THEME = {
  sidebarBg: "#0F1E40",
  bgLight: "#F4F7FE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      {/* Arka plan rengi hatası style ile kesin olarak çözüldü */}
      <body className={`${raleway.className} ${spaceGrotesk.variable} text-gray-900`} style={{ backgroundColor: THEME.bgLight }}>
        <div className="flex min-h-screen overflow-hidden">
          
          {/* SABİT SOL KENAR ÇUBUĞU (SIDEBAR) */}
          <aside className="w-64 hidden md:flex flex-col shadow-2xl z-20 shrink-0" style={{ backgroundColor: THEME.sidebarBg }}>
            <div className="p-8 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(45,212,191,0.5)]">
                S
              </div>
              <Link href="/">
                <h1 className="text-xl font-extrabold text-white tracking-wide">
                  sentix<span className="text-teal-400">.ai</span>
                </h1>
              </Link>
            </div>

            <nav className="flex-1 px-4 mt-6 space-y-2">
              <Link href="/" className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-teal-400/10 hover:text-teal-400 text-gray-400 border border-transparent hover:border-teal-400/20 cursor-pointer transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                <span className="font-semibold text-sm">Dashboard</span>
              </Link>
              
              <Link href="/devices" className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-teal-400/10 hover:text-teal-400 text-gray-400 border border-transparent hover:border-teal-400/20 cursor-pointer transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <span className="font-semibold text-sm">Cihaz Yönetimi</span>
              </Link>

              <Link href="#" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A2B56] cursor-pointer transition-all">
                <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="font-semibold text-sm">Ayarlar</span>
              </Link>
            </nav>
          </aside>

          {/* DEĞİŞKEN ANA İÇERİK ALANI (Sayfalar buraya yüklenir) */}
          <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
            {children}
          </main>

        </div>
      </body>
    </html>
  );
}