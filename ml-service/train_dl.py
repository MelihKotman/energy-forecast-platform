import torch
from torch.utils.data import Dataset, DataLoader
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error
from sqlalchemy import create_engine
import os
from dotenv import load_dotenv
import joblib
import torch.nn as nn
import math

load_dotenv(dotenv_path="../go-ingestion/.env")

device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

# PyTorch'ta özel veri setleri her zaman 'Dataset' sınıfından miras (inherit) alır.
# Ve her zaman şu 3 fonksiyonu ezmek (override etmek) zorundadır: __init__, __len__, __getitem__
class TimeSeriesDataset(Dataset):
    def __init__(self, data, seq_len=96, pred_len=15):
        """
        data: Gelen ham veri dizisi (Numpy array)
        seq_len: Geçmiş veri penceresi (Modele verilecek kısım - X)
        pred_len: Tahmin edilecek gelecek penceresi (Modelin bulması gereken kısım - y)
        """
        # Veriyi PyTorch'un anladığı FloatTensor tipine çeviriyoruz
        self.data = torch.FloatTensor(data)
        self.seq_len = seq_len
        self.pred_len = pred_len

    def __len__(self):
        # MÜLAKAT NOTU: Toplam veriden kaç tane geçerli (tam) pencere çıkarabiliriz?
        # En son pencerenin dışarı taşmaması için toplam uzunluktan seq_len ve pred_len çıkarılır.
        return len(self.data) - self.seq_len - self.pred_len + 1

    def __getitem__(self, index):
        # PyTorch arka planda bu fonksiyona sürekli bir 'index' numarası gönderir (Örn: 0, 1, 2...)
        # Senin görevin bu index'i kullanarak data'nın içinden doğru X ve y dilimlerini kesmektir.

        # GÖREV 1: x (Geçmiş) 
        # 'index' konumundan başla, 'index + seq_len' konumuna kadar git.
        x = self.data[index : index + self.seq_len]
        # GÖREV 2: y (Gelecek/Hedef)
        # Sadece 0.indeksteki (global_active_power) sütununu alıyoruz, çünkü modelimiz sadece bu sütunu tahmin edecek.
        y = self.data[index + self.seq_len : index + self.seq_len + self.pred_len, 0:1]

        return x, y
    
# Kendi mimarilerimizi kurarken her zaman nn.Module'den miras alırız.
class TimeSeriesTransformer(nn.Module):
    def __init__(self, input_size=1, d_model=64, n_heads=4, num_layers=2, seq_len=96, pred_len=15):
        super(TimeSeriesTransformer, self).__init__()
        
        self.seq_len = seq_len
        self.pred_len = pred_len
        
        # 1. GİRİŞ KAPISI (Input Projection)
        # 1 boyutlu (kW) veriyi alıp Transformer'ın anlayacağı 64 boyutlu (d_model) matrise genişletir
        self.input_projection = nn.Linear(input_size, d_model)
        
        # 2. ZAMAN ALGISI (Positional Encoding)
        # Modele 1. dakika ile 96. dakika arasındaki sıra farkını öğretmek için öğrenilebilir (learnable) bir parametre
        self.positional_encoding = nn.Parameter(torch.zeros(1, seq_len, d_model))
        
        # 3. TRANSFORMER'IN KALBİ (Encoder Layer)
        # batch_first=True -> (Batch, Seq_Len, Features) formatında çalışmasını sağlar
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=n_heads, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        # 4. ÇIKIŞ KAPISI (Output Projection)
        # 64 boyutlu zenginleştirilmiş veriyi alıp, 15 dakikalık (pred_len) nihai tahmine daraltır
        self.output_projection = nn.Linear(d_model, pred_len)

    def forward(self, x):
        # x boyutu: [Batch=32, Seq_Len=96, Input=1]
        
        # Giriş projeksiyonu ve Zaman Algısı (Positional Encoding) ekleniyor
        x = self.input_projection(x) + self.positional_encoding
        
        # Self-Attention mekanizmasından geçiş
        x = self.transformer(x)
        
        # Kritik Nokta: Bize tüm 96 dakikanın Transformer çıktısı lazım değil.
        # Sadece EN SON anın (96. dakikanın) tüm geçmişi süzerek oluşturduğu o son bilgi kümesi lazım.
        # x[:, -1, :] ifadesi "Tüm batch'leri al, SADECE sonuncu zaman adımını al, tüm özellikleri al" demektir.
        last_step_output = x[:, -1, :] 
        
        # Gelecekteki 15 dakikayı tahmin et
        out = self.output_projection(last_step_output)
        
        # Çıkış boyutu [32, 15] olur. Data setimizle uyumlu olması için [32, 15, 1] formatına (unsqueeze) getiriyoruz
        return out.unsqueeze(-1)

