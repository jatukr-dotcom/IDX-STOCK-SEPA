<div align="center">

# IDX-STOCK-SEPA

Screener saham Indonesia dengan metode **Momentum Masters** (Minervini, Ryan, Zanger, Ritchie II): analisis pakai data, bukan feeling.

[![Deno](https://img.shields.io/badge/deno-2.7.4-000000?logo=deno&logoColor=ffcb00)](https://deno.com) [![price](https://img.shields.io/badge/price-free-22c55e)](https://github.com/jatukr-dotcom/IDX-STOCK-SEPA) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## Fitur Utama

### Web UI
- **SEPA Candidates** — Filter kandidat saham berdasarkan kriteria Minervini SEPA: trend template, RS ranking, EPS growth, liquidity filter.
- **Trend Template** — 8 kriteria teknikal Minervini (MA50 > MA150 > MA200, harga di atas semua MA, dll).
- **RS Ranking** — Peringkat Relative Strength saham terhadap seluruh pasar IDX.
- **New Highs 52W** — Daftar saham mencetak harga tertinggi 52 minggu.
- **Volume A/D** — Analisis volume (CMF, MFI, OBV, ADL, net foreign 20h, volume surge) + deteksi VCP + 5-criteria model akumulasi/distribusi.
- **Stage Analysis** — Klasifikasi otomatis Stage 1–4 Minervini dengan konfirmasi 3-of-5 hari untuk mencegah flipping.
- **Pocket Pivot** — Deteksi sinyal beli berbasis volume David Ryan (vol up-day > max down-day vol 10 hari).
- **RS Line New High** — Deteksi RS Line (harga / IHSG proxy) mencetak new high 52 minggu — leading indicator terkuat.
- **Base Pattern Detection** — Identifikasi Flat Base, Cup-and-Handle, dan High Tight Flag beserta base count.
- **Power Play / Low Cheat** — Setup entry Minervini: konsolidasi ketat + volume kering sebelum breakout.
- **🆕 Breakout Screener** — Deteksi saham yang breakout dari pivot base (volume ≥1.5× avg50d) atau mendekati pivot (dalam 3%), dengan ATR(14) dan Bollinger Band Squeeze.
- **🆕 Smart Money Tracker** — Deteksi jejak institusi & asing: 6 sinyal kuantitatif (skor 0–100) + broker accumulation dari histori top-10 broker harian. Tampilkan kolom Foreign Flow, Streak, Trade Size, Bid/Offer, dan nama broker yang konsisten akumulasi.
- **AI Rekomendasi** — Skor terpadu teknikal + fundamental, narasi Claude AI (opsional), export PDF.
- **Export PDF** — Semua tab utama bisa diekspor ke PDF (per saham, SEPA bulk, VCP bulk, Momentum Masters).
- **Watchlist** — Simpan saham favorit dengan bintang.
- **API + SQLite** — Backend Deno, data di SQLite, cron tiap jam fetch data IDX.

### Terminal Screener (`screen.ts`)
- **Lebih cepat dari web UI** — query langsung ke SQLite, semua kalkulasi in-process
- **Semua sinyal Minervini** — Stage, Trend Template, RS Rank, EPS, VCP, Pocket Pivot, Cup-Handle, Flat Base, HTF, Power Play
- **5-criteria volume model** — CMF, MFI, OBV, Volume Surge, Foreign Flow (net asing IDX)
- **Sinyal entry presisi** — Breakout detection (BKT), Approaching pivot (APR), Pullback EMA21 (PB), Shakeout
- **Sinyal exit** — Climax Top, Upper BB 3d+, 7% Stop Breach, OBV Divergence, Support Breakdown (6 sinyal)
- **Quant signals** — ATR(14), Bollinger Band Squeeze, Multi-Factor Momentum (0–100), Sharpe Ratio
- **Sinyal institusional** — `smt` mode: 6 sinyal jejak asing/institusional (total 100 pts) + broker accumulation bonus, sinyal hingga STRONG BUY
- **🆕 Entry Plan** — `--detail KODE` kini menampilkan rencana entry Minervini: pivot point, buy zone (0–5% di atas pivot), stop loss, target 1R/2R/3R, R/R ratio, dan position sizing (lot) otomatis
- **Position sizing** — hitung lot berdasarkan ATR stop + portfolio size
- **Workflow tools** — Watchlist (save/load/compare), CSV export, Alert system, Backtest sederhana
- **Mode & filter** — `breakout`, `vcp`, `pullback`, `momentum`, `technical`, `fundamental`, `combined`, `smt`, `auto`
- **Auto Mode** — `auto` mode: skor komposit otomatis (AutoScore 0–100) menggabungkan fundamental, momentum, SMT, dan sinyal entry setup. Output otomatis menyimpan watchlist harian dan menampilkan detail top-N saham.

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

#### Cara Membaca Grafik A/D Line & OBV (Detail Saham → Volume A/D)

Di halaman detail saham, tab **Volume A/D** menampilkan grafik A/D Line dan OBV dalam satu chart dengan **dua sumbu Y terpisah** — A/D Line di kiri (merah), OBV di kanan (biru). Keduanya ditampilkan bersamaan untuk memudahkan perbandingan.

**A/D Line:**

| Kondisi | Interpretasi |
|---|---|
| Garis naik | Uang masuk — pembeli dominan (akumulasi) |
| Garis turun | Uang keluar — penjual dominan (distribusi) |
| Naik saat harga sideways | Akumulasi tersembunyi — potensi breakout |
| **Naik saat harga turun** | **Divergensi bullish** — tekanan jual melemah, potensi reversal naik |
| **Turun saat harga naik** | **Divergensi bearish** — kenaikan tidak didukung volume beli, rawan koreksi |

**OBV:**

| Kondisi | Interpretasi |
|---|---|
| Naik konsisten | Volume beli mendominasi — uptrend valid dan kuat |
| Turun konsisten | Volume jual mendominasi — downtrend dikonfirmasi |
| Naik mendahului harga | Smart money sudah masuk sebelum harga bergerak |
| **Turun saat harga naik** | **Divergensi bearish** — distribusi tersembunyi, waspadai |
| Flat saat harga naik | Kenaikan tanpa dukungan volume — kurang meyakinkan |

**Membaca keduanya bersama:**

```
Harga naik + A/D naik + OBV naik  → Uptrend KUAT, konfirmasi valid
Harga naik + A/D turun + OBV turun → Distribusi tersembunyi — waspadai pembalikan
Harga turun + A/D naik + OBV naik  → Akumulasi di bawah — potensi reversal naik
```

> **Kunci:** Divergensi antara harga dan A/D Line / OBV adalah sinyal paling berharga. Ketika keduanya kompak (A/D dan OBV sama-sama divergen), sinyalnya lebih kuat.

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

### Breakout Screener

Tab **Breakout** mendeteksi saham yang sedang atau akan segera breakout dari pola konsolidasi, menggunakan pivot point berbasis pola yang terdeteksi.

**Pivot Point (basis pola):**
| Pola | Lookback Pivot |
|---|---|
| High Tight Flag | 15 hari terakhir |
| VCP | 20 hari terakhir |
| Cup-and-Handle | 5 hari terakhir (handle) |
| Flat Base / Default | 25 hari terakhir |

**Sinyal Breakout:**
```
BREAKOUT    = Close > Pivot AND Volume hari ini > 1.5× avg volume 50 hari
MENDEKATI   = Harga dalam 3% di bawah pivot (belum breakout)
```

**Indikator pendukung:**
- **ATR(14)** — Average True Range: mengukur volatilitas harian rata-rata (digunakan untuk position sizing)
- **BB Squeeze** — Bollinger Band width di level 6 bulan (126 hari) terendah → volatilitas terkompresi, sering mendahului pergerakan besar
- **Shakeout** — Harga sempat turun di bawah MA50 intraday tapi close kembali di atas MA50 (tanda supply habis)

**Logika filter:**
- Hanya Stage 1 dan 2 (Stage 3/4 di-exclude)
- Gorengan filter aktif (notation X, market cap < 100B)
- Breakout ditampilkan pertama, diurutkan RS Rank tertinggi

---

### Auto Screener (`--mode auto`)

Mode paling praktis untuk screening harian — menggabungkan **semua sinyal** menjadi satu skor AutoScore (0–100) dan secara otomatis:
- Menampilkan tabel ringkas dengan kolom AutoScore, Setup, SMT, Combined Score, Momentum, dan Warnings
- Mencetak detail checklist untuk top-N saham (`--auto-detail N`, default 3)
- Menyimpan watchlist otomatis ke `data/watchlists/auto_YYYYMMDD.json`

#### AutoScore Formula (0–100)

| Komponen | Bobot/Poin | Keterangan |
|---|---|---|
| Combined Score | × 0.30 | (TechScore 60% + FundScore 40%) × 0.30 |
| Momentum Factor | × 0.15 | Multi-factor momentum (RS + EPS + Trend + Vol + Foreign) × 0.15 |
| SMT Score | × 0.25 | Institutional footprint score × 0.25 |
| Stage 2 bonus | +5 | Saham dalam Stage 2 (Advancing) |
| Setup bonus (stackable, cap 20) | +8–20 | Breakout=+15, Approaching=+8, VCP=+6, Pullback=+4 |
| Pocket Pivot | +7 | Pocket Pivot terdeteksi dalam 5 hari |
| RS Line New High | +6 | RS Line mencetak 52w high |
| Broker Accumulation | +3–5 | ≥2 broker akumulasi=+5, 1 broker=+3 |
| Gorengan penalty | −5 atau −10 | Score 30–44=−5, Score 45+=−10 |
| Sell signal | × 0.5 atau −pts | Climax Top / BB 3d+ = ×0.5; 7% Stop=−12, Breakdown MA50=−6, OBV Divergence=−8, Support Breakdown=−10 |

**Filter:** Hanya saham dengan AutoScore ≥ 30 yang tampil. Setup bonus bersifat **stackable** — saham dengan VCP sekaligus mendekati pivot mendapat keduanya.

```bash
deno run -A screen.ts --mode auto              # Default: top 15, cetak detail 3 teratas
deno run -A screen.ts --mode auto --top 20 --auto-detail 5
deno run -A screen.ts --mode auto --min-score 40
```

---

### Smart Money Tracker (SMT)

Mendeteksi jejak **institusi dan investor asing** secara kuantitatif — sebelum pergerakan harga terlihat jelas. SMT menggabungkan 6 sinyal dari data yang sudah tersedia (foreign flow, OBV, trade size, bid/offer) ditambah bonus dari histori konsentrasi broker.

#### SMT Score (0–100 pts)

| # | Sinyal | Pts | Sumber Data | Cara Hitung |
|---|--------|-----|------------|-------------|
| 1 | **Foreign Flow Momentum** | 30 | `foreign_buy`, `foreign_sell` | Akselerasi net-buy asing 5d vs rata-rata 20d, dinormalisasi terhadap avg volume 20d. Range `[-5%, +25%]` → `[0, 30]` |
| 2 | **Foreign Flow Streak** | 10 | `foreign_buy`, `foreign_sell` | Hari berturut-turut asing net-buy: ≥5h=10, ≥3h=6, ≥1h=3 |
| 3 | **OBV Divergence** | 15 | OHLCV | OBV naik + harga turun (divergensi bullish) = 15 pts; OBV naik + harga naik/flat = 12 pts |
| 4 | **Trade Size Profile** | 20 | `value`, `frequency` | Avg trade size 5d vs 20d: `(value/freq)`. Naik = blok institusional. +20% → mulai score, +80% → maks |
| 5 | **Bid/Offer Pressure** | 10 | `bid_volume`, `offer_volume` | Rasio 3-day aggregate: ≥1.5=10, ≥1.2=6, ≥1.0=3 pts |
| 6 | **Cross-Signal Alignment** | 15 | — | Berapa sinyal di atas aktif serentak: ≥4=15, 3=10, 2=5 pts. Re-calculated lebih tinggi jika Broker Concentration kuat (≥7 pts). |
| + | **Broker Concentration** | +10 | `broker_stock_metrics` | Top-3 broker volume ≥70%=10pts, ≥60%=7pts, ≥50%=4pts. Sinyal konsentrasi institusional. |
| + | **Broker Accumulation Bonus** | +3 | `broker_top_daily` | Broker hadir ≥50% hari & avg rank ≤5 selama 20 hari: ≥2 broker=+3, 1 broker=+2 |

**Total maks: 113 pts, di-cap di 100.**

#### Klasifikasi Sinyal

| Skor SMT | Sinyal | Interpretasi |
|---|---|---|
| ≥ 75 | **STRONG BUY** | Jejak institusional sangat kuat, multiple signals konfirmasi |
| ≥ 55 | **BUY** | Akumulasi terdeteksi, setup menarik |
| ≥ 35 | **NETRAL** | Beberapa sinyal ada tapi belum konklusif |
| ≥ 20 | **SELL** | Distribusi lemah terdeteksi |
| < 20 | **STRONG SELL** | Distribusi aktif, distribusi terindikasi |

#### Cara Baca Output SMT (Terminal)

```
#   Kode   Nama                  SMT  For5d   Streak  TxChg  B/O  Akum.Broker         Sinyal
1   BBRI   Bank Rakyat Indonesia  78  +5.2B    7h     +32%   1.48 BRI DANAREKSA,...  STRONG BUY
```

| Kolom | Arti |
|---|---|
| SMT | Skor 0–100 (hijau ≥75, kuning ≥55) |
| For5d | Net foreign buy/sell 5 hari terakhir (+ = asing beli net) |
| Streak | Hari berturut-turut asing net-buy |
| TxChg | Perubahan avg ukuran transaksi 5d vs 20d (+ = institusional masuk) |
| B/O | Bid/Offer ratio 3-day aggregate (>1.0 = buyer dominan) |
| Akum.Broker | Broker yang konsisten di top-10 selama ≥50% dari 20 hari terakhir |

#### Cara Baca Output Detail Saham (`--detail KODE`)

```
═══ Smart Money ═══
SMT Score       : 78/100 [████████░░]
Foreign Flow    : +5.2B (5d) ▲ accelerating
Consecutive Buy : 7 hari berturut-turut
Avg Trade Size  : +32.0% vs 20d (institusional)
Bid/Offer Ratio : 1.48 (buyer dominated)
Signal          : STRONG BUY
Reasons         : Foreign flow accelerating, Asing beli 7h berturut, OBV naik ...

═══ Broker Activity ═══
Konsentrasi Top3: 67.5% (konsentrasi tinggi)
▶ Broker Akumulasi (hadir konsisten ≥50% hari, avg rank ≤5):
  🏦 BRI DANAREKSA SEKURITAS
  🏦 MANDIRI SEKURITAS
```

#### Sumber Data Broker

Data broker berasal dari IDX API endpoint `GetBrokerSummary?stockCode=X&date=YYYYMMDD`. Data ini hanya tersedia setelah menjalankan:

```bash
deno task db:fetch-broker          # default: 60 hari terakhir
deno task db:fetch-broker --days 90  # mundur lebih jauh
```

Data disimpan di tabel `broker_top_daily` (top-10 broker per saham per hari). Jika tabel belum ada, fitur broker di web dan terminal akan **degrade gracefully** — SMT tetap jalan tanpa bonus broker.

---

### Quant Signals (Terminal Screener)

#### Multi-Factor Momentum Score (0–100)
Skor komposit yang menggabungkan lima faktor dengan bobot berbeda:

| Faktor | Bobot | Formula |
|---|---|---|
| RS Rank | 30% | rsRank / 99 × 30 |
| EPS Score | 20% | epsScore / 15 × 20 |
| Trend Template | 20% | trendCriteriaCount / 8 × 20 |
| Volume Criteria | 15% | volCriteriaCount / 5 × 15 |
| Foreign Flow | 15% | (foreignNetPct + 10) / 20 × 15, capped [-10,+10] |

#### ATR & Position Sizing
```
ATR(14) = rata-rata True Range 14 hari
TR      = max(High−Low, |High−PrevClose|, |Low−PrevClose|)

Stop Distance = max(ATR × 1.5, Harga × 7%)
Risk per Trade = Portfolio × RiskPct%
Lot            = floor(Risk per Trade / Stop Distance / Harga / 100) × 100 lembar
```

#### Bollinger Band Squeeze
```
BB Width = (Upper − Lower) / Middle × 100
           = 4 × StdDev(20) / SMA(20) × 100

BB Squeeze = BB Width saat ini ≤ BB Width minimum 126 hari terakhir
```
Squeeze adalah kondisi saat volatilitas terkompresi ke level paling sempit dalam 6 bulan — sering mendahului gerakan besar (breakout atau breakdown).

#### Sharpe Ratio (Simplified)
```
Sharpe = (Mean Daily Return − Risk Free) / StdDev × √252

Risk Free = 6% / 252 ≈ 0.0238% per hari (BI rate proxy)
Window    = 63 hari (3 bulan)
```
Sharpe > 1.0 = return bagus relatif terhadap risikonya.

---

### Selling Rules — Kapan Harus Keluar (Minervini)

Membeli di titik yang tepat hanya separuh dari trading yang baik. Mengetahui **kapan harus keluar** sama pentingnya. Tiga sinyal exit ini aktif di terminal screener (`screen.ts --detail KODE`) dan hanya berlaku untuk saham Stage 2.

#### 1. Climax Top

**Definisi:** Saham yang sudah naik panjang tiba-tiba mencetak **hari kenaikan harga terbesar sepanjang run-nya**, disertai **volume tertinggi** dalam periode terakhir.

Ini bukan tanda kekuatan — ini adalah tanda **euforia akhir**. Institusi memanfaatkan antusiasme retail untuk mendistribusikan (menjual) posisi besar mereka dengan harga puncak.

> *"When a stock makes its biggest one-day point gain of the entire move on the heaviest volume, that's a climax run — get out."* — Mark Minervini

**Cara deteksi:**
```
1. Hitung gain % harian sepanjang 252 hari terakhir
2. Jika salah satu dari 5 hari terakhir adalah hari gain % TERBESAR di seluruh run
   DAN volume hari itu adalah TERTINGGI dalam 20 hari terakhir
   → Climax Top terdeteksi
```

**Tindakan:** Jual semua atau mayoritas posisi segera. Ini adalah sinyal paling serius.

---

#### 2. Upper BB 3d+ (Upper Bollinger Band 3 Hari Berturut-turut)

**Definisi:** Harga berada **di atas Bollinger Band atas** (SMA20 + 2×StdDev) selama 3 hari atau lebih berturut-turut.

Bollinger Band atas adalah batas statistik di mana harga secara historis cenderung kembali ke mean (rata-rata). Ketika harga bertahan di atas band selama 3+ hari, saham berada dalam kondisi **overbought ekstrem** — biasanya diikuti koreksi atau reversal tajam.

**Cara deteksi:**
```
BB Atas   = SMA(20) + 2 × StdDev(20)
Hitungan  = Berapa hari berturut-turut close > BB Atas (dari hari ini ke belakang)
→ Jika ≥ 3 hari → Upper BB 3d+
```

**Tindakan:** Trim 30–50% posisi, perketat stop loss. Berbeda dari Climax Top, sinyal ini bisa muncul di tengah run (bukan harus di puncak).

---

#### 3. 7% Stop Breach

**Definisi:** Harga sudah turun **lebih dari 7% di bawah pivot point** yang menjadi basis entry. Ini adalah aturan stop loss **tidak dapat dikompromikan** dari Minervini.

> *"I never lose more than 7-8% on any trade, ever. This is non-negotiable."* — Mark Minervini

Ketika harga turun 7–8% dari pivot breakout, berarti setup sudah **invalidated**: breakout tersebut kemungkinan besar palsu (failed breakout), atau ada perubahan kondisi yang tidak terlihat sebelumnya. Keluar dari posisi melindungi kapital untuk setup berikutnya.

**Cara deteksi:**
```
Pivot Point = high tertinggi dari lookback sesuai pola (HTF=15h, VCP=20h, Flat=25h, dll)
→ Jika harga saat ini < Pivot × 0.93 (turun > 7%) → 7% Stop Breach
```

**Penting:** Ini bukan berarti saham jelek selamanya — mungkin saja fundamental masih bagus. Tapi dari sudut pandang trade management, posisi ini harus ditutup.

---

#### Perbandingan Tiga Sinyal Exit

| Sinyal | Kondisi | Urgensi | Tindakan |
|---|---|---|---|
| **Climax Top** | Hari gain terbesar + volume terbesar setelah run panjang | 🔴 Sangat tinggi | Jual semua segera |
| **Upper BB 3d+** | Harga di atas BB atas ≥ 3 hari berturut | 🟡 Sedang | Trim 30–50%, perketat stop |
| **7% Stop Breach** | Harga turun >7% dari pivot entry | 🔴 Tinggi | Cut loss, keluar sepenuhnya |
| **Breakdown MA50** | Close di bawah MA50 | 🟡 Sedang | Waspadai perubahan trend |
| **OBV Divergence** | Harga buat new high tapi OBV buat lower high (20 hari vs 20 hari sebelumnya) | 🟡 Sedang | Trim posisi, distribusi tersembunyi |
| **Support Breakdown** | Harga turun di bawah base low 25 hari (exclude 5 hari terakhir) | 🔴 Tinggi | Setup invalidated, exit |

> **Catatan implementasi:** Di `screen.ts`, sinyal exit muncul di output `--detail KODE` untuk saham Stage 2 yang lolos screening. Kemunculannya berarti saham punya skor bagus tetapi ada **peringatan manajemen posisi** yang perlu diperhatikan. Sinyal Climax Top & Upper BB 3d+ memberikan penalty multiplicative (×0.5) pada AutoScore; sinyal lainnya memberikan penalty additive (−6 hingga −12 poin).

---

### Entry Plan — Rencana Entry Otomatis (Minervini)

Saat menjalankan `--detail KODE`, screener secara otomatis menghitung **rencana entry Minervini** berdasarkan setup yang terdeteksi.

#### Dua Tipe Entry Plan

| Tipe | Kondisi | Pivot/Entry | Stop Loss |
|------|---------|-------------|-----------|
| **BREAKOUT** | Sinyal breakout atau mendekati pivot | Pivot point (high tertinggi sesuai pola) | 7% di bawah pivot |
| **PULLBACK** | Pullback ke EMA21 terdeteksi | EMA21 saat ini | MA50 atau EMA21 × 93% |
| **—** | Tidak ada setup valid | — | — |

#### Contoh Output (Breakout)

```
═══ Entry Plan ═══
Entry Type     : BREAKOUT
Pivot Point    : Rp 2,150 (Resistance high)
Buy Zone       : Rp 2,150 - 2,258 (+0% to +5%)
Stop Loss      : Rp 2,000 (7% below pivot)
Risk per Share : Rp 150 (7.0%)
Target (1R)    : Rp 2,300 (+7.0%)
Target (2R)    : Rp 2,450 (+14.0%)
Target (3R)    : Rp 2,600 (+20.9%)
R/R Ratio      : 1:3 (jika target 3R)
Position Size  : 333 lot @ Rp 2,150 (risk 2% of Rp 100jt)
```

#### Cara Baca

| Field | Penjelasan |
|-------|-----------|
| **Buy Zone** | Beli di rentang pivot hingga pivot+5% — Minervini: jangan beli lebih dari 5% di atas pivot |
| **Stop Loss** | Titik cut loss wajib. Breakout: 7% di bawah pivot. Pullback: di bawah MA50/EMA21 |
| **Risk per Share** | Selisih entry − stop = risiko per lembar saham |
| **Target 1R/2R/3R** | Target profit sebesar 1×/2×/3× risiko per saham (R-multiple) |
| **R/R Ratio** | Risk-Reward Ratio ideal minimal 1:3 (profit 3× lebih besar dari risiko) |
| **Position Size** | Jumlah lot berdasarkan `Portfolio × RiskPct% / RiskPerShare / Harga / 100` |

Entry Plan section hanya tampil jika setup breakout atau pullback terdeteksi. Gunakan `--portfolio` dan `--risk-pct` untuk kustomisasi position sizing.

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

## Terminal Screener (`screen.ts`)

Alternatif screening via terminal — lebih cepat dari web UI karena query langsung ke SQLite.

### Cara Menjalankan

```bash
# Dari root direktori project
deno run -A screen.ts
```

### Opsi Lengkap

```
--mode technical|fundamental|combined|momentum|breakout|vcp|pullback|smt|auto
--top N              (default: 15)
--min-score N        (default: 0)
--sector "nama"      (filter sektor)
--sort rs|eps|volume|foreign|momentum|atr|smt|auto
--compact            (tabel minimal)
--detail KODE        (checklist lengkap 1 saham)
--auto-detail N      (jumlah saham teratas yang dicetak detail otomatis, default: 3)
--portfolio N        (ukuran portofolio IDR, untuk position sizing)
--risk-pct N         (risiko per trade %, default 1)
--export csv         (output CSV)
--output file.csv    (simpan ke file)
--watchlist save|load|show|compare <nama>
--alert set|list|clear
--backtest KODE --days N
```

### Contoh Penggunaan

```bash
# Screening harian — top 20 saham terbaik
deno run -A screen.ts --top 20

# Hanya saham yang sedang breakout
deno run -A screen.ts --mode breakout

# Hanya VCP
deno run -A screen.ts --mode vcp

# Pullback ke EMA21 (beli di area support)
deno run -A screen.ts --mode pullback

# Urutkan berdasarkan Momentum Factor
deno run -A screen.ts --mode momentum --top 15

# Filter sektor + minimum score
deno run -A screen.ts --sector "Financials" --min-score 65

# Detail saham + position sizing
deno run -A screen.ts --detail BBRI --portfolio 100000000 --risk-pct 1

# Urutkan RS Rank tertinggi
deno run -A screen.ts --sort rs --top 20

# Export ke CSV
deno run -A screen.ts --export csv --output screening.csv

# Simpan hasil ke watchlist
deno run -A screen.ts --watchlist save harian

# Bandingkan skor sekarang vs tersimpan
deno run -A screen.ts --watchlist compare harian

# Set alert harga
deno run -A screen.ts --alert set BBRI price_above 5000
deno run -A screen.ts --alert set TLKM rs_above 80
deno run -A screen.ts --alert list

# Cek alert otomatis (saat run normal)
deno run -A screen.ts

# Backtest sederhana
deno run -A screen.ts --backtest BBRI --days 30

# Smart Money Tracker — semua saham berdasarkan SMT score (≥20)
deno run -A screen.ts --mode smt --top 20

# SMT hanya yang BUY atau STRONG BUY
deno run -A screen.ts --mode smt --min-score 55 --top 15

# SMT diurutkan berdasarkan SMT score
deno run -A screen.ts --mode smt --sort smt --top 20

# SMT diurutkan berdasarkan foreign flow
deno run -A screen.ts --mode smt --sort foreign --top 20

# SMT detail saham dengan section Smart Money + Broker Activity
deno run -A screen.ts --detail BBRI

# Auto Mode — screening terpadu otomatis (AutoScore komposit)
deno run -A screen.ts --mode auto

# Auto Mode top 20, cetak detail 5 saham teratas
deno run -A screen.ts --mode auto --top 20 --auto-detail 5

# Auto Mode dengan minimum AutoScore 50
deno run -A screen.ts --mode auto --min-score 50
```

### Interpretasi Output

```
#   Kode   Nama                  Score  Tech  Fund  Stage  RS  Pola  Entry Signals
1   BBRI   Bank Rakyat Indonesia  75.2  78.5  70.1  S2      85  VCP   BKT, PP, RS-NH, Akum
```

| Kolom | Arti |
|---|---|
| Score | Skor sesuai mode (Combined = 60% Tech + 40% Fund) |
| Stage | S2 = ideal (hijau), S1 = ok (kuning), S3/S4 = dihindari |
| RS | Relative Strength Rank 1–99 (cari ≥70, terbaik ≥85) |
| Pola | VCP (ungu) atau — |
| BKT | Breakout aktif (pivot terlampaui + vol ≥1.5×) |
| APR | Mendekati pivot (dalam 3%) |
| PP | Pocket Pivot (dalam 5 hari terakhir) |
| RS-NH | RS Line New High |
| PB | Pullback ke EMA21 |
| Akum | Volume Akumulasi (CMF + OBV + MFI) |
| Shakeout | Undercut MA50 dan recover |
| SMT | Smart Money Tracker score 0–100 (mode smt) |
| For5d | Net foreign 5 hari terakhir (mode smt) |
| Streak | Hari berturut-turut asing net-buy (mode smt) |
| TxChg | Perubahan avg ukuran transaksi 5d vs 20d (mode smt) |

### Best Practice: Alur Screening Harian

Panduan step-by-step untuk memaksimalkan terminal screener. Urutan dirancang dari **saringan kasar → presisi → keputusan**, mengikuti prinsip Minervini: *"Cast a wide net, then narrow down aggressively."*

#### Langkah 1 — Cek Alert & Gambaran Umum

```bash
deno run -A screen.ts
```

**Tujuan:** Melihat top 15 saham combined score tertinggi + alert yang terpicu sejak kemarin. Output ini memberi gambaran pasar secara keseluruhan — apakah banyak Stage 2 yang muncul (pasar bullish) atau sedikit (pasar lemah).

**Yang diperhatikan:**
- Alert yang muncul (kuning) di atas tabel — segera cek saham tersebut
- Follow-Through Day status — apakah pasar dalam kondisi bullish confirmation
- Berapa total kandidat yang lolos filter (tertulis di header: "X kandidat (Y lolos filter)")

#### Langkah 2 — Saringan Lebar: Top Combined + Momentum

```bash
deno run -A screen.ts --top 30
deno run -A screen.ts --mode momentum --top 20
```

**Tujuan:** Lihat 30 saham terbaik secara keseluruhan (teknikal + fundamental), lalu bandingkan dengan 20 saham momentum terkuat. Saham yang muncul di **kedua daftar** adalah kandidat paling kuat — fundamental solid, momentum sedang naik.

**Tips:** Perhatikan kolom **Entry Signals** — saham dengan sinyal BKT (breakout), PP (pocket pivot), atau RS-NH (RS line new high) prioritas lebih tinggi.

#### Langkah 3 — Cari Setup Entry: Breakout, VCP, Pullback

```bash
deno run -A screen.ts --mode breakout
deno run -A screen.ts --mode vcp
deno run -A screen.ts --mode pullback
```

**Tujuan:** Cari saham dengan **timing entry yang tepat** — bukan hanya bagus secara umum, tapi sedang berada di titik entry presisi.

| Mode | Kapan Beli | Risiko | Reward |
|------|-----------|--------|--------|
| `breakout` | Hari ini/besok — harga sudah melewati pivot + volume confirm | Sedang (bisa failed breakout) | Tinggi |
| `vcp` | 1–5 hari ke depan — volatilitas sudah menyempit, tinggal trigger | Rendah (stop ketat) | Tinggi |
| `pullback` | Sekarang — harga kembali ke EMA21 support | Rendah (stop di bawah EMA21) | Sedang |

**Best practice:**
- Breakout **tanpa volume** (BKT tapi vol ratio < 1.5×) = curiga, jangan buru-buru
- VCP yang bertepatan dengan pullback = setup paling ideal (supply habis + di area support)
- Pullback di Stage 2 dengan RS ≥ 80 = high probability buy

#### Langkah 4 — Cek Jejak Smart Money

```bash
deno run -A screen.ts --mode smt --top 20
```

**Tujuan:** Cari saham yang sedang diakumulasi oleh asing/institusi. Ini adalah **konfirmasi terkuat** — jika saham dari langkah 2/3 juga muncul di sini dengan SMT score tinggi, probabilitas naik jauh lebih besar.

**Yang diperhatikan:**
| Kolom | Sinyal Kuat |
|-------|------------|
| For5d | Positif (asing net buy) — semakin besar semakin baik |
| Streak | ≥ 5 hari berturut-turut = akumulasi serius, bukan fluktuasi |
| **Akum Window** | ≥ 11/20h beli = akumulasi sustained (lebih andal dari streak) |
| TxChg | ≥ +20% = ukuran transaksi membesar (blok institusional) |
| B/O | ≥ 1.5 = buyer mendominasi order book |
| Akum.Broker | Nama broker muncul = ada institusi yang konsisten beli 20 hari |

**Filter tambahan:**
```bash
# Hanya yang sinyal BUY atau STRONG BUY
deno run -A screen.ts --mode smt --min-score 55

# Urutkan berdasarkan net foreign terbesar
deno run -A screen.ts --mode smt --sort foreign --top 20

# Filter sektor tertentu
deno run -A screen.ts --mode smt --sector "Financials" --top 15
```

#### Langkah 5 — Deep Dive: Detail Saham Kandidat

```bash
deno run -A screen.ts --detail BBRI --portfolio 100000000 --risk-pct 1
```

**Tujuan:** Analisis menyeluruh satu saham yang menarik perhatian dari langkah sebelumnya. Output ini menampilkan **semua checklist Minervini** dalam satu tampilan:

```
Checklist yang harus ✓ (hijau) untuk entry ideal:
  ✓ Stage 2 (Advancing)
  ✓ Trend Template ≥ 6/8
  ✓ RS Rank ≥ 70
  ✓ EPS Growth ≥ 25% YoY
  ✓ RS Line New High
  ✓ Volume Akumulasi
  ✓ Foreign Flow positif
  ✓ SMT Score ≥ 55 (BUY atau lebih)
```

**Section Smart Money:**
- SMT Score dengan bar visual — hijau (≥75), kuning (≥55), merah (<55)
- Foreign Flow detail: net 5d + arah akselerasi (▲/▼)
- Consecutive Buy days — indikator keseriusan asing
- Bid/Offer ratio + label (buyer/seller dominated)

**Section Broker Activity:**
- Konsentrasi Top3 — jika ≥ 60% berarti beberapa broker mendominasi (kuning)
- Nama broker akumulasi — institusi yang konsisten di top-10 selama 20 hari

**Position Sizing (jika `--portfolio` diset):**
- Lot yang aman dibeli sesuai risk management ATR-based
- Stop price berdasarkan ATR × 1.5 atau 7% rule
- Risk per trade dalam Rupiah

**Entry Plan di detail view:**
- Muncul otomatis jika ada setup breakout atau pullback
- Tunjukkan pivot, buy zone (0–5% di atas pivot), stop loss, target 1R/2R/3R, dan lot sizing
- Gunakan `--portfolio 100000000 --risk-pct 2` untuk position sizing 2% risk dari Rp100jt

**Red flags di detail view:**
- Sell Signal muncul (Climax Top / Upper BB 3d+ / 7% Stop / OBV Divergence / Support Breakdown) = **jangan beli**
- Gorengan Score ≥ 30 = waspada manipulasi
- OBV trend "down" + Foreign negatif = distribusi, hindari

#### Langkah 6 — Simpan & Tracking

```bash
# Simpan kandidat hari ini ke watchlist
deno run -A screen.ts --watchlist save harian

# Besok/lusa: bandingkan apakah skor naik atau turun
deno run -A screen.ts --watchlist compare harian

# Set alert untuk saham yang belum breakout tapi mendekati pivot
deno run -A screen.ts --alert set BBRI price_above 5000
deno run -A screen.ts --alert set TLKM rs_above 85

# Cek alert yang aktif
deno run -A screen.ts --alert list
```

**Tujuan:** Jangan langsung beli — simpan dulu, track perkembangan skornya. Saham yang skornya **konsisten naik** selama 2–3 hari lebih reliable daripada yang tiba-tiba muncul.

#### Langkah 7 (Opsional) — Export & Backtest

```bash
# Export hasil screening ke CSV untuk analisis lanjutan
deno run -A screen.ts --mode smt --export csv --output smt_screening.csv

# Backtest: cek apakah saham yang pernah kamu beli sudah profit/loss
deno run -A screen.ts --backtest BBRI --days 30
```

---

#### Ringkasan Alur Harian (Copy-Paste Ready)

```bash
# ══════════════════════════════════════════════════════════
# ALUR SCREENING HARIAN — 5 menit sebelum market buka
# ══════════════════════════════════════════════════════════

# 1. Cek alert + overview pasar
deno run -A screen.ts

# 2. Top saham combined + momentum
deno run -A screen.ts --top 30
deno run -A screen.ts --mode momentum --top 20

# 3. Cari timing entry
deno run -A screen.ts --mode breakout
deno run -A screen.ts --mode vcp
deno run -A screen.ts --mode pullback

# 4. Konfirmasi smart money
deno run -A screen.ts --mode smt --top 20

# 5. Detail saham terbaik + position sizing
deno run -A screen.ts --detail KODE --portfolio 100000000

# 6. Simpan watchlist
deno run -A screen.ts --watchlist save harian
```

---

#### Tips Lanjutan

**Kombinasi mode paling powerful:**

| Situasi | Perintah | Alasan |
|---------|---------|--------|
| Pasar bullish, cari leader | `--mode momentum --sort rs` | RS tinggi + momentum = leader pasar |
| Cari entry low-risk | `--mode pullback` lalu `--detail KODE` | Pullback EMA21 = stop ketat |
| Konfirmasi sebelum beli | `--mode smt --min-score 55` | Pastikan asing/institusi juga beli |
| Evaluasi mingguan | `--watchlist compare minggu_lalu` | Track apakah kandidat membaik/memburuk |
| Saham sektor tertentu | `--sector "Basic Materials" --mode smt` | Filter sektor + cek smart money |

**Prinsip Minervini yang harus diingat:**
1. **Hanya beli Stage 2** — tidak ada pengecualian
2. **RS Rank ≥ 70** — beli saham yang lebih kuat dari pasar, bukan yang "murah"
3. **Volume konfirmasi breakout** — breakout tanpa volume = trap
4. **Cut loss 7%** — jika detail menunjukkan "7% Stop Breach", keluar tanpa berpikir
5. **Saham terbaik muncul di banyak filter** — jika BBRI muncul di top combined, breakout, DAN smt, itu kandidat terkuat

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

**4. Fetch histori broker (untuk Smart Money Tracker)**

```bash
deno task db:fetch-broker          # 60 hari terakhir (default)
deno task db:fetch-broker --days 90  # mundur lebih jauh
```

Mengambil histori top-10 broker per saham per hari dari IDX API. Data ini digunakan untuk mendeteksi broker yang konsisten mengakumulasi di kolom **Akum. Broker** (web + terminal). Jalankan ulang setiap minggu untuk update data terbaru. Langkah ini **opsional** — SMT tetap berfungsi tanpa data broker, hanya skor akan lebih rendah (tanpa bonus +2/+3 pts).

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
| `deno task db:fetch-broker`| [BARU] Fetch histori Top-10 Broker harian (default: 60 hari) |
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

### Data Shareholder KSEI (Phase 8)

Screener menggunakan data shareholder bulanan dari KSEI untuk menghitung **true retail float** dan mendeteksi **shell company risk**.

**Cara update data** (monthly):
1. Download PDF dari website KSEI: `composition_of_stocks_owned_by_investors_DD-MMM-YYYY.pdf`
2. Parse ke TSV: `python scripts/parse_ksei_shareholders.py input.pdf data/shareholders.tsv`
3. Import ke DB: `deno run -A src/server/IngestShareholders.ts data/shareholders.tsv`

**Metrics yang dihitung**:
- **True Retail Float** = 100% - sum(top 10 holders %)
- **Top-1 Concentration** = % holder terbesar
- **Tax-Haven Shell Count** = jumlah holder tipe CP+F yang berdomisili di BVI/Cayman/Mauritius/dll

**Gorengan penalty tambahan**:
| Kondisi | Penalty |
|---------|---------|
| True retail float < 5% | +20 |
| True retail float 5-10% | +10 |
| Top-1 holder > 75% | +10 |
| Tax-haven shell count >= 3 | +15 |

**Contoh FAPA**: True retail float 0,97% + top-1 79,31% + 4 shell BVI = **gorengan +45** total. AutoScore turun dari ~69 ke ~54 (penalti -10 karena gorengan>=45).

---

## Changelog

### 2026-04-08 — Phase 12: Fix VCP False Positive + Entry Plan Stop Loss Bug

**Fix 12A — VCP false positive**:
- **Bug**: `detectVCP` hanya butuh `contractions >= 1` dari 2 transisi — artinya W0→W1 kontrak, tapi W1→W2 justru melebar tetap lolos. Contoh: ASGR W1=16.11%, W2=16.56% (melebar 2.8%) → isVcp=True (salah).
- **Fix**: Ganti ke `allContracting = contractions >= analyzed.length - 1` (semua transisi harus kontrak). Threshold per transisi diperketat dari 15% (×0.85) ke 30% (×0.70), sesuai Minervini tiap leg harus ~30-50% lebih ketat.

**Fix 12B — Entry Plan stop loss di atas entry**:
- **Bug**: `ma50Valid` check mengizinkan `ma50 <= ema21 * 1.05` — MA50 hingga 5% di atas EMA21. Jika MA50 > EMA21, `Math.max(ma50, pctStop)` = MA50 > entry → stop di atas entry → risk negatif.
- **Contoh**: ASGR EMA21=1590, MA50=1607 → stop=1607 > entry=1590 → Risk = -17 (bug).
- **Fix**: Ubah ke `ma50 < ema21` — MA50 hanya valid sebagai stop jika benar-benar di **bawah** entry level.

### 2026-04-08 — Phase 11: Fix Pocket Pivot False Positive

**Bug**: Perhitungan `maxDV` (max down-day volume) dalam Pocket Pivot menggunakan `Array.filter((e, j, a) => j > 0 ...)` dimana `j` adalah indeks dalam **slice**, bukan array penuh. Entry pertama slice (j=0) tidak pernah dievaluasi sebagai down-day, meskipun entry tersebut memang down-day relatif terhadap hari sebelumnya.

**Dampak**: Jika entry volume tinggi jatuh di posisi j=0, maxDV terlalu rendah → Pocket Pivot false positive.

**Contoh**: TOTL 2026-04-08 — 20260317 (vol 6,17jt, turun dari 1000→995) di posisi j=0 → dilewati → maxDV hanya 2,78jt → PP "terdeteksi" padahal vol 2,96jt < 6,17jt.

**Fix**: Ganti slice-based filter → explicit loop yang compare setiap entry terhadap `entries[k-1]` di array penuh.

---

### 2026-04-06 — Phase 10: Bid/Offer Manipulation Resistance

Bid/Offer Ratio sebelumnya bisa memberi sinyal palsu pada saham illikuid/shadow-owned karena:
- Spoofing: order beli besar yang tidak niat eksekusi menggembungkan bid volume di EOD snapshot
- Saham free float <5% (seperti FAPA): satu order 5 ribu lot sudah geser rasio dari 1.0 ke 5.0
- Sinyal "foreign accumulating" dari shell BVI dihitung sebagai institutional smart money

**Perubahan**:
- 5-day consistency check: 3d aggregate tinggi tapi hanya 1 dari 5 hari tinggi → score −5
- Float-aware discount: float <5% →×0.2, <10% →×0.5, <15% →×0.75 pada final score
- Shell penalty: tax-haven shell holders ≥2 →×0.5 tambahan
- bullishCount increment hanya jika final score ≥7 (bukan raw ratio ≥1.5)
- Reliability label di detail output: HIGH (hijau) / MEDIUM (kuning) / LOW / SUSPECT (merah)
- SUSPECT + LOW → warning banner di detail

**Contoh impact FAPA** (float 0.97%, 4 BVI shells):
- Raw bid/offer ratio tetap 4.60 (tidak diubah — data real)
- Score: 10 →×0.2 (float) →×0.5 (shell) = **1 pt** (dari sebelumnya 10 pts)
- Label: **[SUSPECT]** dengan warning spoofing risk
- Tidak count sebagai bullish signal → SMT score drop ~9+ pts

Saham IDX30/LQ45 dengan float >40% tidak terpengaruh (reliability HIGH, behavior identik).

---

### 2026-04-06 — Phase 9: Detail Mode Bypass Filters

`--detail KODE` sekarang dapat menampilkan profil lengkap untuk **semua stage** (1, 2, 3, 4) dan **saham gorengan**. Sebelumnya hanya saham yang lolos filter screening yang bisa dilihat detail-nya.

**Perubahan**:
- Stage 3/4 filter + gorengan filter di-bypass jika `code === detailCode`
- Warning banner tampil di detail output untuk Stage 1/3/4 dan gorengan
- Entry Plan untuk Stage ≠ 2 ditampilkan dengan warning "INFO ONLY"

**Kegunaan**:
- Riset shareholder structure untuk saham apapun (pair dengan Phase 8)
- Pre-watch list analysis (Stage 1 emerging)
- Post-mortem saham yang sudah topping/declining
- Inspeksi gorengan untuk memahami red flag

Summary table (`--mode auto --top N`) tetap menerapkan filter lengkap — bypass hanya berlaku untuk target `--detail` spesifik.

---

### 2026-04-05 — Phase 8: Shareholder Quality Filter

Tambah deteksi structural ownership risk dari data KSEI bulanan:
- Parse PDF KSEI ke TSV ke SQLite (Python + Deno pipeline)
- Hitung true retail float, top-1 concentration, tax-haven shell count
- Gorengan penalty baru: float <5% (+20), float <10% (+10), top-1 >75% (+10), >=3 shell entities (+15)
- Detail output tampilkan top 8 holders dengan flag [F] foreign & [SHELL] untuk tax-haven BVI/Cayman entities

Temuan: FAPA punya true retail float hanya 0,97% (79,31% Prinsep + 6,98% Fangiono Perkasa Sejati + 3,98% treasury + 4 shell BVI @ ~2%). Screener sebelumnya rank FAPA #1 dengan autoScore ~69 tapi tidak bisa deteksi risiko struktural ini. Setelah Phase 8: gorenganScore naik ke 45, autoScore turun ke 54 (penalti -10 karena gorengan>=45), FAPA tetap muncul di list tapi dengan warning Gorengan yang jelas.

---

### 2026-04-05 — Phase 7: Stage Gating + Regime-Aware Scoring

Tiga fix desain yang ditemukan dari evaluasi output top 10 pasca-Phase 6:

| # | Fix | Dampak |
|---|-----|--------|
| 7A | **Stage Quality Multiplier** — ganti `stage2Bonus +5` additive → multiplicative: S2=×1.0, S1=×0.80, S3=×0.60, S4=×0.40 | Stage 1/3/4 tidak lagi bisa rank setara Stage 2; sesuai Minervini "never buy outside Stage 2" |
| 7B | **Sell Penalty dikuatkan** — `ma50: 6→15`, `stop: 12→20`, `supportBreak: 10→15`, `obvDiv: 8→10` | Stock dengan Breakdown MA50 keluar dari top ranking (bukan sekadar warning) |
| 7C | **Regime-Adaptive Filter** — `filterThreshold` dari single `30` → object `{ bear: 40, neutral: 30, bull: 25 }` | Di BEAR: 135 kandidat → ~17 (hanya saham terkuat), di BULL: lebih permisif (25) |

**Contoh dampak konkret** (BEAR regime, data 2026-04-02):

| Saham | Pre-Phase 7 | Post-Phase 7 | Alasan |
|-------|-------------|--------------|--------|
| FAPA (Stage 2) | #1 / score 69 | #1 / score ~69 | Stage 2 ×1.0, tidak berubah |
| TAPG (Stage 1) | #2 / score 62 | keluar top list | ×0.80 → 50, di bawah threshold 40 |
| ADMR (Stage 2, MA50 break) | #4 / score 61 | #10 / score 47 | penalty –15 (bukan –6) |

Header otomatis menampilkan threshold aktif:
```
[PERINGATAN] IHSG dalam fase BEAR — filter autoScore≥40, kurangi eksposur.
```

---

### 2026-04-05 — Phase 6: Audit Hardening

Perbaikan 8 isu yang ditemukan dari audit mendalam post Phase 1-5:

| # | Fix | Dampak |
|---|-----|--------|
| 6A | FVG boundary: hapus buffer `×1.02` arbitrer | Price harus strictly dalam zone `[bottom, top]` |
| 6B | Climax Top: `===` float → epsilon `1e-9` | Hindari false negative akibat floating-point rounding |
| 6C | OBV Divergence: 40d → 60d lookback + konfirmasi 2-of-3 hari | Kurangi false positive dari noise harian |
| 6D | Parabolic extension: hapus dari gorengan score | Extension = penalty kontinyu (autoScore ×), bukan exclusion keras |
| 6E | **Bear Market Regime Detection** | IHSG MA200 slope + drawdown →  label BEAR/BULL di header + warning merah |
| 6F | Support Breakdown: cek `yesterdayClose >= baseLow` | Hindari trigger retroaktif untuk base panjang |
| 6G | Sell penalty config: nilai positif + `−=` | Kode lebih mudah dibaca, numeric output identik |
| 6H | Entry Plan MA50 stop: validasi ≥90% EMA21 | MA50 yang terlalu jauh di bawah EMA21 tidak dipakai sebagai stop |

**Bear Market Regime Detection:**
```
Pasar: BEAR (drawdown -18.3%) → [PERINGATAN] IHSG dalam fase BEAR
Pasar: Follow-Through Day AKTIF  → (jika FTD aktif, label normal digantikan)
Pasar: Normal / BULL             → kondisi non-bear
```
Trigger bear: MA200 slope < -2% ATAU drawdown dari 252d high < -15%.

---

### 2026-04-04 — Robustness Overhaul + Entry Plan Feature

Audit menyeluruh `screen.ts` menemukan kelemahan struktural. Semua diperbaiki dalam 5 fase:

#### Phase 1 — Centralized Config (`SCREEN_CONFIG`)

Seluruh ~40+ magic number dipindahkan ke satu objek `SCREEN_CONFIG` di awal file. Setiap threshold kini memiliki nama deskriptif dan mudah disesuaikan untuk backtesting:

```typescript
SCREEN_CONFIG.breakout.stopPct          // 0.07 → stop loss 7%
SCREEN_CONFIG.auto.filterThreshold      // 30 → AutoScore minimum (naik dari 25)
SCREEN_CONFIG.entryPlan.buyZoneMaxPct   // 0.05 → buy zone maks 5% di atas pivot
SCREEN_CONFIG.mjp.largeCap              // 0.01 → slope threshold large-cap MJP
```

AutoScore filter threshold **naik dari 25 → 30** (lebih selektif).

#### Phase 2 — Dokumentasi Format EPS

Tambah JSDoc di `calcQEps` menjelaskan bahwa `profitAttrOwner` adalah **YTD kumulatif** (Q2 = Jan–Jun, bukan Q2 saja). Formula subtraksi yang ada sudah benar tapi tidak terdokumentasi — kini ada penjelasan lengkap beserta referensi ke TTM formula di `DataEnrichment.ts`.

#### Phase 3 — Date Gap Detection (OHLCV)

Deteksi otomatis gap data abnormal di OHLCV (misalnya data broker hilang untuk saham tertentu). Fitur **smart holiday filtering**: sistem membandingkan gap yang dialami ≥80% saham (libur pasar seperti Lebaran) dan hanya memperingatkan gap yang **per-saham** (data benar-benar missing).

Output: `[INFO] 7 market-wide gap (libur) terdeteksi, diabaikan` + `[WARN]` hanya untuk gap anomali.

#### Phase 4 — 2 Sinyal Exit Baru

| Sinyal | Cara Deteksi | AutoScore Penalty |
|--------|-------------|-------------------|
| **OBV Divergence** | Harga buat new high 20d tapi OBV buat lower high 20d | −8 pts |
| **Support Breakdown** | Harga di bawah base low 25 hari (exclude 5 hari terakhir) | −10 pts |

Total sinyal exit kini **6** (dari 3 sebelumnya). Lihat bagian Selling Rules.

#### Phase 5 — Entry Plan Feature (🆕)

`--detail KODE` kini menampilkan **rencana entry Minervini** lengkap:

```
═══ Entry Plan ═══
Entry Type     : PULLBACK ke EMA21
Entry Level    : Rp 2460 (EMA21)
Stop Loss      : Rp 2332 (MA50)
Risk per Share : Rp 128 (5.2%)
Target (1R)    : Rp 2588 (+5.2%)
Target (2R)    : Rp 2717 (+10.4%)
Target (3R)    : Rp 2845 (+15.6%)
R/R Ratio      : 1:3 (jika target 3R)
Position Size  : 155 lot @ Rp 2460 (risk 2% of Rp 100.0jt)
```

- **Breakout**: pivot = high tertinggi sesuai pola, buy zone = pivot hingga pivot+5%, stop = pivot−7%
- **Pullback**: entry = EMA21, stop = max(MA50, EMA21×93%)
- **Position sizing**: `Portfolio × RiskPct% / RiskPerShare / Harga / 100` lot

#### Perbaikan Tambahan (dari sesi sebelumnya)

- **Sustained Accumulation SMT**: Kolom "Akum Window" (X/20h beli) lebih andal untuk ADRO-style gradual accumulation vs hanya mengukur akselerasi
- **Adaptive MJP threshold**: Large-cap (vol > median) pakai slope 0.01, small-cap 0.02
- **Gradual fund floor**: AutoScore dikalikan `0.5 + 0.5×((fundScore−20)/15)` untuk fund score 20–35 (tidak lagi cliff)
- **Cross-validation convergence bonus**: +7 pts AutoScore jika volume=akumulasi + foreignNet>5% + broker≥2 semua sejajar

---

### 2026-03-31 — Auto Mode, SMT Parity Fix & Berbagai Koreksi

#### Fitur Baru: `--mode auto` (AutoScore)

Mode screening terpadu baru yang menggabungkan semua sinyal (Combined, Momentum, SMT, Setup) menjadi satu AutoScore (0–100). Output otomatis: tabel ringkas, cetak detail top-N, simpan watchlist harian.

Highlights:
- Setup bonus **stackable**: saham dengan VCP + approaching pivot mendapat kedua bonus (bukan salah satu)
- Sell signal penalty **multiplicative (×0.5)**: saham dengan sell flag tidak bisa ranking tinggi
- Filter minimum **AutoScore ≥ 25**: lebih selektif dari `autoScore > 0` sebelumnya
- Gorengan gradual penalty: −5 (score 30–44) atau −10 (score 45+)
- `--auto-detail N`: kontrol jumlah detail saham yang dicetak otomatis (default 3)

#### Perbaikan Paritas SMT: screen.ts ↔ Server API

- **Broker Concentration Scoring** ditambahkan ke `screen.ts` (sesuai `smart-money.ts` server): top-3 broker volume ≥70%=10pts, ≥60%=7pts, ≥50%=4pts, dengan re-calc `crossSignalScore` saat broker kuat terdeteksi
- **"Foreign distributing" reason** ditambahkan ke terminal (saat `foreignFlowScore ≤ 8`) — sesuai server
- Skor SMT terminal kini **identik** dengan skor SMT web UI

#### Perbaikan Bug `screen.ts`

| # | Bug | Perbaikan |
|---|-----|-----------|
| 1 | `--min-score` untuk `--mode smt` filter pakai `combinedScore` (salah) | Filter berdasarkan `smtScore` |
| 2 | `--min-score` untuk `--mode auto` filter pakai `combinedScore` (salah) | Filter berdasarkan `autoScore` |
| 3 | SMT table: signal label hanya handle `strong-buy`/fallback hijau `BUY` | Handle semua 5 signal dengan warna tepat |
| 4 | ANSI padding offset kolom Akum.Broker: `18+10` seharusnya `18+9` | Diperbaiki — kolom tidak bergeser |
| 5 | Duplikat `/**` di baris pertama file | Dihapus |

---

### 2026-03-31 — Historical Broker Tracking & SMT Scoring Refinement

Fitur baru pelacakan konsentrasi broker historis untuk mendeteksi jejak bandar/institusi dengan presisi lebih tinggi:

#### 1. Historical Broker History (`broker_top_daily`)
- **Skrip Independen:** `deno task db:fetch-broker --days 60` untuk menarik histori top-10 broker harian mundur sejauh N hari. Skrip ini *idempotent* (melanjutkan otomatis yang belum didownload) dan menghemat call API IDX.
- **Frontend UI SMT:** Penambahan kolom baru **"Akum. Broker"** dengan badge hijau untuk broker yang konsisten mengakumulasi selama 20 hari terakhir.
- **API Baru:** Endpoint `/api/[code]/broker-history` untuk menganalisis tren broker spesifik per saham.

#### 2. Upgrade SMT Scoring Engine
- **Broker Accumulation Bonus:** Saham dengan institusi/broker yang terdeteksi mengakumulasi konsisten (+50% presence, rank tinggi, net volume positif) kini mendapat bonus +2 hingga +3 pts pada skor SMT di web dan terminal.
- **Bid/Offer Pressure Refinement:** Diubah dari single-day ratio menjadi **3-day aggregate ratio**. Ini menstabilkan skor dan mengurangi false-positive dari noise harian.
- **Foreign Flow Normalization:** Range normalisasi akselerasi asing diperlebar dari `[-0.1, +0.1]` menjadi `[-0.05, +0.25]`. Full score 30 pts sekarang benar-benar membutuhkan aksi beli asing yang signifikan (bukan hanya 10% volume). Kriteria ini sinkron 100% antara `screen.ts` dan server API.

#### 3. Bug Fix Fundamental Screening (`screen.ts`)
- **[HIGH] EPS & Sales Year Hardcoded:** Diperbaiki bug pencarian EPS dan Sales yang menggunakan array tahun statis `[2025, 2024, 2023, 2022]`. Ini berpotensi merusak skoring setelah tahun berganti ke 2026. Kini menggunakan kalkulasi dinamis berdasarkan `currentYear`.

---

### 2026-03-31 — Fitur SMT + Perbaikan 8 Bug

#### Fitur Baru: Smart Money Tracker (`--mode smt`)

Mode terminal screener baru untuk mendeteksi jejak institusional dan asing:

| Sinyal | Pts | Deskripsi |
|--------|-----|-----------|
| Foreign Flow Momentum | 30 | Akselerasi net-buy asing 5d vs rata-rata 20d |
| Foreign Flow Streak | 10 | Hari berturut-turut asing net-buy |
| OBV Divergence | 15 | OBV naik saat harga turun = akumulasi tersembunyi |
| Trade Size Profile | 20 | Ukuran transaksi naik = blok institusional |
| Bid/Offer Pressure | 10 | Bid vol > Offer vol terbaru |
| Cross-Signal Alignment | 15 | Berapa banyak sinyal di atas aktif serentak |

Sinyal: `≥75 STRONG BUY` · `≥55 BUY` · `≥35 NETRAL` · `≥20 SELL` · `<20 STRONG SELL`

Penggunaan: `deno run -A screen.ts --mode smt` / `--sort smt`

#### Perbaikan Bug

| # | File | Bug | Perbaikan |
|---|------|-----|-----------|
| 1 | `BrokerStockMetrics.ts` | `date` kolom pakai `real` → float equality fragile | Ganti ke `integer('date')` |
| 2 | `BrokerStockMetrics.ts` | `brokerCount` pakai `real` padahal selalu bilangan bulat | Ganti ke `integer('broker_count')` |
| 3 | `broker-flow.ts` | `stockCode` dimasukkan langsung ke URL IDX tanpa encoding | Tambah `encodeURIComponent(stockCode)` |
| 4 | `smart-money.ts` | Komentar header: broker bonus "+5 pts" tidak sesuai kode (max 10 pts) | Koreksi komentar |
| 5 | `SmartMoneyView.tsx` | `onRowClick ?? (() => {})` signature tidak match prop `(code: string) => void` | Ganti ke `(_code: string) => {}` |
| 6 | `screen.ts` | SMT table: `colorScore().padStart(12)` — ANSI escape merusak lebar kolom | Pad angka dulu → baru wrap warna |
| 7 | `screen.ts` | Vol-Price Divergence: branch 'OBV up' bisa double-trigger saat `priceTrend === 'down'` | Tambah guard `&& smtPriceTrend !== 'down'` |
| 8 | `screen.ts` | Help text tidak menyebutkan mode `smt` dan sort `smt` | Tambah `smt` ke daftar `--mode` dan `--sort` |

---

### 2026-03-30 — Perbaikan Bug `screen.ts`

Lima bug ditemukan dan diperbaiki pada terminal screener:

| # | Fungsi | Bug | Dampak | Perbaikan |
|---|--------|-----|--------|-----------|
| 1 | `countBases` | Off-by-one: setelah breakout ditemukan, `i` di-set `winLen+1` lalu `i++` dieksekusi lagi → skip 1 window terlalu jauh | Base count bisa under-count | `i = i + winLen` (tanpa +1, karena `i++` sudah ada) |
| 2 | `calcBBSqueeze` | Parameter `lookback` (default 126 hari) diabaikan — loop scan seluruh histori data | BB Squeeze sangat jarang terdeteksi karena all-time minimum terlalu sulit dilampaui | Loop mulai dari `max(period, closes.length - lookback)` |
| 3 | `volumeSignal` | `accumScoreSimple` double-count CMF: dua dari tiga kriteria buatan berbasis CMF saja (`vC1: cmf>0` dan `cmf>0.05`) | CMF>0.05 saja → sinyal 'akumulasi' tanpa konfirmasi MFI/OBV (false positive) | Gunakan `[vC1, vC2, vC3]` (CMF + MFI + OBV) — tiga indikator independen |
| 4 | `--mode momentum` | Filter `--min-score` dan default sort menggunakan `combinedScore`, bukan `momentumFactor` | `--mode momentum` tidak benar-benar mem-filter dan men-sort berdasarkan Momentum Factor | Semua jalur sort/filter cek `argMode === 'momentum'` → gunakan `momentumFactor` |
| 5 | Tampilan tabel | Kolom Score pada tabel compact & full menggunakan `combinedScore` untuk mode momentum | Kolom Score tampilkan angka yang salah di output terminal `--mode momentum` | Konsisten: `argMode === 'momentum'` → tampilkan `momentumFactor` |

---

## Lisensi

Proyek ini dilisensikan di bawah MIT. Lihat berkas [LICENSE](LICENSE) untuk detail.

> Data bersumber dari IDX. Bukan rekomendasi jual/beli. Gunakan dengan tanggung jawab penuh sebagai alat bantu analisis.
