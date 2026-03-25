<div align="center">

# IDX-STOCK-SEPA

Screener saham Indonesia dengan metode **Momentum Masters** (Minervini, Ryan, Zanger, Ritchie II): analisis pakai data, bukan feeling.

[![Deno](https://img.shields.io/badge/deno-2.7.4-000000?logo=deno&logoColor=ffcb00)](https://deno.com) [![price](https://img.shields.io/badge/price-free-22c55e)](https://github.com/jatukr-dotcom/IDX-STOCK-SEPA) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## Fitur Utama

- **SEPA Candidates** — Filter kandidat saham berdasarkan kriteria Minervini SEPA: trend template, RS ranking, EPS growth, liquidity filter.
- **Trend Template** — 8 kriteria teknikal Minervini (MA50 > MA150 > MA200, harga di atas semua MA, dll).
- **RS Ranking** — Peringkat Relative Strength saham terhadap seluruh pasar IDX.
- **New Highs 52W** — Daftar saham mencetak harga tertinggi 52 minggu.
- **Volume A/D** — Analisis volume (CMF, MFI, OBV, ADL, net foreign) + deteksi VCP otomatis.
- **Stage Analysis** — Klasifikasi otomatis Stage 1–4 Minervini untuk setiap saham.
- **Pocket Pivot** — Deteksi sinyal beli berbasis volume David Ryan (vol up-day > max down-day vol 10 hari).
- **RS Line New High** — Deteksi RS Line (harga / IHSG proxy) mencetak new high 52 minggu — leading indicator terkuat.
- **Base Pattern Detection** — Identifikasi Flat Base, Cup-and-Handle, dan High Tight Flag beserta base count.
- **Power Play / Low Cheat** — Setup entry Minervini: konsolidasi ketat + volume kering sebelum breakout.
- **EPS Historis** — EPS per kuartal 2022–2025, dihitung dari `profitAttrOwner / shares` (year-end basis).
- **Export PDF** — Semua tab utama bisa diekspor ke PDF (per saham, SEPA bulk, VCP bulk, Momentum Masters).
- **Watchlist** — Simpan saham favorit dengan bintang.
- **API + SQLite** — Backend Deno, data di SQLite, cron tiap jam fetch data IDX.

---

## Metodologi Analisis

### SEPA — Specific Entry Point Analysis (Minervini)

SEPA adalah metodologi trading yang dikembangkan Mark Minervini, 2× U.S. Investing Champion. Fokusnya mencari saham dengan **fundamental kuat + teknikal super** yang siap breakout besar.

**Skor SEPA (0–100):**

| Komponen | Bobot | Penjelasan |
|---|---|---|
| Trend Template | 40% | Jumlah kriteria terpenuhi / 8 |
| RS Rank | 30% | Peringkat RS / 99 |
| EPS Growth | 15% | Pertumbuhan EPS YoY + akselerasi + konsistensi |
| Fundamental (ROE + NPM) | 15% | ROE hingga 30% → 9pts + NPM hingga 20% → 6pts |

**Detail skor EPS Growth (0–15 poin):**

| Kondisi | Poin |
|---|---|
| EPS YoY ≥ 25% (standar Minervini) | 8 |
| EPS YoY ≥ 10% | 5 |
| EPS YoY ≥ 0% | 2 |
| Akselerasi (growth kuartal ini > kuartal lalu) | +4 |
| ≥ 2 kuartal berturut-turut tumbuh positif | +3 |

**Liquidity Filter (pre-filter sebelum scoring):**
- Avg volume 20 hari ≥ 50.000 lembar/hari
- Avg value 20 hari ≥ 200 juta IDR/hari
- Saham yang tidak lolos **tidak dihitung** skor SEPA-nya

---

### Trend Template (8 Kriteria)

Saham layak dipertimbangkan hanya jika struktur tren teknikal sudah terbentuk sempurna:

| # | Kriteria | Arti |
|---|---|---|
| 1 | Harga > MA150 & MA200 | Saham di atas rata-rata jangka menengah & panjang |
| 2 | MA150 > MA200 | Tren menengah lebih kuat dari tren panjang |
| 3 | MA200 trending naik | Slope MA200 positif (sekarang > 22 hari lalu) |
| 4 | MA50 > MA150 & MA200 | Tren jangka pendek memimpin |
| 5 | Harga > MA50 | Saham di atas rata-rata 50 hari |
| 6 | Harga ≥ 30% di atas low 52w | Sudah bangkit dari titik terendah |
| 7 | Harga dalam 25% dari high 52w | Dekat area kekuatan, bukan saham lemah |
| 8 | RS Rank ≥ 70 | Lebih kuat dari 70% saham IDX lainnya |

Threshold default SEPA: trendCriteriaCount ≥ 6 (dapat disesuaikan via parameter `minTrend`).

---

### RS Ranking — Relative Strength

Mengukur kekuatan harga saham relatif terhadap seluruh pasar IDX dalam 4 periode, dengan bobot lebih besar pada momentum terbaru:

```
RS Score = (Return 3 bln × 40%) + (Return 6 bln × 20%) + (Return 9 bln × 20%) + (Return 12 bln × 20%)
RS Rank  = Persentil RS Score di seluruh saham IDX (1 = terlemah, 99 = terkuat)
```

Minervini mensyaratkan RS Rank ≥ 70. Saham dengan RS Rank ≥ 90 adalah kandidat terkuat. RS Rank ≥ 80 sebelum breakout disebut "leading stock".

---

### Stage Analysis — Minervini Stage 1–4

Setiap saham selalu berada di salah satu dari 4 stage siklus pasar. **Hanya Stage 2 yang layak dibeli.** Membeli di stage lain adalah kesalahan yang paling umum dilakukan trader pemula.

| Stage | Nama | Kondisi Teknikal | Aksi |
|---|---|---|---|
| **1** | Basing / Accumulation | MA200 flat (slope ±2%), harga bergerak sideways di sekitar MA200, MA50 ≈ MA200 | Tunggu, observe |
| **2** | Advancing | Harga > MA50 > MA150 > MA200, MA200 slope positif, harga ≥ 10% di atas MA200 | **BELI — satu-satunya stage yang valid** |
| **3** | Topping / Distribution | Harga mulai turun di bawah MA50, MA50 mulai turun, MA150 mendatar | Hati-hati, pertimbangkan jual |
| **4** | Declining | Harga < MA200, MA200 slope negatif, MA50 < MA150 < MA200, RS Rank < 30 | **HINDARI — jangan beli** |

**Cara kerja deteksi:**
```
Stage 2: price > MA50 > MA150 > MA200 AND MA200SlopePct > 0
Stage 4: price < MA200 AND MA200SlopePct ≤ 0
Stage 3: price < MA50 ATAU MA150 < MA200 (belum Stage 4)
Stage 1: selain kondisi di atas
```

---

### RS Line New High

RS Line mengukur kekuatan relatif saham terhadap pasar secara visual dalam bentuk grafis. Ketika RS Line mencetak **new high sebelum harga mencetak new high**, ini adalah salah satu sinyal paling kuat yang diakui semua trader di Momentum Masters.

**Cara penghitungan:**
```
IHSG Proxy = SUM(individualIndex × weightForIndex) per hari (dari data stock_summary IDX)
RS Line    = stockClose / IHSG_proxy (dinormalisasi: titik pertama = 100)
RS Line 52w High = nilai tertinggi RS Line dalam 252 hari terakhir
RS Line New High = RS Line saat ini ≥ RS Line 52w High × 99.9%
```

**Interpretasi:**
- RS Line New High saat harga masih konsolidasi → **leading signal** sangat kuat
- RS Line membuat new high bersamaan dengan harga → konfirmasi breakout valid
- RS Line melemah saat harga naik → divergensi bearish, waspadai

---

### Pocket Pivot — David Ryan

Pocket Pivot adalah sinyal beli berbasis volume yang dikembangkan David Ryan (3× U.S. Investing Champion, murid Peter Lynch). Sinyal ini mengidentifikasi akumulasi oleh institusi **di dalam base** — sebelum breakout terjadi.

**Definisi:**
Sebuah hari dinyatakan Pocket Pivot jika:
1. Hari itu adalah **up-day** (close > close kemarin)
2. **Volume hari ini > volume terbesar hari turun dalam 10 hari sebelumnya**
3. Harga berada di atau di atas **MA10**
4. Harga **tidak extended** — maksimal 5% di atas MA10
5. Saham dalam Stage 1 atau Stage 2 (bukan declining)

**Mengapa efektif:**
Volume tinggi pada hari naik yang melebihi volume hari-hari turun sebelumnya menunjukkan bahwa institusi/smart money sedang mengakumulasi saham, bukan mendistribusikan. Ini seringkali terjadi **1–3 hari sebelum breakout sesungguhnya**.

```
Pocket Pivot = upDay AND volume > max(downDayVolume, 10 hari) AND price >= MA10 AND pctAboveMA10 <= 5%
```

---

### Base Pattern Detection

Identifikasi tiga pola konsolidasi klasik sesuai metodologi Zanger dan Minervini, beserta penghitungan **base count** (iterasi base) yang menentukan kematangan setup.

#### Flat Base

Konsolidasi sideways yang sehat sebelum breakout:
- Range harga ≤ 15% selama minimal 20–25 hari trading
- Volume menurun selama konsolidasi (supply mengering)
- Harga dalam 25% dari high 52 minggu
- Merupakan base paling umum dan paling mudah diidentifikasi

```
Range% = (High - Low) / ((High + Low) / 2) × 100  ← harus ≤ 15%
Volume trend: rata-rata 10 hari kedua < rata-rata 10 hari pertama
```

#### Cup-and-Handle (U-shape)

Pola berbentuk cangkir teh:
- **Kiri cup**: harga turun 12–35% dari pivot high (koreksi sehat)
- **Dasar cup**: harga stabil selama beberapa minggu (bukan berbentuk V)
- **Kanan cup**: harga recover ke dalam 8% dari pivot high sebelumnya
- **Handle** (opsional): pullback kecil 5–12% selama 5–15 hari sebelum breakout

Pola ini menggambarkan distribusi (kiri), penghentian penjualan (dasar), dan re-akumulasi (kanan).

#### High Tight Flag (HTF)

Pola paling agresif dan paling langka:
- Harga naik **100%+ dalam 20–40 hari** (tiang bendera)
- Kemudian konsolidasi 15–25 hari dengan range 10–25%
- Pullback dari peak ≤ 25%
- Sangat jarang terjadi tetapi ketika terjadi, potensi breakout sangat besar

#### Base Count

Jumlah base yang sudah terbentuk sejak awal Stage 2:
- **Base 1 (1st base)**: probabilitas tertinggi, risiko terendah — setup paling ideal
- **Base 2 (2nd base)**: masih valid, probabilitas bagus
- **Base 3+ (late stage)**: risiko lebih tinggi, potensi breakdown lebih besar

> Prinsip Minervini: "The later the base count, the higher the risk."

---

### Power Play & Low Cheat — Minervini Entry Setups

Setup entry presisi tinggi yang dikembangkan Minervini untuk memasuki posisi dengan risiko minimal:

#### Power Play

Setup paling ketat dan paling clean:
- Harga berkonsolidasi dalam **range ≤ 3%** selama **3–5 hari berturutan**
- **Volume mengering** signifikan: avg volume konsolidasi < 50% dari avg volume 20 hari sebelumnya
- Saham harus dalam Stage 2 (tren naik)
- Harga dalam 15% dari high 52 minggu
- **Near Breakout** = harga berada ≥ 98% dari high range konsolidasi

Interpretasi: supply sudah benar-benar habis. Sedikit demand tambahan akan langsung mendorong harga naik.

#### Low Cheat

Variasi Power Play untuk entry di titik risiko terendah:
- Range harga ≤ 5% selama **5–10 hari**
- **Harga saat ini dalam 3% dari low range konsolidasi** — inilah yang membuat risikonya kecil
- Volume di bawah rata-rata (supply menghilang)
- Stop loss bisa sangat ketat (di bawah low konsolidasi)

```
Power Play: tightRange <= 3% AND consolDays in [3,5] AND volumeDryUp > 30%
Low Cheat:  tightRange <= 5% AND consolDays in [5,10] AND pctAboveLow <= 3%
```

---

### Volume Akumulasi & Distribusi

Analisis volume mengungkap apakah **uang besar sedang masuk (akumulasi) atau keluar (distribusi)** — sesuatu yang tidak terlihat dari harga saja.

#### ADL — Accumulation/Distribution Line

Mengukur tekanan beli vs jual berdasarkan posisi harga penutupan dalam range High-Low hari itu:

```
Money Flow Multiplier (MFM) = [(Close − Low) − (High − Close)] / (High − Low)
Money Flow Volume             = MFM × Volume
ADL                           = Kumulatif Money Flow Volume
```

- MFM → **+1**: close mendekati high = tekanan beli kuat
- MFM → **−1**: close mendekati low = tekanan jual kuat
- ADL naik saat harga datar/turun = divergensi bullish (akumulasi tersembunyi)

#### CMF — Chaikin Money Flow (20 hari)

Versi ternormalisasi ADL dalam jendela 20 hari:

```
CMF(20) = Σ(MFM × Volume, 20 hari) / Σ(Volume, 20 hari)
```

| Nilai CMF | Interpretasi |
|---|---|
| > +0.10 | Akumulasi kuat — uang besar masuk |
| 0 s/d +0.10 | Akumulasi lemah / netral |
| −0.10 s/d 0 | Distribusi lemah / netral |
| < −0.10 | Distribusi kuat — uang besar keluar |

#### OBV — On-Balance Volume

Indikator kumulatif volume berdasarkan arah harga:

```
Jika Close > Close kemarin → OBV = OBV + Volume
Jika Close < Close kemarin → OBV = OBV − Volume
Jika Close = Close kemarin → OBV tidak berubah
```

OBV trend naik mengkonfirmasi tren harga naik. OBV trend turun saat harga naik = peringatan distribusi (divergensi bearish).

#### MFI — Money Flow Index (14 hari)

RSI berbasis volume — mengukur tekanan beli/jual menggunakan nilai transaksi:

```
Typical Price (TP)  = (High + Low + Close) / 3
Raw Money Flow      = TP × Volume
Positive MF         = Σ Raw MF hari-hari TP naik (14 hari)
Negative MF         = Σ Raw MF hari-hari TP turun (14 hari)
MFI                 = 100 − [100 / (1 + Positive MF / Negative MF)]
```

| Nilai MFI | Interpretasi |
|---|---|
| > 80 | Overbought — potensi koreksi |
| 40 – 80 | Normal — kondisi sehat |
| < 30 | Oversold — potensi pembalikan naik |

---

### VCP — Volatility Contraction Pattern (Minervini)

VCP adalah pola konsolidasi sehat sebelum breakout besar. Minervini menyebutnya sebagai "tanda tangan" saham yang akan bergerak besar — pola ini mencerminkan proses supply berkurang secara bertahap.

**Ciri-ciri VCP:**
1. Saham sudah dalam uptrend, dekat high 52 minggu (dalam 20%)
2. Terjadi **2–4 koreksi yang semakin kecil** (contraction): contoh −20% → −12% → −6%
3. **Volume semakin menyusut** di setiap koreksi — menunjukkan supply berkurang
4. Koreksi terakhir sangat ketat — tekanan jual hampir habis

**Deteksi otomatis** dalam aplikasi:
- Bagi 60 hari terakhir menjadi 3 jendela × 20 hari
- Range setiap jendela ≤ 85% dari range jendela sebelumnya (semakin menyempit)
- Volume rata-rata jendela terakhir < 75% volume jendela pertama (mengering)
- Harga dalam 20% dari high 52 minggu

---

### EPS Historis per Kuartal

Data EPS dihitung ulang menggunakan formula **year-end shares** untuk konsistensi antar kuartal:

```
Shares  = profitAttrOwner_Q4 / EPS_Q4   (basis year-end, bukan weighted average)

EPS_Q1  = profitAttrOwner_Q1 / Shares
EPS_Q2  = (profitAttrOwner_Q2 − profitAttrOwner_Q1) / Shares
EPS_Q3  = (profitAttrOwner_Q3 − profitAttrOwner_Q2) / Shares
EPS_Q4  = (profitAttrOwner_Q4 − profitAttrOwner_Q3) / Shares
```

**Mengapa year-end shares:**
- `profitAttrOwner` dari IDX API adalah nilai **kumulatif** (Jan–Mar, Jan–Jun, Jan–Sep, Jan–Des)
- Untuk menghitung EPS kuartalan standalone, harus dikurangkan dari kuartal sebelumnya
- Shares dihitung dari Q4 karena itu adalah laporan tahunan resmi — konsisten dengan angka EPS yang dilaporkan emiten
- Jika Q4 tahun berjalan belum tersedia (belum lapor), fallback ke Q4 tahun sebelumnya

**EPS Growth YoY:**
```
EPS Growth YoY% = (EPS_Q_tahun_ini − EPS_Q_tahun_lalu) / |EPS_Q_tahun_lalu| × 100
```

Minervini mensyaratkan EPS growth minimal **25% YoY** selama setidaknya 2 kuartal berturut-turut, dengan akselerasi pertumbuhan sebagai sinyal terkuat.

---

### AI Rekomendasi Saham

Fitur AI Rekomendasi menggabungkan **semua sinyal teknikal dan fundamental** menjadi satu skor terpadu, membantu pengguna menemukan kandidat saham terbaik tanpa harus menganalisis setiap tab secara manual. Sistem ini dilengkapi dengan:

1. **Tiga Mode Rekomendasi:**
   - **Teknikal**: Fokus pada SEPA score, Stage analysis, RS Line, Pocket Pivot, dan pattern recognition
   - **Fundamental**: Fokus pada EPS growth, ROE, NPM, DER, dan revenue growth
   - **Kombinasi**: Gabungan 60% teknikal + 40% fundamental (default)

2. **Skor Teknikal (0–100 pts):**

| Komponen | Bobot | Penjelasan |
|---|---|---|
| SEPA Score (normalized) | 50% | Tren + RS + EPS + ROE/NPM |
| Stage 2 Bonus | 20% | Stage 2 → +20 pts, Stage 1 → +10 pts |
| RS Line New High | 10% | Jika mencetak new high 52w → +10 pts |
| Pocket Pivot | 10% | Jika terdeteksi dalam 5 hari terakhir → +10 pts |
| Base Pattern | 6% | HTF=6, Cup-Handle=4, Flat=2 pts |
| Power Play/Low Cheat | 4% | Power Play=4, Low Cheat=2 pts |

3. **Skor Fundamental (0–100 pts):**

| Komponen | Bobot | Penjelasan |
|---|---|---|
| EPS Growth YoY | 25% | ≥25%=25pts, ≥10%=18pts, ≥0%=10pts |
| EPS Acceleration | 10% | Kuartal ini > kuartal lalu → +10 pts |
| Consecutive Growth | 5% | ≥3Q berturut → 5pts, 2Q → 3pts, 1Q → 1pt |
| ROE | 20% | min(roe/25, 1) × 20 — capped di 25% |
| NPM | 15% | min(npm/20, 1) × 15 — capped di 20% |
| DER (lower = better) | 10% | ≤0.5=10pts, ≤1.0=7pts, ≤2.0=4pts |
| Revenue Growth YoY | 10% | ≥15%=10pts, ≥5%=6pts, ≥0%=2pts |
| PER | 5% | 5–20=5pts, 20–30=3pts, 30–50=1pt |

4. **Filter Gorengan — Mandatory Safety Filter**

Untuk melindungi pengguna dari saham spekulatif (gorengan), sistem secara otomatis menghapus saham dengan kondisi:

| Kriteria | Tindakan |
|---|---|
| Notation "X" (mark spekulatif IDX) | Exclude (pengecualian tidak bisa ditolak) |
| UMA flag aktif (≤30 hari) | Exclude — Unusual Market Activity warning |
| Market cap < 100B IDR | High risk — exclude (25 pts penalty) |
| Market cap 100B–500B IDR | Medium risk — 15 pts penalty |
| Free float ratio < 20% | Thin float risk — dapat di-corner, 15 pts penalty |
| Volume anomali (>10× 20d avg) | Pump indicator — 10 pts penalty |
| Tanpa data EPS | Tidak cukup data fundamental — 5 pts penalty |

**Gorengan Score ≥ 60 = otomatis dikecualikan, tidak bisa diubah.**

5. **Claude AI Narrative (Opsional)**

Jika `ANTHROPIC_API_KEY` env var diset, sistem akan:
- Mengirimkan top 10 rekomendasi ke Claude API
- Menghasilkan narasi pasar 3–4 paragraf dalam Bahasa Indonesia
- Mengidentifikasi sektor kuat dan setup individual yang perlu diperhatikan
- **Cache hasil selama 1 jam** untuk menghindari biaya API berlebihan
- Menampilkan dengan disclaimer jelas: "Bukan rekomendasi investasi"

6. **Output & Export**

Setiap rekomendasi menampilkan:
- **Skor keseluruhan** (berkode warna: hijau ≥75, kuning ≥55, abu-abu <55)
- **Breakdown sinyal**: Stage, RS Rank, EPS Growth, ROE, DER
- **Daftar alasan terperinci**: semua sinyal yang berkontribusi ke skor (klik baris untuk expand)
- **Gorengan Score**: transparansi filter keamanan
- **PDF Export**: landscape A4 dengan tabel lengkap + narasi AI di halaman kedua (jika tersedia)

---

## Instalasi

**Prasyarat:** [Git](https://git-scm.com/install/windows) dan [Deno](https://docs.deno.com/runtime/getting_started/installation/)

**1. Clone repo**

```bash
git clone https://github.com/jatukr-dotcom/IDX-STOCK-SEPA.git
cd IDX-STOCK-SEPA
```

**2. Setup database**

```bash
deno task db:generate
deno task db:push
deno task db:init
```

- `db:generate` — buat file migrasi SQL dari schema (pertama kali saja)
- `db:push` — terapkan skema ke SQLite (buat/update tabel)
- `db:init` — isi data 2 tahun penuh (jalankan sekali saat setup awal, bisa memakan waktu 10–30 menit)

**3. Fetch data EPS historis (2022–2025)**

```bash
deno task db:fetch-eps
```

Mengambil data EPS Q1–Q4 untuk semua saham dari IDX API. Jalankan ulang setiap kuartal baru tersedia (biasanya ~3 bulan setelah akhir periode).

## Cara Menjalankan

### Production

```bash
deno task ui:build && deno task api:serve
```

Akses di `http://127.0.0.1:50270` atau `http://localhost:50270`.

> [!IMPORTANT]
> Cronjob akan otomatis mengambil data setiap jam (jadwal: menit 0). Untuk update manual data yang tertinggal tanpa download ulang penuh:
> ```bash
> deno task db:update
> ```

### Development

**Terminal 1 — API:**
```bash
deno task api:dev
```

**Terminal 2 — UI:**
```bash
deno task ui:dev
# Akses di http://127.0.0.1:50260
```

---

## Tasks

| Perintah | Keterangan |
|---|---|
| `deno task api:serve` | Jalankan API server (production) |
| `deno task api:dev` | Jalankan API server dengan watch mode |
| `deno task ui:build` | Build UI untuk production |
| `deno task ui:dev` | Jalankan UI dev server |
| `deno task db:push` | Terapkan skema ke database |
| `deno task db:init` | Isi data awal 2 tahun (jalankan sekali) |
| `deno task db:update` | Fetch hanya tanggal yang belum ada di DB |
| `deno task db:fetch-eps` | Fetch data EPS historis Q1–Q4 dari IDX |
| `deno task check` | Format, lint, dan typecheck |

---

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| Runtime | Deno 2.7.4 |
| Backend | Hono (via `@neabyte/deserve`) |
| Frontend | Preact + Vite |
| Database | SQLite via `@libsql/client` + Drizzle ORM |
| Charts | Recharts |
| PDF | jsPDF + jspdf-autotable |
| Data | IDX API (stock summary, screener, financial ratio) |

---

## Lisensi

Proyek ini dilisensikan di bawah MIT. Lihat berkas [LICENSE](LICENSE) untuk detail.

> Data bersumber dari IDX. Bukan rekomendasi jual/beli. Gunakan dengan tanggung jawab penuh sebagai alat bantu analisis.
