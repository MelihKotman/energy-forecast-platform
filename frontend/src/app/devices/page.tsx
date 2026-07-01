"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Space_Grotesk } from 'next/font/google';
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
});

const SYSTEM_DEVICES = [
  { id: 1, name: "Ana Şebeke (Ev)", type: "Smart Meter" },
  { id: 2, name: "HVAC Sistemi (Klima)", type: "Heavy Load" },
  { id: 3, name: "Aydınlatma Grubu", type: "Low Load" },
];

interface DashboardMessage {
  time: string;
  date: string;
  device_id: number;
  actual_value: number;
  forecast_value: number;
}

interface AnomalyToast {
  id: number;
  deviceId: number;
  deviceName: string;
  diff: number;
  time: string;
}

type DeviceDataMap = Record<number, DashboardMessage[]>;
type LiveDeviceStatus = Record<number, {
  lastSync: string;
  currentKw: number;
  isWorking: boolean;
  hasAnomaly: boolean;  // cihaz listesinde ikon için
}>;

// Her cihaz için ayrı eşik değeri — varsayılan 1.5 kW
type ThresholdMap = Record<number, number>;

const CustomGanttTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-100">
        <span className="block text-gray-400 text-[11px] uppercase tracking-wider mb-1 font-semibold">
          Saat: {label}
        </span>
        <span className="block font-extrabold text-sm" style={{ color: payload[0].payload.color }}>
          {payload[0].payload.statusName}
        </span>
      </div>
    );
  }
  return null;
};

