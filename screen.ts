/**
 * IDX Screener — Terminal Screening Tool
 * Jalankan: deno run -A screen.ts [options]
 *
 * Options:
 *   --mode technical|fundamental|combined|momentum|breakout|vcp|pullback|smt|auto
 *   --top N                                (default: 15)
 *   --min-score N                          (default: 0)
 *   --sector "nama sektor"                 (default: semua)
 *   --detail KODE
 *   --sort rs|eps|volume|foreign|momentum|atr|smt|auto
 *   --compact
 *   --auto-detail N                        (default: 3, for auto mode)
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

// ─── Configuration ──────────────────────────────────────────────────────────
// All tunable thresholds in one place for easy backtesting and optimization.

const SCREEN_CONFIG = {
  // Stage & Trend
  stage: { proximityFactor: 0.99, confirmDays: 5, confirmMajority: 3 },
  rs: {
    weights: { r3m: 0.4, r6m: 0.2, r9m: 0.2, r12m: 0.2 },
    minRank: 70,
    minDataDays: 252,
  },
  // Trend Template criteria
  trend: {
    low52wMultiplier: 1.3,   // price >= 52w low × 1.3
    high52wMultiplier: 0.75, // price >= 52w high × 0.75
    trendWeight: 40,         // (criteriaCount/8) × 40
    rsWeight: 30,            // (rsRank/99) × 30
  },
  // Fundamental scoring
  fundamental: {
    roeCap: 35, roeMaxPts: 12,
    npmCap: 35, npmMaxPts: 9,
    synergyThreshold: 15, synergyBonus: 3,
    derLow: 0.5, derLowPts: 10,
    derMid: 1.0, derMidPts: 7,
    derHigh: 2.0, derHighPts: 4,
    salesGrowthHigh: 15, salesGrowthHighPts: 10,
    salesGrowthMid: 5, salesGrowthMidPts: 6,
    salesGrowthLow: 0, salesGrowthLowPts: 2,
    perRanges: [
      { min: 5, max: 20, pts: 5 },
      { min: 20, max: 30, pts: 3 },
      { min: 30, max: 50, pts: 1 },
    ],
  },
  // EPS scoring
  eps: {
    growthHigh: 25, growthHighPts: 8,
    growthMid: 10, growthMidPts: 5,
    growthLow: 0, growthLowPts: 2,
    accelerationPts: 4,
    recoveryPts: 2,
    consecutiveQPts: 3,
    consecutiveQMin: 2,
  },
  // Pattern detection
  patterns: {
    htfPoleGain: 0.80, htfFlagRange: 0.25, htfPoleDays: 40, htfFlagDays: 15,
    cupMinDays: 45, cupMaxDays: 90, cupDepthMin: 12, cupDepthMax: 35,
    cupRightRecovery: 0.92, cupHandleMaxRange: 12,
    flatRangeMax: 0.15, flatDays: 25,
    baseRangeMaxPct: 15,
    powerPlayRange: 0.03, powerPlayDry: 30,
    lowCheatRange: 0.05, lowCheatDry: 20,
  },
  // VCP detection
  vcp: {
    windowSize: 20, windows: 3,
    contractionRatio: 0.85,
    volumeDryRatio: 0.75,
    nearHighPct: -20,
  },
  // Breakout & Pivot
  breakout: {
    lookback: { 'cup-handle': 5, vcp: 20, htf: 15, default: 25 } as Record<string, number>,
    volRatioMin: 1.5,
    approachPct: 0.97,
    stopPct: 0.07,
  },
  // Sell signals
  sell: {
    bbConsecutiveDays: 3,
    stopBreachMultiplier: 0.93,
  },
  // Volume criteria
  volume: {
    cmfThreshold: 0, cmfDistThreshold: -0.05,
    mfiLow: 40, mfiHigh: 80, mfiDistThreshold: 35,
    obvTrendThreshold: 0.05,
    volSurgeThreshold: 20,
    foreignNetThreshold: 0,
    accumMinCriteria: 2, distMinCriteria: 2,
  },
  // Tech score weights
  techScore: {
    sepaBase: 50,
    stage2: 20, stage1: 10,
    rsNewHigh: 10, pocketPivot: 10,
    htf: 6, cupHandle: 4, flat: 2,
    powerPlay: 4, lowCheat: 2,
    vcp: 5,
  },
  // Combined score
  combined: { techWeight: 0.6, fundWeight: 0.4 },
  // Momentum factor weights (sum = 100)
  momentum: { rs: 30, eps: 20, trend: 20, vol: 15, foreign: 15, foreignClamp: 10 },
  // SMT thresholds
  smt: {
    strongBuy: 75, buy: 55, neutral: 35, sell: 20,
    filterThreshold: 20,
    foreignFlowOffset: 0.05, foreignFlowRange: 0.30,
    sustainedBuyDaysStrong: 15, sustainedNetPctStrong: 5,
    sustainedBuyDaysMid: 12, sustainedNetPctMid: 3,
    sustainedBuyDaysLow: 10,
    tradeSizeOffset: 30, tradeSizeRange: 80,
    bidOfferHigh: 1.5, bidOfferMid: 1.2, bidOfferLow: 1.0,
    brokerConcHigh: 70, brokerConcMid: 60, brokerConcLow: 50,
  },
  // AutoScore
  auto: {
    baseWeights: { combined: 0.35, momentum: 0.15, smt: 0.20 },
    stage2Bonus: 5,
    setupBonusCap: 20,
    breakoutBonus: 15, approachingBonus: 8, vcpBonus: 6, pullbackBonus: 4,
    pocketPivotBonus: 7, rsNewHighBonus: 6,
    brokerAccum2Bonus: 5, brokerAccum1Bonus: 3,
    fvgInZoneBonus: 4, fvgNearBonus: 2, fvgNearThreshold: 3,
    mjpBullishBonus: 2, mjpBearishPenalty: -2,
    cvBonus3: 5, cvBonus2: 2, cvForeignThreshold: 5,
    gorenganPenalty45: -10, gorenganPenalty30: -5,
    sellPenalty: { climax: 0.5, stop: -12, ma50: -6, obvDiv: -8, supportBreak: -10 },
    fundFloor: { min: 20, rampEnd: 35, minMult: 0.5 },
    parabolic: { extreme: { ratio: 5.0, mult: 0.2 }, high: { ratio: 3.0, mult: 0.4 }, mid: { ratio: 2.5, mult: 0.7 } },
    filterThreshold: 30,
  },
  // Gorengan filter
  gorengan: {
    xNotation: 40, umaRecent: 25, umaDays: 30,
    mcSmall: 100_000_000_000, mcSmallPts: 25,
    mcMid: 500_000_000_000, mcMidPts: 15,
    lowFloat: 0.20, lowFloatPts: 15,
    volSpike: 10, volSpikePts: 10,
    noEarnings: 5,
    parabolicExtreme: { ratio: 5.0, pts: 30 },
    parabolicHigh: { ratio: 3.0, pts: 20 },
    parabolicMid: { ratio: 2.5, pts: 10 },
    climax3m: { high: 300, highPts: 25, mid: 200, midPts: 15 },
    filterMax: 60,
  },
  // MJP
  mjp: { largeCap: 0.01, smallCap: 0.02 },
  // Date gap detection
  dateGap: { maxTradingDayGap: 3 },
  // Entry Plan
  entryPlan: {
    buyZoneMaxPct: 0.05,
    stopLossPct: 0.07,
    defaultPortfolio: 100_000_000,
    defaultRiskPct: 2,
    targetMultipliers: [1, 2, 3] as readonly number[],
  },
} as const

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
  foreignBuyDays20d: number
  avgTradeSize5d: number | null
  avgTradeSizeChange: number | null
  bidOfferRatio: number | null
  // Broker history fields
  accumulatingBrokers: string[]
  brokerConcentrationPct: number | null
  autoScore: number
  // Parabolic / overextension fields
  extensionRatio: number | null
  ret3mPct: number | null
  // FVG fields
  fvgBullishCount: number
  fvgBearishCount: number
  fvgPriceInZone: boolean
  fvgNearestPct: number | null
  // OBV Momentum Jangka Pendek (MJP)
  obvMjp: 'bullish' | 'bearish' | 'neutral'
  obvAboveSma10: boolean
  obvSma10Slope: number | null
  // Entry Plan
  entryType: 'breakout' | 'pullback' | 'none'
  buyZoneHigh: number | null
  entryStopLoss: number | null
  riskPerShare: number | null
  riskPct: number | null
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

// ─── Format helpers ──────────────────────────────────────────────────────────

/** Format foreign net shares as Rupiah value (shares × price), adaptive scale */
function formatForeignRp(netShares: number | null, price: number): string {
  if (netShares == null) return '—'
  const rp = netShares * price
  const abs = Math.abs(rp)
  const sign = rp >= 0 ? '+' : ''
  if (abs >= 1e12) return `${sign}${(rp / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${sign}${(rp / 1e9).toFixed(1)}B`
  return `${sign}${(rp / 1e6).toFixed(0)}M`
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
  const PROX = SCREEN_CONFIG.stage.proximityFactor
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
  const confirmDays = SCREEN_CONFIG.stage.confirmDays
  const majority = SCREEN_CONFIG.stage.confirmMajority
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

/**
 * Calculate single-quarter EPS from YTD-cumulative profitAttrOwner data.
 *
 * IMPORTANT: profitAttrOwner in financial_ratio is YTD cumulative:
 *   Q1 = Jan-Mar profit, Q2 = Jan-Jun (cumulative), Q3 = Jan-Sep (cumulative), Q4 = full year
 *
 * To extract single-quarter profit: current_YTD - previous_quarter_YTD
 *   Q1: Q1_YTD - 0, Q2: Q2_YTD - Q1_YTD, Q3: Q3_YTD - Q2_YTD, Q4: Q4_YTD - Q3_YTD
 *
 * The `?? 0` handles Q1 correctly (no previous quarter → full Q1 YTD = Q1 period profit).
 * See also: DataEnrichment.ts TTM calculation: currentYtd + (prevFY - prevSameQ)
 */
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

function calcEpsInfo(histRows: HistRow[]): { score: number; latestGrowthPct: number | null; acceleration: boolean; recovery: boolean; consecutiveGrowthQ: number } {
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
  if (latestYear == null || latestQ == null) return { score: 0, latestGrowthPct: null, acceleration: false, recovery: false, consecutiveGrowthQ: 0 }
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
  // Acceleration: only TRUE when latest growth is positive AND improving (Minervini: accelerating earnings)
  // Recovery: negative growth but improving (e.g. -57% from -77% = improving but NOT accelerating)
  const acceleration = latestGrowthPct != null && prevGrowthPct != null && latestGrowthPct > 0 && latestGrowthPct > prevGrowthPct
  const recovery = !acceleration && latestGrowthPct != null && prevGrowthPct != null && latestGrowthPct > prevGrowthPct && latestGrowthPct < 0
  let consecutiveGrowthQ = 0
  let cy = latestYear; let cq = latestQ
  for (let i = 0; i < 4; i++) {
    const ce = calcQEps(byKey, cy, cq); const pe = calcQEps(byKey, cy - 1, cq)
    if (ce != null && pe != null && ce > pe) { consecutiveGrowthQ++ } else break
    cq--; if (cq === 0) { cq = 4; cy-- }
  }
  let score = 0
  if (latestGrowthPct != null) {
    if (latestGrowthPct >= SCREEN_CONFIG.eps.growthHigh) score += SCREEN_CONFIG.eps.growthHighPts
    else if (latestGrowthPct >= SCREEN_CONFIG.eps.growthMid) score += SCREEN_CONFIG.eps.growthMidPts
    else if (latestGrowthPct >= SCREEN_CONFIG.eps.growthLow) score += SCREEN_CONFIG.eps.growthLowPts
  }
  if (acceleration) score += SCREEN_CONFIG.eps.accelerationPts
  else if (recovery) score += SCREEN_CONFIG.eps.recoveryPts
  if (consecutiveGrowthQ >= SCREEN_CONFIG.eps.consecutiveQMin) score += SCREEN_CONFIG.eps.consecutiveQPts
  return { score, latestGrowthPct, acceleration, recovery, consecutiveGrowthQ }
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

// OBV trend is now computed via calcOBVMomentum().trend20d

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

// ─── Fair Value Gap (FVG) detection ──────────────────────────────────────────

type FvgZone = { type: 'bullish' | 'bearish'; top: number; bottom: number; dayIndex: number }

function detectFVG(
  rows: { high: number; low: number; close: number; volume: number }[],
  lookback = 20
): { bullishCount: number; bearishCount: number; nearestBullish: FvgZone | null; priceinFVG: boolean } {
  if (rows.length < 3) return { bullishCount: 0, bearishCount: 0, nearestBullish: null, priceinFVG: false }

  const start = Math.max(2, rows.length - lookback)
  const zones: FvgZone[] = []

  for (let i = start; i < rows.length; i++) {
    const candle1 = rows[i - 2]!
    const candle3 = rows[i]!

    // Bullish FVG: candle 3's low > candle 1's high (gap up)
    if (candle3.low > candle1.high) {
      zones.push({ type: 'bullish', top: candle3.low, bottom: candle1.high, dayIndex: i })
    }
    // Bearish FVG: candle 1's low > candle 3's high (gap down)
    if (candle1.low > candle3.high) {
      zones.push({ type: 'bearish', top: candle1.low, bottom: candle3.high, dayIndex: i })
    }
  }

  // Filter: only keep unfilled FVGs (price hasn't revisited the zone yet)
  const currentPrice = rows[rows.length - 1]!.close
  const unfilledBullish: FvgZone[] = []
  const unfilledBearish: FvgZone[] = []

  for (const zone of zones) {
    let filled = false
    for (let j = zone.dayIndex + 1; j < rows.length; j++) {
      if (zone.type === 'bullish' && rows[j]!.low <= zone.bottom) { filled = true; break }
      if (zone.type === 'bearish' && rows[j]!.high >= zone.top) { filled = true; break }
    }
    if (!filled) {
      if (zone.type === 'bullish') unfilledBullish.push(zone)
      else unfilledBearish.push(zone)
    }
  }

  // Find nearest bullish FVG below current price (support)
  let nearestBullish: FvgZone | null = null
  let nearestDist = Infinity
  for (const z of unfilledBullish) {
    const dist = currentPrice - z.top
    if (dist >= 0 && dist < nearestDist) {
      nearestDist = dist
      nearestBullish = z
    }
  }

  // Check if current price is inside any bullish FVG (bounce zone)
  const priceinFVG = unfilledBullish.some((z) =>
    currentPrice >= z.bottom && currentPrice <= z.top * 1.02
  )

  return {
    bullishCount: unfilledBullish.length,
    bearishCount: unfilledBearish.length,
    nearestBullish,
    priceinFVG
  }
}

// ─── OBV Short-Term Momentum (MJP / SMA10) ─────────────────────────────────

function calcOBVMomentum(rows: { close: number; volume: number }[], slopeThreshold = 0.02): {
  trend20d: 'up' | 'down' | 'flat'
  mjp: 'bullish' | 'bearish' | 'neutral'
  obvAboveSma10: boolean
  obvSma10Slope: number | null
} {
  if (rows.length < 20) return { trend20d: 'flat', mjp: 'neutral', obvAboveSma10: false, obvSma10Slope: null }

  // Build full OBV series
  let obv = 0
  const obvSeries: number[] = [0]
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.close > rows[i - 1]!.close) obv += rows[i]!.volume
    else if (rows[i]!.close < rows[i - 1]!.close) obv -= rows[i]!.volume
    obvSeries.push(obv)
  }

  // 20-day trend (original logic)
  const recent20 = obvSeries.slice(-20)
  const first20 = recent20[0]!
  const last20 = recent20[recent20.length - 1]!
  const scale20 = Math.abs(first20) || 1
  const pct20 = (last20 - first20) / scale20
  const trend20d: 'up' | 'down' | 'flat' = pct20 > 0.05 ? 'up' : pct20 < -0.05 ? 'down' : 'flat'

  // SMA10 of OBV
  if (obvSeries.length < 12) return { trend20d, mjp: 'neutral', obvAboveSma10: false, obvSma10Slope: null }

  const sma10Now = obvSeries.slice(-10).reduce((a, b) => a + b, 0) / 10
  const sma10Prev = obvSeries.slice(-12, -2).reduce((a, b) => a + b, 0) / 10
  const currentObv = obvSeries[obvSeries.length - 1]!
  const obvAboveSma10 = currentObv > sma10Now

  // SMA10 slope: positive = upward momentum
  const slopeScale = Math.abs(sma10Prev) || 1
  const obvSma10Slope = (sma10Now - sma10Prev) / slopeScale

  // MJP determination: OBV above SMA10 AND slope positive = bullish momentum
  // Threshold is adaptive: lower for large-cap stocks (smoother OBV movement)
  let mjp: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  if (obvAboveSma10 && obvSma10Slope > slopeThreshold) mjp = 'bullish'
  else if (!obvAboveSma10 && obvSma10Slope < -slopeThreshold) mjp = 'bearish'

  return { trend20d, mjp, obvAboveSma10, obvSma10Slope }
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
    if (depthPct < SCREEN_CONFIG.patterns.cupDepthMin || depthPct > SCREEN_CONFIG.patterns.cupDepthMax) continue
    if (rightHigh / leftHigh < SCREEN_CONFIG.patterns.cupRightRecovery) continue
    const handle = rows.slice(-5)
    const handleHigh = Math.max(...handle.map((r) => r.high))
    const handleLow = Math.min(...handle.map((r) => r.low))
    const handleRange = handleHigh > 0 ? ((handleHigh - handleLow) / handleHigh) * 100 : Infinity
    if (handleRange > SCREEN_CONFIG.patterns.cupHandleMaxRange) continue
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
  lookback = SCREEN_CONFIG.breakout.lookback[patternType] ?? SCREEN_CONFIG.breakout.lookback['default']!
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
const autoDetailN = args.includes('--auto-detail') ? Number(args[args.indexOf('--auto-detail') + 1]) : 3

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
  // Detect identical broker data bug: if all values are the same, data is aggregated incorrectly
  if (brokerConcentrationMapScreen.size > 10) {
    const vals = new Set(brokerConcentrationMapScreen.values())
    if (vals.size === 1) {
      console.warn(`[WARN] Semua ${brokerConcentrationMapScreen.size} saham memiliki top3_volume_pct identik (${[...vals][0]}%) — data broker tidak valid, dinonaktifkan`)
      brokerConcentrationMapScreen.clear()
    }
  }
} catch {
  // broker_top_daily not available — degrade gracefully (run deno task db:fetch-broker)
}

