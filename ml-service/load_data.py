import pandas as pd
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# --- 1. Veriyi oku ---
print("CSV okunuyor...")
df = pd.read_csv(
    "../data/household_power_consumption.txt",
    sep=";",
    na_values=["?"],          # nan olan veriler "?" ile gösterilmiş
    low_memory=False          # low_memory=False, çünkü veri çok büyük ve mixed type uyarısı alıyoruz
)


print(f"Toplam satır: {len(df)}")
print(f"Eksik değer sayısı:\n{df.isna().sum()}")

# --- 2. Datetime birleştir ---
# Bu tek tek sütun olacağına zamansal veri olarak tek bir sütun olsun, böylece zaman serisi analizleri daha kolay olur.
df["datetime"] = pd.to_datetime(
    df["Date"] + " " + df["Time"],
    format="%d/%m/%Y %H:%M:%S"
)
df = df.drop(columns=["Date", "Time"]) # Ardından date ve time sütunu tek sütun olduğu için gerek yok.
df = df.set_index("datetime").sort_index() # Ve bunu index olarak ayarlayalım, böylece zaman serisi analizleri daha kolay olur.

# --- 3. Eksik değerleri interpolate et (zaman serisi için doğru yöntem) ---
# Sayısal sütunlar için interpolate etmek gerekir.
# Interpolate, eksik değerleri tahmin etmek için mevcut verileri kullanır. Zaman serisi verilerinde, eksik değerler genellikle önceki ve sonraki değerlerin ortalaması alınarak doldurulur.
numeric_cols = [
    "Global_active_power", "Global_reactive_power", "Voltage",
    "Global_intensity", "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"
] 
df[numeric_cols] = df[numeric_cols].interpolate(method="time") # Metot olarak "time" kullanıyoruz, çünkü zaman serisi verilerinde bu en uygun yöntemdir.

print(f"İnterpolasyon sonrası eksik değer: {df[numeric_cols].isna().sum().sum()}") # Kontrol ediyoruz

# --- 4. DB'ye bağlan ---
# DB bağlantısı için psycopg2 kullanıyoruz. Bağlantı bilgilerini .env dosyasından alıyoruz.
conn = psycopg2.connect(
    host=os.getenv("DB_HOST"),
    port=os.getenv("DB_PORT"),
    dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
)
# Cursor() fonksiyonu, veritabanı üzerinde SQL sorguları çalıştırmak için kullanılır. Bu fonksiyon, veritabanı bağlantısı üzerinden bir "cursor" nesnesi oluşturur ve bu nesne aracılığıyla SQL sorgularını çalıştırabiliriz.
cur = conn.cursor()

# device_id'yi al (devices tablosuna eklediğimiz satır)
# execute() fonksiyonu, SQL sorgularını çalıştırmak için kullanılır. Bu fonksiyon, cursor nesnesi üzerinden çağrılır ve SQL sorgusunu parametre olarak alır. Örneğin, SELECT sorgusu ile belirli bir cihazın device_id'sini almak için kullanılır.
cur.execute("SELECT device_id FROM devices WHERE device_name = 'uci_household_1'")
device_id = cur.fetchone()[0]
print(f"device_id: {device_id}")

# --- 5. Toplu (bulk) insert — COPY kullanarak hızlı yükleme ---
from io import StringIO

df_to_insert = df.reset_index()[
    ["datetime"] + numeric_cols # Sadece datetime ve sayısal sütunları alıyoruz, çünkü diğer sütunlar (Date, Time) artık yok.
].copy()
df_to_insert.insert(1, "device_id", device_id) # device_id sütununu ekliyoruz
df_to_insert.columns = [
    "time", "device_id", "global_active_power", "global_reactive_power",
    "voltage", "global_intensity", "sub_metering_1", "sub_metering_2", "sub_metering_3"
] # Olan sütun isimlerini veritabanındaki sütun isimleri ile eşleştiriyoruz.

buffer = StringIO() # Yazmak için bir buffer oluşturuyoruz
df_to_insert.to_csv(buffer, index=False, header=False) # Bu buffer içine CSV formatında yazıyoruz, index ve header yok çünkü veritabanına direkt yükleyeceğiz.
buffer.seek(0) # En başa dönüyoruz, çünkü copy_expert() fonksiyonu buffer'ın başından itibaren okur.

print("Veritabanına yükleniyor (COPY ile)...")
# COPY komutu, PostgreSQL'de büyük miktarda veriyi hızlı bir şekilde yüklemek için kullanılan bir SQL komutudur. Bu komut, verileri bir dosyadan veya standart girişten (STDIN) alarak tabloya ekler. Bu yöntem, tek tek INSERT sorguları kullanmaktan çok daha hızlıdır ve büyük veri setleri için idealdir.
cur.copy_expert(
    """
    COPY raw_consumption (time, device_id, global_active_power, global_reactive_power,
                           voltage, global_intensity, sub_metering_1, sub_metering_2, sub_metering_3)
    FROM STDIN WITH CSV
    """,
    buffer
)

conn.commit() # Değişiklikleri veritabanına kaydediyoruz. commit() fonksiyonu, yapılan değişiklikleri kalıcı hale getirir. Eğer commit() çağrılmazsa, yapılan değişiklikler geçici olur ve bağlantı kapatıldığında kaybolur. Rollback() fonksiyonu ise yapılan değişiklikleri geri alır ve veritabanını önceki durumuna döndürür.
print("Yükleme tamamlandı!")

cur.close() # Cursor'ı kapatıyoruz. Cursor, veritabanı ile olan bağlantıyı temsil eder ve SQL sorgularını çalıştırmak için kullanılır. İşlem tamamlandıktan sonra cursor'ı kapatmak, kaynakları serbest bırakmak için önemlidir.
conn.close() # Veritabanı bağlantısını kapatıyoruz. Veritabanı bağlantısı, veritabanına erişim sağlamak için kullanılır ve işlem tamamlandıktan sonra kapatılması gerekir. Bağlantıyı kapatmak, kaynakları serbest bırakır ve veritabanı performansını artırır.