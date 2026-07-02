from fastapi import FastAPI, status
from pydantic import BaseModel
from datetime import datetime
from collections import deque, defaultdict
import pandas as pd
import joblib
import os
import numpy as np
import time
from dotenv import load_dotenv
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine

load_dotenv(dotenv_path="../go-ingestion/.env")

app = FastAPI(title="Sentix Energy Forecast - Production Inference Service")

# 🌟 YENİ: CORS Ayarları (Next.js'in bu API'ye erişmesine izin veriyoruz)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Geliştirme aşamasında her porttan gelen isteğe izin ver (İleride sadece "http://localhost:3000" yapılabilir)
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, PUT, DELETE vb. hepsine izin ver
    allow_headers=["*"],
)

MODEL_PATH = os.getenv("MODEL_PATH", "model/energy_forecast_model.pkl")
if os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)
    print(f"Gerçek Zamanlı LightGBM Üretim Modeli Yüklendi (RMSE: 0.27 kW)")
else:
    model = None
    print(" HATA: model bulunamadı!")

# Model yüklendikten hemen sonra:
try:
    print("Model metrikleri için veritabanından test verisi çekiliyor...")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    
    engine_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(engine_url)
    
    # Modelin performansını ölçmek için sistemdeki EN SON 5000 veriyi alıyoruz
    # Önce DESC ile en son verileri alıp, alt sorguda ASC ile zamana göre düz sıraya diziyoruz
    query = """
        SELECT * FROM (
            SELECT time, device_id, global_active_power
            FROM raw_consumption
            ORDER BY time DESC
            LIMIT 5000
        ) sub
        ORDER BY time ASC;
    """
    val_df = pd.read_sql(query, engine)
    
    # Canlı özellik mühendisliği (train.py ile birebir aynı)
    val_df['time'] = pd.to_datetime(val_df['time'])
    val_df.set_index('time', inplace=True)

    val_df['hour'] = val_df.index.hour
    val_df['dayofweek'] = val_df.index.dayofweek
    val_df['month'] = val_df.index.month

    for lag in [1, 2, 5, 15, 30, 60]:
        val_df[f'lag_{lag}'] = val_df['global_active_power'].shift(lag)
    for window in [5, 15, 30, 60]: 
        val_df[f'rolling_mean_{window}'] = val_df['global_active_power'].rolling(window=window).mean()
        val_df[f'rolling_std_{window}'] = val_df['global_active_power'].rolling(window=window).std() 
        
    val_df.dropna(inplace=True)

    feature_cols = [
        'hour', 'dayofweek', 'month',
        'lag_1', 'lag_2', 'lag_5', 'lag_15', 'lag_30', 'lag_60',
        'rolling_mean_5', 'rolling_mean_15', 'rolling_mean_30', 'rolling_mean_60',
        'rolling_std_5', 'rolling_std_15', 'rolling_std_30', 'rolling_std_60'
    ]
    
    X_val = val_df[feature_cols]
    y_val = val_df['global_active_power']
    print(f"✅ Test verisi DB'den alındı ({len(X_val)} satır). Metrikler gerçek zamanlı hesaplanacak.")
    test_data_loaded = True
except Exception as e:
    print(f"⚠️ Test verisi DB'den çekilemedi, metrikler hesaplanamayacak: {e}")
    test_data_loaded = False

# Her bir device_id için otomatik olarak veri saklamak için bir buffer oluşturuyoruz. Bu buffer, en son 120 veriyi saklayacak şekilde sınırlıdır.
device_buffers = defaultdict(lambda: deque(maxlen=120))
prediction_log = defaultdict(lambda: deque(maxlen=60))  # her cihaz için son tahminler
error_log = defaultdict(lambda: deque(maxlen=30))        # her cihaz için son hatalar

def update_rolling_metrics(device_id, predicted_value):
    """Yeni bir tahmin yapıldığında çağrılır."""
    prediction_log[device_id].append(predicted_value)

def check_and_record_error(device_id, actual_value):
    """Yeni gerçek değer geldiğinde, önceki tahminle karşılaştır."""
    if len(prediction_log[device_id]) == 0:
        return  # Eğer önceki tahmin yoksa, hata kaydı yapma
    last_predicted_value = prediction_log[device_id][-1]
    error = last_predicted_value - actual_value
    error_log[device_id].append(error)

