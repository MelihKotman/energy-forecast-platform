"use client"; // WebsSocket gibi tarayıcı API'lerini kullanmak için Next.js'in client component özelliğini kullanıyoruz

import React, { useEffect, useState } from 'react';
import { 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { Raleway, Space_Grotesk } from 'next/font/google';

// Raleway fontunu Next.js üzerinden optimize ederek projeye dahil ediyoruz
const raleway = Raleway({ 
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

// Go'dan gelecek verinin TypeScript tipini tanımlıyoruz (Data Contract)
interface DashboardMessage {
  time: string;
  device_id: number;
  actual_value: number;
  forecast_value: number;
  model_used: string;
  rolling_rmse: number | null;
  rolling_mae: number | null;
}

// React State için yeni tip: Her cihaz ID'sine karşılık gelen verileri saklamak için bir tip tanımlıyoruz
type DeviceDataMap = Record<number, DashboardMessage[]>; // Cihaz ID'sine göre DashboardMessage dizilerini saklayan bir tip

const THEME = {
  sidebarBg: "#0F1E40", // Koyu lacivert
  sidebarHover: "#1A2B56",
  accentMint: "#2DD4BF", // Mint yeşili (Teal)
  accentBlue: "#3B82F6",
  bgLight: "#F4F7FE", // Ferah açık gri arkaplan
};

function useSmoothValue(targetValue: number | null, durationMs: number = 400) {
  const [displayValue, setDisplayValue] = useState<number | null>(targetValue);
  const startValueRef = React.useRef<number | null>(targetValue);
  const startTimeRef = React.useRef<number>(0);

  useEffect(() => {
    if (targetValue === null) {
      setDisplayValue(null);
      return;
    }

    const startValue = startValueRef.current ?? targetValue;
    startTimeRef.current = performance.now();

    let frameId: number;

    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const current = startValue + (targetValue - startValue) * progress;

      setDisplayValue(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        startValueRef.current = targetValue;
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [targetValue, durationMs]);

  return displayValue;
}

function KpiCard({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const smoothValue = useSmoothValue(value, 400);

  return (
    <div className="text-right bg-gray-50 px-6 py-3 rounded-2xl border border-gray-100">
      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</p>
      <div className={`text-3xl font-bold text-gray-800 tabular-nums ${spaceGrotesk.className}`}>
        {smoothValue !== null ? (
          <>
            {smoothValue.toFixed(2)} <span className="text-sm text-gray-400 font-medium">{unit}</span>
          </>
        ) : (
          <span className="text-base text-gray-400 font-semibold">Hesaplanıyor...</span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [dataMap, setDataMap] = useState<DeviceDataMap>({});
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeDevice, setActiveDevice] = useState<number>(1);

  useEffect(() => {
    // Go APU Gateway'deki WebSocket kanalına bağlanıyoruz
    const ws = new WebSocket('ws://localhost:8080/ws');

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const message: DashboardMessage = JSON.parse(event.data); // Gelen mesajı JSON formatında parse ediyoruz
      const deviceId = message.device_id; // Cihaz ID'sini alıyoruz

      setDataMap((prevDataMap) => {
        // Eğer cihaz ID'si daha önce eklenmemişse, boş bir dizi ile başlatıyoruz
        const currentDeviceData = [...(prevDataMap[message.device_id] || []), message];
        const newData = [...currentDeviceData, message];
        
        // Ekranda çok veri birikip tarayıcıyı dondurmasın diye son 30 veriyi tut
        const trimmedData = newData.length > 30 ? newData.slice(1) : newData;

        // Sözlüğü güncelle
        return {
          ...prevDataMap,
          [deviceId]: trimmedData
        };
      });
    };

    return () => ws.close();
  }, []);
  // Sadece seçili cihaza ait verileri grafiğe gönder
  const activeData = dataMap[activeDevice] || [];

return (
    <div className={`flex min-h-screen bg-[${THEME.bgLight}] font-sans ${raleway.className} ${spaceGrotesk.variable}`}>
      
      {/* SOL KENAR ÇUBUĞU (SIDEBAR) */}
      <aside className="w-64 hidden md:flex flex-col shadow-2xl z-10" style={{ backgroundColor: THEME.sidebarBg }}>
        <div className="p-8 flex items-center gap-3">
          {/* Logo İkonu */}
          <div className="w-8 h-8 rounded-lg bg-teal-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(45,212,191,0.5)]">
            S
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-wide">
            sentix<span className="text-teal-400">.ai</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 mt-6 space-y-2">
          {/* Aktif Menü Elemanı */}
          <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-teal-400/10 text-teal-400 border border-teal-400/20 cursor-pointer transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span className="font-semibold text-sm">Dashboard</span>
          </div>
          
          {/* Pasif Menü Elemanları (Süs için) */}
          {['Cihaz Yönetimi', 'Model Metrikleri', 'Ayarlar'].map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A2B56] cursor-pointer transition-all">
               <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span className="font-semibold text-sm">{item}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* SAĞ ANA İÇERİK ALANI */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden" style={{ backgroundColor: THEME.bgLight }}>
        
        {/* Üst Bar (Topbar) */}
        <header className="w-full px-8 py-6 flex justify-between items-center bg-white/50 backdrop-blur-md border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Cihaz İzleme Merkezi</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">Gerçek Zamanlı AI Tüketim Analizi</p>
          </div>
          
          {/* Minimalist Canlı Bağlantı Göstergesi */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${isConnected ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-teal-500 animate-pulse' : 'bg-red-500'}`}></span>
              <span className="text-xs font-bold uppercase tracking-widest">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
            </div>
            {/* Profil İkonu (Mock) */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 shadow-sm border-2 border-white"></div>
          </div>
        </header>

        {/* Dashboard İçeriği */}
        <div className="flex-1 overflow-y-auto p-8">
          
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Cihaz Seçim Butonları (Referans görseldeki mavi butonlar gibi) */}
            <div className="flex gap-3">
              {[1, 2, 3].map((deviceId) => (
                <button
                  key={deviceId}
                  onClick={() => setActiveDevice(deviceId)}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all duration-200 ${
                    activeDevice === deviceId 
                      ? "bg-[#3B82F6] text-white shadow-blue-500/30" // Aktif mavi
                      : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                  }`}
                >
                  Cihaz {deviceId}
                </button>
              ))}
            </div>

            {/* Grafiğin Bulunduğu Ana Kart */}
            <div className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Tüketim Tahmin Akışı</h3>
                  <div className="flex items-center gap-4 mt-3">
                     <div className="flex items-center gap-2">
                       <span className="w-3 h-3 rounded-full bg-[#1A2B56]"></span>
                       <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gerçek Tüketim</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="w-3 h-3 rounded-full bg-teal-400"></span>
                       <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Tahmini</span>
                     </div>
                  </div>
                </div>
                
                {/* Son Değer Kutucuğu */}
                {activeData.length > 0 && (
                  <div className="flex gap-4">
                    <KpiCard
                    label="Anlık Yük"
                    value={activeData[activeData.length - 1].forecast_value}
                    unit="kW"
                  />
                    <KpiCard
                    label="Rolling RMSE"
                    value={activeData[activeData.length - 1].rolling_rmse}
                    unit="kW"
                  />
                    <KpiCard
                    label="Rolling MAE"
                    value={activeData[activeData.length - 1].rolling_mae}
                    unit="kW"
                  />
                </div>
                )}
                </div>
              
              {/* Grafik Alanı */}
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={activeData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                    <defs>
                      {/* Referans görseldeki gibi yumuşak bir degrade (gradient) */}
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={THEME.sidebarBg} stopOpacity={0.15}/>
                        <stop offset="95%" stopColor={THEME.sidebarBg} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    
                    {/* Arka plan ızgarası çok hafif, sadece yatay */}
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    
                    <XAxis 
                      dataKey="time" 
                      stroke="#cbd5e1" 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-space-grotesk)' }} 
                      tickMargin={15} 
                      axisLine={false} 
                      tickLine={false} 
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis 
                      stroke="#cbd5e1" 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-space-grotesk)' }} 
                      axisLine={false} 
                      tickLine={false} 
                      dx={-10}
                    />
                    
                    <Tooltip 
                      contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: 'none', 
                      borderRadius: '12px', 
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                      fontFamily: 'var(--font-space-grotesk)'
                      }}
                      itemStyle={{ fontWeight: '700' }}
                      cursor={{ stroke: '#e2e8f0', strokeWidth: 2, strokeDasharray: '4 4' }}
                      formatter={(value, name) => {
                          const numericValue = typeof value === 'number' ? value : Number(value);
                          const label = name === 'actual_value' ? 'Gerçek Tüketim' : 'AI Tahmini';
                          return [`${numericValue.toFixed(2)} kW`, label];
                      }}
                      labelFormatter={(label) => `Saat: ${label}`}
                      />
                    
                    {/* Gerçek Veri (Lacivert Alan Grafiği) */}
                    <Area 
                      type="monotone" 
                      dataKey="actual_value" 
                      stroke={THEME.sidebarBg} 
                      strokeWidth={3}
                      fill="url(#colorActual)"
                      isAnimationActive={false}
                      activeDot={{ r: 6, fill: THEME.sidebarBg, stroke: '#fff', strokeWidth: 2 }}
                    />
                    
                    {/* AI Tahmini (Mint Yeşili Çizgi) */}
                    <Line 
                      type="monotone" 
                      dataKey="forecast_value" 
                      stroke={THEME.accentMint} 
                      strokeWidth={3}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}