// ─── Date Gap Detection ──────────────────────────────────────────────────────
// Detect per-stock gaps (not market-wide closures like Lebaran/holiday)
{
  // First, find market-wide gap dates by checking a sample of stocks
  const gapCounts = new Map<string, number>() // "prevDate-currDate" → count of stocks with this gap
  const sampleCodes = Array.from(ohlcByCode.keys()).slice(0, 50)
  for (const sc of sampleCodes) {
    const ents = ohlcByCode.get(sc)!
    for (let i = 1; i < ents.length; i++) {
      const pStr = String(ents[i - 1]!.date)
      const cStr = String(ents[i]!.date)
      const pD = new Date(`${pStr.slice(0, 4)}-${pStr.slice(4, 6)}-${pStr.slice(6, 8)}`)
      const cD = new Date(`${cStr.slice(0, 4)}-${cStr.slice(4, 6)}-${cStr.slice(6, 8)}`)
      const calDays = (cD.getTime() - pD.getTime()) / (24 * 60 * 60 * 1000)
      const tradDays = Math.round(calDays * 5 / 7)
      if (tradDays > SCREEN_CONFIG.dateGap.maxTradingDayGap) {
        const key = `${pStr}-${cStr}`
        gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1)
      }
    }
  }
  // Market-wide gaps: present in 80%+ of sample stocks → holiday, ignore
  const marketGaps = new Set<string>()
  for (const [key, count] of gapCounts) {
    if (count >= sampleCodes.length * 0.8) marketGaps.add(key)
  }
  // Now warn only per-stock gaps (not holidays)
  let stockGapCount = 0
  for (const [code, entries] of ohlcByCode) {
    if (entries.length < 2) continue
    for (let i = 1; i < entries.length; i++) {
      const pStr = String(entries[i - 1]!.date)
      const cStr = String(entries[i]!.date)
      const key = `${pStr}-${cStr}`
      if (marketGaps.has(key)) continue // skip market-wide holidays
      const pD = new Date(`${pStr.slice(0, 4)}-${pStr.slice(4, 6)}-${pStr.slice(6, 8)}`)
      const cD = new Date(`${cStr.slice(0, 4)}-${cStr.slice(4, 6)}-${cStr.slice(6, 8)}`)
      const calDays = (cD.getTime() - pD.getTime()) / (24 * 60 * 60 * 1000)
      const tradDays = Math.round(calDays * 5 / 7)
      if (tradDays > SCREEN_CONFIG.dateGap.maxTradingDayGap) {
        console.warn(`[WARN] ${code}: gap ${tradDays}d antara ${pStr} dan ${cStr} (per-stock)`)
        stockGapCount++
        break // warn once per stock
      }
    }
  }
  if (marketGaps.size > 0) {
    console.warn(`[INFO] ${marketGaps.size} market-wide gap (libur) terdeteksi, diabaikan`)
  }
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
  if (entries.length < SCREEN_CONFIG.rs.minDataDays) continue
  const closes = entries.map((e) => e.close)
  const r3m = returnPct(closes[closes.length - 1]!, closes[closes.length - 63]!)
  const r6m = closes.length >= 126 ? returnPct(closes[closes.length - 1]!, closes[closes.length - 126]!) : null
  const r9m = closes.length >= 189 ? returnPct(closes[closes.length - 1]!, closes[closes.length - 189]!) : null
  const r12m = returnPct(closes[closes.length - 1]!, closes[closes.length - 252]!)
  rsScores.set(code, { score: (r3m ?? 0) * SCREEN_CONFIG.rs.weights.r3m + (r6m ?? 0) * SCREEN_CONFIG.rs.weights.r6m + (r9m ?? 0) * SCREEN_CONFIG.rs.weights.r9m + (r12m ?? 0) * SCREEN_CONFIG.rs.weights.r12m, rank: 0 })
}
const sortedByRs = Array.from(rsScores.entries()).sort((a, b) => a[1].score - b[1].score)
for (let i = 0; i < sortedByRs.length; i++) {
  rsScores.get(sortedByRs[i]![0])!.rank = Math.max(1, Math.round(((i + 1) / sortedByRs.length) * 99))
}