def get_rolling_rmse(device_id):
    """error_log'dan RMSE hesapla."""
    errors = error_log[device_id]
    if len(errors) == 0:
        return None
    rmse = np.sqrt(np.mean(np.square(errors)))
    return float(rmse)

def get_rolling_mae(device_id):
    errors = error_log[device_id]
    if len(errors) == 0:
        return None
    mae = np.mean(np.abs(errors))
    return float(mae)


# Pydantic ile gelen JSON verisinin otomatik doğrulamasını yapar ve snake_case ile değişken isimlerini eşleştirir.
class EnergyDataInput(BaseModel):
    time : datetime
    device_id: int
    global_active_power: float

# app.get() decorator'ı, HTTP GET isteği ile bu fonksiyonun çağrılmasını sağlar. "/" path'i ile bu fonksiyon çağrıldığında, servis sağlıklı olduğunu belirten bir JSON yanıt döner.
@app.get("/")
def read_root():
    return {"status": "healthy", "message": "Sentix Energy Forecast ML Service is running.", "service": "ml-service"}

@app.get("/hourly-summary/{device_id}")
def get_hourly_summary(device_id: int):
    import psycopg2
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )
    cur = conn.cursor()
    cur.execute("""
        WITH latest AS (
            SELECT MAX(time) AS max_time
            FROM raw_consumption
            WHERE device_id = %s
        )
        SELECT 
            EXTRACT(HOUR FROM time)::int AS hour,
            ROUND(AVG(global_active_power)::numeric, 2) AS avg_power,
            ROUND(MAX(global_active_power)::numeric, 2) AS max_power,
            ROUND(MIN(global_active_power)::numeric, 2) AS min_power,
            COUNT(*) AS count
        FROM raw_consumption, latest
        WHERE device_id = %s
          AND time >= latest.max_time - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour ASC
    """, (device_id, device_id))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {"hour": f"{r[0]:02d}:00", "avg": float(r[1]), "max": float(r[2]), "min": float(r[3]), "count": r[4]}
        for r in rows
    ]

@app.get("/daily-summary/{device_id}")
def get_daily_summary(device_id: int):
    import psycopg2
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )
    cur = conn.cursor()
    cur.execute("""
        WITH latest AS (
            SELECT MAX(time) AS max_time
            FROM raw_consumption
            WHERE device_id = %s
        )
        SELECT 
            DATE(time) AS day,
            ROUND(AVG(global_active_power)::numeric, 2) AS avg_power,
            ROUND(MAX(global_active_power)::numeric, 2) AS max_power,
            ROUND(MIN(global_active_power)::numeric, 2) AS min_power,
            COUNT(*) AS count
        FROM raw_consumption, latest
        WHERE device_id = %s
          AND time >= latest.max_time - INTERVAL '7 days'
        GROUP BY day
        ORDER BY day ASC
    """, (device_id, device_id))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {"date": str(r[0]), "avg": float(r[1]), "max": float(r[2]), "min": float(r[3]), "count": r[4]}
        for r in rows
    ]

# ÖNEMLİ NOT: Metrikleri (RMSE, MAE) ve Residual (Hata) dağılımını 
# canlı hesaplamak için bir validasyon veya test veri setine ihtiyacın var.
# Burada X_val ve y_val'in senin sisteminde Pandas DataFrame / Numpy dizisi 
# olarak bellekte veya bir dosyada olduğunu varsayıyoruz.
# X_val, y_val = load_validation_data() 