export default function DevicesPage() {
  const [activeDevice, setActiveDevice] = useState<number>(1);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [dataMap, setDataMap] = useState<DeviceDataMap>({});
  const [liveStatus, setLiveStatus] = useState<LiveDeviceStatus>({});
  const [toasts, setToasts] = useState<AnomalyToast[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdMap>({ 1: 1.5, 2: 1.5, 3: 1.5 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDevice, setDrawerDevice] = useState<number>(1);

  const selectedDevice = SYSTEM_DEVICES.find(d => d.id === activeDevice);

  const addToast = useCallback((toast: AnomalyToast) => {
    setToasts(prev => [...prev.slice(-4), toast]); // max 5 toast
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 4000);
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const message: DashboardMessage = JSON.parse(event.data);
      const deviceId = message.device_id;
      const isWorking = message.actual_value > 0.1;

      // Anomali kontrolü — threshold state'ine doğrudan erişemeyiz
      // Bu yüzden custom event ile threshold'u dışarıdan alıyoruz
      const threshold = (window as any).__sentix_thresholds?.[deviceId] ?? 1.5;
      const diff = Math.abs(message.actual_value - message.forecast_value);
      const hasAnomaly = diff > threshold;

      if (hasAnomaly) {
        const device = SYSTEM_DEVICES.find(d => d.id === deviceId);
        addToast({
          id: Date.now() + Math.random(),
          deviceId,
          deviceName: device?.name ?? `Cihaz ${deviceId}`,
          diff: parseFloat(diff.toFixed(2)),
          time: message.time,
        });
      }

      setLiveStatus(prev => ({
        ...prev,
        [deviceId]: {
          lastSync: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
          currentKw: message.actual_value,
          isWorking,
          hasAnomaly,
        }
      }));

      setDataMap(prevDataMap => {
        const prev = prevDataMap[deviceId] || [];
        const newData = [...prev, message];
        const trimmedData = newData.length > 120 ? newData.slice(newData.length - 120) : newData;
        return { ...prevDataMap, [deviceId]: trimmedData };
      });
    };

    return () => ws.close();
  }, [addToast]);

  // threshold değişince window'a yaz ki WebSocket handler okuyabilsin
  useEffect(() => {
    (window as any).__sentix_thresholds = thresholds;
  }, [thresholds]);

  const activeData = dataMap[activeDevice] || [];

  const activityData = useMemo(() => {
    return activeData.map(d => ({
      time: d.time,
      bandLevel: 1,
      statusName: d.actual_value > 0.1 ? "Çalışıyor" : "Uyku Modu",
      color: d.actual_value > 0.1 ? "#10B981" : "#A855F7",
    }));
  }, [activeData]);

  const anomalyCount = Object.values(liveStatus).filter(s => s.hasAnomaly).length;

  return (
    <>
      {/* TOAST BİLDİRİMLERİ */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="bg-white rounded-xl border-l-4 border-rose-500 shadow-2xl flex items-start gap-3 p-4 min-w-[280px] animate-pulse"
            style={{ animation: 'slideIn 0.2s ease-out' }}
          >
            <div className="bg-rose-50 text-rose-500 p-2 rounded-lg shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Anomali Tespit Edildi</p>
              <p className="text-xs text-gray-500 mt-0.5">{toast.deviceName}</p>
              <p className="text-xs text-rose-500 font-semibold mt-1">
                Sapma: {toast.diff} kW · {toast.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* YAPILANDIR DRAWER */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Cihazı Yapılandır</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {SYSTEM_DEVICES.find(d => d.id === drawerDevice)?.name}
                </p>
              </div>
              <button onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">
              {/* Anomali Eşiği */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-bold text-gray-700">Anomali Eşik Değeri</label>
                  <span className={`text-sm font-bold tabular-nums ${spaceGrotesk.className}`}
                    style={{ color: '#0F1E40' }}>
                    {thresholds[drawerDevice]?.toFixed(1)} kW
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1" max="5.0" step="0.1"
                  value={thresholds[drawerDevice] ?? 1.5}
                  onChange={(e) => setThresholds(prev => ({
                    ...prev,
                    [drawerDevice]: parseFloat(e.target.value)
                  }))}
                  className="w-full accent-[#0F1E40]"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.1 kW (hassas)</span>
                  <span>5.0 kW (gevşek)</span>
                </div>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Tahmin ile gerçek değer arasındaki fark bu eşiği aştığında anomali bildirimi gönderilir.
                </p>
              </div>

              {/* Mevcut durum özeti */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Anlık Durum</p>
                {(() => {
                  const s = liveStatus[drawerDevice];
                  if (!s) return <p className="text-xs text-gray-400">Veri bekleniyor...</p>;
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Anlık Yük</span>
                        <span className={`text-xs font-bold text-gray-800 tabular-nums ${spaceGrotesk.className}`}>
                          {s.currentKw.toFixed(2)} kW
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Durum</span>
                        <span className={`text-xs font-bold ${s.isWorking ? 'text-emerald-600' : 'text-purple-600'}`}>
                          {s.isWorking ? 'Çalışıyor' : 'Uyku Modu'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Anomali</span>
                        <span className={`text-xs font-bold ${s.hasAnomaly ? 'text-rose-500' : 'text-emerald-600'}`}>
                          {s.hasAnomaly ? 'Tespit Edildi' : 'Normal'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Tüm Cihazlar için Toplu Eşik */}
              <button
                onClick={() => {
                  const val = thresholds[drawerDevice] ?? 1.5;
                  setThresholds({ 1: val, 2: val, 3: val });
                }}
                className="w-full py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Tüm Cihazlara Uygula
              </button>
            </div>
          </div>
        </>
      )}

      {/* ÜST BAR */}
      <header className="w-full px-8 py-6 flex justify-between items-center bg-white/50 backdrop-blur-md border-b border-gray-100 shrink-0 z-10">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Cihaz Envanteri</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Sistemdeki donanımları ve çalışma periyotlarını yönetin
          </p>
        </div>
        <div className="flex items-center gap-4">
          {anomalyCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 border border-rose-100 text-rose-600">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-widest">
                {anomalyCount} Anomali
              </span>
            </div>
          )}
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${isConnected ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-teal-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-xs font-bold uppercase tracking-widest">
              {isConnected ? 'LIVE SYNC' : 'OFFLINE'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 shadow-sm border-2 border-white"></div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* KPI KARTLARI */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: 'Toplam Kayıtlı Cihaz', value: SYSTEM_DEVICES.length.toString(), icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z', color: '#3B82F6', bg: '#EFF6FF' },
              { label: 'Çalışan Cihaz', value: Object.values(liveStatus).filter(s => s.isWorking).length.toString(), icon: 'M13 10V3L4 14h7v7l9-11h-7z', color: '#10B981', bg: '#ECFDF5' },
              { label: 'Aktif Anomali', value: anomalyCount.toString(), icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: anomalyCount > 0 ? '#F43F5E' : '#10B981', bg: anomalyCount > 0 ? '#FFF1F2' : '#ECFDF5' },
            ].map((kpi, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: kpi.bg, color: kpi.color }}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={kpi.icon} />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-500">{kpi.label}</div>
                  <div className={`text-2xl font-bold text-gray-800 ${spaceGrotesk.className}`}>{kpi.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CİHAZ LİSTESİ + GANTT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Sol: Cihaz Listesi */}
            <div className="lg:col-span-1 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden flex flex-col h-[600px]">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-lg font-bold text-gray-800">Donanım Listesi</h3>
                <p className="text-xs text-gray-400 font-medium mt-1">İncelemek için bir cihaz seçin</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {SYSTEM_DEVICES.map((device) => {
                  const isActive = activeDevice === device.id;
                  const status = liveStatus[device.id] || { lastSync: 'Bekleniyor...', currentKw: 0, isWorking: false, hasAnomaly: false };

                  let cardStyle = "p-4 rounded-2xl cursor-pointer transition-all border relative ";
                  if (isActive) {
                    cardStyle += status.hasAnomaly
                      ? "bg-rose-50/70 border-rose-200 shadow-sm"
                      : status.isWorking
                        ? "bg-emerald-50/70 border-emerald-200 shadow-sm"
                        : "bg-purple-50/70 border-purple-200 shadow-sm";
                  } else {
                    cardStyle += "bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50";
                  }

                  return (
                    <div key={device.id} onClick={() => setActiveDevice(device.id)} className={cardStyle}>
                      {/* Anomali uyarı ikonu */}
                      {status.hasAnomaly && (
                        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center animate-pulse">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01" />
                          </svg>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
                          status.hasAnomaly ? 'bg-rose-100 text-rose-500' :
                          status.isWorking ? 'bg-emerald-100 text-emerald-600' : 'bg-purple-100 text-purple-600'
                        }`}>
                          {status.hasAnomaly ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          ) : status.isWorking ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-gray-800 block">{device.name}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            status.hasAnomaly ? 'text-rose-500' :
                            status.isWorking ? 'text-emerald-600' : 'text-purple-600'
                          }`}>
                            {status.hasAnomaly ? 'ANOMALİ' : status.isWorking ? 'ÇALIŞIYOR' : 'UYKU MODU'}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-xs text-gray-400">Son Senkronizasyon</p>
                          <p className="text-xs font-bold text-gray-600 mt-0.5">{status.lastSync}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Anlık Yük</p>
                          <p className={`text-sm font-bold text-gray-800 ${spaceGrotesk.className}`}>
                            {status.currentKw.toFixed(2)} kW
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sağ: Gantt */}
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-[600px]">
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">{selectedDevice?.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Cihaz #{selectedDevice?.id} · {selectedDevice?.type} · Eşik: {thresholds[activeDevice]?.toFixed(1)} kW
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setDrawerDevice(activeDevice); setDrawerOpen(true); }}
                  className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                >
                  Cihazı Yapılandır
                </button>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800">Gerçek Zamanlı Çalışma Haritası</h3>
                  <div className="flex gap-4">
                    {[
                      { color: '#10B981', label: 'Çalışıyor' },
                      { color: '#A855F7', label: 'Uyku Modu' },
                      { color: '#F43F5E', label: 'Anomali' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded" style={{ backgroundColor: item.color }}></span>
                        <span className="text-xs font-semibold text-gray-500 uppercase">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-1 w-full">
                  {activityData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activityData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }} barCategoryGap={0}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="time"
                          stroke="#cbd5e1"
                          tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                          tickMargin={15}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                          minTickGap={60}
                        />
                        <Tooltip content={<CustomGanttTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                        <Bar dataKey="bandLevel" minPointSize={10} isAnimationActive={false}>
                          {activityData.map((entry, index) => {
                            // Son veri anomali mi kontrol et
                            const d = activeData[index];
                            const threshold = thresholds[activeDevice] ?? 1.5;
                            const isAnomaly = d && Math.abs(d.actual_value - d.forecast_value) > threshold;
                            return (
                              <Cell
                                key={`cell-${index}`}
                                fill={isAnomaly ? '#F43F5E' : entry.color}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm font-medium">
                      Canlı veri akışı bekleniyor...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}