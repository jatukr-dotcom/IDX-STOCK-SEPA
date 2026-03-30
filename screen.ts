/**
 * IDX Screener — Terminal Screening Tool
 * Jalankan: deno run -A screen.ts [options]
 *
 * Options:
 *   --mode technical|fundamental|combined  (default: combined)
 *   --top N                                (default: 15)
 *   --min-score N                          (default: 0)
 *   --sector "nama sektor"                 (default: semua)
 *   --detail KODE                          (default: tidak ada)
 *
 * Contoh:
 *   deno run -A screen.ts
 *   deno run -A screen.ts --mode technical --top 10
 *   deno run -A screen.ts --detail BBRI
 *   deno run -A screen.ts --sector "Financials" --min-score 70
 */

import { createClient } from 'npm:@libsql/client'

// ─── Types ───────────────────────────────────────────────────────────────────

type StageNumber = 1 | 2 | 3 | 4

type ScreenRow = {
  code: string
  name: string | null
  sector: string | null
  price: number
  stage: StageNumber
  rsRank: number
  sepaScore: number
  techScore: number
  fundScore: number
  combinedScore: number
  gorenganScore: number
  epsGrowthPct: number | null
  roe: number | null
  der: number | null
  trendCriteriaCount: number
  hasRsLineNewHigh: boolean
  hasPocketPivot: boolean
  patternType: string
  setupType: string
  volumeSignal: string
  cmf: number | null
  obvTrend: string
  reasons: string[]
}

// ─── DB setup ────────────────────────────────────────────────────────────────

const dbPath = new URL('./data/database.sqlite', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const client = createClient({ url: `file:${dbPath}` })

async function query<T>(sql: string, args: (string | number | null)[] = []): Promise<T[]> {
  const result = await client.execute({ sql, args })
  return result.rows as unknown as T[]
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function calcMA200SlopePct(closes: number[]): number | null {
  const ma200 = calcMA(closes, 200)
  if (ma200 == null || closes.length < 222) return null
  const older = closes.slice(0, closes.length - 22)
  const ma200old = calcMA(older, 200)
  if (ma200old == null || ma200old <= 0) return null
  return ((ma200 - ma200old) / ma200old) * 100
}

function determineStage(
  price: number,
  ma50: number | null,
  ma150: number | null,
  ma200: number | null,
  slopePct: number | null
): StageNumber {
  const PROX = 0.99
  if (ma200 == null) {
    if (ma50 != null && price > ma50 * PROX && (ma150 == null || ma50 > ma150 * PROX)) return 2
    return 1
  }
  const ma200up = slopePct != null && slopePct > 0
  if (ma50 != null && ma150 != null && price > ma50 * PROX && ma50 > ma150 * PROX && ma150 > ma200 * PROX && ma200up) return 2
  if (price < ma200 * (2 - PROX) && !ma200up) return 4
  if (ma50 != null && (price < ma50 * (2 - PROX) || (ma150 != null && ma150 < ma200 * (2 - PROX)))) return 3
  return 1
}

function determineStageConfirmed(closes: number[]): StageNumber {
  if (closes.length < 50) return 1
  const confirmDays = 5
  const majority = 3
  const maxOffset = Math.min(confirmDays, closes.length - 222)
  if (maxOffset < 1) {
    const p = closes[closes.length - 1]!
    return determineStage(p, calcMA(closes, 50), calcMA(closes, 150), calcMA(closes, 200), calcMA200SlopePct(closes))
  }
  const votes: StageNumber[] = []
  for (let offset = 0; offset < Math.min(confirmDays, maxOffset + 1); offset++) {
    const sl = closes.slice(0, closes.length - offset)
    if (sl.length < 50) break
    const p = sl[sl.length - 1]!
    votes.push(determineStage(p, calcMA(sl, 50), calcMA(sl, 150), calcMA(sl, 200), calcMA200SlopePct(sl)))
  }
  if (votes.length === 0) return 1
  const counts = new Map<StageNumber, number>()
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1)
  for (const [stage, count] of counts) if (count >= majority) return stage
  return votes[0]!
}

function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) return null
  return ((current - past) / past) * 100
}

