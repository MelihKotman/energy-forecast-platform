package main

import (

	"bytes" // JSON verilerini işlemek için gerekli paket
	"encoding/json" // JSON verilerini kodlamak ve çözmek için gerekli paket
	"net/http" // HTTP istekleri yapmak için gerekli paket	
	"database/sql" // SQL gerektiği için
	"fmt" // fmt paketi, formatlı I/O için kullanılır
	"log" // log paketi, loglama işlemleri için kullanılır
	"time" // time paketi, zamanla ilgili işlemler için kullanılır
	"strconv" // strconv paketi, string ve diğer tipler arasında dönüşüm yapmak için kullanılır
	"os" // os paketi, işletim sistemi ile ilgili işlemler için kullanılır
	"sync" // sync paketi, eşzamanlı işlemler için gerekli paket

	// PostgreSQL sürücüsünü projeye dahil ediyoruz. 
	// Doğrudan kod içinde çağırmayacağımız ama arka planda veritabanı/sql paketinin 
	// bu sürücüyü kullanmasını istediğimiz için "_" (blank import) ile ekliyoruz.
	"github.com/joho/godotenv" // .env dosyasını okumak için gerekli paket
	_ "github.com/lib/pq"
	"github.com/gorilla/mux" // Go dünyasının en popüler WebSocket kütüphanesi
	"github.com/gorilla/websocket" // Temiz API rotaları (Routing) oluşturmak için
	"github.com/rs/cors" // Next.js'in farklı bir porttan (CORS) Go'ya erişebilmesi içi
)

// Veritabanından okunacağı için ham tüketim yapısını temsil eden Go Struct yapısı ki bu şekilde veritabanından gelen verileri kolayca temsil edebiliriz.
type RawConsumption struct {
	Time            time.Time  `json:"time"`         // Zaman bilgisini temsil eden alan ve json etiketini belirtiyoruz
	DeviceID        int 	 `json:"device_id"`      // Cihaz ID'sini temsil eden alan ve json etiketini belirtiyoruz
	GlobalActivePower float64 `json:"global_active_power"` // Tüketim değerini temsil eden alan ve json etiketini belirtiyoruz 
}

// FastAPI'den dönen yanıtı (response) temsil eden Go Struct yapısı
type FastAPIResponse struct {
	Status  string `json:"status"`  // Yanıtın durumunu temsil eden alan ve json etiketini belirtiyoruz
	DeviceID int    `json:"device_id"` // Cihaz ID'sini temsil eden alan ve json etiketini belirtiyoruz
	ForecastValue float64 `json:"forecast_value"` // Tahmin edilen tüketim değerini temsil eden alan ve json etiketini belirtiyoruz
	ModelUsed string `json:"model_used"` // Kullanılan modeli temsil eden alan ve json etiketini belirtiyoruz
	Message string `json:"message"` // Yanıt mesajını temsil eden alan ve json etiketini belirtiyoruz
	RollingRMSE *float64 `json:"rolling_rmse"` // Rolling RMSE değerini temsil eden alan ve json etiketini belirtiyoruz
	RollingMAE *float64 `json:"rolling_mae"` // Rolling MAE değerini temsil eden alan ve json etiketini belirtiyoruz
}

// Next.js'e (Frontend) canlı veri göndermek için WebSocket bağlantısını temsil eden Go Struct yapısı
type DashboardMessage struct {
	Time string `json:"time"` // Zaman bilgisini temsil eden alan ve json etiketini belirtiyoruz
	Date string `json:"date"` // Tarih bilgisini temsil eden alan ve json etiketini belirtiyoruz
	DeviceID int `json:"device_id"` // Cihaz ID'sini temsil eden alan ve json etiketini belirtiyoruz
	ActualValue float64 `json:"actual_value"` // Gerçek tüketim değerini temsil eden alan ve json etiketini belirtiyoruz
	ForecastValue float64 `json:"forecast_value"` // Tahmin edilen tüketim değerini temsil eden alan ve json etiketini belirtiyoruz
	ModelUsed string `json:"model_used"` // Kullanılan modeli temsil eden alan ve json etiketini belirtiyoruz
	RollingRMSE *float64 `json:"rolling_rmse"` // Rolling RMSE değerini temsil eden alan ve json etiketini belirtiyoruz
	RollingMAE *float64 `json:"rolling_mae"` // Rolling MAE değerini temsil eden alan ve json etiketini belirtiyoruz
}

