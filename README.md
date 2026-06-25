# Sentix Energy Forecast Platform

Sentix, akıllı sayaç verilerini kullanarak gerçek zamanlı enerji tüketim tahmini yapan bir mikroservis mimarisi prototipidir.

![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-013243.svg?style=for-the-badge&logo=numpy&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-150458.svg?style=for-the-badge&logo=pandas&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C.svg?style=for-the-badge&logo=pytorch&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?style=for-the-badge&logo=go&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

## Mimari Özeti
* **Frontend:** Next.js, Tailwind CSS, Recharts (dashboard arayüzü).
* **Backend:** FastAPI (Python), `deque` tabanlı sliding-window buffer ile cihaz bazlı akış verisi yönetimi.
* **Inference Engine:** LightGBM ile zaman serisi tahmini (lag + rolling window özellikleri).
* **Communication:** WebSocket ile Go API Gateway'den frontend'e gerçek zamanlı veri akışı.
* **Veri Toplama:** Go (goroutine'ler ile çok cihazlı eşzamanlı simülasyon).

## Temel Yetenekler
- **Çok Cihazlı Simülasyon:** Aynı anda farklı "cihaz" profilleriyle (çarpan/sapma uygulanmış) veri üretip izole şekilde işleme.
- **Streaming Feature Engineering:** Gelen her veri noktasında lag ve rolling-window özelliklerini canlı hesaplama.
- **Gerçek Zamanlı Görselleştirme:** WebSocket üzerinden cihaz bazlı gerçek vs. tahmin grafiği.

## Model Performansı
- **Model:** LightGBM Regressor
- **Metrik:** Test setinde RMSE 0.27 kW (ilk 100.000 satırlık alt küme üzerinde, naive baseline ile karşılaştırmalı)
- **Not:** Bu sonuç, veritabanındaki 2 milyon satırlık verinin sadece bir alt kümesinde elde edilmiştir; tam veri setinde yeniden eğitim ve ayrı bir test/validation ayrımı henüz yapılmamıştır.
- **Log Dönüşümü:** `np.log1p` ile hedef değişkenin dağılımı normalize edilmiştir.

## Bilinen Sınırlamalar
- Model değerlendirmesi şu an tek bir train/test ayrımına dayanıyor (cross-validation yok).
- `naive_fallback` modu, model bulunamadığında veya buffer ısınma sürecindeyken gelen değeri olduğu gibi döndürür — bu bir tahmin değil, yer tutucu bir davranıştır.
- Çok cihazlı simülasyon, gerçek farklı cihazlardan değil, tek bir veri kaynağının çarpan/sapma ile değiştirilmiş kopyalarından oluşur.

## Başlatma
1. `go-ingestion/` içinde Go servisini ayağa kaldır.
2. `ml-service/` içinde FastAPI'yi başlat (`uvicorn main:app`).
3. `frontend/` içinde `npm run dev` ile arayüzü başlat.

---
*Melih Yiğit Kotman | 2026*