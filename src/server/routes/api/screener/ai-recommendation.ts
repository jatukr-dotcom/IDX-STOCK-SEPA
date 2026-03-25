/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * AI Recommendation Engine combining all technical, fundamental, and pattern signals
 * with mandatory gorengan (speculative/pump-and-dump) filter and optional Claude narrative.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

type HistRow = {
  year: number
  quarter: number
  eps: number | null
  profitAttrOwner: number | null
  sales: number | null
}

// ─── Scoring Helpers ────────────────────────────────────────────────────────

function calcQEps(byKey: Map<string, HistRow>, year: number, quarter: number): number | null {
  const row = byKey.get(`${year}_${quarter}`)
  if (!row || row.profitAttrOwner == null || row.eps == null) {
    return null
  }
  let shares: number | null = null
  const q4c = byKey.get(`${year}_4`)
  if (q4c?.profitAttrOwner != null && q4c.eps != null && q4c.eps !== 0) {
    shares = q4c.profitAttrOwner / q4c.eps
  }
  if (shares == null || shares === 0) {
    const q4p = byKey.get(`${year - 1}_4`)
    if (q4p?.profitAttrOwner != null && q4p.eps != null && q4p.eps !== 0) {
      shares = q4p.profitAttrOwner / q4p.eps
    }
  }
  if (shares == null || shares === 0) {
    return null
  }
  const prev = quarter > 1 ? byKey.get(`${year}_${quarter - 1}`) : null
  const prevProfit = prev?.profitAttrOwner ?? 0
  return (row.profitAttrOwner - prevProfit) / shares
}

function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null
  }
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) {
    return null
  }
  return ((current - past) / past) * 100
}

function determineStage(
  price: number,
  ma50: number | null,
  ma150: number | null,
  ma200: number | null,
  ma200SlopePct: number | null
): Types.StageNumber {
  if (ma200 == null) {
    if (ma50 != null && price > ma50 && (ma150 == null || ma50 > ma150)) {
      return 2
    }
    return 1
  }
  const ma200up = ma200SlopePct != null && ma200SlopePct > 0
  if (ma50 != null && ma150 != null && price > ma50 && ma50 > ma150 && ma150 > ma200 && ma200up) {
    return 2
  }
  if (price < ma200 && !ma200up) {
    return 4
  }
  if (ma50 != null && (price < ma50 || (ma150 != null && ma150 < ma200))) {
    return 3
  }
  return 1
}

// ─── EPS Score Component ────────────────────────────────────────────────────