// ─── Screen each stock ────────────────────────────────────────────────────────

const results: ScreenRow[] = []
const firstIhsg = ihsgByDate.size > 0 ? (ihsgByDate.values().next().value ?? 1) : 1

// Compute median 20d average volume across all stocks for adaptive MJP threshold
const allAvgVol20: number[] = []
for (const [, ents] of ohlcByCode) {
  if (ents.length >= 20) {
    const v20 = ents.slice(-20).reduce((s, e) => s + e.volume, 0) / 20
    if (v20 > 0) allAvgVol20.push(v20)
  }
}
allAvgVol20.sort((a, b) => a - b)
const medianVol20 = allAvgVol20.length > 0 ? allAvgVol20[Math.floor(allAvgVol20.length / 2)]! : 1

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

  // ── Hoist MA200 (reused by gorenganScore + autoScore) ────────────────────
  const ma200Early = closes.length >= 200
    ? closes.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200
    : null
  const extensionRatio = (ma200Early != null && ma200Early > 0) ? price / ma200Early : null
  const ret3mPct = closes.length >= 63 && closes[closes.length - 63]! > 0
    ? ((price - closes[closes.length - 63]!) / closes[closes.length - 63]!) * 100
    : null

  // Gorengan filter
  let gorenganScore = 0
  if (sc?.notation === 'X') gorenganScore += SCREEN_CONFIG.gorengan.xNotation
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
  // Layer 1: Parabolic extension penalty
  if (extensionRatio != null) {
    if (extensionRatio > 5.0) gorenganScore += 30
    else if (extensionRatio > 3.0) gorenganScore += 20
    else if (extensionRatio > 2.5) gorenganScore += 10
  }
  // Layer 1: 3-month climax run penalty
  if (ret3mPct != null) {
    if (ret3mPct > 300) gorenganScore += 25
    else if (ret3mPct > 200) gorenganScore += 15
  }
  if (gorenganScore >= SCREEN_CONFIG.gorengan.filterMax) continue

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
  const c6 = low52w > 0 && price >= low52w * SCREEN_CONFIG.trend.low52wMultiplier
  const c7 = high52w > 0 && price >= high52w * SCREEN_CONFIG.trend.high52wMultiplier
  const c8 = rsRank >= SCREEN_CONFIG.rs.minRank
  const trendCriteriaCount = [c1, c2, c3, c4, c5, c6, c7, c8].filter(Boolean).length
  const trendScore = (trendCriteriaCount / 8) * SCREEN_CONFIG.trend.trendWeight
  const rsScore30 = (rsRank / 99) * SCREEN_CONFIG.trend.rsWeight

  // EPS & Fundamental
  const histRows = historyByCode.get(code) ?? []
  const epsInfo = calcEpsInfo(histRows)
  const roe = sc?.roe ?? 0
  const npm = sc?.npm ?? 0
  const der = sc?.der ?? 999
  const per = sc?.per ?? 0

  let fundScoreFull = epsInfo.score
  fundScoreFull += Math.min(roe / SCREEN_CONFIG.fundamental.roeCap, 1) * SCREEN_CONFIG.fundamental.roeMaxPts + Math.min(npm / SCREEN_CONFIG.fundamental.npmCap, 1) * SCREEN_CONFIG.fundamental.npmMaxPts
  // Synergy bonus: companies with both strong ROE and NPM deserve extra credit
  if (roe >= SCREEN_CONFIG.fundamental.synergyThreshold && npm >= SCREEN_CONFIG.fundamental.synergyThreshold) fundScoreFull += SCREEN_CONFIG.fundamental.synergyBonus
  if (der <= SCREEN_CONFIG.fundamental.derLow) fundScoreFull += SCREEN_CONFIG.fundamental.derLowPts
  else if (der <= SCREEN_CONFIG.fundamental.derMid) fundScoreFull += SCREEN_CONFIG.fundamental.derMidPts
  else if (der <= SCREEN_CONFIG.fundamental.derHigh) fundScoreFull += SCREEN_CONFIG.fundamental.derHighPts
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

  const sepaScore = Math.min(100, trendScore + rsScore30 + epsInfo.score + Math.min(roe / SCREEN_CONFIG.fundamental.roeCap, 1) * SCREEN_CONFIG.fundamental.roeMaxPts + Math.min(npm / SCREEN_CONFIG.fundamental.npmCap, 1) * SCREEN_CONFIG.fundamental.npmMaxPts)

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
  // Adaptive MJP threshold: large-cap (vol > median) uses 0.01, small-cap uses 0.02
  const avgVol20d = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length)
  const mjpThreshold = avgVol20d >= medianVol20 ? SCREEN_CONFIG.mjp.largeCap : SCREEN_CONFIG.mjp.smallCap
  const obvMom = calcOBVMomentum(ohlcvForVol, mjpThreshold)
  const obvTrend = obvMom.trend20d

  // Fair Value Gap detection
  const fvgResult = detectFVG(ohlcvForVol)
  const fvgNearestPct = fvgResult.nearestBullish != null && price > 0
    ? ((price - fvgResult.nearestBullish.top) / price) * 100
    : null

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
    if (price > pivotPoint && breakoutVolRatio != null && breakoutVolRatio > SCREEN_CONFIG.breakout.volRatioMin) {
      breakoutSignal = 'breakout'
    } else if (price >= pivotPoint * SCREEN_CONFIG.breakout.approachPct && price <= pivotPoint) {
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
    // 3. 7% Stop below pivot — only for actual breakout stocks (Minervini: stop from buy point)
    if (sellSignal == null && pivotPoint != null && price < pivotPoint * SCREEN_CONFIG.sell.stopBreachMultiplier && breakoutSignal === 'breakout') {
      sellSignal = '7% Stop Breach'
    }
    // 4. Breakdown MA50 — context signal for non-breakout stocks trading below key MA
    if (sellSignal == null && ma50 != null && price < ma50 && stage === 2) {
      sellSignal = 'Breakdown MA50'
    }
    // 5. OBV Divergence: price makes new high but OBV makes lower high (bearish)
    if (sellSignal == null && entries.length >= 40) {
      let divObv = 0
      const divOBV: number[] = [0]
      for (let di = 1; di < entries.length; di++) {
        if (entries[di]!.close > entries[di - 1]!.close) divObv += entries[di]!.volume
        else if (entries[di]!.close < entries[di - 1]!.close) divObv -= entries[di]!.volume
        divOBV.push(divObv)
      }
      const recentCloseHigh = Math.max(...closes.slice(-20))
      const priorCloseHigh = Math.max(...closes.slice(-40, -20))
      const recentOBVHigh = Math.max(...divOBV.slice(-20))
      const priorOBVHigh = Math.max(...divOBV.slice(-40, -20))
      if (recentCloseHigh > priorCloseHigh && recentOBVHigh < priorOBVHigh) {
        sellSignal = 'OBV Divergence'
      }
    }
    // 6. Support Breakdown: price below recent base low (25d, excl last 5d)
    if (sellSignal == null && entries.length >= 25) {
      const baseLow = Math.min(...lows.slice(-25, -5))
      if (price < baseLow) {
        sellSignal = 'Support Breakdown'
      }
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

  // ─── Entry Plan computation ─────────────────────────────────────────────────
  const epCfg = SCREEN_CONFIG.entryPlan
  let entryType: 'breakout' | 'pullback' | 'none' = 'none'
  let buyZoneHigh: number | null = null
  let entryStopLoss: number | null = null
  let riskPerShareCalc: number | null = null
  let entryRiskPct: number | null = null

  if (breakoutSignal === 'breakout' || breakoutSignal === 'approaching') {
    entryType = 'breakout'
    if (pivotPoint != null) {
      buyZoneHigh = pivotPoint * (1 + epCfg.buyZoneMaxPct)
      entryStopLoss = pivotPoint * (1 - epCfg.stopLossPct)
      riskPerShareCalc = pivotPoint - entryStopLoss
      entryRiskPct = (riskPerShareCalc / pivotPoint) * 100
    }
  } else if (pullbackSignal && ema21 != null) {
    entryType = 'pullback'
    buyZoneHigh = ema21 * 1.02
    const stopFromMa50 = ma50 ?? ema21 * (1 - epCfg.stopLossPct)
    const stopFromPct = ema21 * (1 - epCfg.stopLossPct)
    entryStopLoss = Math.max(stopFromMa50, stopFromPct)
    riskPerShareCalc = ema21 - entryStopLoss
    entryRiskPct = ema21 > 0 ? (riskPerShareCalc / ema21) * 100 : null
  }

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
  if (argMode !== 'auto' && argMode !== 'smt' && sortScore < minScore) continue

  // Reasons
  const reasons: string[] = []
  if (sepaScore >= 60) reasons.push(`SEPA ${Math.round(sepaScore)}, Stage ${stage}, RS ${rsRank}`)
  if (rsLineNewHigh) reasons.push('RS Line New High')
  if (epsInfo.latestGrowthPct != null) {
    let msg = `EPS ${epsInfo.latestGrowthPct >= 0 ? '+' : ''}${epsInfo.latestGrowthPct.toFixed(1)}% YoY`
    if (epsInfo.acceleration) msg += ', akselerasi'
    else if (epsInfo.recovery) msg += ', perbaikan'
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
  if (fvgResult.priceinFVG) reasons.push('Harga di zona FVG bullish (support)')
  else if (fvgResult.bullishCount > 0 && fvgNearestPct != null && fvgNearestPct < 5) reasons.push(`FVG bullish terdekat ${fvgNearestPct.toFixed(1)}% di bawah`)
  if (fvgResult.bearishCount > 0 && fvgResult.bullishCount === 0) reasons.push(`FVG bearish (${fvgResult.bearishCount} gap)`)
  if (obvMom.mjp === 'bullish') reasons.push('MJP: OBV > SMA10 ↑ (momentum positif)')
  else if (obvMom.mjp === 'bearish') reasons.push('MJP: OBV < SMA10 ↓ (momentum negatif)')
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
  else if (smtForeignFlowScore <= 8 && smtHasEnoughData) { smtReasons.push('Foreign distributing') }
  if (smtStreak >= 5) { smtBullishCount++; smtReasons.push(`Asing beli ${smtStreak}h berturut`) }

  // 2B. Sustained Accumulation (10 pts) — catches steady foreign buying that acceleration misses
  //     Counts net buy days in 20d window + checks if cumulative foreignNetPct > 5%
  let smtSustainedScore = 0
  let foreignBuyDays20d = 0
  if (smtHasEnoughData) {
    for (const e of entries.slice(-20)) {
      if (e.foreignBuy > e.foreignSell) foreignBuyDays20d++
    }
    // Strong sustained: 15+ buy days out of 20 AND positive net flow
    if (foreignBuyDays20d >= 15 && foreignNetPct != null && foreignNetPct > 5) {
      smtSustainedScore = 10; smtBullishCount++
      smtReasons.push(`Akumulasi asing stabil (${foreignBuyDays20d}/20h beli, net +${foreignNetPct.toFixed(1)}%)`)
    } else if (foreignBuyDays20d >= 12 && foreignNetPct != null && foreignNetPct > 3) {
      smtSustainedScore = 6
      smtReasons.push(`Asing cenderung beli (${foreignBuyDays20d}/20h beli)`)
    } else if (foreignBuyDays20d >= 10 && foreignNetPct != null && foreignNetPct > 0) {
      smtSustainedScore = 3
    }
  }

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
  let smtCrossScore = smtBullishCount >= 4 ? 15 : smtBullishCount === 3 ? 10 : smtBullishCount === 2 ? 5 : 0

  // 7. Broker concentration scoring (0-10 pts) — matches server smart-money.ts logic
  const smtBrokerConc = brokerConcentrationMapScreen.get(code) ?? null
  let smtBrokerConcScore = 0
  if (smtBrokerConc != null) {
    if (smtBrokerConc >= 70) { smtBrokerConcScore = 10; smtBullishCount++; smtReasons.push(`Broker terkonsentrasi (top3: ${smtBrokerConc.toFixed(0)}%)`) }
    else if (smtBrokerConc >= 60) smtBrokerConcScore = 7
    else if (smtBrokerConc >= 50) smtBrokerConcScore = 4
  }
  // Re-calc cross-signal with broker info (same as server)
  if (smtBrokerConcScore >= 7) {
    if (smtBullishCount >= 5) smtCrossScore = 15
    else if (smtBullishCount === 4) smtCrossScore = 12
    else if (smtBullishCount === 3) smtCrossScore = 8
  }

  // 8. Broker accumulation bonus (from broker_top_daily — +2/+3 pts, cap total at 100)
  const smtAccumBrokers = brokerAccumMapScreen.get(code) ?? []
  let smtBrokerAccumBonus = 0
  if (smtAccumBrokers.length >= 2) {
    smtBrokerAccumBonus = 3
    smtReasons.push(`${smtAccumBrokers.slice(0, 2).join(', ')} akumulasi konsisten`)
  } else if (smtAccumBrokers.length === 1) {
    smtBrokerAccumBonus = 2
    smtReasons.push(`${smtAccumBrokers[0]} akumulasi konsisten 20h`)
  }

  const smtBaseScore = smtForeignFlowScore + smtForeignStreakScore + smtSustainedScore + smtVolPriceScore + smtTradeSizeScore + smtBidOfferScore + smtCrossScore + smtBrokerConcScore
  const smtScore = Math.min(100, smtBaseScore + smtBrokerAccumBonus)
  const smtSignal: ScreenRow['smtSignal'] = smtScore >= 75 ? 'strong-buy' : smtScore >= 55 ? 'buy' : smtScore >= 35 ? 'neutral' : smtScore >= 20 ? 'sell' : 'strong-sell'

  // AutoScore: normalized ~100, stacked bonuses, severity-based penalties
  // Base (max 70): combined 0-35, momentum 0-15, smt 0-20
  let autoScore = (combinedScore * SCREEN_CONFIG.auto.baseWeights.combined) + (momentumFactor * SCREEN_CONFIG.auto.baseWeights.momentum) + (smtScore * SCREEN_CONFIG.auto.baseWeights.smt)
  // Stage 2 quality boost
  if (stage === 2) autoScore += SCREEN_CONFIG.auto.stage2Bonus
  // Setup bonuses — stackable, capped at 20
  let autoSetupBonus = 0
  if (breakoutSignal === 'breakout') autoSetupBonus += 15
  else if (breakoutSignal === 'approaching') autoSetupBonus += 8
  if (vcpResult.isVcp) autoSetupBonus += 6
  if (pullbackSignal) autoSetupBonus += 4
  autoScore += Math.min(autoSetupBonus, 20)
  // Signal quality bonuses (max 18)
  if (hasPocketPivot) autoScore += 7
  if (rsLineNewHigh) autoScore += 6
  if (smtAccumBrokers.length >= 2) autoScore += 5
  else if (smtAccumBrokers.length === 1) autoScore += 3
  // FVG + MJP bonuses (max 6)
  if (fvgResult.priceinFVG) autoScore += 4
  else if (fvgResult.bullishCount > 0 && fvgNearestPct != null && fvgNearestPct < 3) autoScore += 2
  if (obvMom.mjp === 'bullish') autoScore += 2
  else if (obvMom.mjp === 'bearish') autoScore -= 2
  // Cross-validation convergence bonus: reward when multiple independent signals align
  // volume=akumulasi AND foreignNet>5% AND brokerAccum≥2 → all 3 independently confirm institutional buying
  const cvVolAccum = volumeSignal === 'akumulasi'
  const cvForeignStrong = foreignNetPct != null && foreignNetPct > 5
  const cvBrokerAccum = smtAccumBrokers.length >= 2
  const cvCount = [cvVolAccum, cvForeignStrong, cvBrokerAccum].filter(Boolean).length
  if (cvCount === 3) autoScore += 5
  else if (cvCount === 2) autoScore += 2
  // Gorengan gradual penalty
  if (gorenganScore >= 45) autoScore -= 10
  else if (gorenganScore >= 30) autoScore -= 5
  // Sell signal — severity-based penalty (not blanket ×0.5)
  if (sellSignal === 'Climax Top' || sellSignal === 'Upper BB 3d+') autoScore *= 0.5
  else if (sellSignal === '7% Stop Breach') autoScore -= 12
  else if (sellSignal === 'Breakdown MA50') autoScore += SCREEN_CONFIG.auto.sellPenalty.ma50
  else if (sellSignal === 'OBV Divergence') autoScore += SCREEN_CONFIG.auto.sellPenalty.obvDiv
  else if (sellSignal === 'Support Breakdown') autoScore += SCREEN_CONFIG.auto.sellPenalty.supportBreak
  // Layer 2: Fundamental floor — gradual linear ramp (no cliff edge)
  // fundScore 0→20: multiplier 0.5, fundScore 20→35: ramp 0.5→1.0, fundScore ≥35: no penalty
  if (finalFundScore < 20) autoScore *= 0.5
  else if (finalFundScore < 35) autoScore *= 0.5 + 0.5 * ((finalFundScore - 20) / 15)
  // Layer 2: Parabolic extension — multiplicative penalty
  if (extensionRatio != null) {
    if (extensionRatio > 5.0) autoScore *= 0.2
    else if (extensionRatio > 3.0) autoScore *= 0.4
    else if (extensionRatio > 2.5) autoScore *= 0.7
  }
  autoScore = Math.max(0, Math.min(100, autoScore))

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
    foreignBuyDays20d,
    avgTradeSize5d: smtAvgTradeSize5d,
    avgTradeSizeChange: smtTradeSizeChange,
    bidOfferRatio: smtBidOfferRatio,
    accumulatingBrokers: smtAccumBrokers,
    brokerConcentrationPct: brokerConcentrationMapScreen.get(code) ?? null,
    autoScore,
    extensionRatio,
    ret3mPct,
    fvgBullishCount: fvgResult.bullishCount,
    fvgBearishCount: fvgResult.bearishCount,
    fvgPriceInZone: fvgResult.priceinFVG,
    fvgNearestPct,
    obvMjp: obvMom.mjp,
    obvAboveSma10: obvMom.obvAboveSma10,
    obvSma10Slope: obvMom.obvSma10Slope,
    entryType,
    buyZoneHigh,
    entryStopLoss,
    riskPerShare: riskPerShareCalc,
    riskPct: entryRiskPct
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
  filteredResults = results.filter((r) => r.smtScore >= Math.max(20, minScore))
} else if (argMode === 'auto') {
  filteredResults = results.filter((r) => r.autoScore >= Math.max(SCREEN_CONFIG.auto.filterThreshold, minScore))
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
  if (sortBy === 'auto') return b.autoScore - a.autoScore
  // default sort by score
  const sa = argMode === 'technical' ? a.techScore : argMode === 'fundamental' ? a.fundScore : argMode === 'momentum' ? a.momentumFactor : argMode === 'smt' ? a.smtScore : argMode === 'auto' ? a.autoScore : a.combinedScore
  const sb = argMode === 'technical' ? b.techScore : argMode === 'fundamental' ? b.fundScore : argMode === 'momentum' ? b.momentumFactor : argMode === 'smt' ? b.smtScore : argMode === 'auto' ? b.autoScore : b.combinedScore
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

function printStockDetail(row: ScreenRow) {
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
  const mjpColor = row.obvMjp === 'bullish' ? '\x1b[32m' : row.obvMjp === 'bearish' ? '\x1b[31m' : '\x1b[90m'
  const mjpLabel = row.obvMjp === 'bullish' ? 'BULLISH ↑' : row.obvMjp === 'bearish' ? 'BEARISH ↓' : 'NETRAL'
  console.log(`  ${tick(row.obvMjp === 'bullish')} MJP (OBV SMA10): ${mjpColor}${mjpLabel}\x1b[0m | OBV ${row.obvAboveSma10 ? '>' : '<'} SMA10 | Slope: ${row.obvSma10Slope != null ? (row.obvSma10Slope > 0 ? '+' : '') + row.obvSma10Slope.toFixed(3) : '—'}`)
  console.log(`  ${tick((row.foreignNetPct ?? 0) > 0)} Foreign Flow: ${row.foreignNetPct != null ? `${row.foreignNetPct > 0 ? '+' : ''}${row.foreignNetPct.toFixed(1)}%` : '—'}${row.volSurgePct != null ? ` | Vol Surge: ${row.volSurgePct > 0 ? '+' : ''}${row.volSurgePct.toFixed(1)}%` : ''}`)
  // FVG section
  const fvgHasBullish = row.fvgBullishCount > 0
  const fvgInZone = row.fvgPriceInZone
  const fvgLabel = fvgInZone ? '\x1b[32mHarga di zona FVG (support)\x1b[0m' : fvgHasBullish ? `${row.fvgBullishCount} gap bullish (terdekat ${fNum(row.fvgNearestPct, 1)}% bawah)` : 'Tidak ada FVG bullish'
  console.log(`  ${tick(fvgHasBullish)} FVG: ${fvgLabel}${row.fvgBearishCount > 0 ? ` | ${row.fvgBearishCount} gap bearish` : ''}`)
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
  // ─── Entry Plan section ────────────────────────────────────────────────────
  if (row.entryType !== 'none') {
    const epCfg = SCREEN_CONFIG.entryPlan
    const portfolioForCalc = portfolioSize > 0 ? portfolioSize : epCfg.defaultPortfolio
    const riskPctForCalc = portfolioSize > 0 ? riskPct : epCfg.defaultRiskPct
    console.log(`  ═══ Entry Plan ═══`)

    if (row.entryType === 'breakout' && row.pivotPoint != null) {
      const pivot = row.pivotPoint
      const buyHigh = row.buyZoneHigh ?? pivot * 1.05
      const stop = row.entryStopLoss ?? pivot * 0.93
      const risk = pivot - stop
      const patLabel = row.patternType === 'cup-handle' ? 'Cup & Handle high'
        : row.patternType === 'htf' ? 'High Tight Flag high'
        : row.patternType === 'flat' ? 'Flat Base high'
        : row.vcpIsVcp ? 'VCP resistance' : 'Resistance high'

      console.log(`  Entry Type     : \x1b[32mBREAKOUT\x1b[0m`)
      console.log(`  Pivot Point    : Rp ${fIDR(pivot)} (${patLabel})`)
      console.log(`  Buy Zone       : Rp ${fIDR(pivot)} - ${fIDR(buyHigh)} (+0% to +${((buyHigh / pivot - 1) * 100).toFixed(0)}%)`)
      console.log(`  Stop Loss      : Rp ${fIDR(stop)} (${((1 - stop / pivot) * 100).toFixed(0)}% below pivot)`)
      console.log(`  Risk per Share : Rp ${risk.toFixed(0)} (${row.riskPct?.toFixed(1) ?? '?'}%)`)
      for (const mult of epCfg.targetMultipliers) {
        const target = pivot + risk * mult
        const targetPct = ((target - pivot) / pivot) * 100
        console.log(`  Target (${mult}R)    : Rp ${fIDR(target)} (+${targetPct.toFixed(1)}%)`)
      }
      const maxMult = epCfg.targetMultipliers[epCfg.targetMultipliers.length - 1] ?? 3
      console.log(`  R/R Ratio      : 1:${maxMult} (jika target ${maxMult}R)`)
      if (risk > 0) {
        const riskPerTrade = portfolioForCalc * riskPctForCalc / 100
        const lots = Math.floor(riskPerTrade / risk / 100)
        console.log(`  Position Size  : ${lots} lot @ Rp ${fIDR(pivot)} (risk ${riskPctForCalc}% of Rp ${fIDR(portfolioForCalc)})`)
      }
    } else if (row.entryType === 'pullback' && row.ema21 != null) {
      const entry = row.ema21
      const stop = row.entryStopLoss ?? entry * 0.93
      const risk = entry - stop
      const stopLabel = row.entryStopLoss != null && row.entryStopLoss === Math.max(entry * (1 - SCREEN_CONFIG.entryPlan.stopLossPct), entry * (1 - SCREEN_CONFIG.entryPlan.stopLossPct))
        ? `${((1 - stop / entry) * 100).toFixed(0)}% below EMA21` : 'MA50'

      console.log(`  Entry Type     : \x1b[36mPULLBACK ke EMA21\x1b[0m`)
      console.log(`  Entry Level    : Rp ${fIDR(entry)} (EMA21)`)
      console.log(`  Stop Loss      : Rp ${fIDR(stop)} (${stopLabel})`)
      console.log(`  Risk per Share : Rp ${risk.toFixed(0)} (${row.riskPct?.toFixed(1) ?? '?'}%)`)
      for (const mult of epCfg.targetMultipliers) {
        const target = entry + risk * mult
        const targetPct = ((target - entry) / entry) * 100
        console.log(`  Target (${mult}R)    : Rp ${fIDR(target)} (+${targetPct.toFixed(1)}%)`)
      }
      const maxMult = epCfg.targetMultipliers[epCfg.targetMultipliers.length - 1] ?? 3
      console.log(`  R/R Ratio      : 1:${maxMult} (jika target ${maxMult}R)`)
      if (risk > 0) {
        const riskPerTrade = portfolioForCalc * riskPctForCalc / 100
        const lots = Math.floor(riskPerTrade / risk / 100)
        console.log(`  Position Size  : ${lots} lot @ Rp ${fIDR(entry)} (risk ${riskPctForCalc}% of Rp ${fIDR(portfolioForCalc)})`)
      }
    }
    console.log(line)
  }
  // Smart Money section
  const smtBar = '█'.repeat(Math.round(row.smtScore / 10)) + '░'.repeat(10 - Math.round(row.smtScore / 10))
  const smtColor = row.smtScore >= 75 ? '\x1b[32m' : row.smtScore >= 55 ? '\x1b[33m' : '\x1b[31m'
  const smtSignalLabel = row.smtSignal === 'strong-buy' ? '\x1b[32mSTRONG BUY\x1b[0m' : row.smtSignal === 'buy' ? '\x1b[32mBUY\x1b[0m' : row.smtSignal === 'neutral' ? '\x1b[33mNETRAL\x1b[0m' : row.smtSignal === 'sell' ? '\x1b[31mSELL\x1b[0m' : '\x1b[31mSTRONG SELL\x1b[0m'
  console.log(`  ═══ Smart Money ═══`)
  console.log(`  SMT Score       : ${smtColor}${row.smtScore}/100 [${smtBar}]\x1b[0m`)
  const smtFn5dStr = `${formatForeignRp(row.foreignNet5d, row.price)} (5d)`
  const smtAccelStr = row.foreignAcceleration != null && row.foreignAcceleration > 0 ? ' ▲ accelerating' : row.foreignAcceleration != null && row.foreignAcceleration < 0 ? ' ▼ decelerating' : ''
  console.log(`  Foreign Flow    : ${smtFn5dStr}${smtAccelStr}`)
  console.log(`  Consecutive Buy : ${row.consecutiveForeignBuyDays > 0 ? `${row.consecutiveForeignBuyDays} hari berturut-turut` : '—'} | Akum Window: ${row.foreignBuyDays20d}/20h beli`)
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
}

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
  printStockDetail(row)
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
    const smtFn5d = formatForeignRp(r.foreignNet5d, r.price)
    const smtStreak = r.consecutiveForeignBuyDays > 0 ? `${r.consecutiveForeignBuyDays}h` : '—'
    const smtTxChg = r.avgTradeSizeChange != null ? `${r.avgTradeSizeChange >= 0 ? '+' : ''}${r.avgTradeSizeChange.toFixed(1)}%` : '—'
    const smtBo = r.bidOfferRatio != null ? r.bidOfferRatio.toFixed(2) : '—'
    const smtSigLabel = r.smtSignal === 'strong-buy' ? '\x1b[32mSTRONG BUY\x1b[0m' : r.smtSignal === 'buy' ? '\x1b[32mBUY\x1b[0m' : r.smtSignal === 'neutral' ? '\x1b[33mNETRAL\x1b[0m' : r.smtSignal === 'sell' ? '\x1b[31mSELL\x1b[0m' : '\x1b[31mSTRONG SELL\x1b[0m'
    const smtScoreStr = String(r.smtScore).padStart(5)
    const smtScoreColored = r.smtScore >= 75 ? `\x1b[32m${smtScoreStr}\x1b[0m` : r.smtScore >= 55 ? `\x1b[33m${smtScoreStr}\x1b[0m` : `\x1b[90m${smtScoreStr}\x1b[0m`
    // Accumulating brokers: show first 2 (truncated), green if present
    const accumBrokerStr = r.accumulatingBrokers.length > 0
      ? `\x1b[32m${r.accumulatingBrokers.slice(0, 2).join(', ').slice(0, 17)}\x1b[0m`
      : '\x1b[90m—\x1b[0m'
    console.log(
      `  ${pad(String(i + 1), 3)} ${pad(r.code, 6)} ${pad(r.name?.slice(0, 20) ?? '-', 20)} ${smtScoreColored} ${smtFn5d.padStart(8)} ${smtStreak.padStart(7)} ${smtTxChg.padStart(7)} ${smtBo.padStart(5)} ${accumBrokerStr.padEnd(18 + 9)} ${smtSigLabel}`
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

if (argMode === 'auto') {
  console.log(`  ${pad('#', 3)} ${pad('Kode', 6)} ${pad('Nama', 20)} ${'AutoScore'.padStart(9)} ${'Setup'.padStart(10)} ${'SMT'.padStart(10)} ${'Cmbnd'.padStart(5)} ${'Mmt'.padStart(4)} ${pad('Warnings', 20)}`)
  console.log(`  ${'─'.repeat(100)}`)
  for (let i = 0; i < top.length; i++) {
    const r = top[i]!
    const autoStr = `\x1b[32m${r.autoScore.toFixed(0).padStart(9)}\x1b[0m`
    
    const setupRaw = r.breakoutSignal === 'breakout' ? 'Breakout' : r.breakoutSignal === 'approaching' ? 'Pendekatan' : r.vcpIsVcp ? 'VCP' : r.pullbackSignal ? 'Pullback' : '—'
    const setupColor = r.breakoutSignal === 'breakout' ? '\x1b[32m' : r.breakoutSignal === 'approaching' ? '\x1b[33m' : r.vcpIsVcp ? '\x1b[35m' : r.pullbackSignal ? '\x1b[36m' : '\x1b[90m'
    const setupStr = `${setupColor}${setupRaw.padStart(10)}\x1b[0m`

    const smtRaw = r.smtScore >= 75 ? 'StrongBuy' : r.smtScore >= 55 ? 'Buy' : r.smtScore >= 35 ? 'Netral' : 'Sell'
    const smtColor = r.smtScore >= 75 ? '\x1b[32m' : r.smtScore >= 55 ? '\x1b[33m' : r.smtScore >= 35 ? '\x1b[90m' : '\x1b[31m'
    const smtStr = `${smtColor}${smtRaw.padStart(10)}\x1b[0m`
    
    const warn: string[] = []
    if (r.sellSignal) warn.push(`\x1b[31m${r.sellSignal}\x1b[0m`)
    if (r.gorenganScore >= 30) warn.push('\x1b[31mGorengan\x1b[0m')
    // Layer 3: Parabolic warning
    if (r.extensionRatio != null && r.extensionRatio > 2.5) {
      warn.push(`\x1b[31mPARABOLIC ${r.extensionRatio.toFixed(1)}×\x1b[0m`)
    }
    // Layer 3: Fundamental weakness warning
    if (r.fundScore < 25) warn.push('\x1b[33mFundLemah\x1b[0m')
    
    console.log(`  ${pad(String(i + 1), 3)} ${pad(r.code, 6)} ${pad(r.name?.slice(0, 20) ?? '-', 20)} ${autoStr} ${setupStr} ${smtStr} ${r.combinedScore.toFixed(0).padStart(5)} ${String(r.momentumFactor).padStart(4)} ${warn.join(', ')}`)
  }
  console.log(dline)

  const autoN = Math.min(autoDetailN, top.length)
  if (autoN > 0) {
    console.log(`\n  \x1b[36m[AUTO-DETAIL] Menganalisis ${autoN} saham teratas...\x1b[0m`)
    for (let i = 0; i < autoN; i++) {
      printStockDetail(top[i]!)
    }
  }

  const autoWlName = `auto_${dateStr}`
  const wlData: WatchlistFile = {
    date: dateFmt,
    stocks: top.map((r) => ({ code: r.code, name: r.name, score: r.combinedScore, rsRank: r.rsRank, stage: r.stage }))
  }
  await writeJsonFile(`${watchlistsDir}/${autoWlName}.json`, wlData)
  console.log(`\n  \x1b[32m✓ Watchlist "${autoWlName}" otomatis disimpan (${top.length} saham).\x1b[0m`)

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
console.log(`  Mode: --mode technical|fundamental|combined|momentum|breakout|vcp|pullback|smt|auto`)
console.log(`  Sort: --sort rs|eps|volume|foreign|momentum|atr|smt|auto`)
console.log(`  Lainnya: --top N --min-score N --sector "nama" --compact --portfolio N --risk-pct N`)
console.log(`  Export: --export csv [--output file.csv]`)
console.log(`  Watchlist: --watchlist save|load|show|compare <nama>`)
console.log(`  Alert: --alert set <CODE> <type> <val> | --alert list | --alert clear <CODE>|all`)
console.log(`  Backtest: --backtest <CODE> [--days N]`)
console.log(dline + '\n')

client.close()