def fetch_data_from_db():
    print(" Veritabanından veriler çekiliyor...")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    
    engine_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(engine_url)
    
    query = """
        SELECT time, global_active_power 
        FROM raw_consumption 
        ORDER BY time ASC 
        LIMIT 100000;
    """
    df = pd.read_sql(query, engine)

    # Zaman Özellikleri ve Log Dönüşümü
    df['time'] = pd.to_datetime(df['time'])
    df.set_index('time', inplace=True)
    df['hour'] = df.index.hour
    df['dayofweek'] = df.index.dayofweek
    
    # Hedefi LightGBM'deki gibi Log ölçeğine alıyoruz ki uç değerler (outliers) modeli kör etmesin
    df['global_active_power'] = np.log1p(df['global_active_power'])
    
    # Derin öğrenme modeli (Transformer) kendi içindeki Self-Attention mekanizmasıyla 
    # geçmiş örüntüleri (lags) zaten kendi keşfedeceği için, LightGBM'deki gibi 
    # manuel öznitelik (lag_1, rolling_mean vs) üretmemize gerek yok!
    return df

def prepare_dataloaders(df, seq_len=96, pred_len=15, batch_size=256):
    print(" Tensörler ve DataLoader'lar hazırlanıyor...")
    
    # Hedef değişkenimizi Numpy dizisine çeviriyoruz ve 2D yapıyoruz (Scikit-learn böyle ister)
    raw_values = df[['global_active_power', 'hour', 'dayofweek']].values
    
    # Veriyi zaman serisi kurallarına (shuffle=False) uygun olarak %80 Eğitim, %20 Test bölüyoruz
    split_index = int(len(raw_values) * 0.8)
    train_data = raw_values[:split_index]
    test_data = raw_values[split_index:]
    
    # Ölçeklendirme (Standardization: Ortalamayı 0, Std'yi 1 yapar)
    scaler = StandardScaler()
    
    # MÜLAKAT NOTU: Eğitime 'fit_transform', teste sadece 'transform' uygulanır!
    scaled_train = scaler.fit_transform(train_data)
    scaled_test = scaler.transform(test_data)
    
    # Canlı sistemde tahminleri gerçek ölçeğe geri döndürmek için scaler'ı kaydediyoruz
    joblib.dump(scaler, "transformer_scaler.pkl")
    
    # Dataset'leri oluşturuyoruz
    train_dataset = TimeSeriesDataset(scaled_train, seq_len, pred_len)
    test_dataset = TimeSeriesDataset(scaled_test, seq_len, pred_len)
    
    # DataLoader'ları oluşturuyoruz
    # batch_size'ı parametre olarak değil, doğrudan devasa bir değere çekiyoruz
    train_loader = DataLoader(
        train_dataset, 
        batch_size=256,       # 64'ten 256'ya çıktı
        shuffle=True, 
        num_workers=0,        
        pin_memory=False      # Apple Silicon'da pin_memory=False daha iyi performans verir
    )
    test_loader = DataLoader(
        test_dataset, 
        batch_size=256, 
        shuffle=False, 
        num_workers=0, 
        pin_memory=False
    )
    
    return train_loader, test_loader