function calcEpsScore(histRows: HistRow[]): {
  score: number
  latestGrowthPct: number | null
  acceleration: boolean
  consecutiveGrowthQ: number
} {
  const byKey = new Map<string, HistRow>()
  for (const r of histRows) {
    byKey.set(`${r.year}_${r.quarter}`, r)
  }

  let latestYear: number | null = null
  let latestQ: number | null = null
  outer: for (const y of [2025, 2024, 2023, 2022]) {
    for (const q of [4, 3, 2, 1]) {
      if (byKey.get(`${y}_${q}`)?.profitAttrOwner != null) {
        latestYear = y
        latestQ = q
        break outer
      }
    }
  }
  if (latestYear == null || latestQ == null) {
    return { score: 0, latestGrowthPct: null, acceleration: false, consecutiveGrowthQ: 0 }
  }

  const curEps = calcQEps(byKey, latestYear, latestQ)
  const pyEps = calcQEps(byKey, latestYear - 1, latestQ)
  let latestGrowthPct: number | null = null
  if (curEps != null && pyEps != null && pyEps !== 0) {
    latestGrowthPct = ((curEps - pyEps) / Math.abs(pyEps)) * 100
  }

  const prevQ = latestQ > 1 ? latestQ - 1 : 4
  const prevY = latestQ > 1 ? latestYear : latestYear - 1
  const prevCurEps = calcQEps(byKey, prevY, prevQ)
  const prevPyEps = calcQEps(byKey, prevY - 1, prevQ)
  let prevGrowthPct: number | null = null
  if (prevCurEps != null && prevPyEps != null && prevPyEps !== 0) {
    prevGrowthPct = ((prevCurEps - prevPyEps) / Math.abs(prevPyEps)) * 100
  }
  const acceleration = latestGrowthPct != null && prevGrowthPct != null &&
    latestGrowthPct > prevGrowthPct

  let consecutiveGrowthQ = 0
  let cy = latestYear
  let cq = latestQ
  for (let i = 0; i < 4; i++) {
    const ce = calcQEps(byKey, cy, cq)
    const pe = calcQEps(byKey, cy - 1, cq)
    if (ce != null && pe != null && ce > pe) {
      consecutiveGrowthQ++
    } else {
      break
    }
    cq--
    if (cq === 0) {
      cq = 4
      cy--
    }
  }

  let score = 0
  if (latestGrowthPct != null) {
    if (latestGrowthPct >= 25) {
      score += 8
    } else if (latestGrowthPct >= 10) {
      score += 5
    } else if (latestGrowthPct >= 0) {
      score += 2
    }
  }
  if (acceleration) {
    score += 4
  }
  if (consecutiveGrowthQ >= 2) {
    score += 3
  }

  return { score, latestGrowthPct, acceleration, consecutiveGrowthQ }
}

// ─── Trend Score (reuse from sepa.ts) ────────────────────────────────────

function calcTrendScore(criteria: Types.TrendTemplateCriteria): number {
  const count = (criteria.aboveMa150Ma200 ? 1 : 0) +
    (criteria.ma150AboveMa200 ? 1 : 0) +
    (criteria.ma200Trending ? 1 : 0) +
    (criteria.ma50AboveMa150Ma200 ? 1 : 0) +
    (criteria.aboveMa50 ? 1 : 0) +
    (criteria.above52wLowBy30Pct ? 1 : 0) +
    (criteria.within25PctOf52wHigh ? 1 : 0) +
    (criteria.rsRank70 ? 1 : 0)
  return (count / 8) * 40
}

// ─── Claude API Narrative Cache ─────────────────────────────────────────────

interface NarrativeCache {
  date: number
  mode: string
  narrative: string
  cachedAt: number
}
let narrativeCache: NarrativeCache | null = null
const CACHE_TTL_MS = 60 * 60 * 1000

async function getClaudeNarrative(
  date: number,
  mode: string,
  topRows: Types.AiRecommendationRow[]
): Promise<string | undefined> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return undefined
  }

  // Check cache
  const now = Date.now()
  if (
    narrativeCache && narrativeCache.date === date && narrativeCache.mode === mode &&
    (now - narrativeCache.cachedAt) < CACHE_TTL_MS
  ) {
    return narrativeCache.narrative
  }

  try {
    const contextStr = topRows
      .slice(0, 10)
      .map((r) =>
        `- ${r.code} (${r.name}, ${r.sector}): score=${Math.round(r.combinedScore)}, SEPA=${
          Math.round(r.sepaScore)
        }, Stage=${r.stage}, RS=${r.rsRank}, EPS=${r.epsGrowthPct?.toFixed(1) ?? 'N/A'}%, ROE=${
          r.roe?.toFixed(1) ?? 'N/A'
        }%, ${r.reasons[0] ?? ''}`
      )
      .join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system:
          'Anda adalah analis pasar saham Indonesia. Tulis narasi pasar singkat (3-4 paragraf) untuk laporan screener saham profesional. Fokus pada sinyal data, konteks pasar, dan peringatan risiko. Jangan berikan saran investasi. Selalu tambahkan disclaimer.',
        messages: [{
          role: 'user',
          content:
            `Saham-saham teratas yang direkomendasikan AI berdasarkan analisis ${mode} untuk ${
              String(date).slice(0, 4)
            }-${String(date).slice(4, 6)}-${
              String(date).slice(6, 8)
            }:\n\n${contextStr}\n\nTulis ringkasan narasi singkat tentang apa yang mereka miliki kesamaan, sektor mana yang kuat, dan setup individual mana yang perlu diperhatikan.`
        }]
      })
    })

    if (response.ok) {
      const data = await response.json() as { content: Array<{ type: string; text: string }> }
      const text = data.content?.[0]?.text ?? ''
      if (text) {
        narrativeCache = { date, mode, narrative: text, cachedAt: now }
        return text
      }
    }
  } catch {
    // Silently fail on timeout or network error
  }

  return undefined
}

