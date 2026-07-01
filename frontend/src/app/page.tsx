"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
});

interface DashboardMessage {
  time: string;
  date: string; 
  device_id: number;
  actual_value: number;
  forecast_value: number;
  model_used: string;
  rolling_rmse: number | null;
  rolling_mae: number | null;
}

type DeviceDataMap = Record<number, DashboardMessage[]>;

// 🌟 YENİ: Soft UI Renk ve İkon Paleti (Göz yormayan pastel arka planlar)
const SUMMARY_STYLES = {
  danger: { 
    color: "#E11D48", // Rose 600
    bg: "#FFF1F2",    // Rose 50
    border: "#FFE4E6",// Rose 100
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    )
  },
  success: { 
    color: "#059669", // Emerald 600
    bg: "#ECFDF5",    // Emerald 50
    border: "#D1FAE5",// Emerald 100
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
      </svg>
    )
  },
  warning: { 
    color: "#D97706", // Amber 600
    bg: "#FFFBEB",    // Amber 50
    border: "#FEF3C7",// Amber 100
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8 8 8 0 018 8 8 8 0 01-8 8 8 8 0 01-8-8z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
      </svg>
    )
  },
};

export default function Dashboard() {
  const SYSTEM_DEVICES = [
  { id: 1, name: "Ana Şebeke (Ev)" },
  { id: 2, name: "HVAC Sistemi (Klima)" },
  { id: 3, name: "Aydınlatma Grubu" },
  ];
  const [dataMap, setDataMap] = useState<DeviceDataMap>({});
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeDevice, setActiveDevice] = useState<number>(1);

  // WebSocket Bağlantısı
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const message: DashboardMessage = JSON.parse(event.data);
      const deviceId = message.device_id;

      setDataMap((prevDataMap) => {
        const prev = prevDataMap[deviceId] || [];
        const newData = [...prev, message];
        const trimmedData = newData.length > 120 ? newData.slice(newData.length - 120) : newData;
        return { ...prevDataMap, [deviceId]: trimmedData };
      });
    };
    return () => ws.close();
  }, []);

  const activeData = dataMap[activeDevice] || [];

  // Saatlik Özet Mantığı (Son 60 dakika)
  const lastHourStats = useMemo(() => {
    if (activeData.length === 0) return null;
    const last60 = activeData.slice(-60);
    const max = Math.max(...last60.map((d) => d.actual_value));
    const min = Math.min(...last60.map((d) => d.actual_value));
    const avg = last60.reduce((acc, curr) => acc + curr.actual_value, 0) / last60.length;
    
    return { 
      max: max.toFixed(2), 
      min: min.toFixed(2), 
      avg: avg.toFixed(2) 
    };
  }, [activeData]);

  // Günlük Özet Mantığı
  const dailySummaryStats = useMemo(() => {
    if (activeData.length === 0) return null;
    const grouped: Record<string, number[]> = {};
    activeData.forEach((d) => {
      const hour = d.time.split(':')[0] + ':00';
      if (!grouped[hour]) grouped[hour] = [];
      grouped[hour].push(d.actual_value);
    });

    const hourlyAverages = Object.entries(grouped).map(([hour, values]) => ({
      hour,
      avg_consumption: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
    }));

    const peak = hourlyAverages.reduce((a, b) => a.avg_consumption > b.avg_consumption ? a : b);
    const low  = hourlyAverages.reduce((a, b) => a.avg_consumption < b.avg_consumption ? a : b);
    const dailyAvg = (hourlyAverages.reduce((acc, curr) => acc + curr.avg_consumption, 0) / hourlyAverages.length).toFixed(2);

    return { peak, low, dailyAvg };
  }, [activeData]);

  return (
    <>
      <header className="w-full px-8 py-6 flex justify-between items-center bg-white/50 backdrop-blur-md border-b border-gray-100 shrink-0 z-10">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Cihaz İzleme Merkezi</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Gerçek Zamanlı AI Tüketim Analizi</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${isConnected ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-teal-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-xs font-bold uppercase tracking-widest">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 shadow-sm border-2 border-white"></div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Cihaz Seçim Butonları (Güncellendi) */}
          <div className="flex gap-3">
            {SYSTEM_DEVICES.map((device) => (
              <button key={device.id} onClick={() => setActiveDevice(device.id)}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all duration-200 flex items-center gap-2 ${
                  activeDevice === device.id
                    ? "bg-[#3B82F6] text-white shadow-blue-500/30"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}>
                
                {/* Küçük bir durum gösterge noktası ekledik */}
                <span className={`w-2 h-2 rounded-full ${activeDevice === device.id ? 'bg-white' : 'bg-gray-300'}`}></span>
                {device.name}
                
              </button>
            ))}
          </div>

          {/* Ana Grafik */}
          <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Tüketim Tahmin Akışı</h3>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#0F1E40]"></span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gerçek</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-teal-400"></span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Tahmini</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={activeData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F1E40" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#0F1E40" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="time" stroke="#cbd5e1"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    tickMargin={15} axisLine={false} tickLine={false}
                    interval="preserveStartEnd" minTickGap={60} />
                  <YAxis stroke="#cbd5e1"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '12px', padding: '8px 12px' }}
                    itemStyle={{ fontWeight: '700', fontSize: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}
                    cursor={{ stroke: '#e2e8f0', strokeWidth: 2, strokeDasharray: '4 4' }}
                    formatter={(value, name) => [`${Number(value).toFixed(2)} kW`, name === 'actual_value' ? 'Gerçek Tüketim' : 'AI Tahmini']}
                    labelFormatter={(l) => `Saat: ${l}`} />
                  <Area type="monotone" dataKey="actual_value" stroke="#0F1E40" strokeWidth={3} fill="url(#colorActual)" isAnimationActive={false} activeDot={{ r: 6, fill: '#0F1E40', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="forecast_value" stroke="#2DD4BF" strokeWidth={3} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SAATLİK & GÜNLÜK ÖZET KARTLARI (YENİ SOFT UI TASARIMI) */}
          <div className="grid grid-cols-2 gap-6">

            {/* Sol: Saatlik Özet */}
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Saatlik Özet</h3>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-5">Son 1 saatin tüketim dağılımı</p>
              {lastHourStats ? (
                <div className="space-y-4">
                  {[
                    { label: 'Zirve Tüketim', value: lastHourStats.max, unit: 'kW', sub: 'Son 1 saatin en yüksek anı', style: SUMMARY_STYLES.danger },
                    { label: 'Taban Tüketim', value: lastHourStats.min, unit: 'kW', sub: 'Son 1 saatin en düşük anı', style: SUMMARY_STYLES.success },
                    { label: 'Saatlik Ortalama', value: lastHourStats.avg, unit: 'kW', sub: 'Genel denge (1 Saat)', style: SUMMARY_STYLES.warning },
                  ].map((row) => (
                    // 🌟 Pastel Arka Planlar ve Büyüyen Tipografi
                    <div key={row.label} className="flex items-center justify-between px-5 py-4 rounded-2xl border" style={{ backgroundColor: row.style.bg, borderColor: row.style.border }}>
                      <div className="flex items-center gap-4">
                        {/* 🌟 Şekiller (İkon Kutusu) */}
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm" style={{ color: row.style.color }}>
                          {row.style.icon}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{row.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{row.sub}</div>
                        </div>
                      </div>
                      <div className={`text-4xl font-extrabold tabular-nums ${spaceGrotesk.className}`} style={{ color: row.style.color }}>
                        {row.value} {row.unit && <span className="text-base font-semibold opacity-70 ml-1">{row.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Veri bekleniyor...</div>
              )}
            </div>

            {/* Sağ: Günlük Özet */}
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Günlük Özet</h3>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-5">Günün saat bazlı karşılaştırması</p>
              {dailySummaryStats ? (
                <div className="space-y-4">
                  {[
                    { label: 'En Yoğun Saat', value: dailySummaryStats.peak.hour, unit: '', sub: `${dailySummaryStats.peak.avg_consumption} kW ortalama tüketim`, style: SUMMARY_STYLES.danger },
                    { label: 'En Sakin Saat', value: dailySummaryStats.low.hour, unit: '', sub: `${dailySummaryStats.low.avg_consumption} kW ortalama tüketim`, style: SUMMARY_STYLES.success },
                    { label: 'Günlük Ortalama', value: dailySummaryStats.dailyAvg, unit: 'kW', sub: 'Tüm saatlerin ortalaması', style: SUMMARY_STYLES.warning },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-5 py-4 rounded-2xl border" style={{ backgroundColor: row.style.bg, borderColor: row.style.border }}>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm" style={{ color: row.style.color }}>
                          {row.style.icon}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{row.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{row.sub}</div>
                        </div>
                      </div>
                      <div className={`text-4xl font-extrabold tabular-nums ${spaceGrotesk.className}`} style={{ color: row.style.color }}>
                        {row.value} {row.unit && <span className="text-base font-semibold opacity-70 ml-1">{row.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Veri bekleniyor...</div>
              )}
            </div>
          </div>

          {/* ALT: KPI KARTLARI */}
          {activeData.length > 0 && (
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: 'Anlık Yük',      sub: 'Son tahmin',   value: activeData[activeData.length-1].forecast_value.toFixed(2), bg: '#0F1E40' },
                { label: 'Anlık Sapma',    sub: 'Rolling RMSE', value: activeData[activeData.length-1].rolling_rmse?.toFixed(2) ?? '—', bg: '#0D9488' },
                { label: 'Ortalama Sapma', sub: 'Rolling MAE',  value: activeData[activeData.length-1].rolling_mae?.toFixed(2)  ?? '—', bg: '#1D4ED8' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl px-6 py-5 relative overflow-hidden flex justify-between items-center"
                  style={{ backgroundColor: card.bg }}>
                  <div className="absolute -top-8 -right-5 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}/>
                  <div className="absolute -bottom-10 -left-3 w-24 h-24 rounded-full" style={{ background: 'rgba(255,255,255,0.03)' }}/>
                  <div className="relative">
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255, 255, 255, 0.93)' }}>{card.label}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{card.sub}</p>
                  </div>
                  <div className="relative text-right">
                    <div className={`font-bold text-white tabular-nums ${spaceGrotesk.className}`} style={{ fontSize: '42px', lineHeight: 1, letterSpacing: '-1px' }}>
                      {card.value}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>kW</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
}