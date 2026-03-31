/**
 * IDX Screener — Terminal Screening Tool
 * Jalankan: deno run -A screen.ts [options]
 *
 * Options:
 *   --mode technical|fundamental|combined|momentum|breakout|vcp|pullback|smt
 *   --top N                                (default: 15)
 *   --min-score N                          (default: 0)
 *   --sector "nama sektor"                 (default: semua)
 *   --detail KODE
 *   --sort rs|eps|volume|foreign|momentum|atr
 *   --compact
 *   --portfolio N                          (default: 0 = disabled)
 *   --risk-pct N                           (default: 1)
 *   --export csv [--output filename.csv]
 *   --watchlist save|load|show|compare <name>
 *   --alert set <CODE> <type> <value>
 *   --alert list
 *   --alert clear <CODE>|all
 *   --backtest <CODE> --days <N>           (default N=30)
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
  baseCount: number
  setupType: string
  volumeSignal: string
  cmf: number | null
  mfi: number | null
  obvTrend: string
  foreignNetPct: number | null
  volSurgePct: number | null
  volCriteriaCount: number
  vcpIsVcp: boolean
  vcpContractions: number
  vcpVolumeDrying: boolean
  reasons: string[]
  // Phase 2 fields
  breakoutSignal: 'breakout' | 'approaching' | 'none'
  pivotPoint: number | null
  breakoutVolRatio: number | null
  shakeoutDetected: boolean
  sellSignal: string | null
  // Phase 3 fields
  atr: number | null
  atrPct: number | null
  bbSqueeze: boolean
  bbWidth: number | null
  momentumFactor: number
  sharpeRatio: number | null
  pullbackSignal: boolean
  ema21: number | null
  // SMT fields
  smtScore: number
  smtSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'
  smtReasons: string[]
  foreignNet5d: number | null
  foreignAcceleration: number | null
  consecutiveForeignBuyDays: number
  avgTradeSize5d: number | null
  avgTradeSizeChange: number | null
  bidOfferRatio: number | null
  // Broker history fields
  accumulatingBrokers: string[]
  brokerConcentrationPct: number | null
}

type WatchlistEntry = { code: string; name: string | null; score: number; rsRank: number; stage: StageNumber }
type WatchlistFile = { date: string; stocks: WatchlistEntry[] }
type AlertEntry = { code: string; type: string; value: number; created: string }

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

function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  const k = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < prices.length; i++) {
    ema = prices[i]! * k + ema * (1 - k)
  }
  return ema
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
  const currentYear = new Date().getFullYear()
  outer: for (const y of [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]) {
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

function detectVCP(
  rows: { high: number; low: number; close: number; volume: number }[]
): { isVcp: boolean; contractions: number; volumeDrying: boolean } {
  if (rows.length < 60) return { isVcp: false, contractions: 0, volumeDrying: false }

  const windows = [
    rows.slice(rows.length - 60, rows.length - 40),
    rows.slice(rows.length - 40, rows.length - 20),
    rows.slice(rows.length - 20)
  ]

  const analyzed = windows.map((w) => {
    const maxH = Math.max(...w.map((r) => r.high))
    const minL = Math.min(...w.map((r) => r.low))
    const midpoint = (maxH + minL) / 2
    const range = midpoint > 0 ? ((maxH - minL) / midpoint) * 100 : 0
    const avgVol = w.reduce((s, r) => s + r.volume, 0) / w.length
    return { range, avgVol }
  })

  let contractions = 0
  for (let i = 1; i < analyzed.length; i++) {
    if (analyzed[i]!.range < analyzed[i - 1]!.range * 0.85) contractions++
  }

  const volumeDrying = analyzed[2]!.avgVol < analyzed[0]!.avgVol * 0.75

  const last252 = rows.slice(Math.max(0, rows.length - 252))
  const high52w = Math.max(...last252.map((r) => r.high))
  const currentClose = rows[rows.length - 1]!.close
  const pctFromHigh = high52w > 0 ? ((currentClose - high52w) / high52w) * 100 : -100
  const nearHighs = pctFromHigh >= -20

  return {
    isVcp: contractions >= 1 && volumeDrying && nearHighs,
    contractions,
    volumeDrying
  }
}

function calcMFI14(rows: { high: number; low: number; close: number; volume: number }[]): number | null {
  if (rows.length < 15) return null
  const slice = rows.slice(-15)
  let posFlow = 0; let negFlow = 0
  for (let i = 1; i < slice.length; i++) {
    const tp = (slice[i]!.high + slice[i]!.low + slice[i]!.close) / 3
    const prevTp = (slice[i - 1]!.high + slice[i - 1]!.low + slice[i - 1]!.close) / 3
    const mf = tp * slice[i]!.volume
    if (tp > prevTp) posFlow += mf
    else negFlow += mf
  }
  if (negFlow === 0) return 100
  return 100 - (100 / (1 + posFlow / negFlow))
}

type OhlcEntry = { date: number; close: number; high: number; low: number; volume: number }

function detectCupHandle(rows: OhlcEntry[]): { detected: boolean; depthPct: number | null; lengthDays: number | null } {
  if (rows.length < 45) return { detected: false, depthPct: null, lengthDays: null }
  for (let cupLen = 45; cupLen <= Math.min(90, rows.length - 5); cupLen++) {
    const cup = rows.slice(-(cupLen + 5), -5)
    if (cup.length < 30) continue
    const leftHigh = Math.max(...cup.slice(0, 10).map((r) => r.high))
    const rightHigh = Math.max(...cup.slice(-10).map((r) => r.high))
    const bottom = Math.min(...cup.map((r) => r.low))
    if (leftHigh <= 0 || bottom <= 0) continue
    const depthPct = ((leftHigh - bottom) / leftHigh) * 100
    if (depthPct < 12 || depthPct > 35) continue
    if (rightHigh / leftHigh < 0.92) continue
    const handle = rows.slice(-5)
    const handleHigh = Math.max(...handle.map((r) => r.high))
    const handleLow = Math.min(...handle.map((r) => r.low))
    const handleRange = handleHigh > 0 ? ((handleHigh - handleLow) / handleHigh) * 100 : Infinity
    if (handleRange > 12) continue
    return { detected: true, depthPct, lengthDays: cupLen }
  }
  return { detected: false, depthPct: null, lengthDays: null }
}

function countBases(rows: OhlcEntry[]): number {
  if (rows.length < 40) return 0
  let bases = 0
  let i = 20
  let prevHigh = Math.max(...rows.slice(0, 20).map((r) => r.high))
  while (i < rows.length - 10) {
    for (let winLen = 15; winLen <= 40 && i + winLen < rows.length; winLen++) {
      const win = rows.slice(i, i + winLen)
      const wHigh = Math.max(...win.map((r) => r.high))
      const wLow = Math.min(...win.map((r) => r.low))
      const mid = (wHigh + wLow) / 2
      if (mid <= 0) continue
      const rangePct = ((wHigh - wLow) / mid) * 100
      if (rangePct > 15) break
      const afterBase = rows.slice(i + winLen, i + winLen + 10)
      const breakoutHigh = Math.max(...afterBase.map((r) => r.high))
      if (breakoutHigh > wHigh && breakoutHigh > prevHigh) {
        bases++
        prevHigh = breakoutHigh
        i = i + winLen
        break
      }
    }
    i++
  }
  return bases
}

// ─── Phase 2: Entry/Exit Signal helpers ──────────────────────────────────────

function calcPivotPoint(entries: OhlcvEntry[], patternType: string): number | null {
  if (entries.length === 0) return null
  let lookback: number
  if (patternType === 'cup-handle') lookback = 5
  else if (patternType === 'vcp') lookback = 20
  else if (patternType === 'htf') lookback = 15
  else lookback = 25 // flat or default
  const slice = entries.slice(-Math.min(lookback, entries.length))
  return Math.max(...slice.map((e) => e.high))
}

function calcATR(entries: OhlcvEntry[]): number | null {
  if (entries.length < 15) return null
  const slice = entries.slice(-15)
  let sumTR = 0
  for (let i = 1; i < slice.length; i++) {
    const h = slice[i]!.high
    const l = slice[i]!.low
    const pc = slice[i - 1]!.close
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    sumTR += tr
  }
  return sumTR / 14
}

function calcBBWidth(closes: number[], period = 20, stdMult = 2): number | null {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / period
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
  const std = Math.sqrt(variance)
  const upper = mean + stdMult * std
  const lower = mean - stdMult * std
  if (mean <= 0) return null
  return ((upper - lower) / mean) * 100
}

function calcBBSqueeze(closes: number[], period = 20, stdMult = 2, lookback = 126): boolean {
  if (closes.length < period + lookback) return false
  const currentWidth = calcBBWidth(closes, period, stdMult)
  if (currentWidth == null) return false
  let minWidth = Infinity
  for (let i = Math.max(period, closes.length - lookback); i < closes.length - 1; i++) {
    const slice = closes.slice(i - period, i)
    if (slice.length < period) continue
    const w = calcBBWidth(slice, period, stdMult)
    if (w != null && w < minWidth) minWidth = w
  }
  return currentWidth <= minWidth * 1.05
}

function calcSharpeRatio(entries: OhlcvEntry[]): number | null {
  if (entries.length < 63) return null
  const slice = entries.slice(-63)
  const returns: number[] = []
  for (let i = 1; i < slice.length; i++) {
    const r = (slice[i]!.close - slice[i - 1]!.close) / slice[i - 1]!.close
    returns.push(r)
  }
  if (returns.length === 0) return null
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length
  const std = Math.sqrt(variance)
  if (std === 0) return null
  const riskFree = 0.000238
  return ((mean - riskFree) / std) * Math.sqrt(252)
}

// ─── Phase 4: File I/O helpers ────────────────────────────────────────────────

async function ensureDir(path: string): Promise<void> {
  try {
    await Deno.mkdir(path, { recursive: true })
  } catch { /* ignore */ }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const text = await Deno.readTextFile(path)
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await ensureDir(path.split('/').slice(0, -1).join('/'))
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2))
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

