# Sentix Energy Forecast Platform

Sentix, akıllı sayaç verilerini kullanarak gerçek zamanlı enerji tüketim tahmini yapan, yüksek performanslı bir "SaaS" platformudur.

![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-013243.svg?style=for-the-badge&logo=numpy&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-150458.svg?style=for-the-badge&logo=pandas&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C.svg?style=for-the-badge&logo=pytorch&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?style=for-the-badge&logo=go&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

##  Mimari Özeti
* **Frontend:** Next.js, Tailwind CSS, Recharts (Modern SaaS Dashboard).
* **Backend:** FastAPI (Python), Eşzamanlı veri işleme (defaultdict + deque).
* **Inference Engine:** LightGBM (Production-Ready Time-Series Forecasting).
* **Communication:** WebSocket (Real-time data streaming).
* **Hardware Acceleration:** Apple Silicon (M4) optimize edilmiş veri işleme.

##  Temel Yetenekler
- **Multi-Tenant Architecture:** Aynı anda yüzlerce farklı cihazdan gelen veriyi birbirinden izole ederek işleme.
- **Low Latency:** Go-based Ingestion + FastAPI inference ile milisaniyeler bazında tahmin.
- **SaaS UI:** Dribbble-inspired modern, temiz ve cihaz bazlı özelleştirilebilir arayüz.

##  Model Performansı
- **Model:** LightGBM Boosting
- **Metrics:** RMSE 0.2700 kW (Production Baseline)
- **Log Transformation:** `np.log1p` ile aykırı değer yönetimi.

##  Başlatma
1. `go-ingestion/` içinde Go servisini ayağa kaldır.
2. `ml-service/` içinde FastAPI'yi başlat (`uvicorn main:app`).
3. `frontend/` içinde `npm run dev` ile arayüzü başlat.

---
*Melih Yiğit Kotman | 2026*