def train_deep_learning_model():
    df = fetch_data_from_db()

    train_loader, test_loader = prepare_dataloaders(df, seq_len=96, pred_len=15, batch_size=256)
    model = TimeSeriesTransformer(input_size=3, seq_len=96, pred_len=15).to(device)

    criterion = nn.MSELoss() 
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-4) 

    epochs = 100             
    patience = 7             
    best_test_loss = float('inf') 
    epochs_no_improve = 0    

    print(" Transformer Eğitimi Başlıyor... (MPS Hızlandırması Aktif)")

    for epoch in range(epochs):
        model.train() 
        train_loss = 0.0
    
        for x_batch, y_batch in train_loader:
            x_batch, y_batch = x_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            predictions = model(x_batch)
            loss = criterion(predictions, y_batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
        
        avg_train_loss = train_loss / len(train_loader)
        
        model.eval()
        test_loss = 0.0
        with torch.no_grad(): 
            for x_batch, y_batch in test_loader:
                x_batch, y_batch = x_batch.to(device), y_batch.to(device)
                predictions = model(x_batch)
                loss = criterion(predictions, y_batch)
                test_loss += loss.item()
        
        avg_test_loss = test_loss / len(test_loader)
        print(f"Epoch [{epoch+1}/{epochs}] | Eğitim Loss: {avg_train_loss:.6f} | Test Loss: {avg_test_loss:.6f}")

        if avg_test_loss < best_test_loss:
            best_test_loss = avg_test_loss
            epochs_no_improve = 0
            model_path = "transformer_model.pth"
            torch.save(model.state_dict(), model_path)
            print(" Yeni rekor! En iyi model diske kaydedildi.")
        else:
            epochs_no_improve += 1
            print(f" Test hatası düşmedi. Kalan sabır: {patience - epochs_no_improve}")
        
        if epochs_no_improve >= patience:
            print(f" Erken Durdurma Tetiklendi! Model {epoch+1}. turda eğitimi kesti.")
            break

if __name__ == "__main__":

    #train_deep_learning_model()
    # Modelin input_size değerini 3 yapıyoruz!
    # model = TimeSeriesTransformer(input_size=3, seq_len=96, pred_len=15).to(device)
    
    print(" Test seti verileri gerçek kW ölçeğine geri dönüştürülüyor...")
    
    df = fetch_data_from_db()
    _, test_loader = prepare_dataloaders(df, seq_len=96, pred_len=15, batch_size=256)
    scaler = joblib.load("transformer_scaler.pkl")
    
    #  Model 3 girdili (input_size=3) olarak başlatılıyor
    model = TimeSeriesTransformer(input_size=3, seq_len=96, pred_len=15).to(device)
    model.load_state_dict(torch.load("transformer_model.pth", map_location=device))
    model.eval()
    
    all_preds = []
    all_trues = []
    
    with torch.no_grad():
        for x_batch, y_batch in test_loader:
            x_batch = x_batch.to(device)
            preds = model(x_batch)
            
            preds_np = preds[:, -1, 0].cpu().numpy().reshape(-1, 1)
            y_np = y_batch[:, -1, 0].cpu().numpy().reshape(-1, 1)
            
            all_preds.append(preds_np)
            all_trues.append(y_np)
            
    all_preds = np.vstack(all_preds)
    all_trues = np.vstack(all_trues)
    
    # Scaler 3 kolon bekliyor. Biz sahte (dummy) kolonlar ekleyip sadece 0. kolonu (güç) geri alacağız.
    dummy_preds = np.zeros((len(all_preds), 3))
    dummy_preds[:, 0] = all_preds.flatten()
    unscaled_preds_log = scaler.inverse_transform(dummy_preds)[:, 0]
    
    dummy_trues = np.zeros((len(all_trues), 3))
    dummy_trues[:, 0] = all_trues.flatten()
    unscaled_trues_log = scaler.inverse_transform(dummy_trues)[:, 0]
    
    # Log dönüşümünü (np.log1p) tersine çeviriyoruz (np.expm1)
    unscaled_preds = np.expm1(unscaled_preds_log)
    unscaled_trues = np.expm1(unscaled_trues_log)
    
    true_dl_rmse = np.sqrt(mean_squared_error(unscaled_trues, unscaled_preds))
    
    print("\n ================= NİHAİ SKORLAR ================= 🏁")
    print(f"LightGBM Üretim Modeli RMSE : 0.2700 kW")
    print(f"Transformer Derin Öğrenme RMSE: {true_dl_rmse:.4f} kW")
    print("======================================================")