// ─── EPS helpers ─────────────────────────────────────────────────────────────

type HistRow = { year: number; quarter: number; eps: number | null; profitAttrOwner: number | null; sales: number | null }

function calcQEps(byKey: Map<string, HistRow>, year: number, quarter: number): number | null {
  const row = byKey.get(`${year}_${quarter}`)
  if (!row || row.profitAttrOwner == null || row.eps == null) return null
  let shares: number | null = null
  const q4c = byKey.get(`${year}_4`)
  if (q4c?.profitAttrOwner != null && q4c.eps != null && q4c.eps !== 0) shares = q4c.profitAttrOwner / q4c.eps
  if (shares == null || shares === 0) {
    const q4p = byKey.get(`${year - 1}_4`)
    if (q4p?.profitAttrOwner != null && q4p.eps != null && q4p.eps !== 0) shares = q4p.profitAttrOwner / q4p.eps
  }
  if (shares == null || shares === 0) return null
  const prev = quarter > 1 ? byKey.get(`${year}_${quarter - 1}`) : null
  return (row.profitAttrOwner - (prev?.profitAttrOwner ?? 0)) / shares
}

function calcEpsInfo(histRows: HistRow[]): { score: number; latestGrowthPct: number | null; acceleration: boolean; consecutiveGrowthQ: number } {
  const byKey = new Map<string, HistRow>()
  for (const r of histRows) byKey.set(`${r.year}_${r.quarter}`, r)
  let latestYear: number | null = null
  let latestQ: number | null = null
  outer: for (const y of [2025, 2024, 2023, 2022]) {
    for (const q of [4, 3, 2, 1]) {
      if (byKey.get(`${y}_${q}`)?.profitAttrOwner != null) { latestYear = y; latestQ = q; break outer }
    }
  }
  if (latestYear == null || latestQ == null) return { score: 0, latestGrowthPct: null, acceleration: false, consecutiveGrowthQ: 0 }
  const curEps = calcQEps(byKey, latestYear, latestQ)
  const pyEps = calcQEps(byKey, latestYear - 1, latestQ)
  let latestGrowthPct: number | null = null
  if (curEps != null && pyEps != null && pyEps !== 0) latestGrowthPct = ((curEps - pyEps) / Math.abs(pyEps)) * 100
  const prevQ = latestQ > 1 ? latestQ - 1 : 4
  const prevY = latestQ > 1 ? latestYear : latestYear - 1
  const prevCurEps = calcQEps(byKey, prevY, prevQ)
  const prevPyEps = calcQEps(byKey, prevY - 1, prevQ)
  let prevGrowthPct: number | null = null
  if (prevCurEps != null && prevPyEps != null && prevPyEps !== 0) prevGrowthPct = ((prevCurEps - prevPyEps) / Math.abs(prevPyEps)) * 100
  const acceleration = latestGrowthPct != null && prevGrowthPct != null && latestGrowthPct > prevGrowthPct
  let consecutiveGrowthQ = 0
  let cy = latestYear; let cq = latestQ
  for (let i = 0; i < 4; i++) {
    const ce = calcQEps(byKey, cy, cq); const pe = calcQEps(byKey, cy - 1, cq)
    if (ce != null && pe != null && ce > pe) { consecutiveGrowthQ++ } else break
    cq--; if (cq === 0) { cq = 4; cy-- }
  }
  let score = 0
  if (latestGrowthPct != null) {
    if (latestGrowthPct >= 25) score += 8
    else if (latestGrowthPct >= 10) score += 5
    else if (latestGrowthPct >= 0) score += 2
  }
  if (acceleration) score += 4
  if (consecutiveGrowthQ >= 2) score += 3
  return { score, latestGrowthPct, acceleration, consecutiveGrowthQ }
}

// ─── Volume helpers ───────────────────────────────────────────────────────────

function calcCMF20(rows: { high: number; low: number; close: number; volume: number }[]): number | null {
  if (rows.length < 20) return null
  const slice = rows.slice(-20)
  let sumMFV = 0; let sumVol = 0
  for (const r of slice) {
    const mfm = r.high === r.low ? 0 : ((r.close - r.low) - (r.high - r.close)) / (r.high - r.low)
    sumMFV += mfm * r.volume; sumVol += r.volume
  }
  return sumVol === 0 ? null : sumMFV / sumVol
}