function fIDR(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`
  return n.toFixed(0)
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

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = Deno.args
const argMode = (args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'combined') as string
const topN = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : 15
const minScore = args.includes('--min-score') ? Number(args[args.indexOf('--min-score') + 1]) : 0
const sectorFilter = args.includes('--sector') ? args[args.indexOf('--sector') + 1] : null
const detailCode = args.includes('--detail') ? (args[args.indexOf('--detail') + 1] ?? '').toUpperCase() : null
const sortBy = args.includes('--sort') ? (args[args.indexOf('--sort') + 1] ?? 'score') : 'score'
const compactMode = args.includes('--compact')
const portfolioSize = args.includes('--portfolio') ? Number(args[args.indexOf('--portfolio') + 1]) : 0
const riskPct = args.includes('--risk-pct') ? Number(args[args.indexOf('--risk-pct') + 1]) : 1
const exportCsv = args.includes('--export') && args[args.indexOf('--export') + 1] === 'csv'
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null
const backtestCode = args.includes('--backtest') ? (args[args.indexOf('--backtest') + 1] ?? '').toUpperCase() : null
const backtestDays = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 30

// Watchlist & alert CLI
const watchlistIdx = args.indexOf('--watchlist')
const watchlistAction = watchlistIdx >= 0 ? (args[watchlistIdx + 1] ?? '') : null
const watchlistName = watchlistIdx >= 0 ? (args[watchlistIdx + 2] ?? '') : null

const alertIdx = args.indexOf('--alert')
const alertAction = alertIdx >= 0 ? (args[alertIdx + 1] ?? '') : null

// ─── Alert / Watchlist early exits (no DB needed) ────────────────────────────

const alertsPath = './data/alerts.json'
const watchlistsDir = './data/watchlists'

if (alertAction === 'list') {
  const alerts = await readJsonFile<AlertEntry[]>(alertsPath) ?? []
  if (alerts.length === 0) {
    console.log('Tidak ada alert terdaftar.')
  } else {
    console.log('\nDaftar Alert:')
    for (const a of alerts) {
      console.log(`  [${a.code}] ${a.type} ${a.value} (dibuat: ${a.created})`)
    }
  }
  client.close()
  Deno.exit(0)
}

if (alertAction === 'set') {
  const code = (args[alertIdx + 2] ?? '').toUpperCase()
  const type = args[alertIdx + 3] ?? ''
  const value = Number(args[alertIdx + 4] ?? 0)
  if (!code || !type || !['price_above', 'price_below', 'vol_surge', 'rs_above'].includes(type)) {
    console.log('Usage: --alert set <CODE> <price_above|price_below|vol_surge|rs_above> <value>')
    client.close()
    Deno.exit(1)
  }
  const alerts = await readJsonFile<AlertEntry[]>(alertsPath) ?? []
  alerts.push({ code, type, value, created: new Date().toISOString().slice(0, 10) })
  await writeJsonFile(alertsPath, alerts)
  console.log(`Alert ditambahkan: ${code} ${type} ${value}`)
  client.close()
  Deno.exit(0)
}

if (alertAction === 'clear') {
  const target = (args[alertIdx + 2] ?? '').toUpperCase()
  if (!target) {
    console.log('Usage: --alert clear <CODE>|all')
    client.close()
    Deno.exit(1)
  }
  let alerts = await readJsonFile<AlertEntry[]>(alertsPath) ?? []
  if (target === 'ALL') {
    alerts = []
    console.log('Semua alert dihapus.')
  } else {
    const before = alerts.length
    alerts = alerts.filter((a) => a.code !== target)
    console.log(`${before - alerts.length} alert untuk ${target} dihapus.`)
  }
  await writeJsonFile(alertsPath, alerts)
  client.close()
  Deno.exit(0)
}

if (watchlistAction === 'load' || watchlistAction === 'show') {
  if (!watchlistName) {
    console.log('Usage: --watchlist load <name>')
    client.close()
    Deno.exit(1)
  }
  const wl = await readJsonFile<WatchlistFile>(`${watchlistsDir}/${watchlistName}.json`)
  if (!wl) {
    console.log(`Watchlist "${watchlistName}" tidak ditemukan.`)
    client.close()
    Deno.exit(1)
  }
  console.log(`\nWatchlist: ${watchlistName} (disimpan: ${wl.date})`)
  console.log('  Kode   Stage  RS    Score  Nama')
  console.log('  ' + '─'.repeat(60))
  for (const s of wl.stocks) {
    console.log(`  ${pad(s.code, 6)} ${stageLabel(s.stage)}    ${String(s.rsRank).padStart(3)}  ${s.score.toFixed(1).padStart(6)}  ${s.name ?? '-'}`)
  }
  client.close()
  Deno.exit(0)
}

// ─── Main DB queries ──────────────────────────────────────────────────────────

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

// Query OHLCV + foreign flow + bid/offer/frequency for SMT
const summaryRows = await query<{
  stock_code: string; date: number; price_close: number; price_high: number; price_low: number
  volume: number; value: number; frequency: number | null; listed_shares: number | null; tradable_shares: number | null
  foreign_buy: number | null; foreign_sell: number | null
  bid_volume: number | null; offer_volume: number | null
}>(
  'SELECT stock_code, date, price_close, price_high, price_low, volume, value, frequency, listed_shares, tradable_shares, foreign_buy, foreign_sell, bid_volume, offer_volume FROM stock_summary WHERE date >= ? AND date <= ? ORDER BY stock_code, date',
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

// Phase 2B: Market Follow-Through Day detection
let marketFollowThrough = false
{
  const ihsgSeries = Array.from(ihsgByDate.entries()).sort((a, b) => a[0] - b[0])
  if (ihsgSeries.length >= 15) {
    const last20 = ihsgSeries.slice(-20)
    // Check if any of last 5 days had >=1.7% gain
    let hasBigUpDay = false
    for (let i = Math.max(1, last20.length - 5); i < last20.length; i++) {
      const prev = last20[i - 1]![1]
      const cur = last20[i]![1]
      if (prev > 0 && (cur - prev) / prev * 100 >= 1.7) { hasBigUpDay = true; break }
    }
    // Check if prior 10 days had at least 3 down days
    if (hasBigUpDay) {
      let downDays = 0
      const prior10Start = Math.max(1, last20.length - 15)
      const prior10End = Math.max(1, last20.length - 5)
      for (let i = prior10Start; i < prior10End; i++) {
        const prev = last20[i - 1]![1]
        const cur = last20[i]![1]
        if (cur < prev) downDays++
      }
      if (downDays >= 3) marketFollowThrough = true
    }
  }
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
type OhlcvEntry = { date: number; close: number; high: number; low: number; volume: number; value: number; frequency: number; foreignBuy: number; foreignSell: number; bidVolume: number; offerVolume: number }
const ohlcByCode = new Map<string, OhlcvEntry[]>()
const floatByCode = new Map<string, { listed: number; tradable: number }>()

for (const r of summaryRows) {
  const close = Number(r.price_close)
  if (!Number.isFinite(close) || close <= 0) continue
  const list = ohlcByCode.get(r.stock_code) ?? []
  list.push({ date: Number(r.date), close, high: Number(r.price_high) || close, low: Number(r.price_low) || close, volume: Number(r.volume) || 0, value: Number(r.value) || 0, frequency: Number(r.frequency) || 0, foreignBuy: Number(r.foreign_buy) || 0, foreignSell: Number(r.foreign_sell) || 0, bidVolume: Number(r.bid_volume) || 0, offerVolume: Number(r.offer_volume) || 0 })
  ohlcByCode.set(r.stock_code, list)
  if (r.listed_shares != null && r.tradable_shares != null) floatByCode.set(r.stock_code, { listed: Number(r.listed_shares), tradable: Number(r.tradable_shares) })
}

// ─── Phase 4C: Broker accumulation history ───────────────────────────────────

// Query broker_top_daily for last 28 calendar days ≈ 20 trading days
// Degrades gracefully if table not yet populated (run deno task db:fetch-broker)
type BrokerHistRow = { stock_code: string; broker_code: string; broker_name: string; rank: number; date: number }
const brokerAccumMapScreen = new Map<string, string[]>() // stockCode → [accumulating broker names]
const brokerConcentrationMapScreen = new Map<string, number>() // stockCode → top3VolumePct from broker_stock_metrics
try {
  const brokerHistStart = (() => {
    const s = String(dateRef)
    const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
    d.setDate(d.getDate() - 28)
    return Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`)
  })()
  const brokerHistRows = await query<BrokerHistRow>(
    'SELECT stock_code, broker_code, broker_name, rank, date FROM broker_top_daily WHERE date >= ? AND date <= ? ORDER BY stock_code, date ASC',
    [brokerHistStart, dateRef]
  )
  // Group by stockCode → brokerCode → stats
  type BStat = { name: string; ranks: number[]; dates: Set<number> }
  const perStock = new Map<string, Map<string, BStat>>()
  for (const r of brokerHistRows) {
    const sc = String(r.stock_code)
    const bc = String(r.broker_code)
    if (!sc || !bc) continue
    const bmap = perStock.get(sc) ?? new Map<string, BStat>()
    const stat = bmap.get(bc) ?? { name: String(r.broker_name), ranks: [], dates: new Set<number>() }
    stat.ranks.push(Number(r.rank))
    stat.dates.add(Number(r.date))
    bmap.set(bc, stat)
    perStock.set(sc, bmap)
  }
  for (const [sc, bmap] of perStock.entries()) {
    const allDates = new Set<number>()
    for (const stat of bmap.values()) {
      for (const d of stat.dates) allDates.add(d)
    }
    const totalDays = allDates.size
    if (totalDays === 0) continue
    const accumNames: string[] = []
    for (const [, stat] of bmap.entries()) {
      const daysPresent = stat.dates.size
      const avgRank = stat.ranks.reduce((s, r) => s + r, 0) / stat.ranks.length
      const presencePct = daysPresent / totalDays
      const half = Math.floor(stat.ranks.length / 2)
      let declining = false
      if (half >= 2) {
        const avgOld = stat.ranks.slice(0, half).reduce((s, r) => s + r, 0) / half
        const avgNew = stat.ranks.slice(-half).reduce((s, r) => s + r, 0) / half
        declining = avgNew - avgOld > 1.5
      }
      if (presencePct >= 0.5 && avgRank <= 5 && !declining) accumNames.push(stat.name)
    }
    if (accumNames.length > 0) brokerAccumMapScreen.set(sc, accumNames)
  }
  // Also load top3 concentration from broker_stock_metrics
  const concRows = await query<{ stock_code: string; top3_volume_pct: number | null }>(
    'SELECT stock_code, top3_volume_pct FROM broker_stock_metrics WHERE date = ?',
    [dateRef]
  )
  for (const r of concRows) {
    if (r.top3_volume_pct != null) brokerConcentrationMapScreen.set(r.stock_code, Number(r.top3_volume_pct))
  }
} catch {
  // broker_top_daily not available — degrade gracefully (run deno task db:fetch-broker)
}



