"use client";

import React, { useState, useEffect } from 'react';
import { Space_Grotesk } from 'next/font/google';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
});

// --- MOCK VERİLER ---

const FEATURE_IMPORTANCE = [
  { name: 'lag_1 (Son 15dk)', score: 85, color: '#3B82F6' },
  { name: 'rolling_mean_15', score: 72, color: '#0EA5E9' },
  { name: 'hour (Saat)', score: 64, color: '#06B6D4' },
  { name: 'lag_2 (Son 30dk)', score: 58, color: '#14B8A6' },
  { name: 'rolling_std_5', score: 45, color: '#10B981' },
  { name: 'dayofweek (Gün)', score: 30, color: '#84CC16' },
  { name: 'month (Ay)', score: 12, color: '#F59E0B' },
];

const generateResiduals = () => {
  return Array.from({ length: 100 }).map((_, i) => {
    const predicted = Math.random() * 5; 
    const error = (Math.random() - 0.5) * (Math.random() > 0.8 ? 1.5 : 0.4); 
    return { predicted: parseFloat(predicted.toFixed(2)), error: parseFloat(error.toFixed(2)) };
  });
};
const RESIDUAL_DATA = generateResiduals();

const CustomFeatureTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100">
        <span className="block text-gray-400 text-[11px] uppercase tracking-wider mb-1 font-semibold">Önem Skoru</span>
        <span className="block font-extrabold text-sm text-gray-800">{payload[0].payload.name}: {payload[0].value}</span>
      </div>
    );
  }
  return null;
};

const CustomScatterTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100">
        <span className="block text-gray-400 text-[11px] uppercase tracking-wider mb-1 font-semibold">Hata (Residual)</span>
        <span className="block font-bold text-sm text-gray-800 mb-1">Tahmin: {payload[0].value} kW</span>
        <span className={`block font-bold text-sm ${payload[1].value > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
          Sapma: {payload[1].value > 0 ? '+' : ''}{payload[1].value} kW
        </span>
      </div>
    );
  }
  return null;
};

// Renk paleti eşleştirmesi için
const CHART_COLORS = ['#3B82F6', '#0EA5E9', '#06B6D4', '#14B8A6', '#10B981', '#84CC16', '#F59E0B'];

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('7D');
  
  // API'den gelecek veriler için State'ler
  const [kpis, setKpis] = useState({ rmse: 0, mae: 0, r2: 0, latency: 0 });
  const [features, setFeatures] = useState<any[]>([]);
  const [residuals, setResiduals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Canlı veri bağlantısı durumu

  // Sayfa yüklendiğinde FastAPI'den metrikleri çek
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('http://localhost:8000/model-metrics');
        const data = await response.json();
        
        // 🌟 YENİ: Backend'den hata geldiyse uygulamayı çökertme, güvenli çıkış yap
        if (data.error) {
          console.error("Backend Hatası:", data.error);
          setIsLoading(false);
          return; // .map() fonksiyonuna gitmesini engeller
        }
        
        setKpis(data.kpis);
        
        const coloredFeatures = data.feature_importance.map((f: any, index: number) => ({
          ...f,
          color: CHART_COLORS[index % CHART_COLORS.length]
        }));
        setFeatures(coloredFeatures);
        
        setResiduals(data.residuals);
        setIsLoading(false);
      } catch (error) {
        console.error("Metrikler çekilemedi veya API kapalı:", error);
        setIsLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Yüklenme veya Hata Durumu Ekranı
  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-gray-500 font-bold">Model Analizleri Yükleniyor...</div>;
  }
  
  // Eğer özellikler dizisi boşsa (Model yüklenemediyse)
  if (!isLoading && features.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-rose-500 font-bold gap-2">
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        <span>Model verileri alınamadı. Lütfen Backend (FastAPI) loglarını kontrol edin.</span>
      </div>
    );
  }
  

  return (
    <>
      <header className="w-full px-8 py-6 flex justify-between items-center bg-white/50 backdrop-blur-md border-b border-gray-100 shrink-0 z-10">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Cihaz İzleme Merkezi</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Gerçek Zamanlı AI Tüketim Analizi</p>
        </div>
        
        <div className="flex items-center gap-6">
          
          {/* MEVCUT: Bağlantı Durumu (LIVE SYNC / OFFLINE) */}
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${isConnected ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-teal-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-xs font-bold uppercase tracking-widest">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
          </div>

          {/* 🌟 YENİ: Kullanıcı Profil Menüsü */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none"
            >
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold text-gray-800">Melih Kotman</p>
                <p className="text-xs text-teal-500 font-semibold">Sistem Yöneticisi</p>
              </div>
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-teal-400 shadow-md border-2 border-white flex items-center justify-center text-white font-bold text-sm">
                MK
              </div>
            </button>

            {/* Açılır Menü (Dropdown) */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-3 border-b border-gray-50 mb-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Oturum Açık</p>
                  <p className="text-sm font-bold text-gray-800 truncate">melih@homeV.tr</p>
                </div>
                
                <button className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-teal-600 font-medium flex items-center gap-3 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Profilim
                </button>
                
                <button className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-teal-600 font-medium flex items-center gap-3 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Hesap Ayarları
                </button>
                
                <div className="h-px bg-gray-100 my-1"></div>
                
                <button className="w-full text-left px-4 py-2 text-sm text-rose-500 hover:bg-rose-50 font-medium flex items-center gap-3 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Güvenli Çıkış
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* DİNAMİK KPI KARTLARI */}
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: 'Global RMSE', sub: 'Ortalama Karekök Hata', value: kpis.rmse.toFixed(2), unit: 'kW', bg: '#b0b61d' },
              { label: 'Global MAE',  sub: 'Ortalama Mutlak Hata',  value: kpis.mae.toFixed(2),  unit: 'kW', bg: '#0a8cd3' },
              { label: 'R² Score',    sub: 'Model Açıklayıcılığı',  value: kpis.r2.toFixed(2),   unit: '',   bg: '#b0146f' },
              { label: 'Tahmin Hızı', sub: 'Gecikme (Latency)',     value: kpis.latency,         unit: 'ms', bg: '#119a75' },
            ].map((card) => (
              <div key={card.label} className="rounded-3xl px-6 py-6 relative overflow-hidden flex flex-col justify-between" style={{ backgroundColor: card.bg }}>
                 {/* ... (Arka plan şekilleri aynı) ... */}
                <div className="relative mb-6">
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255, 255, 255, 0.84)' }}>{card.label}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{card.sub}</p>
                </div>
                <div className="relative flex items-baseline gap-1">
                  <div className={`font-bold text-white tabular-nums ${spaceGrotesk.className}`} style={{ fontSize: '46px', lineHeight: 1, letterSpacing: '-1px' }}>
                    {card.value}
                  </div>
                  {card.unit && <div className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{card.unit}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* SOL: DİNAMİK Öznitelik Önemi */}
            <div className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-[500px]">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800">Öznitelik Önemi (Feature Importance)</h3>
                <p className="text-xs text-gray-500 mt-1">LightGBM modelinin karar alırken kullandığı öznitelik ağırlıkları</p>
              </div>
              <div className="flex-1 w-full mt-2">
                {features.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={features} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      {/* 🌟 YENİ: width={120} eklenerek uzun değişken isimlerinin sığması sağlandı */}
                      <YAxis dataKey="name" type="category" width={120} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} content={<CustomFeatureTooltip />} />
                      {/* 🌟 YENİ: Animasyon kapatılarak render hataları önlendi */}
                      <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
                        {features.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="flex items-center justify-center h-full text-gray-400 text-sm">Veri bekleniyor...</div>
                )}
              </div>
            </div>

            {/* SAĞ: DİNAMİK Residual (Hata) Dağılımı */}
            <div className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-[500px]">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800">Hata Dağılımı (Residual Analysis)</h3>
                <p className="text-xs text-gray-500 mt-1">Tahmin değerlerine karşılık modelin yaptığı pozitif/negatif sapmalar</p>
              </div>
              <div className="flex-1 w-full mt-2">
                {residuals.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      {/* 🌟 YENİ: domain={['auto', 'auto']} ile veriye göre otomatik ölçekleme eklendi */}
                      <XAxis type="number" dataKey="predicted" name="Tahmin (kW)" domain={['auto', 'auto']} stroke="#cbd5e1" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="number" dataKey="error" name="Hata (kW)" domain={['auto', 'auto']} stroke="#cbd5e1" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <ZAxis range={[60, 60]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomScatterTooltip />} />
                      {/* 🌟 YENİ: Scatter animasyonu kapatıldı ve Cell içine opaklık eklendi */}
                      <Scatter data={residuals} isAnimationActive={false}>
                        {residuals.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.error > 0 ? '#F43F5E' : '#10B981'} opacity={0.7} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">Veri bekleniyor...</div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}