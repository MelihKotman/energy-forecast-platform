"use client";

import React, { useState } from 'react';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
});

// Şık Toggle (Şalter) Bileşeni
const Toggle = ({ enabled, onChange }: { enabled: boolean, onChange: () => void }) => (
  <button 
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${enabled ? 'bg-teal-500' : 'bg-gray-200'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

export default function SettingsPage() {
  // Ayarlar için örnek stateler
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [aiRetrain, setAiRetrain] = useState(true);

  return (
    <>
      {/* ÜST BAR */}
      <header className="w-full px-8 py-6 flex justify-between items-center bg-white/50 backdrop-blur-md border-b border-gray-100 shrink-0 z-10">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Sistem Ayarları</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Platform konfigürasyonları ve entegrasyon yönetimi</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="px-6 py-2 bg-gray-100 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-200 transition-colors">
            İptal
          </button>
          <button className="px-6 py-2 bg-[#0F1E40] text-white font-bold text-sm rounded-xl hover:bg-[#1a2e5e] transition-colors shadow-lg shadow-blue-900/20">
            Değişiklikleri Kaydet
          </button>
        </div>
      </header>

      {/* ANA İÇERİK */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* 1. API VE BAĞLANTI AYARLARI */}
          <div className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              </div>
              <h3 className={`text-xl font-bold text-gray-800 ${spaceGrotesk.className}`}>Bağlantı & Entegrasyon (API)</h3>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">FastAPI Model Inference Endpoint</label>
                <input type="text" defaultValue="http://localhost:8000/model-metrics" disabled
                  className="w-full bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-xl px-4 py-3 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Go WebSocket Canlı Veri Akışı</label>
                <input type="text" defaultValue="ws://localhost:8080/ws" disabled
                  className="w-full bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-xl px-4 py-3 focus:outline-none" />
              </div>
              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-emerald-800">PostgreSQL / TimescaleDB Durumu</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Veritabanı bağlantısı sağlıklı ve aktif.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Connected
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 2. BİLDİRİM VE UYARI SİSTEMİ */}
            <div className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-rose-50 text-rose-500 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                </div>
                <h3 className={`text-xl font-bold text-gray-800 ${spaceGrotesk.className}`}>Uyarı Tercihleri</h3>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">E-Posta Bildirimleri</p>
                    <p className="text-xs text-gray-500 mt-1">Anomali durumunda rapor gönder.</p>
                  </div>
                  <Toggle enabled={emailNotif} onChange={() => setEmailNotif(!emailNotif)} />
                </div>
                <hr className="border-gray-100" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Acil Durum SMS (Kritik)</p>
                    <p className="text-xs text-gray-500 mt-1">Tüketim %50 saparsa SMS at.</p>
                  </div>
                  <Toggle enabled={smsNotif} onChange={() => setSmsNotif(!smsNotif)} />
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Anomali Eşik Hassasiyeti (kW)</label>
                  <input type="range" min="0.1" max="5.0" step="0.1" defaultValue="1.5" className="w-full accent-teal-500" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1 font-semibold">
                    <span>Hassas (0.1)</span>
                    <span>Esnek (5.0)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. YAPAY ZEKA VE SİSTEM TERCİHLERİ */}
            <div className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className={`text-xl font-bold text-gray-800 ${spaceGrotesk.className}`}>Sistem & Model</h3>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Senkronizasyon (Live Sync)</p>
                    <p className="text-xs text-gray-500 mt-1">WebSocket akışını açık tut.</p>
                  </div>
                  <Toggle enabled={autoSync} onChange={() => setAutoSync(!autoSync)} />
                </div>
                <hr className="border-gray-100" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Otomatik Model Eğitimi</p>
                    <p className="text-xs text-gray-500 mt-1">LightGBM her hafta yeniden eğitilir.</p>
                  </div>
                  <Toggle enabled={aiRetrain} onChange={() => setAiRetrain(!aiRetrain)} />
                </div>
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <button className="w-full py-3 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 transition-colors flex justify-center items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Sistem Önbelleğini Temizle
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}