if (backtestCode) {
  const entries = ohlcByCode.get(backtestCode)
  if (!entries || entries.length < 2) {
    console.log(`Saham ${backtestCode} tidak ditemukan atau data tidak cukup.`)
    client.close()
    Deno.exit(1)
  }
  const n = Math.min(backtestDays, entries.length - 1)
  const entryEntry = entries[entries.length - 1 - n]!
  const current = entries[entries.length - 1]!
  const entryPrice = entryEntry.close
  const currentPrice = current.close
  const retPct = ((currentPrice - entryPrice) / entryPrice) * 100
  const periodEntries = entries.slice(entries.length - 1 - n)
  const minClose = Math.min(...periodEntries.map((e) => e.close))
  const maxDrawdown = ((minClose - entryPrice) / entryPrice) * 100
  const pivot = calcPivotPoint(entries.slice(0, entries.length - 1 - n + 1), 'default') ?? entryPrice
  const stopBreached = periodEntries.some((e) => e.close < pivot * 0.93)

  const dline2 = '═'.repeat(60)
  console.log(`\n${dline2}`)
  console.log(`  BACKTEST — ${backtestCode} | ${n} hari terakhir`)
  console.log(dline2)
  console.log(`  Entry  : Rp ${entryPrice.toFixed(0)} (${String(entryEntry.date)})`)
  console.log(`  Current: Rp ${currentPrice.toFixed(0)} (${String(current.date)})`)
  console.log(`  Return : ${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%`)
  console.log(`  Max DD : ${maxDrawdown.toFixed(2)}%`)
  console.log(`  7% Stop: ${stopBreached ? 'TERTEMBUS selama periode' : 'Aman'}`)
  console.log(dline2 + '\n')
  client.close()
  Deno.exit(0)
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
    const fundYear = new Date().getFullYear()
    salesSearch: for (const y of [fundYear, fundYear - 1, fundYear - 2, fundYear - 3]) {
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

  // Base Pattern (priority: HTF > Cup-Handle > Flat)
  let patternType = 'none'
  if (entries.length >= 55) {
    const poleStartClose = entries[entries.length - 40]!.close
    const poleHigh = Math.max(...highs.slice(-40, -15))
    const poleGain = poleStartClose > 0 ? (poleHigh - poleStartClose) / poleStartClose : 0
    if (poleGain >= 0.80) {
      const flagH = Math.max(...highs.slice(-15)); const flagL = Math.min(...lows.slice(-15))
      if (flagH > 0 && (flagH - flagL) / flagH <= 0.25) patternType = 'htf'
    }
  }
  if (patternType === 'none') {
    const cupResult = detectCupHandle(entries)
    if (cupResult.detected) patternType = 'cup-handle'
  }
  if (patternType === 'none' && entries.length >= 25) {
    const last25H = highs.slice(-25); const last25L = lows.slice(-25)
    const rng = Math.max(...last25H) - Math.min(...last25L)
    const mid = (Math.max(...last25H) + Math.min(...last25L)) / 2
    if (mid > 0 && rng / mid <= 0.15) patternType = 'flat'
  }

  // Base Count
  const baseCount = countBases(entries)

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

  // Volume A/D signal (5-criteria model)
  const ohlcvForVol = entries.map((e) => ({ high: e.high, low: e.low, close: e.close, volume: e.volume }))
  const cmf = calcCMF20(ohlcvForVol)
  const mfi = calcMFI14(ohlcvForVol)
  const obvTrend = calcOBVTrend(ohlcvForVol)

  // Volume surge: 5d vs 20d
  const vol5d = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5
  const vol20d = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const volSurgePct = vol20d > 0 ? ((vol5d - vol20d) / vol20d) * 100 : null

  // Foreign flow: net asing 20d as % of volume
  const totalForeignNet = entries.slice(-20).reduce((s, e) => s + (e.foreignBuy - e.foreignSell), 0)
  const totalVol20 = entries.slice(-20).reduce((s, e) => s + e.volume, 0)
  const foreignNetPct = totalVol20 > 0 ? (totalForeignNet / totalVol20) * 100 : null

  // 5 accumulation criteria
  const vC1 = cmf != null && cmf > 0
  const vC2 = mfi != null && mfi >= 40 && mfi <= 80
  const vC3 = obvTrend === 'up'
  const vC4 = volSurgePct != null && volSurgePct > 20
  const vC5 = foreignNetPct != null && foreignNetPct > 0
  const volCriteriaCount = [vC1, vC2, vC3, vC4, vC5].filter(Boolean).length

  // Signal determination
  const accumScoreSimple = [vC1, vC2, vC3].filter(Boolean).length
  const distC1 = cmf != null && cmf < -0.05
  const distC2 = mfi != null && mfi < 35
  const distC3 = obvTrend === 'down'
  const distScore = [distC1, distC2, distC3].filter(Boolean).length
  const volumeSignal = accumScoreSimple >= 2 ? 'akumulasi' : distScore >= 2 ? 'distribusi' : 'netral'

  // VCP detection
  const vcpResult = detectVCP(ohlcvForVol)

  // ─── Phase 2A: Breakout detection ───────────────────────────────────────────
  const pivotPoint = calcPivotPoint(entries, patternType)
  const avg50dVol = volumes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, volumes.length)
  const todayVol = volumes[volumes.length - 1] ?? 0
  const breakoutVolRatio = avg50dVol > 0 ? todayVol / avg50dVol : null

  let breakoutSignal: 'breakout' | 'approaching' | 'none' = 'none'
  if (pivotPoint != null) {
    if (price > pivotPoint && breakoutVolRatio != null && breakoutVolRatio > 1.5) {
      breakoutSignal = 'breakout'
    } else if (price >= pivotPoint * 0.97 && price <= pivotPoint) {
      breakoutSignal = 'approaching'
    }
  }

  // ─── Phase 2C: Shakeout detection ──────────────────────────────────────────
  let shakeoutDetected = false
  if (ma50 != null && entries.length >= 5) {
    const last5e = entries.slice(-5)
    for (const e of last5e) {
      if (e.low < ma50 && e.close > ma50) { shakeoutDetected = true; break }
    }
  }

  // ─── Phase 2D: Sell signals (Stage 2 only) ──────────────────────────────────
  let sellSignal: string | null = null
  if (stage === 2 && entries.length >= 20) {
    // 1. Climax Top
    const pct252: number[] = []
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1]!.close
      if (prev > 0) pct252.push((entries[i]!.close - prev) / prev * 100)
    }
    if (pct252.length >= 5) {
      const maxGainDay = Math.max(...pct252)
      const last5PctGains = pct252.slice(-5)
      const todayGain = pct252[pct252.length - 1] ?? 0
      const last20Vols = volumes.slice(-20)
      const maxVol20 = Math.max(...last20Vols)
      if (last5PctGains.includes(maxGainDay) && todayGain === maxGainDay && todayVol >= maxVol20) {
        sellSignal = 'Climax Top'
      }
    }
    // 2. BB Breach (3+ consecutive days above upper BB)
    if (sellSignal == null && closes.length >= 23) {
      let consecutiveDaysAbove = 0
      for (let i = closes.length - 3; i < closes.length; i++) {
        const slice20 = closes.slice(i - 20, i)
        const mean = slice20.reduce((a, b) => a + b, 0) / 20
        const variance = slice20.reduce((s, v) => s + (v - mean) ** 2, 0) / 20
        const upper = mean + 2 * Math.sqrt(variance)
        if (closes[i]! > upper) consecutiveDaysAbove++
      }
      if (consecutiveDaysAbove >= 3) sellSignal = 'Upper BB 3d+'
    }
    // 3. 7% Stop below pivot
    if (sellSignal == null && pivotPoint != null && price < pivotPoint * 0.93) {
      sellSignal = '7% Stop Breach'
    }
  }

  // ─── Phase 3A: ATR(14) ───────────────────────────────────────────────────────
  const atr = calcATR(entries)
  const atrPct = atr != null && price > 0 ? (atr / price) * 100 : null

  // ─── Phase 3B: BB Squeeze ────────────────────────────────────────────────────
  const bbWidth = calcBBWidth(closes)
  const bbSqueeze = calcBBSqueeze(closes)

  // ─── Phase 3D: Sharpe Ratio ──────────────────────────────────────────────────
  const sharpeRatio = calcSharpeRatio(entries)

  // ─── Phase 3F: EMA21 & Pullback ──────────────────────────────────────────────
  const ema21 = calcEMA(closes, 21)
  const pullbackSignal = (
    stage === 2 &&
    rsRank >= 70 &&
    ema21 != null &&
    price >= ema21 * 0.97 &&
    price <= ema21 * 1.03 &&
    ma50 != null && price > ma50
  )

  // Tech Score
  let techScore = (sepaScore / 100) * 50
  if (stage === 2) techScore += 20
  else if (stage === 1) techScore += 10
  if (rsLineNewHigh) techScore += 10
  if (hasPocketPivot) techScore += 10
  if (patternType === 'htf') techScore += 6
  else if (patternType === 'cup-handle') techScore += 4
  else if (patternType === 'flat') techScore += 2
  if (setupType === 'power-play') techScore += 4
  else if (setupType === 'low-cheat') techScore += 2
  if (vcpResult.isVcp) techScore += 5
  techScore = Math.min(100, techScore)

  const finalFundScore = Math.min(100, fundScoreFull)
  const combinedScore = techScore * 0.6 + finalFundScore * 0.4

  // ─── Phase 3C: Momentum Factor ───────────────────────────────────────────────
  const rsComponent = (rsRank / 99) * 30
  const epsComponent = (epsInfo.score / 15) * 20
  const trendComponent = (trendCriteriaCount / 8) * 20
  const volComponent = (volCriteriaCount / 5) * 15
  const foreignClamped = Math.max(-10, Math.min(10, foreignNetPct ?? 0))
  const foreignComponent = ((foreignClamped + 10) / 20) * 15
  const momentumFactor = Math.round(rsComponent + epsComponent + trendComponent + volComponent + foreignComponent)

  const sortScore = argMode === 'technical' ? techScore : argMode === 'fundamental' ? finalFundScore : argMode === 'momentum' ? momentumFactor : combinedScore
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
  if (patternType !== 'none') {
    const pLabel = patternType === 'htf' ? 'High Tight Flag' : patternType === 'cup-handle' ? 'Cup & Handle' : 'Flat Base'
    reasons.push(pLabel)
  }
  if (baseCount > 0) reasons.push(`Base #${baseCount}`)
  if (setupType !== 'none') reasons.push(setupType === 'power-play' ? 'Power Play' : 'Low Cheat')
  if (volumeSignal === 'akumulasi') reasons.push(`Vol: Akumulasi (CMF ${(cmf ?? 0).toFixed(3)}, ${volCriteriaCount}/5)`)
  if (foreignNetPct != null && foreignNetPct > 0) reasons.push(`Asing: +${foreignNetPct.toFixed(1)}%`)
  if (vcpResult.isVcp) reasons.push(`VCP (kontraksi: ${vcpResult.contractions}, vol kering)`)
  if (breakoutSignal === 'breakout') reasons.push(`BREAKOUT (pivot Rp ${(pivotPoint ?? 0).toFixed(0)}, vol ${(breakoutVolRatio ?? 0).toFixed(1)}x)`)
  if (breakoutSignal === 'approaching') reasons.push(`Mendekati pivot Rp ${(pivotPoint ?? 0).toFixed(0)}`)
  if (pullbackSignal) reasons.push('Pullback ke EMA21')
  if (shakeoutDetected) reasons.push('Shakeout terdeteksi')
  if (sellSignal) reasons.push(`JUAL: ${sellSignal}`)

  // ─── SMT computation ───────────────────────────────────────────────────────
  const smtReasons: string[] = []
  let smtBullishCount = 0
  const smtHasEnoughData = entries.length >= 20

  // 1. Foreign Flow Momentum (30 pts) — requires 20+ days
  let smtForeignFlowScore = 0
  const smtFNet5d = entries.slice(-5).reduce((s: number, e: OhlcvEntry) => s + e.foreignBuy - e.foreignSell, 0)
  let smtFAccel = 0
  if (smtHasEnoughData) {
    const smtFNet20d = entries.slice(-20).reduce((s: number, e: OhlcvEntry) => s + e.foreignBuy - e.foreignSell, 0)
    const smtFAvg5 = smtFNet5d / 5
    const smtFAvg20 = smtFNet20d / 20
    smtFAccel = smtFAvg5 - smtFAvg20
    const smtAvgVol20 = entries.slice(-20).reduce((s: number, e: OhlcvEntry) => s + e.volume, 0) / 20
    const smtAccelNorm = smtAvgVol20 > 0 ? smtFAccel / smtAvgVol20 : 0
    smtForeignFlowScore = Math.round(Math.max(0, Math.min(1, (smtAccelNorm + 0.05) / 0.30)) * 30)
  }

  // 2. Foreign Flow Streak (10 pts)
  let smtStreak = 0
  for (let si = entries.length - 1; si >= 0; si--) {
    if (entries[si]!.foreignBuy > entries[si]!.foreignSell) smtStreak++
    else break
  }
  const smtForeignStreakScore = smtStreak >= 5 ? 10 : smtStreak >= 3 ? 6 : smtStreak >= 1 ? 3 : 0
  if (smtForeignFlowScore >= 18) { smtBullishCount++; smtReasons.push('Foreign flow accelerating') }
  if (smtStreak >= 5) { smtBullishCount++; smtReasons.push(`Asing beli ${smtStreak}h berturut`) }

  // 3. Volume-Price Divergence (15 pts) — reuse obvTrend
  let smtVolPriceScore = 0
  const smtPriceTrend = entries.length >= 10
    ? (() => { const f = entries[entries.length - 10]!.close; const l = entries[entries.length - 1]!.close; const p = f > 0 ? (l - f) / f : 0; return p > 0.03 ? 'up' : p < -0.03 ? 'down' : 'flat' })()
    : 'flat'
  if (obvTrend === 'up' && smtPriceTrend === 'down') { smtVolPriceScore = 15; smtBullishCount++; smtReasons.push('Divergence bullish: OBV naik, harga turun') }
  else if (obvTrend === 'up' && smtPriceTrend !== 'down') { smtVolPriceScore = 12; smtBullishCount++; smtReasons.push('OBV naik (akumulasi volume)') }
  else if (obvTrend === 'flat') smtVolPriceScore = 5

  // 4. Trade Size Profile (20 pts)
  let smtTradeSizeScore = 0
  let smtTradeSizeChange: number | null = null
  let smtAvgTradeSize5d: number | null = null
  if (smtHasEnoughData) {
    const smtTs5Freq = entries.slice(-5).reduce((s: number, e: OhlcvEntry) => s + e.frequency, 0)
    const smtTs5Val = entries.slice(-5).reduce((s: number, e: OhlcvEntry) => s + e.value, 0)
    const smtTs20Freq = entries.slice(-20).reduce((s: number, e: OhlcvEntry) => s + e.frequency, 0)
    const smtTs20Val = entries.slice(-20).reduce((s: number, e: OhlcvEntry) => s + e.value, 0)
    const smtTs5 = smtTs5Freq > 0 ? smtTs5Val / smtTs5Freq : null
    const smtTs20 = smtTs20Freq > 0 ? smtTs20Val / smtTs20Freq : null
    smtAvgTradeSize5d = smtTs5
    if (smtTs5 != null && smtTs20 != null && smtTs20 > 0) {
      smtTradeSizeChange = Math.round(((smtTs5 - smtTs20) / smtTs20) * 1000) / 10
      smtTradeSizeScore = Math.round(Math.max(0, Math.min(1, (smtTradeSizeChange + 30) / 80)) * 20)
      if (smtTradeSizeScore >= 14) { smtBullishCount++; smtReasons.push(`Ukuran tx naik ${smtTradeSizeChange.toFixed(1)}% (institusional)`) }
    }
  }

  // 5. Bid/Offer Pressure (10 pts) — 3-day aggregate to reduce noise
  let smtBidOfferScore = 0
  const smtBoSlice = entries.slice(-3)
  const smtTotalBid3d = smtBoSlice.reduce((s: number, e: OhlcvEntry) => s + e.bidVolume, 0)
  const smtTotalOffer3d = smtBoSlice.reduce((s: number, e: OhlcvEntry) => s + e.offerVolume, 0)
  const smtBidOfferRatio = smtTotalBid3d > 0 && smtTotalOffer3d > 0
    ? Math.round((smtTotalBid3d / smtTotalOffer3d) * 1000) / 1000
    : null
  if (smtBidOfferRatio != null) {
    if (smtBidOfferRatio >= 1.5) { smtBidOfferScore = 10; smtBullishCount++; smtReasons.push(`Bid/Offer ${smtBidOfferRatio.toFixed(2)} (tekanan beli 3h)`) }
    else if (smtBidOfferRatio >= 1.2) smtBidOfferScore = 6
    else if (smtBidOfferRatio >= 1.0) smtBidOfferScore = 3
  }

  // 6. Cross-Signal Alignment (15 pts)
  const smtCrossScore = smtBullishCount >= 4 ? 15 : smtBullishCount === 3 ? 10 : smtBullishCount === 2 ? 5 : 0

  // 7. Broker accumulation bonus (from broker_top_daily — +2/+3 pts, cap total at 100)
  const smtAccumBrokers = brokerAccumMapScreen.get(code) ?? []
  let smtBrokerBonus = 0
  if (smtAccumBrokers.length >= 2) {
    smtBrokerBonus = 3
    smtReasons.push(`${smtAccumBrokers.slice(0, 2).join(', ')} akumulasi konsisten`)
  } else if (smtAccumBrokers.length === 1) {
    smtBrokerBonus = 2
    smtReasons.push(`${smtAccumBrokers[0]} akumulasi konsisten 20h`)
  }

  const smtBaseScore = smtForeignFlowScore + smtForeignStreakScore + smtVolPriceScore + smtTradeSizeScore + smtBidOfferScore + smtCrossScore
  const smtScore = Math.min(100, smtBaseScore + smtBrokerBonus)
  const smtSignal: ScreenRow['smtSignal'] = smtScore >= 75 ? 'strong-buy' : smtScore >= 55 ? 'buy' : smtScore >= 35 ? 'neutral' : smtScore >= 20 ? 'sell' : 'strong-sell'

  results.push({
    code, name: sc?.name ?? null, sector: sc?.sector ?? null, price, stage, rsRank, sepaScore, techScore,
    fundScore: finalFundScore, combinedScore, gorenganScore, epsGrowthPct: epsInfo.latestGrowthPct,
    roe: roe > 0 ? roe : null, der: der < 999 ? der : null, trendCriteriaCount, hasRsLineNewHigh: rsLineNewHigh,
    hasPocketPivot, patternType, baseCount, setupType, volumeSignal, cmf, mfi, obvTrend, foreignNetPct,
    volSurgePct, volCriteriaCount, vcpIsVcp: vcpResult.isVcp, vcpContractions: vcpResult.contractions,
    vcpVolumeDrying: vcpResult.volumeDrying, reasons,
    breakoutSignal, pivotPoint, breakoutVolRatio, shakeoutDetected, sellSignal,
    atr, atrPct, bbSqueeze, bbWidth, momentumFactor, sharpeRatio, pullbackSignal, ema21,
    smtScore, smtSignal, smtReasons,
    foreignNet5d: smtFNet5d,
    foreignAcceleration: smtFAccel,
    consecutiveForeignBuyDays: smtStreak,
    avgTradeSize5d: smtAvgTradeSize5d,
    avgTradeSizeChange: smtTradeSizeChange,
    bidOfferRatio: smtBidOfferRatio,
    accumulatingBrokers: smtAccumBrokers,
    brokerConcentrationPct: brokerConcentrationMapScreen.get(code) ?? null
  })
}

