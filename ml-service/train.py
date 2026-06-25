import os
import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, accuracy_score
import joblib
from sqlalchemy import create_engine # YENİ: Pandas'ın istediği kurumsal motor
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()  # .env dosyasındaki değişkenleri yükle

def fetch_data_from_db():
    """ TimescaleDB'den eğitim verilerini çeker."""
    print("Veritabanından veri çekiliyor...")

    # SQLAlchemy için URL formatı oluşturuyoruz
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    
    # engine_url formatı: postgresql://kullanici:sifre@localhost:5432/veritabani_adi
    engine_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(engine_url)


    # İlk iki aşamada 2 milyon satırın hepsini çekmemek için ilk 100.000 satırı çekiyoruz. Daha sonra tüm veriyi çekebiliriz.
    query = """
            SELECT time, device_id, global_active_power
            FROM raw_consumption
            ORDER BY time ASC
            LIMIT 100000;
            """
    
    df = pd.read_sql(query, engine)
    print(f"{len(df)} satır veri çekildi.")
    return df

def create_features(df):
    """ Zaman serisinden LightGBM için özellikler oluşturur. """
    print("Özellikler oluşturuluyor...")

    df['time'] = pd.to_datetime(df['time'])
    df.set_index('time', inplace=True)

    df['hour'] = df.index.hour
    df['dayofweek'] = df.index.dayofweek
    df['month'] = df.index.month

    # Lag features
    for lag in [1, 2, 5, 15, 30, 60]:
        df[f'lag_{lag}'] = df['global_active_power'].shift(lag)
    
    # Rolling mean features
    for window in [5, 15, 30, 60]:  # 15 dakika, 30 dakika, 1 saat
        df[f'rolling_mean_{window}'] = df['global_active_power'].rolling(window=window).mean()
        df[f'rolling_std_{window}'] = df['global_active_power'].rolling(window=window).std() # Varyansı yakalamak için std ekledik
    
    
    df.dropna(inplace=True)  # Lag ve rolling mean nedeniyle oluşan NaN değerleri düşür
    return df

def train_model(df):

    # Veriyi çek
    df = fetch_data_from_db()

    # Özellikleri oluştur
    df_featured = create_features(df)

    # NAIVE BASELINE HESABI 
    # İlkel tahmin: bir sonraki dakika, bu dakikaya eşittir (lag_1)
    naive_rmse = np.sqrt(mean_squared_error(df_featured['global_active_power'], df_featured['lag_1']))
    print(f"İlkel Baseline (Naive) RMSE: {naive_rmse:.4f} kW")
    
    feature_cols = [
        'hour', 'dayofweek', 'month',
        'lag_1', 'lag_2', 'lag_5', 'lag_15', 'lag_30', 'lag_60',
        'rolling_mean_5', 'rolling_mean_15', 'rolling_mean_30', 'rolling_mean_60',
        'rolling_std_5', 'rolling_std_15', 'rolling_std_30', 'rolling_std_60'
    ]
    
    X = df_featured[feature_cols]
    y = df_featured['global_active_power']

    # LOG TRANSFORMATION ---
    # Büyük hataların cezalandırılmasını dengelemek için hedefi log ölçeğine alıyoruz
    y_log = np.log1p(y)

    X_train, X_test, y_train_log, y_test_log = train_test_split(X, y_log, test_size=0.2, shuffle=False)

    model = lgb.LGBMRegressor(
        objective='regression',
        metric='rmse',
        n_estimators=200,
        learning_rate=0.03,
        max_depth=6,
        num_leaves=31,
        random_state=42,
        verbosity=-1 # Konsoldaki kalabalık mesajları azaltmak için verbosity=-1 kullanıyoruz
    )
    model.fit(X_train, y_train_log)

    # Değerlendirme 
    predictions_log = model.predict(X_test)
    predictions = np.expm1(predictions_log)  # Log ölçeğinden gerçek kW ölçeğine geri dönüş

    # Gerçek y değerlerini test setinden alıyoruz (orijinal ölçekte kıyaslamak için)
    y_test_original = np.expm1(y_test_log)  # Log dönüşümünü geri al

    rmse = np.sqrt(mean_squared_error(y_test_original, predictions))
    print(f"Model RMSE: {rmse}")

    model_path = os.getenv("MODEL_PATH", "energy_forecast_model.pkl")
    joblib.dump(model, model_path)
    print(f"Model kaydedildi: {model_path}")

if __name__ == "__main__":
    train_model(None)  # df parametresi kullanılmıyor, çünkü veriyi DB'den çekiyoruz.