function calcOBVTrend(rows: { close: number; volume: number }[]): 'up' | 'down' | 'flat' {
  if (rows.length < 20) return 'flat'
  let obv = 0
  const obvSeries: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) { obvSeries.push(0); continue }
    if (rows[i]!.close > rows[i - 1]!.close) obv += rows[i]!.volume
    else if (rows[i]!.close < rows[i - 1]!.close) obv -= rows[i]!.volume
    obvSeries.push(obv)
  }
  const recent = obvSeries.slice(-20)
  const first = recent[0]!; const last = recent[recent.length - 1]!
  const scale = Math.abs(first) || 1; const pct = (last - first) / scale
  if (pct > 0.05) return 'up'
  if (pct < -0.05) return 'down'
  return 'flat'
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function pad(s: string, len: number, right = false): string {
  const str = s.slice(0, len)
  return right ? str.padStart(len) : str.padEnd(len)
}

function fNum(n: number | null, dec = 1): string {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function stageLabel(s: StageNumber): string {
  return ['', 'S1', 'S2', 'S3', 'S4'][s] ?? '??'
}

function colorScore(score: number): string {
  if (score >= 75) return `\x1b[32m${score.toFixed(1)}\x1b[0m`
  if (score >= 55) return `\x1b[33m${score.toFixed(1)}\x1b[0m`
  return `\x1b[90m${score.toFixed(1)}\x1b[0m`
}

function colorStage(s: StageNumber): string {
  if (s === 2) return `\x1b[32m${stageLabel(s)}\x1b[0m`
  if (s === 1) return `\x1b[33m${stageLabel(s)}\x1b[0m`
  return `\x1b[31m${stageLabel(s)}\x1b[0m`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = Deno.args
const mode = (args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'combined') as string
const topN = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : 15
const minScore = args.includes('--min-score') ? Number(args[args.indexOf('--min-score') + 1]) : 0
const sectorFilter = args.includes('--sector') ? args[args.indexOf('--sector') + 1] : null
const detailCode = args.includes('--detail') ? (args[args.indexOf('--detail') + 1] ?? '').toUpperCase() : null

console.log('\x1b[36m\nMemuat data dari database...\x1b[0m')

// Query latest date
const dateRows = await query<{ date: number }>('SELECT date FROM stock_summary ORDER BY date DESC LIMIT 1')
const latestDate = dateRows[0]?.date
if (latestDate == null) {
  console.log('Tidak ada data di database.')
  Deno.exit(1)
}
const dateRef = Number(latestDate)
const dateStart = (() => {
  const s = String(dateRef)
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
  d.setDate(d.getDate() - 420)
  return Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`)
})()

// Query OHLCV
const summaryRows = await query<{
  stock_code: string; date: number; price_close: number; price_high: number; price_low: number
  volume: number; value: number; listed_shares: number | null; tradable_shares: number | null
}>(
  'SELECT stock_code, date, price_close, price_high, price_low, volume, value, listed_shares, tradable_shares FROM stock_summary WHERE date >= ? AND date <= ? ORDER BY stock_code, date',
  [dateStart, dateRef]
)

// Query IHSG proxy
const ihsgRows = await query<{ date: number; ihsg: number }>(
  'SELECT date, SUM(individual_index * weight_for_index) as ihsg FROM stock_summary WHERE date >= ? AND date <= ? AND individual_index IS NOT NULL AND weight_for_index IS NOT NULL GROUP BY date ORDER BY date',
  [dateStart, dateRef]
)
const ihsgByDate = new Map<number, number>()
for (const r of ihsgRows) {
  const v = Number(r.ihsg)
  if (Number.isFinite(v) && v > 0) ihsgByDate.set(Number(r.date), v)
}

// Query screener
const screenerRows = await query<{
  code: string; name: string | null; sector: string | null; market_capital: number | null
  notation: string | null; uma_date: string | null; per: number | null
  roe: number | null; der: number | null; npm: number | null
}>('SELECT code, name, sector, market_capital, notation, uma_date, per, roe, der, npm FROM stock_screener')
const screenerMap = new Map(screenerRows.map((r) => [r.code, r]))

// Query financial history
const finRows = await query<{
  stock_code: string; year: number; quarter: number; eps: number | null; profit_attr_owner: number | null; sales: number | null
}>('SELECT stock_code, year, quarter, eps, profit_attr_owner, sales FROM stock_financial_ratio')
const historyByCode = new Map<string, HistRow[]>()
for (const r of finRows) {
  const list = historyByCode.get(r.stock_code) ?? []
  list.push({ year: r.year, quarter: r.quarter, eps: r.eps, profitAttrOwner: r.profit_attr_owner, sales: r.sales })
  historyByCode.set(r.stock_code, list)
}

// Build OHLCV by code
type OhlcvEntry = { date: number; close: number; high: number; low: number; volume: number; value: number }
const ohlcByCode = new Map<string, OhlcvEntry[]>()
const floatByCode = new Map<string, { listed: number; tradable: number }>()

for (const r of summaryRows) {
  const close = Number(r.price_close)
  if (!Number.isFinite(close) || close <= 0) continue
  const list = ohlcByCode.get(r.stock_code) ?? []
  list.push({ date: Number(r.date), close, high: Number(r.price_high) || close, low: Number(r.price_low) || close, volume: Number(r.volume) || 0, value: Number(r.value) || 0 })
  ohlcByCode.set(r.stock_code, list)
  if (r.listed_shares != null && r.tradable_shares != null) floatByCode.set(r.stock_code, { listed: Number(r.listed_shares), tradable: Number(r.tradable_shares) })
}

// RS Ranks (ascending sort = rank 1 weakest, 99 strongest)
const rsScores = new Map<string, { score: number; rank: number }>()
for (const [code, entries] of ohlcByCode) {
  if (entries.length < 252) continue
  const closes = entries.map((e) => e.close)
  const r3m = returnPct(closes[closes.length - 1]!, closes[closes.length - 63]!)
  const r6m = closes.length >= 126 ? returnPct(closes[closes.length - 1]!, closes[closes.length - 126]!) : null
  const r9m = closes.length >= 189 ? returnPct(closes[closes.length - 1]!, closes[closes.length - 189]!) : null
  const r12m = returnPct(closes[closes.length - 1]!, closes[closes.length - 252]!)
  rsScores.set(code, { score: (r3m ?? 0) * 0.4 + (r6m ?? 0) * 0.2 + (r9m ?? 0) * 0.2 + (r12m ?? 0) * 0.2, rank: 0 })
}
const sortedByRs = Array.from(rsScores.entries()).sort((a, b) => a[1].score - b[1].score)
for (let i = 0; i < sortedByRs.length; i++) {
  rsScores.get(sortedByRs[i]![0])!.rank = Math.max(1, Math.round(((i + 1) / sortedByRs.length) * 99))
}

// ─── Screen each stock ────────────────────────────────────────────────────────

const results: ScreenRow[] = []
const firstIhsg = ihsgByDate.size > 0 ? (ihsgByDate.values().next().value ?? 1) : 1

for (const [code, entries] of ohlcByCode) {
  if (entries.length < 50) continue
  const sc = screenerMap.get(code)
  if (sectorFilter && sc?.sector !== sectorFilter) continue

  const closes = entries.map((e) => e.close)
  const highs = entries.map((e) => e.high)
  const lows = entries.map((e) => e.low)
  const volumes = entries.map((e) => e.volume)
  const lastEntry = entries[entries.length - 1]!
  const price = lastEntry.close

  // Gorengan filter
  let gorenganScore = 0
  if (sc?.notation === 'X') gorenganScore += 40
  if (sc?.uma_date) {
    try {
      const umaTime = new Date(sc.uma_date).getTime()
      const s = String(dateRef)
      const refTime = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`).getTime()
      if (!isNaN(umaTime) && refTime - umaTime < 30 * 24 * 60 * 60 * 1000) gorenganScore += 25
    } catch { /* ignore */ }
  }
  const mc = sc?.market_capital ?? 0
  if (mc < 100_000_000_000) gorenganScore += 25
  else if (mc < 500_000_000_000) gorenganScore += 15
  const floatData = floatByCode.get(code)
  if (floatData && floatData.listed > 0 && floatData.tradable / floatData.listed < 0.20) gorenganScore += 15
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  if (volumes[volumes.length - 1]! > avgVol20 * 10) gorenganScore += 10
  if ((historyByCode.get(code) ?? []).length === 0) gorenganScore += 5
  if (gorenganScore >= 60) continue

  // Stage
  const stage = determineStageConfirmed(closes)
  if (stage === 3 || stage === 4) continue

  // Trend template
  const ma50 = calcMA(closes, 50)
  const ma150 = calcMA(closes, 150)
  const ma200 = calcMA(closes, 200)
  const ma200SlopePct = calcMA200SlopePct(closes)
  const last252e = entries.slice(-252)
  const high52w = Math.max(...last252e.map((e) => e.high))
  const low52w = Math.min(...last252e.map((e) => e.low))
  const rsRank = rsScores.get(code)?.rank ?? 0

  const c1 = ma150 != null && ma200 != null && price > ma150 && price > ma200
  const c2 = ma150 != null && ma200 != null && ma150 > ma200
  const c3 = ma200SlopePct != null && ma200SlopePct > 0
  const c4 = ma50 != null && ma150 != null && ma200 != null && ma50 > ma150 && ma50 > ma200
  const c5 = ma50 != null && price > ma50
  const c6 = low52w > 0 && price >= low52w * 1.3
  const c7 = high52w > 0 && price >= high52w * 0.75
  const c8 = rsRank >= 70
  const trendCriteriaCount = [c1, c2, c3, c4, c5, c6, c7, c8].filter(Boolean).length
  const trendScore = (trendCriteriaCount / 8) * 40
  const rsScore30 = (rsRank / 99) * 30

  // EPS & Fundamental
  const histRows = historyByCode.get(code) ?? []
  const epsInfo = calcEpsInfo(histRows)
  const roe = sc?.roe ?? 0
  const npm = sc?.npm ?? 0
  const der = sc?.der ?? 999
  const per = sc?.per ?? 0

  let fundScoreFull = epsInfo.score
  fundScoreFull += Math.min(roe / 25, 1) * 9 + Math.min(npm / 20, 1) * 6
  if (der <= 0.5) fundScoreFull += 10
  else if (der <= 1.0) fundScoreFull += 7
  else if (der <= 2.0) fundScoreFull += 4
  if (histRows.length > 0) {
    const byKey = new Map(histRows.map((r) => [`${r.year}_${r.quarter}`, r]))
    let lY: number | null = null; let lQ: number | null = null
    salesSearch: for (const y of [2025, 2024, 2023, 2022]) {
      for (const q of [4, 3, 2, 1]) {
        if (byKey.get(`${y}_${q}`)?.sales != null) { lY = y; lQ = q; break salesSearch }
      }
    }
    if (lY && lQ) {
      const cs = byKey.get(`${lY}_${lQ}`)?.sales ?? 0
      const ps = byKey.get(`${lY - 1}_${lQ}`)?.sales ?? 0
      if (ps > 0) {
        const rg = ((cs - ps) / ps) * 100
        if (rg >= 15) fundScoreFull += 10
        else if (rg >= 5) fundScoreFull += 6
        else if (rg >= 0) fundScoreFull += 2
      }
    }
  }
  if (per >= 5 && per <= 20) fundScoreFull += 5
  else if (per > 20 && per <= 30) fundScoreFull += 3
  else if (per > 30 && per <= 50) fundScoreFull += 1

  const sepaScore = Math.min(100, trendScore + rsScore30 + epsInfo.score + Math.min(roe / 25, 1) * 9 + Math.min(npm / 20, 1) * 6)

  // RS Line New High
  let rsLineNewHigh = false
  if (ihsgByDate.size > 0) {
    let rsLine52wHigh = 0; let rsLineCurrent = 0
    for (const e of entries) {
      const ihsg = ihsgByDate.get(e.date)
      if (ihsg == null) continue
      const v = e.close / (ihsg / firstIhsg)
      if (v > rsLine52wHigh) rsLine52wHigh = v
      if (e.date === lastEntry.date) rsLineCurrent = v
    }
    rsLineNewHigh = rsLine52wHigh > 0 && rsLineCurrent >= rsLine52wHigh * 0.999
  }

  // Pocket Pivot (per-day accurate)
  let hasPocketPivot = false
  if (entries.length >= 20) {
    for (let i = entries.length - 5; i < entries.length; i++) {
      if (i <= 10) continue
      const prev = entries[i - 1]!; const cur = entries[i]!
      const ma10i = closes.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10
      const maxDV = Math.max(...entries.slice(i - 10, i).filter((e, j, a) => j > 0 && e.close < a[j - 1]!.close).map((e) => e.volume).concat([0]))
      if (cur.close > prev.close && cur.volume > maxDV && cur.close >= ma10i) { hasPocketPivot = true; break }
    }
  }

  // Base Pattern
  let patternType = 'none'
  if (entries.length >= 25) {
    const last25H = highs.slice(-25); const last25L = lows.slice(-25)
    const rng = Math.max(...last25H) - Math.min(...last25L)
    const mid = (Math.max(...last25H) + Math.min(...last25L)) / 2
    if (mid > 0 && rng / mid <= 0.15) patternType = 'flat'
  }
  if (patternType === 'none' && entries.length >= 55) {
    const poleStartClose = entries[entries.length - 40]!.close
    const poleHigh = Math.max(...highs.slice(-40, -15))
    const poleGain = poleStartClose > 0 ? (poleHigh - poleStartClose) / poleStartClose : 0
    if (poleGain >= 0.80) {
      const flagH = Math.max(...highs.slice(-15)); const flagL = Math.min(...lows.slice(-15))
      if (flagH > 0 && (flagH - flagL) / flagH <= 0.25) patternType = 'htf'
    }
  }

  // Power Play (with volume dry-up)
  let setupType = 'none'
  if (closes.length >= 25) {
    const last5 = closes.slice(-5)
    const rng = Math.max(...last5) - Math.min(...last5)
    const avg = last5.reduce((a, b) => a + b) / 5
    const avgVol5d = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5
    const avgVol20p = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20
    const dryPct = avgVol20p > 0 ? (1 - avgVol5d / avgVol20p) * 100 : 0
    if (avg > 0) {
      if (rng / avg < 0.03 && dryPct > 30) setupType = 'power-play'
      else if (rng / avg < 0.05 && dryPct > 20) setupType = 'low-cheat'
    }
  }

  // Volume A/D signal
  const ohlcvForVol = entries.map((e) => ({ high: e.high, low: e.low, close: e.close, volume: e.volume }))
  const cmf = calcCMF20(ohlcvForVol)
  const obvTrend = calcOBVTrend(ohlcvForVol)
  const accumC1 = cmf != null && cmf > 0
  const accumC2 = obvTrend === 'up'
  const accumC3 = cmf != null && cmf > 0.05
  const distC1 = cmf != null && cmf < -0.05
  const distC2 = obvTrend === 'down'
  const accumScore2 = [accumC1, accumC2, accumC3].filter(Boolean).length
  const distScore = [distC1, distC2].filter(Boolean).length
  const volumeSignal = accumScore2 >= 2 ? 'akumulasi' : distScore >= 2 ? 'distribusi' : 'netral'

  // Tech Score
  let techScore = (sepaScore / 100) * 50
  if (stage === 2) techScore += 20
  else if (stage === 1) techScore += 10
  if (rsLineNewHigh) techScore += 10
  if (hasPocketPivot) techScore += 10
  if (patternType === 'htf') techScore += 6
  else if (patternType === 'flat') techScore += 2
  if (setupType === 'power-play') techScore += 4
  else if (setupType === 'low-cheat') techScore += 2
  techScore = Math.min(100, techScore)

  const finalFundScore = Math.min(100, fundScoreFull)
  const combinedScore = techScore * 0.6 + finalFundScore * 0.4

  const sortScore = mode === 'technical' ? techScore : mode === 'fundamental' ? finalFundScore : combinedScore
  if (sortScore < minScore) continue

  // Reasons
  const reasons: string[] = []
  if (sepaScore >= 60) reasons.push(`SEPA ${Math.round(sepaScore)}, Stage ${stage}, RS ${rsRank}`)
  if (rsLineNewHigh) reasons.push('RS Line New High')
  if (epsInfo.latestGrowthPct != null) {
    let msg = `EPS ${epsInfo.latestGrowthPct >= 0 ? '+' : ''}${epsInfo.latestGrowthPct.toFixed(1)}% YoY`
    if (epsInfo.acceleration) msg += ', akselerasi'
    if (epsInfo.consecutiveGrowthQ >= 2) msg += `, ${epsInfo.consecutiveGrowthQ}Q berturut`
    reasons.push(msg)
  }
  if (roe > 20 || npm > 15) reasons.push(`ROE ${roe.toFixed(1)}%, NPM ${npm.toFixed(1)}%`)
  if (hasPocketPivot) reasons.push('Pocket Pivot')
  if (patternType !== 'none') reasons.push(patternType === 'htf' ? 'High Tight Flag' : 'Flat Base')
  if (setupType !== 'none') reasons.push(setupType === 'power-play' ? 'Power Play' : 'Low Cheat')
  if (volumeSignal === 'akumulasi') reasons.push(`Vol: Akumulasi (CMF ${(cmf ?? 0).toFixed(3)})`)

  results.push({ code, name: sc?.name ?? null, sector: sc?.sector ?? null, price, stage, rsRank, sepaScore, techScore, fundScore: finalFundScore, combinedScore, gorenganScore, epsGrowthPct: epsInfo.latestGrowthPct, roe: roe > 0 ? roe : null, der: der < 999 ? der : null, trendCriteriaCount, hasRsLineNewHigh: rsLineNewHigh, hasPocketPivot, patternType, setupType, volumeSignal, cmf, obvTrend, reasons })
}