// ─── Phase 4E: Mode filters ───────────────────────────────────────────────────

let filteredResults = results
if (argMode === 'breakout') {
  filteredResults = results.filter((r) => r.breakoutSignal === 'breakout' || r.breakoutSignal === 'approaching')
} else if (argMode === 'vcp') {
  filteredResults = results.filter((r) => r.vcpIsVcp)
} else if (argMode === 'pullback') {
  filteredResults = results.filter((r) => r.pullbackSignal)
} else if (argMode === 'smt') {
  filteredResults = results.filter((r) => r.smtSignal === 'strong-buy' || r.smtSignal === 'buy')
}

// Sort
filteredResults.sort((a, b) => {
  if (sortBy === 'rs') return b.rsRank - a.rsRank
  if (sortBy === 'eps') return (b.epsGrowthPct ?? -999) - (a.epsGrowthPct ?? -999)
  if (sortBy === 'volume') return (b.volCriteriaCount) - (a.volCriteriaCount)
  if (sortBy === 'foreign') return (b.foreignNetPct ?? -999) - (a.foreignNetPct ?? -999)
  if (sortBy === 'momentum') return b.momentumFactor - a.momentumFactor
  if (sortBy === 'atr') return (b.atrPct ?? 0) - (a.atrPct ?? 0)
  if (sortBy === 'smt') return b.smtScore - a.smtScore
  // default sort by score
  const sa = argMode === 'technical' ? a.techScore : argMode === 'fundamental' ? a.fundScore : argMode === 'momentum' ? a.momentumFactor : argMode === 'smt' ? a.smtScore : a.combinedScore
  const sb = argMode === 'technical' ? b.techScore : argMode === 'fundamental' ? b.fundScore : argMode === 'momentum' ? b.momentumFactor : argMode === 'smt' ? b.smtScore : b.combinedScore
  return sb - sa
})

