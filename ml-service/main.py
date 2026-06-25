from fastapi import FastAPI, status
from pydantic import BaseModel
from datetime import datetime
from collections import deque, defaultdict
import pandas as pd
import numpy as np
import joblib
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="../go-ingestion/.env")

app = FastAPI(title="Sentix Energy Forecast - Production Inference Service")

MODEL_PATH = os.getenv("MODEL_PATH", "energy_forecast_model.pkl")
if os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)
    print(f"Gerçek Zamanlı LightGBM Üretim Modeli Yüklendi (RMSE: 0.27 kW)")
else:
    model = None
    print(" HATA: model bulunamadı!")

# Her bir device_id için otomatik olarak veri saklamak için bir buffer oluşturuyoruz. Bu buffer, en son 75 veriyi saklayacak şekilde sınırlıdır.
device_buffers = defaultdict(lambda: deque(maxlen=75))

# Pydantic ile gelen JSON verisinin otomatik doğrulamasını yapar ve snake_case ile değişken isimlerini eşleştirir.
class EnergyDataInput(BaseModel):
    time : datetime
    device_id: int
    global_active_power: float

# app.get() decorator'ı, HTTP GET isteği ile bu fonksiyonun çağrılmasını sağlar. "/" path'i ile bu fonksiyon çağrıldığında, servis sağlıklı olduğunu belirten bir JSON yanıt döner.
@app.get("/")
def read_root():
    return {"status": "healthy", "message": "Sentix Energy Forecast ML Service is running.", "service": "ml-service"}

@app.post("/predict", status_code = status.HTTP_200_OK)
def predict_energy(data:  EnergyDataInput):
    # Gelen veri yakalanıyor ve pydantic modeline göre doğrulanıyor. 
    # Eğer veri eksik veya hatalı ise, FastAPI otomatik olarak 422 Unprocessable Entity hatası döner.

    current_row = {
        "time": data.time,
        "device_id": data.device_id,
        "global_active_power": data.global_active_power
    }
    # Her bir cihaz için ayrı buffer oluşturuluyor ve gelen veri bu buffer'a ekleniyor. Bu sayede her cihazın geçmiş verisi ayrı ayrı saklanıyor.
    device_buffers[data.device_id].append(current_row) # Yeni veriyi buffer'a ekliyoruz

    # O cihaza ait kuyruktaki mevcut veri sayısını alıyoruz. Bu, lag ve rolling hesaplamaları için yeterli veri olup olmadığını kontrol etmek için kullanılır.
    current_buffer_length = len(device_buffers[data.device_id])

    print(f"Go'dan veri alındı -> Device ID: {data.device_id}, Time: {data.time}, Global Active Power: {data.global_active_power} kW")

    # Isınma Durumu: Eğer buffer'daki veri sayısı 61'den az ise, modelin tahmin yapabilmesi için yeterli veri yok demektir. Bu durumda, kullanıcıya kaç veri daha beklenmesi gerektiğini belirten bir mesaj döndürülür.
    if current_buffer_length < 61:
        remaining = 61 - current_buffer_length
        return {
            "status" : "warming_up",
            "message" : f"Canlı öznitelik matrisi oluşturuluyor. {remaining} veri daha bekleniyor.",
            "forecast_value": data.global_active_power,  
            "model_used": "naive_fallback"
        }
    # Canlı Öznitelik Mühendisliği (Streaming Feature Engineering)
    # RAM'deki verileri anlık DataFrame'e çevirip train.py mimarisinin kopyasını çıkarıyoruz
    df_buffer = pd.DataFrame(list(device_buffers[data.device_id]))
    df_buffer['time'] = pd.to_datetime(df_buffer['time'])
    df_buffer.set_index('time', inplace=True)
    
    # Takvim Özellikleri
    df_buffer['hour'] = df_buffer.index.hour
    df_buffer['dayofweek'] = df_buffer.index.dayofweek
    df_buffer['month'] = df_buffer.index.month
    
    # Gecikme (Lag) Özellikleri (Yeni eklenen 2 ve 5 dahil)
    for lag in [1, 2, 5, 15, 30, 60]:
        df_buffer[f'lag_{lag}'] = df_buffer['global_active_power'].shift(lag)
        
    # Hareketli Ortalama ve Varyans Özellikleri (rolling_std dahil)
    for window in [5, 15, 30, 60]:
        df_buffer[f'rolling_mean_{window}'] = df_buffer['global_active_power'].rolling(window=window).mean()
        df_buffer[f'rolling_std_{window}'] = df_buffer['global_active_power'].rolling(window=window).std()
    
    # Hafızadaki en son satır, tüm öznitelikleri eksiksiz hesaplanmış canlı girdimizdir
    live_features = df_buffer.iloc[[-1]]
    
    # train.py'daki feature_cols listesiyle birebir aynı sıra ve isimde olmalı
    feature_cols = [
        'hour', 'dayofweek', 'month',
        'lag_1', 'lag_2', 'lag_5', 'lag_15', 'lag_30', 'lag_60',
        'rolling_mean_5', 'rolling_mean_15', 'rolling_mean_30', 'rolling_mean_60',
        'rolling_std_5', 'rolling_std_15', 'rolling_std_30', 'rolling_std_60'
    ]

    X_live = live_features[feature_cols]

    # Canlı Tahmin ve Ölçek Dönüşümü (Inverse Transform)
    if model:
        # Model log ölçeğinde tahmin üretir. 
        live_forecast_log = model.predict(X_live)[0]
        # Tahmini expm1 ile gerçek ölçeğe çeviriyoruz (log1p ile log dönüşümü yapılmıştı)
        live_forecast = np.expm1(live_forecast_log)
        model_name = "LightGBM"
    else:
        live_forecast = data.global_active_power  # Model yoksa, gelen değeri tahmin olarak döndür
        model_name = "naive_fallback"
    
    print(f"Canlı Tahmin -> Device ID: {data.device_id}, Time: {data.time}, Tahmin: {live_forecast:.4f} kW, Model: {model_name}")

    return {
        "status": "success",
        "device_id": data.device_id,
        "forecast_value": float(live_forecast),
        "model_used": model_name
    }