// Sort
results.sort((a, b) => {
  const sa = mode === 'technical' ? a.techScore : mode === 'fundamental' ? a.fundScore : a.combinedScore
  const sb = mode === 'technical' ? b.techScore : mode === 'fundamental' ? b.fundScore : b.combinedScore
  return sb - sa
})

// ─── Output ───────────────────────────────────────────────────────────────────

const dateStr = String(dateRef)
const dateFmt = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`

if (detailCode) {
  const row = results.find((r) => r.code === detailCode) ?? (() => {
    // Try from all results (might be filtered out)
    for (const [code, entries] of ohlcByCode) {
      if (code === detailCode) {
        console.log(`\nSaham ${detailCode} ditemukan di database tapi tidak lolos filter screening.`)
        return null
      }
    }
    return null
  })()

  if (!row) {
    console.log(`\nSaham ${detailCode} tidak ditemukan atau dieksklusi (gorengan / Stage 3-4).`)
    Deno.exit(0)
  }

  const line = '─'.repeat(60)
  const dline = '═'.repeat(60)
  console.log(`\n${dline}`)
  console.log(`  DETAIL CHECKLIST — ${row.code} (${row.name ?? '-'})`)
  console.log(`  Sektor: ${row.sector ?? '-'} | Harga: ${row.price.toFixed(0)} | Data: ${dateFmt}`)
  console.log(dline)

  const tick = (v: boolean) => v ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${tick(row.stage === 2)} Stage: ${row.stage === 2 ? '\x1b[32mStage 2 (Advancing)\x1b[0m' : `Stage ${row.stage}`}`)
  console.log(`  ${tick(row.trendCriteriaCount >= 6)} Trend Template: ${row.trendCriteriaCount}/8 kriteria`)
  console.log(`  ${tick(row.rsRank >= 70)} RS Rank: ${row.rsRank} ${row.rsRank >= 70 ? '(≥70 ✓)' : '(< 70)'}`)
  if (row.epsGrowthPct != null) {
    console.log(`  ${tick(row.epsGrowthPct >= 25)} EPS Growth: ${row.epsGrowthPct >= 0 ? '+' : ''}${row.epsGrowthPct.toFixed(1)}% YoY`)
  } else {
    console.log(`  ${tick(false)} EPS Growth: tidak ada data`)
  }
  console.log(`  ${tick((row.roe ?? 0) >= 15)} ROE: ${fNum(row.roe)}%  DER: ${fNum(row.der)}`)
  console.log(`  ${tick(row.hasRsLineNewHigh)} RS Line New High: ${row.hasRsLineNewHigh ? 'Ya' : 'Tidak'}`)
  console.log(`  ${tick(row.hasPocketPivot)} Pocket Pivot: ${row.hasPocketPivot ? 'Ya (dalam 5 hari)' : 'Tidak'}`)
  console.log(`  ${tick(row.patternType !== 'none')} Base Pattern: ${row.patternType === 'none' ? 'Tidak terdeteksi' : row.patternType.toUpperCase()}`)
  console.log(`  ${tick(row.setupType !== 'none')} Power Play/Low Cheat: ${row.setupType === 'none' ? 'Tidak' : row.setupType}`)
  console.log(`  ${tick(row.volumeSignal === 'akumulasi')} Volume: ${row.volumeSignal.toUpperCase()} | CMF: ${fNum(row.cmf, 3)} | OBV: ${row.obvTrend}`)
  console.log(line)
  console.log(`  Skor: Tech=${row.techScore.toFixed(1)} | Fund=${row.fundScore.toFixed(1)} | Combined=${colorScore(row.combinedScore)}`)
  console.log(`  Gorengan Score: ${row.gorenganScore} ${row.gorenganScore < 30 ? '(aman)' : '(waspada)'}`)
  console.log(`\n  Alasan:`)
  for (const r of row.reasons) console.log(`    • ${r}`)
  console.log(dline + '\n')
  Deno.exit(0)
}

