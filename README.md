<div align="center">

# IDX-STOCK-SEPA

Screener saham Indonesia dengan metode Minervini SEPA: analisis pakai data, bukan feeling.

[![Deno](https://img.shields.io/badge/deno-2.7.4-000000?logo=deno&logoColor=ffcb00)](https://deno.com) [![price](https://img.shields.io/badge/price-free-22c55e)](https://github.com/jatukr-dotcom/IDX-STOCK-SEPA) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## Fitur Utama

- **SEPA Candidates** — Filter kandidat saham berdasarkan kriteria Minervini SEPA (Specific Entry Point Analysis): trend template, RS ranking, EPS growth.
- **Trend Template** — Daftar saham yang memenuhi 8 kriteria trend template Minervini (MA50 > MA150 > MA200, harga di atas semua MA, dll).
- **RS Ranking** — Peringkat kekuatan relatif (Relative Strength) saham terhadap seluruh pasar IDX.
- **New Highs 52W** — Daftar saham yang mencetak harga tertinggi 52 minggu.
- **Volume Akumulasi/Distribusi** — Analisis volume berbasis indikator CMF, MFI, OBV, ADL, dan net foreign flow. Dilengkapi deteksi **VCP (Volatility Contraction Pattern)** otomatis sesuai metode Minervini.
- **Screener** — Filter saham fundamental dan momentum, eksklusi risiko, pagination.
- **Skor komposit** — Skor gabungan value, quality, momentum; bobot diatur; peringkat sektor.
- **Kekuatan sektor** — Pie chart kekuatan sektor, periode 26 atau 52 minggu.
- **Detail saham** — Modal tab fundamental, teknikal (OHLC, RSI, foreign flow), EPS historis, dan Volume A/D (ADL, OBV, CMF, MFI chart).
- **EPS Historis** — Data EPS per kuartal (Q1–Q4) tahun 2022–2025, dihitung dari `profitAttrOwner / shares` (year-end basis) untuk akurasi per saham.
- **Watchlist** — Simpan saham favorit pakai bintang, untuk akses data yang lebih cepat.
- **API + SQLite** — Backend Deno, data di SQLite, cron tiap jam fetch data IDX.

---

## Metodologi Analisis

### SEPA — Specific Entry Point Analysis (Minervini)

SEPA adalah metodologi trading yang dikembangkan Mark Minervini, pemenang U.S. Investing Championship. Fokusnya mencari saham dengan **fundamental kuat + teknikal super** sebelum breakout besar.

**Skor SEPA (0–100):**
| Komponen | Bobot | Penjelasan |
|---|---|---|
| Trend Template | 40% | Jumlah kriteria terpenuhi / 8 |
| RS Rank | 35% | Peringkat RS / 99 |
| Fundamental (ROE + NPM) | 25% | ROE hingga 30% + NPM hingga 20% |

---

### Trend Template (8 Kriteria)

Saham layak dipertimbangkan hanya jika struktur tren teknikal sudah terbentuk:

| # | Kriteria | Arti |
|---|---|---|
| 1 | Harga > MA150 & MA200 | Saham di atas rata-rata jangka menengah & panjang |
| 2 | MA150 > MA200 | Tren menengah lebih kuat dari tren panjang |
| 3 | MA200 trending naik | Tren jangka panjang sedang meningkat (slope positif) |
| 4 | MA50 > MA150 & MA200 | Tren jangka pendek memimpin |
| 5 | Harga > MA50 | Saham di atas rata-rata 50 hari |
| 6 | Harga ≥ 30% di atas low 52w | Sudah bangkit dari titik terendah |
| 7 | Harga dalam 25% dari high 52w | Dekat area kekuatan, bukan saham lemah |
| 8 | RS Rank ≥ 70 | Lebih kuat dari 70% saham IDX lainnya |

---

### RS Ranking — Relative Strength (Minervini)

Mengukur kekuatan harga saham dibanding seluruh pasar IDX dalam 4 periode:

```
RS Score = (Return 3 bln × 40%) + (Return 6 bln × 20%) + (Return 9 bln × 20%) + (Return 12 bln × 20%)
RS Rank  = Persentil RS Score di seluruh saham IDX (1 = terlemah, 99 = terkuat)
```

Minervini mensyaratkan RS Rank ≥ 70 sebelum membeli. Saham dengan RS Rank ≥ 90 adalah kandidat terkuat.

---

### Volume Akumulasi & Distribusi

Analisis volume mengungkap apakah **uang besar sedang masuk (akumulasi) atau keluar (distribusi)** — sesuatu yang tidak terlihat dari harga saja.

#### ADL — Accumulation/Distribution Line

Mengukur tekanan beli vs jual berdasarkan posisi harga penutupan dalam range High-Low hari itu.

```
Money Flow Multiplier (MFM) = [(Close − Low) − (High − Close)] / (High − Low)
Money Flow Volume            = MFM × Volume
ADL                          = Kumulatif dari Money Flow Volume
```

- MFM mendekati **+1** → close mendekati high = tekanan beli kuat
- MFM mendekati **−1** → close mendekati low = tekanan jual kuat
- ADL **naik** saat harga datar/turun = divergensi bullish (akumulasi tersembunyi)

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

OBV trend **naik** mengkonfirmasi tren harga naik. OBV trend **turun** saat harga naik = peringatan distribusi.

#### MFI — Money Flow Index (14 hari)

RSI berbasis volume — mengukur tekanan beli/jual menggunakan nilai transaksi (bukan hanya harga):

```
Typical Price (TP) = (High + Low + Close) / 3
Raw Money Flow     = TP × Volume
Positive MF        = Σ Raw MF hari-hari TP naik (14 hari)
Negative MF        = Σ Raw MF hari-hari TP turun (14 hari)
MFI                = 100 − [100 / (1 + Positive MF / Negative MF)]
```

| Nilai MFI | Interpretasi |
|---|---|
| > 80 | Overbought — potensi koreksi |
| 40 – 80 | Normal — kondisi sehat |
| < 30 | Oversold — potensi pembalikan naik |

---

### VCP — Volatility Contraction Pattern (Minervini)

VCP adalah pola konsolidasi sehat sebelum breakout besar. Minervini menyebutnya sebagai "tanda tangan" saham yang akan bergerak besar.

**Ciri-ciri VCP:**
1. Saham sudah dalam uptrend (dekat high 52 minggu, dalam 20%)
2. Terjadi 2–4 koreksi yang **semakin kecil** (contraction): misal −20%, −12%, −6%
3. **Volume semakin menyusut** di setiap koreksi — menunjukkan supply berkurang
4. Koreksi terakhir sangat ketat (tight base) — tekanan jual habis

**Deteksi otomatis dalam aplikasi** membagi 60 hari terakhir menjadi 3 jendela 20 hari dan memeriksa:
- Range harga setiap jendela semakin menyempit (≥15% lebih ketat)
- Volume rata-rata jendela terakhir < 75% jendela pertama
- Harga dalam 20% dari high 52 minggu

---

### EPS Historis per Kuartal

Data EPS dihitung ulang menggunakan formula year-end shares untuk konsistensi antar kuartal:

```
Shares       = profitAttrOwner_Q4 / EPS_Q4   (basis year-end, bukan weighted average)
EPS_Q1       = profitAttrOwner_Q1 / Shares
EPS_Q2       = (profitAttrOwner_Q2 − profitAttrOwner_Q1) / Shares
EPS_Q3       = (profitAttrOwner_Q3 − profitAttrOwner_Q2) / Shares
EPS_Q4       = (profitAttrOwner_Q4 − profitAttrOwner_Q3) / Shares
```

- Menggunakan `profitAttrOwner` (laba yang diatribusikan ke pemilik) — bukan total laba konsolidasi
- Jika Q4 tahun berjalan belum tersedia, fallback ke Q4 tahun sebelumnya
- Data bersumber langsung dari IDX API endpoint financial ratio

---

## Instalasi

**Prasyarat:** [Git](https://git-scm.com/install/windows) (untuk clone) dan [Deno](https://docs.deno.com/runtime/getting_started/installation/) (sebagai runtime)

**1. Clone repo**

```bash
git clone https://github.com/jatukr-dotcom/IDX-STOCK-SEPA.git
cd IDX-STOCK-SEPA
```

**2. Setup database**

Dari root proyek, jalankan:

```bash
deno task db:generate
deno task db:push
deno task db:init
```

- `db:generate` — buat file migrasi SQL dari schema, saat pertama kali.
- `db:push` — menerapkan skema ke SQLite (membuat/update tabel).
- `db:init` — mengisi data 2 tahun penuh (jalankan sekali saat setup awal).

**3. Fetch data EPS historis (2022–2025)**

```bash
deno task db:fetch-eps
```

Mengambil data EPS Q1–Q4 untuk semua saham dari IDX API. Cukup dijalankan sekali (data historis tidak berubah). Jalankan ulang setiap kuartal baru tersedia.

## Cara Menjalankan

### Production

```bash
deno task ui:build && deno task api:serve
```

Akses di `http://127.0.0.1:50270` atau `http://localhost:50270`.

> [!IMPORTANT]
> Cronjob akan otomatis mengambil data setiap jam (jadwal: menit 0).

### Development

**Terminal 1 — API:**

```bash
deno task api:dev
```

**Terminal 2 — UI:**

```bash
deno task ui:dev
# Akses di `http://127.0.0.1:50260`
```

## Tasks

| Perintah | Keterangan |
|---|---|
| `deno task api:serve` | Jalankan API server (production) |
| `deno task api:dev` | Jalankan API server dengan watch mode |
| `deno task ui:build` | Build UI untuk production |
| `deno task ui:dev` | Jalankan UI dev server |
| `deno task db:push` | Terapkan skema ke database |
| `deno task db:init` | Isi data awal (2 tahun penuh, jalankan sekali) |
| `deno task db:update` | Fetch hanya tanggal yang belum ada di DB |
| `deno task db:fetch-eps` | Fetch data EPS historis Q1–Q4 dari IDX |
| `deno task check` | Format, lint, dan typecheck |

## Lisensi

Proyek ini dilisensikan di bawah MIT. Lihat berkas [LICENSE](LICENSE) untuk detail.