@app.get("/model-metrics")
def get_model_metrics():
    """
    Kayıtlı LightGBM modelinin içinden gerçek feature importance değerlerini okur
    ve validasyon seti üzerinden performans metriklerini hesaplar.
    """
    start_time = time.time()
    
    if model is None:
        return {"error": "Model bulunamadı veya yüklenemedi."}

    # ==========================================
    # 1. ÖZNİTELİK ÖNEMİ (FEATURE IMPORTANCE)
    # ==========================================
    features = []
    try:
        # 1. Durum: Model scikit-learn API'si (LGBMRegressor) ile eğitildiyse
        if hasattr(model, 'feature_importances_'):
            importance_scores = model.feature_importances_
            feature_names = getattr(model, 'feature_name_', getattr(model, 'feature_names_in_', None))
            
            # İsimler yoksa varsayılan isim üret
            if feature_names is None:
                feature_names = [f"Feature {i}" for i in range(len(importance_scores))]

        # 2. Durum: Model Native API (lgb.train()) ile eğitildiyse
        elif hasattr(model, 'feature_importance'):
            importance_scores = model.feature_importance(importance_type='split')
            feature_names = model.feature_name()
            
        else:
            raise ValueError("Modelden öznitelik önemi çekilemiyor. Desteklenmeyen model yapısı.")

        features = [{"name": str(name), "score": float(score)} for name, score in zip(feature_names, importance_scores)]
        
        # Sadece skoru 0'dan büyük olanları al (Eğer model çok küçükse veya overfit olduysa bazen hepsine 0 verir)
        features = [f for f in features if f["score"] > 0]
        
        # Skora göre büyükten küçüğe sırala ve en etkili ilk 7 özniteliği al
        features = sorted(features, key=lambda x: x["score"], reverse=True)[:7]
        
    except Exception as e:
        print(f"Feature importance çekilemedi: {e}")
        # Hata anında API'nin çökmemesi için geçici veriler gönderiyoruz ki Frontend patlamasın
        features = [
            {"name": "Veri Çekilemedi", "score": 100}
        ]

    # ==========================================
    # 2. METRİKLER VE HATA (RESIDUAL) DAĞILIMI
    # ==========================================
    # ==========================================
    # 2. METRİKLER VE HATA (RESIDUAL) DAĞILIMI
    # ==========================================
    if test_data_loaded and model is not None:
        # Modeli test verisi üzerinde çalıştır (LightGBM log ölçeğinde tahmin dönecek)
        y_pred_log = model.predict(X_val)
        
        # 🌟 KRİTİK NOKTA: Logaritmik ölçeği gerçek kW ölçeğine geri çeviriyoruz
        y_pred = np.expm1(y_pred_log)
        
        # Gerçek metrikleri sklearn ile hesapla
        rmse_val = float(np.sqrt(mean_squared_error(y_val, y_pred)))
        mae_val = float(mean_absolute_error(y_val, y_pred))
        r2_val = float(r2_score(y_val, y_pred))
        
        # Grafik çok kasmasın diye dağılım için rastgele 100 nokta seçiyoruz
        sample_indices = np.random.choice(len(y_val), size=100, replace=False)
        residual_data = [
            {
                "predicted": round(float(y_pred[i]), 2), 
                "error": round(float(y_val.iloc[i] - y_pred[i]), 2)
            } 
            for i in sample_indices
        ]
    else:
        # DB bağlantısı koparsa veya veri yoksa fallback
        rmse_val = 0.0
        mae_val = 0.0
        r2_val = 0.0
        residual_data = []

    # İşlem süresi hesabı (ms cinsinden)
    latency_ms = int((time.time() - start_time) * 1000)

    return {
        "kpis": {
            "rmse": rmse_val,
            "mae": mae_val,
            "r2": r2_val,
            "latency": latency_ms
        },
        "feature_importance": features,
        "residuals": residual_data
    }

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
        check_and_record_error(data.device_id, data.global_active_power)  # Hata kaydı
        update_rolling_metrics(data.device_id, live_forecast)  # Tahmin kaydı
        model_name = "LightGBM"
    else:
        live_forecast = data.global_active_power  # Model yoksa, gelen değeri tahmin olarak döndür
        model_name = "naive_fallback"
    
    print(f"Canlı Tahmin -> Device ID: {data.device_id}, Time: {data.time}, Tahmin: {live_forecast:.4f} kW, Model: {model_name}")

    return {
        "status": "success",
        "device_id": data.device_id,
        "forecast_value": float(live_forecast),
        "model_used": model_name,
        "rolling_rmse": get_rolling_rmse(data.device_id),
        "rolling_mae": get_rolling_mae(data.device_id),
    }