// ─── Phase 4A: Check alerts against results ────────────────────────────────────

const activeAlerts = await readJsonFile<AlertEntry[]>(alertsPath) ?? []
const triggeredAlerts: string[] = []
if (activeAlerts.length > 0) {
  for (const alert of activeAlerts) {
    const row = filteredResults.find((r) => r.code === alert.code) ??
      results.find((r) => r.code === alert.code)
    if (!row) continue
    const rsRankForAlert = rsScores.get(alert.code)?.rank ?? 0
    if (alert.type === 'price_above' && row.price > alert.value) {
      triggeredAlerts.push(`[ALERT] ${alert.code}: harga ${row.price.toFixed(0)} > ${alert.value}`)
    } else if (alert.type === 'price_below' && row.price < alert.value) {
      triggeredAlerts.push(`[ALERT] ${alert.code}: harga ${row.price.toFixed(0)} < ${alert.value}`)
    } else if (alert.type === 'vol_surge' && (row.volSurgePct ?? 0) > alert.value) {
      triggeredAlerts.push(`[ALERT] ${alert.code}: vol surge ${(row.volSurgePct ?? 0).toFixed(1)}% > ${alert.value}%`)
    } else if (alert.type === 'rs_above' && rsRankForAlert > alert.value) {
      triggeredAlerts.push(`[ALERT] ${alert.code}: RS rank ${rsRankForAlert} > ${alert.value}`)
    }
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────

const dateStr = String(dateRef)
const dateFmt = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`

// ─── Phase 4B: CSV Export ─────────────────────────────────────────────────────

if (exportCsv) {
  const header = 'Code,Name,Sector,Price,Stage,RS,SEPA,Tech,Fund,Combined,Momentum,ATR%,Pattern,Setup,VCP,BreakoutSignal,VolumeSignal,ForeignNetPct,SharpeRatio,Reasons'
  const rows = filteredResults.slice(0, topN).map((r) => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    return [
      r.code,
      esc(r.name ?? ''),
      esc(r.sector ?? ''),
      r.price.toFixed(0),
      r.stage,
      r.rsRank,
      r.sepaScore.toFixed(1),
      r.techScore.toFixed(1),
      r.fundScore.toFixed(1),
      r.combinedScore.toFixed(1),
      r.momentumFactor,
      r.atrPct?.toFixed(2) ?? '',
      r.patternType,
      r.setupType,
      r.vcpIsVcp ? 'Y' : 'N',
      r.breakoutSignal,
      r.volumeSignal,
      r.foreignNetPct?.toFixed(2) ?? '',
      r.sharpeRatio?.toFixed(2) ?? '',
      esc(r.reasons.join('; '))
    ].join(',')
  })
  const csv = [header, ...rows].join('\n')
  if (outputFile) {
    await Deno.writeTextFile(outputFile, csv)
    console.log(`CSV diekspor ke: ${outputFile}`)
  } else {
    console.log(csv)
  }
  client.close()
  Deno.exit(0)
}

// ─── Detail view ──────────────────────────────────────────────────────────────

if (detailCode) {
  const row = results.find((r) => r.code === detailCode)

  if (!row) {
    const existsInDb = ohlcByCode.has(detailCode)
    if (existsInDb) {
      console.log(`\nSaham ${detailCode} ditemukan di database tapi tidak lolos filter screening (gorengan / Stage 3-4).`)
    } else {
      console.log(`\nSaham ${detailCode} tidak ditemukan di database.`)
    }
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
  const pLabel = row.patternType === 'htf' ? 'HIGH TIGHT FLAG' : row.patternType === 'cup-handle' ? 'CUP & HANDLE' : row.patternType === 'flat' ? 'FLAT BASE' : 'Tidak terdeteksi'
  console.log(`  ${tick(row.patternType !== 'none')} Base Pattern: ${pLabel}${row.baseCount > 0 ? ` (Base #${row.baseCount})` : ''}`)
  console.log(`  ${tick(row.setupType !== 'none')} Power Play/Low Cheat: ${row.setupType === 'none' ? 'Tidak' : row.setupType}`)
  console.log(`  ${tick(row.vcpIsVcp)} VCP (Pola): ${row.vcpIsVcp ? `Ya (kontraksi: ${row.vcpContractions}, vol kering: ${row.vcpVolumeDrying ? 'Ya' : 'Tidak'})` : 'Tidak terdeteksi'}`)
  console.log(`  ${tick(row.volumeSignal === 'akumulasi')} Volume: ${row.volumeSignal.toUpperCase()} | Kriteria: ${row.volCriteriaCount}/5 | CMF: ${fNum(row.cmf, 3)} | MFI: ${fNum(row.mfi, 1)} | OBV: ${row.obvTrend}`)
  console.log(`  ${tick((row.foreignNetPct ?? 0) > 0)} Foreign Flow: ${row.foreignNetPct != null ? `${row.foreignNetPct > 0 ? '+' : ''}${row.foreignNetPct.toFixed(1)}%` : '—'}${row.volSurgePct != null ? ` | Vol Surge: ${row.volSurgePct > 0 ? '+' : ''}${row.volSurgePct.toFixed(1)}%` : ''}`)
  console.log(line)
  // Phase 2 detail
  const bktLabel = row.breakoutSignal === 'breakout' ? '\x1b[32mBREAKOUT\x1b[0m' : row.breakoutSignal === 'approaching' ? '\x1b[33mMENDEKATI PIVOT\x1b[0m' : 'Tidak ada'
  console.log(`  ${tick(row.breakoutSignal !== 'none')} Breakout Signal: ${bktLabel}${row.breakoutSignal !== 'none' && row.pivotPoint != null ? ` (vol ${(row.breakoutVolRatio ?? 0).toFixed(1)}x avg, pivot Rp ${row.pivotPoint.toFixed(0)})` : ''}`)
  console.log(`  ${tick(row.shakeoutDetected)} Shakeout: ${row.shakeoutDetected ? 'Terdeteksi (low < MA50 + close > MA50)' : 'Tidak terdeteksi'}`)
  console.log(`  ${tick(row.sellSignal == null)} Sell Signal: ${row.sellSignal ?? 'Tidak ada'}`)
  console.log(line)
  // Phase 3 detail
  console.log(`  ─ ATR(14): ${row.atr != null ? row.atr.toFixed(0) : '—'} (${fNum(row.atrPct, 1)}%) | BB Squeeze: ${row.bbSqueeze ? 'Ya' : 'Tidak'} | BB Width: ${fNum(row.bbWidth, 1)}%`)
  console.log(`  ─ Sharpe Ratio: ${fNum(row.sharpeRatio, 2)} | Momentum Factor: ${row.momentumFactor}`)
  console.log(`  ─ EMA(21): ${row.ema21 != null ? row.ema21.toFixed(0) : '—'} | Pullback Setup: ${row.pullbackSignal ? 'Ya' : 'Tidak'}`)
  console.log(line)
  // Smart Money section
  const smtBar = '█'.repeat(Math.round(row.smtScore / 10)) + '░'.repeat(10 - Math.round(row.smtScore / 10))
  const smtColor = row.smtScore >= 75 ? '\x1b[32m' : row.smtScore >= 55 ? '\x1b[33m' : '\x1b[31m'
  const smtSignalLabel = row.smtSignal === 'strong-buy' ? '\x1b[32mSTRONG BUY\x1b[0m' : row.smtSignal === 'buy' ? '\x1b[32mBUY\x1b[0m' : row.smtSignal === 'neutral' ? '\x1b[33mNETRAL\x1b[0m' : row.smtSignal === 'sell' ? '\x1b[31mSELL\x1b[0m' : '\x1b[31mSTRONG SELL\x1b[0m'
  console.log(`  ═══ Smart Money ═══`)
  console.log(`  SMT Score       : ${smtColor}${row.smtScore}/100 [${smtBar}]\x1b[0m`)
  const smtFn5dStr = row.foreignNet5d != null ? `${row.foreignNet5d >= 0 ? '+' : ''}${(row.foreignNet5d / 1_000_000_000).toFixed(1)}B (5d)` : '—'
  const smtAccelStr = row.foreignAcceleration != null && row.foreignAcceleration > 0 ? ' ▲ accelerating' : row.foreignAcceleration != null && row.foreignAcceleration < 0 ? ' ▼ decelerating' : ''
  console.log(`  Foreign Flow    : ${smtFn5dStr}${smtAccelStr}`)
  console.log(`  Consecutive Buy : ${row.consecutiveForeignBuyDays > 0 ? `${row.consecutiveForeignBuyDays} hari berturut-turut` : '—'}`)
  const smtTscStr = row.avgTradeSizeChange != null ? `${row.avgTradeSizeChange >= 0 ? '+' : ''}${row.avgTradeSizeChange.toFixed(1)}% vs 20d${Math.abs(row.avgTradeSizeChange) >= 20 ? ' (institusional)' : ''}` : '—'
  console.log(`  Avg Trade Size  : ${smtTscStr}`)
  const smtBoStr = row.bidOfferRatio != null ? `${row.bidOfferRatio.toFixed(2)}${row.bidOfferRatio >= 1.5 ? ' (buyer dominated)' : row.bidOfferRatio >= 1.0 ? ' (balanced)' : ' (seller dominated)'}` : '—'
  console.log(`  Bid/Offer Ratio : ${smtBoStr}`)
  console.log(`  Signal          : ${smtSignalLabel}`)
  if (row.smtReasons.length > 0) console.log(`  Reasons         : ${row.smtReasons.join(', ')}`)
  // Broker Activity section
  console.log(line)
  console.log(`  ═══ Broker Activity ═══`)
  if (row.brokerConcentrationPct != null) {
    const concStr = row.brokerConcentrationPct >= 60 ? `\x1b[33m${row.brokerConcentrationPct.toFixed(1)}%\x1b[0m (konsentrasi tinggi)` : `${row.brokerConcentrationPct.toFixed(1)}%`
    console.log(`  Konsentrasi Top3: ${concStr}`)
  } else {
    console.log(`  Konsentrasi Top3: — (jalankan deno task db:fetch-broker)`)
  }
  if (row.accumulatingBrokers.length > 0) {
    console.log(`  ▶ Broker Akumulasi (hadir konsisten ≥50% hari, avg rank ≤5):`)
    for (const bname of row.accumulatingBrokers) {
      console.log(`    \x1b[32m🏦 ${bname}\x1b[0m`)
    }
  } else {
    console.log(`  Broker Akumulasi: — (belum ada data histori broker / belum memenuhi kriteria)`)
  }
  // Position sizing (Phase 3E)
  if (portfolioSize > 0) {
    const riskPerTrade = portfolioSize * riskPct / 100
    const stopDist = Math.max((row.atr ?? 0) * 1.5, row.price * 0.07)
    const positionSizeIDR = stopDist > 0 ? riskPerTrade / (stopDist / row.price) : 0
    const lots = Math.floor(positionSizeIDR / row.price / 100) * 100
    const stopPrice = row.price - stopDist
    console.log(line)
    console.log(`  Position Sizing (Portfolio: Rp ${fIDR(portfolioSize)}, Risk: ${riskPct}%):`)
    console.log(`    Lot: ${lots / 100} lot (${lots} saham) | Stop: Rp ${stopPrice.toFixed(0)} | Risk: Rp ${fIDR(riskPerTrade)}`)
  }
  console.log(line)
  console.log(`  Skor: Tech=${row.techScore.toFixed(1)} | Fund=${row.fundScore.toFixed(1)} | Combined=${colorScore(row.combinedScore)} | Momentum=${row.momentumFactor}`)
  console.log(`  Gorengan Score: ${row.gorenganScore} ${row.gorenganScore < 30 ? '(aman)' : '(waspada)'}`)
  console.log(`\n  Alasan:`)
  for (const r of row.reasons) console.log(`    * ${r}`)
  console.log(dline + '\n')
  client.close()
  Deno.exit(0)
}

// ─── Summary table ────────────────────────────────────────────────────────────

const top = filteredResults.slice(0, topN)
const dline = '═'.repeat(104)
const line = '─'.repeat(104)

if (triggeredAlerts.length > 0) {
  console.log('\x1b[33m')
  for (const a of triggeredAlerts) console.log(`  ${a}`)
  console.log('\x1b[0m')
}

console.log(`\n${dline}`)
console.log(`  IDX SCREENER — Terminal Report`)
console.log(`  Data: ${dateFmt} | Mode: ${argMode.toUpperCase()} | Top ${topN} dari ${filteredResults.length} kandidat (${results.length} lolos filter)`)
if (sectorFilter) console.log(`  Sektor: ${sectorFilter}`)
console.log(`  Pasar: ${marketFollowThrough ? '\x1b[32mFollow-Through Day AKTIF\x1b[0m' : 'Normal'}`)
console.log(dline)

// ─── SMT mode table ───────────────────────────────────────────────────────────

if (argMode === 'smt') {
  const smtHeader = `  ${pad('#', 3)} ${pad('Kode', 6)} ${pad('Nama', 20)} ${'SMT'.padStart(5)} ${'For5d'.padStart(8)} ${'Streak'.padStart(7)} ${'TxChg'.padStart(7)} ${'B/O'.padStart(5)} ${pad('Akum.Broker', 18)} ${pad('Sinyal', 12)}`
  console.log(smtHeader)
  console.log(`  ${'─'.repeat(100)}`)
  for (let i = 0; i < top.length; i++) {
    const r = top[i]!
    const smtFn5d = r.foreignNet5d != null ? `${r.foreignNet5d >= 0 ? '+' : ''}${(r.foreignNet5d / 1_000_000_000).toFixed(1)}B` : '—'
    const smtStreak = r.consecutiveForeignBuyDays > 0 ? `${r.consecutiveForeignBuyDays}h` : '—'
    const smtTxChg = r.avgTradeSizeChange != null ? `${r.avgTradeSizeChange >= 0 ? '+' : ''}${r.avgTradeSizeChange.toFixed(1)}%` : '—'
    const smtBo = r.bidOfferRatio != null ? r.bidOfferRatio.toFixed(2) : '—'
    const smtSigLabel = r.smtSignal === 'strong-buy' ? '\x1b[32mSTRONG BUY\x1b[0m' : '\x1b[32mBUY\x1b[0m'
    const smtScoreStr = String(r.smtScore).padStart(5)
    const smtScoreColored = r.smtScore >= 75 ? `\x1b[32m${smtScoreStr}\x1b[0m` : r.smtScore >= 55 ? `\x1b[33m${smtScoreStr}\x1b[0m` : `\x1b[90m${smtScoreStr}\x1b[0m`
    // Accumulating brokers: show first 2 (truncated), green if present
    const accumBrokerStr = r.accumulatingBrokers.length > 0
      ? `\x1b[32m${r.accumulatingBrokers.slice(0, 2).join(', ').slice(0, 17)}\x1b[0m`
      : '\x1b[90m—\x1b[0m'
    console.log(
      `  ${pad(String(i + 1), 3)} ${pad(r.code, 6)} ${pad(r.name?.slice(0, 20) ?? '-', 20)} ${smtScoreColored} ${smtFn5d.padStart(8)} ${smtStreak.padStart(7)} ${smtTxChg.padStart(7)} ${smtBo.padStart(5)} ${accumBrokerStr.padEnd(18 + 10)} ${smtSigLabel}`
    )
  }
  console.log(dline)
  console.log(`  Untuk detail: deno run -A screen.ts --detail KODE`)
  console.log(`  Sort: --sort smt|foreign|momentum | Filter: --top N --sector "nama"`)
  console.log(`  [Akum.Broker] = broker hadir ≥50% hari & avg rank ≤5 (20 hari terakhir)`)
  console.log(dline + '\n')
  client.close()
  Deno.exit(0)
}

if (compactMode) {
  console.log(`  ${pad('#', 3)} ${pad('Kode', 6)} ${'Score'.padStart(6)} ${'RS'.padStart(3)} ${pad('Pola', 7)} ${pad('Signals', 30)}`)
  console.log(`  ${'─'.repeat(60)}`)
  for (let i = 0; i < top.length; i++) {
    const r = top[i]!
    const signals: string[] = []
    if (r.breakoutSignal === 'breakout') signals.push('\x1b[32mBKT\x1b[0m')
    else if (r.breakoutSignal === 'approaching') signals.push('\x1b[33mAPR\x1b[0m')
    if (r.hasPocketPivot) signals.push('PP')
    if (r.hasRsLineNewHigh) signals.push('RS-NH')
    const score = argMode === 'technical' ? r.techScore : argMode === 'fundamental' ? r.fundScore : argMode === 'momentum' ? r.momentumFactor : r.combinedScore
    const polaLabel = r.patternType === 'htf' ? 'HTF' : r.patternType === 'cup-handle' ? 'Cup' : r.patternType === 'flat' ? 'Flat' : '—'
    console.log(`  ${pad(String(i + 1), 3)} ${pad(r.code, 6)} ${colorScore(score).padStart(12)} ${String(r.rsRank).padStart(3)} ${pad(polaLabel, 7)} ${signals.slice(0, 2).join(', ')}`)
  }
} else {
  console.log(`  ${pad('#', 3)} ${pad('Kode', 6)} ${pad('Nama', 22)} ${'Score'.padStart(6)} ${'Tech'.padStart(5)} ${'Fund'.padStart(5)} ${pad('Stage', 5)} ${'RS'.padStart(3)} ${pad('Pola', 5)} ${'Mmt'.padStart(4)} ${pad('Entry Signals', 26)}`)
  console.log(`  ${line.slice(0, 102)}`)

  for (let i = 0; i < top.length; i++) {
    const r = top[i]!
    const signals: string[] = []
    if (r.breakoutSignal === 'breakout') signals.push('\x1b[32mBKT\x1b[0m')
    else if (r.breakoutSignal === 'approaching') signals.push('\x1b[33mAPR\x1b[0m')
    if (r.pullbackSignal) signals.push('PB')
    if (r.shakeoutDetected) signals.push('Shakeout')
    if (r.hasPocketPivot) signals.push('PP')
    if (r.hasRsLineNewHigh) signals.push('RS-NH')
    if (r.patternType === 'htf') signals.push('HTF')
    else if (r.patternType === 'cup-handle') signals.push('Cup')
    else if (r.patternType === 'flat') signals.push('Flat')
    if (r.setupType === 'power-play') signals.push('PwrPlay')
    else if (r.setupType === 'low-cheat') signals.push('LowCheat')
    if (r.volumeSignal === 'akumulasi') signals.push('Akum')
    if (r.volumeSignal === 'distribusi') signals.push('\x1b[31mDist\x1b[0m')
    if (r.sellSignal) signals.push(`\x1b[31m${r.sellSignal}\x1b[0m`)

    const score = argMode === 'technical' ? r.techScore : argMode === 'fundamental' ? r.fundScore : argMode === 'momentum' ? r.momentumFactor : r.combinedScore
    const vcpLabel = r.vcpIsVcp ? '\x1b[35mVCP\x1b[0m  ' : pad('—', 5)
    console.log(
      `  ${pad(String(i + 1), 3)} ${pad(r.code, 6)} ${pad(r.name?.slice(0, 22) ?? '-', 22)} ${colorScore(score).padStart(12)} ${r.techScore.toFixed(1).padStart(5)} ${r.fundScore.toFixed(1).padStart(5)} ${colorStage(r.stage).padStart(11)}  ${String(r.rsRank).padStart(3)} ${vcpLabel} ${String(r.momentumFactor).padStart(4)} ${signals.join(', ')}`
    )
  }
}

console.log(dline)

// Phase 4A: Watchlist compare
if (watchlistAction === 'compare' && watchlistName) {
  const wl = await readJsonFile<WatchlistFile>(`${watchlistsDir}/${watchlistName}.json`)
  if (wl) {
    console.log(`\n  Perbandingan dengan watchlist "${watchlistName}" (${wl.date}):`)
    console.log(`  ${pad('Kode', 6)} ${'Score Lama'.padStart(10)} ${'Score Baru'.padStart(10)} ${'Delta'.padStart(8)} ${'RS Lama'.padStart(8)} ${'RS Baru'.padStart(8)}`)
    console.log(`  ${'─'.repeat(55)}`)
    for (const saved of wl.stocks) {
      const cur = filteredResults.find((r) => r.code === saved.code)
      const newScore = cur?.combinedScore ?? null
      const delta = newScore != null ? newScore - saved.score : null
      const newRs = cur?.rsRank ?? null
      const deltaStr = delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}` : '—'
      console.log(`  ${pad(saved.code, 6)} ${saved.score.toFixed(1).padStart(10)} ${(newScore?.toFixed(1) ?? '—').padStart(10)} ${deltaStr.padStart(8)} ${String(saved.rsRank).padStart(8)} ${String(newRs ?? '—').padStart(8)}`)
    }
  }
}

// Phase 4A: Watchlist save
if (watchlistAction === 'save' && watchlistName) {
  const wlData: WatchlistFile = {
    date: dateFmt,
    stocks: top.map((r) => ({ code: r.code, name: r.name, score: r.combinedScore, rsRank: r.rsRank, stage: r.stage }))
  }
  await writeJsonFile(`${watchlistsDir}/${watchlistName}.json`, wlData)
  console.log(`  Watchlist "${watchlistName}" disimpan (${top.length} saham).`)
}

console.log(`  Untuk detail saham: deno run -A screen.ts --detail KODE`)
console.log(`  Mode: --mode technical|fundamental|combined|momentum|breakout|vcp|pullback|smt`)
console.log(`  Sort: --sort rs|eps|volume|foreign|momentum|atr|smt`)
console.log(`  Lainnya: --top N --min-score N --sector "nama" --compact --portfolio N --risk-pct N`)
console.log(`  Export: --export csv [--output file.csv]`)
console.log(`  Watchlist: --watchlist save|load|show|compare <nama>`)
console.log(`  Alert: --alert set <CODE> <type> <val> | --alert list | --alert clear <CODE>|all`)
console.log(`  Backtest: --backtest <CODE> [--days N]`)
console.log(dline + '\n')

client.close()