// WEBSOCKET Yönetimi

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS kontrolünü devre dışı bırakıyoruz, bu şekilde farklı portlardan gelen istekleri kabul ediyoruz.
	},
}
// Bağlanan kullanıcıları güvenle tutmak için işletim sistemlerindeki mutex kilitlerini kullanıyoruz. Bu sayede aynı anda birden fazla kullanıcı bağlandığında veri bütünlüğünü koruyoruz.
type ClientManager struct {
	clients map[*websocket.Conn]bool // Bağlanan kullanıcıları tutmak için bir map yapısı kullanıyoruz
	mutex sync.Mutex // Mutex kilidi ile aynı anda birden fazla kullanıcı bağlandığında veri bütünlüğünü koruyoruz
}

var manager = ClientManager{
	clients: make(map[*websocket.Conn]bool), // clients map'ini başlatıyoruz
}

// WEBSCOKET Handler fonksiyonu, Next.js (Frontend) ile WebSocket bağlantısını yönetir. Bu fonksiyon, gelen bağlantıları kabul eder ve mesajları gönderir.
func wsEndpoint(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket Upgrade Hatası:", err)
		return
	}
	defer ws.Close()

	// Yeni bağlanan mutex ile kilidi kapar işi bitirince açar ve clients map'ine ekleriz. Bu sayede aynı anda birden fazla kullanıcı bağlandığında veri bütünlüğünü koruyoruz.
	manager.mutex.Lock()
	manager.clients[ws] = true
	manager.mutex.Unlock()

	log.Println("Yeni İstemci (Dashboard) Bağlandı!")

	// İstemci bağlanıp kopana kadar dinle
	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			log.Println("İstemci Bağlantısı Koptu")
			manager.mutex.Lock()
			delete(manager.clients, ws) // Bağlantısı kopan istemciyi clients map'inden sileriz
			manager.mutex.Unlock()
			break
		}
	}
}