// Summary table
const top = results.slice(0, topN)
const dline = '═'.repeat(100)
const line = '─'.repeat(100)

console.log(`\n${dline}`)
console.log(`  IDX SCREENER — Terminal Report`)
console.log(`  Data: ${dateFmt} | Mode: ${mode.toUpperCase()} | Top ${topN} dari ${results.length} kandidat`)
if (sectorFilter) console.log(`  Sektor: ${sectorFilter}`)
console.log(dline)
console.log(`  ${pad('#', 3)} ${pad('Kode', 6)} ${pad('Nama', 22)} ${'Score'.padStart(6)} ${'Tech'.padStart(5)} ${'Fund'.padStart(5)} ${pad('Stage', 5)} ${'RS'.padStart(3)} ${pad('Entry Signals', 30)}`)
console.log(`  ${line.slice(0, 98)}`)

for (let i = 0; i < top.length; i++) {
  const r = top[i]!
  const signals: string[] = []
  if (r.hasPocketPivot) signals.push('PP')
  if (r.hasRsLineNewHigh) signals.push('RS-NH')
  if (r.patternType === 'htf') signals.push('HTF')
  else if (r.patternType === 'flat') signals.push('Flat')
  if (r.setupType === 'power-play') signals.push('PwrPlay')
  else if (r.setupType === 'low-cheat') signals.push('LowCheat')
  if (r.volumeSignal === 'akumulasi') signals.push('Akum')
  if (r.volumeSignal === 'distribusi') signals.push('\x1b[31mDist\x1b[0m')

  const score = mode === 'technical' ? r.techScore : mode === 'fundamental' ? r.fundScore : r.combinedScore
  console.log(
    `  ${pad(String(i + 1), 3)} ${pad(r.code, 6)} ${pad(r.name?.slice(0, 22) ?? '-', 22)} ${colorScore(score).padStart(12)} ${r.techScore.toFixed(1).padStart(5)} ${r.fundScore.toFixed(1).padStart(5)} ${colorStage(r.stage).padStart(11)}  ${String(r.rsRank).padStart(3)}  ${signals.join(', ')}`
  )
}

console.log(dline)
console.log(`  Untuk detail saham: deno run -A screen.ts --detail KODE`)
console.log(`  Opsi: --mode technical|fundamental|combined --top N --min-score N --sector "nama"`)
console.log(dline + '\n')

client.close()