// ─── Main Endpoint ──────────────────────────────────────────────────────────

export async function GET(ctx: Context) {
  const modeStr = Utils.queryString(ctx.query('mode')) ?? 'combined'
  const mode =
    (modeStr === 'technical' || modeStr === 'fundamental' || modeStr === 'combined'
      ? modeStr
      : 'combined') as Types.AiRecommendationMode
  const limit = Math.min(100, Utils.parseNumber(Utils.queryString(ctx.query('limit'))) ?? 30)
  const minTechScore = Utils.parseNumber(Utils.queryString(ctx.query('minTechScore'))) ?? 50
  const minFundScore = Utils.parseNumber(Utils.queryString(ctx.query('minFundScore'))) ?? 40

  // Get latest date
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.AiRecommendationResponse = { date: 0, mode, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }

  // Fetch data
  const dateRef = latestDate - 400
  const summaryRows = await Database.select()
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateRef), lte(Schemas.summary.date, latestDate)))
    .orderBy(asc(Schemas.summary.date))

  const screenerRows = await Database.select()
    .from(Schemas.screener)

  const financialRows = await Database.select()
    .from(Schemas.financial)
    .orderBy(asc(Schemas.financial.year), asc(Schemas.financial.quarter))

  // Build OHLC by code
  interface OhlcData {
    dates: number[]
    closes: number[]
    highs: number[]
    lows: number[]
    volumes: number[]
    values: number[]
    listedShares: number | null
    tradableShares: number | null
  }
  const ohlcByCode = new Map<string, OhlcData>()
  for (const row of summaryRows) {
    const code = row.stock_code
    if (!code) {
      continue
    }
    const entry = ohlcByCode.get(code) ?? {
      dates: [],
      closes: [],
      highs: [],
      lows: [],
      volumes: [],
      values: [],
      listedShares: null,
      tradableShares: null
    }
    entry.dates.push(row.date!)
    entry.closes.push(row.price_close ?? 0)
    entry.highs.push(row.price_high ?? 0)
    entry.lows.push(row.price_low ?? 0)
    entry.volumes.push(row.volume ?? 0)
    entry.values.push(row.value ?? 0)
    if (row.listed_shares != null) {
      entry.listedShares = row.listed_shares
    }
    if (row.tradable_shares != null) {
      entry.tradableShares = row.tradable_shares
    }
    ohlcByCode.set(code, entry)
  }

  // Build screener map
  const screenerMap = new Map<string, typeof screenerRows[0]>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, row)
  }

  // Build financial history by code
  const historyByCode = new Map<string, HistRow[]>()
  for (const row of financialRows) {
    const code = row.stock_code
    if (!code) {
      continue
    }
    const entries = historyByCode.get(code) ?? []
    entries.push({
      year: row.year,
      quarter: row.quarter,
      eps: row.eps,
      profitAttrOwner: row.profit_attr_owner,
      sales: row.sales
    })
    historyByCode.set(code, entries)
  }

  // Compute RS ranks (duplicate logic from other endpoints)
  const rsScores = new Map<string, { score: number; rank: number }>()
  const allCodes = Array.from(ohlcByCode.keys())
  const ret3m = new Map<string, number>()
  const ret6m = new Map<string, number>()
  const ret9m = new Map<string, number>()
  const ret12m = new Map<string, number>()

  for (const code of allCodes) {
    const data = ohlcByCode.get(code)!
    const closes = data.closes
    if (closes.length < 252) {
      continue
    }

    const base = closes[0]
    const r3m = closes.length >= 63
      ? returnPct(closes[closes.length - 1], closes[closes.length - 63])
      : null
    const r6m = closes.length >= 126
      ? returnPct(closes[closes.length - 1], closes[closes.length - 126])
      : null
    const r9m = closes.length >= 189
      ? returnPct(closes[closes.length - 1], closes[closes.length - 189])
      : null
    const r12m = closes.length >= 252
      ? returnPct(closes[closes.length - 1], closes[closes.length - 252])
      : null

    if (r3m != null) {
      ret3m.set(code, r3m)
    }
    if (r6m != null) {
      ret6m.set(code, r6m)
    }
    if (r9m != null) {
      ret9m.set(code, r9m)
    }
    if (r12m != null) {
      ret12m.set(code, r12m)
    }

    const rsScore = (r3m ?? 0) * 0.40 + (r6m ?? 0) * 0.20 + (r9m ?? 0) * 0.20 + (r12m ?? 0) * 0.20
    rsScores.set(code, { score: rsScore, rank: 0 })
  }

  // Rank RS scores
  const sortedByRs = Array.from(rsScores.entries()).sort((a, b) => b[1].score - a[1].score)
  for (let i = 0; i < sortedByRs.length; i++) {
    const percent = Math.round(((i / sortedByRs.length) * 99) + 1)
    rsScores.get(sortedByRs[i][0])!.rank = percent
  }

  // Compute IHSG (for RS Line)
  const ihsgByDate = new Map<number, number>()
  for (const row of summaryRows) {
    const date = row.date!
    const individualIndex = row.individual_index ?? 0
    const weight = row.weight_for_index ?? 0
    const contribution = individualIndex * weight
    ihsgByDate.set(date, (ihsgByDate.get(date) ?? 0) + contribution)
  }

  // Normalize IHSG to 100
  const ihsgValues = Array.from(ihsgByDate.values())
  const firstIhsg = ihsgValues[0] ?? 1
  const normalizedIhsg = new Map<number, number>()
  for (const [date, val] of ihsgByDate) {
    normalizedIhsg.set(date, (val / firstIhsg) * 100)
  }

  // Process each stock
  const results: Types.AiRecommendationRow[] = []

  for (const code of allCodes) {
    const ohlc = ohlcByCode.get(code)!
    if (ohlc.closes.length < 50) {
      continue
    }

    const lastDate = ohlc.dates[ohlc.dates.length - 1]
    const price = ohlc.closes[ohlc.closes.length - 1]
    const screener = screenerMap.get(code)
    const histRows = historyByCode.get(code) ?? []

    // ─── Gorengan Score ────────────────────────────────────────────────────

    let gorenganScore = 0
    const notation = screener?.notation
    if (notation === 'X') {
      gorenganScore += 40
    }

    const umaDate = screener?.uma_date
    if (umaDate) {
      // Parse UMA date (assuming string format)
      try {
        const umaTime = new Date(umaDate).getTime()
        const refTime = new Date(
          String(lastDate).slice(0, 4) + '-' + String(lastDate).slice(4, 6) + '-' +
            String(lastDate).slice(6, 8)
        ).getTime()
        if (refTime - umaTime < 30 * 24 * 60 * 60 * 1000) {
          gorenganScore += 25
        }
      } catch {
        // Unparseable date; skip
      }
    }

    const marketCap = screener?.market_capital ?? 0
    if (marketCap < 100_000_000_000) {
      gorenganScore += 25
    } else if (marketCap < 500_000_000_000) {
      gorenganScore += 15
    }

    const floatRatio = ohlc.tradableShares && ohlc.listedShares && ohlc.listedShares > 0
      ? ohlc.tradableShares / ohlc.listedShares
      : 1
    if (floatRatio < 0.20) {
      gorenganScore += 15
    }

    const avgVol20d = ohlc.volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    if (ohlc.volumes[ohlc.volumes.length - 1] > avgVol20d * 10) {
      gorenganScore += 10
    }

    if (histRows.length === 0) {
      gorenganScore += 5
    }

    // Skip if gorengan score too high
    if (gorenganScore >= 60) {
      continue
    }

    // ─── SEPA Components ───────────────────────────────────────────────────

    const ma50 = calcMA(ohlc.closes, 50)
    const ma150 = calcMA(ohlc.closes, 150)
    const ma200 = calcMA(ohlc.closes, 200)
    const ma200_22 = ohlc.closes.length > 22 ? ohlc.closes[ohlc.closes.length - 23] : ohlc.closes[0]
    const ma200SlopePct = ma200 != null ? returnPct(ma200, ma200_22) : null

    const high52w = Math.max(...ohlc.highs)
    const low52w = Math.min(...ohlc.lows)

    const criteria: Types.TrendTemplateCriteria = {
      aboveMa150Ma200: ma150 != null && ma200 != null && price > ma150 && price > ma200,
      ma150AboveMa200: ma150 != null && ma200 != null && ma150 > ma200,
      ma200Trending: ma200SlopePct != null && ma200SlopePct > 0,
      ma50AboveMa150Ma200: ma50 != null && ma150 != null && ma200 != null && ma50 > ma150 &&
        ma50 > ma200,
      aboveMa50: ma50 != null && price > ma50,
      above52wLowBy30Pct: low52w > 0 && price >= low52w * 1.3,
      within25PctOf52wHigh: high52w > 0 && price >= high52w * 0.75,
      rsRank70: (rsScores.get(code)?.rank ?? 0) >= 70
    }

    const trendScore = calcTrendScore(criteria)
    const rsRank = rsScores.get(code)?.rank ?? 0
    const rsScore30 = (rsRank / 99) * 30
    const epsInfo = calcEpsScore(histRows)
    const fundScore = epsInfo.score

    // ROE + NPM (15 pts max)
    let fundScoreFull = fundScore
    const roe = screener?.roe ?? 0
    const roePts = Math.min(roe / 25, 1) * 9
    const npm = screener?.npm ?? 0
    const npmPts = Math.min(npm / 20, 1) * 6
    fundScoreFull += roePts + npmPts

    // DER (10 pts)
    const der = screener?.der ?? 999
    let derPts = 0
    if (der <= 0.5) {
      derPts = 10
    } else if (der <= 1.0) {
      derPts = 7
    } else if (der <= 2.0) {
      derPts = 4
    }
    fundScoreFull += derPts

    // Revenue growth (10 pts)
    let revenueGrowthPct: number | null = null
    if (histRows.length > 0) {
      const byKey = new Map<string, HistRow>()
      for (const r of histRows) {
        byKey.set(`${r.year}_${r.quarter}`, r)
      }
      let latestYear: number | null = null
      let latestQ: number | null = null
      outer: for (const y of [2025, 2024, 2023, 2022]) {
        for (const q of [4, 3, 2, 1]) {
          if (byKey.get(`${y}_${q}`)?.sales != null) {
            latestYear = y
            latestQ = q
            break outer
          }
        }
      }
      if (latestYear && latestQ) {
        const curSales = byKey.get(`${latestYear}_${latestQ}`)?.sales ?? 0
        const priorSales = byKey.get(`${latestYear - 1}_${latestQ}`)?.sales ?? 0
        if (priorSales > 0) {
          revenueGrowthPct = ((curSales - priorSales) / priorSales) * 100
          let revPts = 0
          if (revenueGrowthPct >= 15) {
            revPts = 10
          } else if (revenueGrowthPct >= 5) {
            revPts = 6
          } else if (revenueGrowthPct >= 0) {
            revPts = 2
          }
          fundScoreFull += revPts
        }
      }
    }

    // PER (5 pts)
    const per = screener?.per ?? 0
    let perPts = 0
    if (per >= 5 && per <= 20) {
      perPts = 5
    } else if (per >= 20 && per <= 30) {
      perPts = 3
    } else if (per >= 30 && per <= 50) {
      perPts = 1
    }
    fundScoreFull += perPts

    // SEPA Score (100 pts max)
    const sepaScore = Math.min(100, trendScore + rsScore30 + fundScoreFull)

    const stage = determineStage(price, ma50, ma150, ma200, ma200SlopePct)

    // ─── RS Line New High ──────────────────────────────────────────────────

    const rsLineByDate = new Map<number, number>()
    for (let i = 0; i < ohlc.dates.length; i++) {
      const date = ohlc.dates[i]
      const stockClose = ohlc.closes[i]
      const ihsg = normalizedIhsg.get(date) ?? 1
      rsLineByDate.set(date, stockClose / ihsg)
    }

    let rsLineNewHigh = false
    if (rsLineByDate.size > 0) {
      const rsLineValues = Array.from(rsLineByDate.values())
      const rsLineMax52w = Math.max(...rsLineValues)
      const rsLineCur = rsLineByDate.get(lastDate) ?? 0
      rsLineNewHigh = rsLineCur >= rsLineMax52w * 0.999
    }

    // ─── Pocket Pivot ──────────────────────────────────────────────────────

    let hasPocketPivot = false
    if (ohlc.closes.length >= 15) {
      const ma10 = calcMA(ohlc.closes, 10)
      const last5 = ohlc.dates.slice(-5)
      const maxDownVol10d = Math.max(...ohlc.volumes.slice(-10))

      for (const lookDate of last5) {
        const idx = ohlc.dates.indexOf(lookDate)
        if (idx <= 0) {
          continue
        }
        const prevClose = ohlc.closes[idx - 1]
        const curClose = ohlc.closes[idx]
        const curVol = ohlc.volumes[idx]
        if (curClose > prevClose && curVol > maxDownVol10d && ma10 != null && curClose >= ma10) {
          hasPocketPivot = true
          break
        }
      }
    }

    // ─── Base Pattern Detection ────────────────────────────────────────────

    let patternType: Types.BasePatternType = 'none'

    // Simplified: Check if last 25 bars form flat base
    if (ohlc.closes.length >= 25) {
      const last25 = ohlc.highs.slice(-25)
      const range = Math.max(...last25) - Math.min(...last25)
      const avgClose = ohlc.closes.slice(-25).reduce((a, b) => a + b) / 25
      if (range / avgClose <= 0.15) {
        patternType = 'flat'
      }
    }

    // ─── Power Play / Low Cheat ────────────────────────────────────────────

    let setupType: Types.PowerPlaySetupType = 'none'

    // Simplified: Check last 5 days for tight range
    if (ohlc.closes.length >= 5) {
      const last5 = ohlc.closes.slice(-5)
      const range = Math.max(...last5) - Math.min(...last5)
      const avgClose = last5.reduce((a, b) => a + b) / 5
      if (range / avgClose < 0.03) {
        setupType = 'power-play'
      } else if (range / avgClose < 0.05) {
        setupType = 'low-cheat'
      }
    }

    // ─── Scoring ───────────────────────────────────────────────────────────

    // Technical Score (0–100)
    let techScore = 0
    techScore += (sepaScore / 100) * 50
    if (stage === 2) {
      techScore += 20
    } else if (stage === 1) {
      techScore += 10
    }
    if (rsLineNewHigh) {
      techScore += 10
    }
    if (hasPocketPivot) {
      techScore += 10
    }
    if (patternType === 'htf') {
      techScore += 6
    } else if (patternType === 'cup-handle') {
      techScore += 4
    } else if (patternType === 'flat') {
      techScore += 2
    }
    if (setupType === 'power-play') {
      techScore += 4
    } else if (setupType === 'low-cheat') {
      techScore += 2
    }
    techScore = Math.min(100, techScore)

    // Fundamental Score (0–100)
    let finalFundScore = Math.min(100, fundScoreFull)

    // Combined Score
    const combinedScore = techScore * 0.6 + finalFundScore * 0.4

    // Build reasons array
    const reasons: string[] = []
    if (sepaScore >= 75) {
      reasons.push(`SEPA ${Math.round(sepaScore)} — Stage ${stage}, RS ${rsRank}`)
    }
    if (rsLineNewHigh) {
      reasons.push('RS Line New High terkonfirmasi')
    }
    if (epsInfo.latestGrowthPct != null) {
      let epsMsg = `EPS +${epsInfo.latestGrowthPct.toFixed(1)}% YoY`
      if (epsInfo.acceleration) {
        epsMsg += ', akselerasi'
      }
      if (epsInfo.consecutiveGrowthQ >= 2) {
        epsMsg += `, ${epsInfo.consecutiveGrowthQ} Q berturut`
      }
      reasons.push(epsMsg)
    }
    if (roe > 20 || npm > 15) {
      reasons.push(`ROE ${roe?.toFixed(1) ?? 'N/A'}%, NPM ${npm?.toFixed(1) ?? 'N/A'}%`)
    }
    if (hasPocketPivot) {
      reasons.push('Pocket Pivot terdeteksi')
    }
    if (patternType !== 'none') {
      const pName = patternType === 'htf'
        ? 'High Tight Flag'
        : patternType === 'cup-handle'
        ? 'Cup-and-Handle'
        : 'Flat Base'
      reasons.push(`${pName} pattern`)
    }
    if (setupType !== 'none') {
      reasons.push(setupType === 'power-play' ? 'Power Play setup' : 'Low Cheat setup')
    }

    // Filter by mode and minimum scores
    let shouldInclude = true
    if (mode === 'technical' && techScore < minTechScore) {
      shouldInclude = false
    } else if (mode === 'fundamental' && finalFundScore < minFundScore) {
      shouldInclude = false
    } else if (mode === 'combined' && combinedScore < Math.min(minTechScore, minFundScore)) {
      shouldInclude = false
    }

    if (!shouldInclude) {
      continue
    }

    results.push({
      code,
      name: screener?.name ?? null,
      sector: screener?.sector ?? null,
      price,
      techScore,
      fundScore: finalFundScore,
      combinedScore,
      gorenganScore,
      stage,
      rsRank,
      sepaScore,
      epsGrowthPct: epsInfo.latestGrowthPct,
      roe: screener?.roe ?? null,
      der: screener?.der ?? null,
      hasRsLineNewHigh: rsLineNewHigh,
      hasPocketPivot,
      patternType,
      setupType,
      reasons
    })
  }

  // Sort by mode
  if (mode === 'technical') {
    results.sort((a, b) => b.techScore - a.techScore)
  } else if (mode === 'fundamental') {
    results.sort((a, b) => b.fundScore - a.fundScore)
  } else {
    results.sort((a, b) => b.combinedScore - a.combinedScore)
  }

  // Slice to limit
  const sliced = results.slice(0, limit)

  // Get Claude narrative if available
  let claudeNarrative: string | undefined
  try {
    claudeNarrative = await getClaudeNarrative(latestDate, mode, sliced)
  } catch {
    // Silently fail
  }

  const response: Types.AiRecommendationResponse = {
    date: latestDate,
    mode,
    totalCount: results.length,
    data: sliced,
    ...(claudeNarrative && { claudeNarrative })
  }

  ctx.send.json(response)
}