// Simülasyon fonksiyonuna DeviceID, çarpan ve sapma (offset) eklendi
func startSimulation(db *sql.DB, mlURL string, delayMs int, deviceID int, multiplier float64, offset float64) {	query := `
		SELECT time, device_id, global_active_power 
		FROM raw_consumption 
		ORDER BY time ASC 
		LIMIT 10000;` // Sorgu ile verileri çekiyoruz, burada sadece ilk 10000 kaydı alıyoruz

	// Sorgu çalıştırma
	rows, err := db.Query(query)
	if err != nil {
		log.Fatalf("Sorgu çalıştırılamadı (Cihaz %d): %v", deviceID, err)
	}

	defer rows.Close()

	for rows.Next() {
		var data RawConsumption
		if err := rows.Scan(&data.Time, &data.DeviceID, &data.GlobalActivePower); err != nil {
			continue
		}

		if data.GlobalActivePower < 0 {
			continue
		}

		data.DeviceID = deviceID // Simülasyon için DeviceID'yi güncelliyoruz
		data.GlobalActivePower = data.GlobalActivePower * multiplier + offset // Simülasyon için çarpan ve sapma ekliyoruz

		// 0. Veriyi JSON formatına çeviriyoruz
		jsonData, _ := json.Marshal(data)
		
		// 1. FastAPI'ye Veriyi Gönder
		resp, err := http.Post(mlURL, "application/json", bytes.NewBuffer(jsonData))
		if err != nil {
			log.Printf("ML Servisine Ulaşılamadı: %v", err)
			time.Sleep(time.Duration(delayMs) * time.Millisecond)
			continue
		}

		// 2. FastAPI'den Gelen Tahmini Oku
		var mlResp FastAPIResponse
		json.NewDecoder(resp.Body).Decode(&mlResp)
		resp.Body.Close()

		// 3. Frontend için Mesaj Paketi Oluştur
		msg := DashboardMessage{
			Date:          data.Time.Format("2006-01-02"), // Tarih bilgisini ekranda göstereceğiz
			Time:          data.Time.Format("15:04:05"), // Ekranda sadece saati göstereceğiz
			DeviceID:      data.DeviceID,
			ActualValue:   data.GlobalActivePower,
			ForecastValue: mlResp.ForecastValue,
			ModelUsed:     mlResp.ModelUsed,
			RollingRMSE:   mlResp.RollingRMSE,
			RollingMAE:    mlResp.RollingMAE,
		}

		// 4. Bağlı Olan Tüm Dashboard'lara Canlı Yayını (Broadcast) Gönder
		manager.mutex.Lock()
		for client := range manager.clients {
			err := client.WriteJSON(msg)
			if err != nil {
				client.Close()
				delete(manager.clients, client)
			}
		}
		manager.mutex.Unlock()

		// Geliştirici logu
		fmt.Printf(" [Cihaz %d] - Gerçek: %.2f kW | Tahmin: %.2f kW (%s)\n", msg.DeviceID, msg.ActualValue, msg.ForecastValue, msg.ModelUsed)

		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}
}


func main() {
	godotenv.Load()

	// ML Servisinin URL'sini .env dosyasından alıyoruz
	mlServiceURL := os.Getenv("ML_SERVICE_URL")
	connStr := fmt.Sprintf("host='%s' port='%s' user='%s' password='%s' dbname='%s' sslmode='%s'",
		os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"), os.Getenv("DB_SSLMODE"))

	// 200 ms'lik bekleme koyuyoruz
	delayMs, _ := strconv.Atoi(os.Getenv("SIMULATION_DELAY_MS"))
	if delayMs == 0 {
		delayMs = 1000
	}

	// Veritabanına bağlanıyoruz
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.Ping()

	// MÜLAKAT NOTU: go anahtar kelimesi (Goroutine) simülasyonu arka planda ayrı bir thread'de (iş parçacığında) çalıştırır.
	// Eğer başına 'go' koymasaydık, program sonsuz simülasyon döngüsüne girer ve aşağıdaki API sunucusu hiçbir zaman ayağa kalkamazdı.
	// 3 farklı cihazı aynı anda (Asenkron) çalıştırıyoruz. 
	// Go'nun eşzamanlılık yeteneği sayesinde bu 3 süreç birbirini hiç beklemeden paralel akar.
	go startSimulation(db, mlServiceURL, delayMs, 1, 1.0, 0.0) // Orijinal Ev
	time.Sleep(333 * time.Millisecond)                         // İstekler saniyeye yayılsın diye ufak gecikme
	go startSimulation(db, mlServiceURL, delayMs, 2, 1.3, 0.5) // Büyük Ev (+%30, +0.5kW)
	time.Sleep(333 * time.Millisecond)
	go startSimulation(db, mlServiceURL, delayMs, 3, 0.8, 0.1) // Küçük Ev (-%20, +0.1kW)

	// --- API SERVER KURULUMU ---
	router := mux.NewRouter()
	
	// Ekrana veri basacak olan WebSocket rotası
	router.HandleFunc("/ws", wsEndpoint)

	// CORS Ayarları (Next.js'in Go'ya bağlanabilmesi için)
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"}, // Next.js portu
		AllowCredentials: true,
	})

	handler := c.Handler(router)

	fmt.Println("Go API Gateway & WebSocket Sunucusu :8080 Portunda Dinleniyor...")
	log.Fatal(http.ListenAndServe(":8080", handler))
}
