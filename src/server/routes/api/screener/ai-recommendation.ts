/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * AI Recommendation Engine combining all technical, fundamental, and pattern signals
 * with mandatory gorengan (speculative/pump-and-dump) filter and optional Claude narrative.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, isNotNull, lte, sql } from 'drizzle-orm'
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function calcEpsInfo(histRows: HistRow[]): {
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

// ─── Claude Narrative Cache ─────────────────────────────────────────────────

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
        `- ${r.code} (${r.name ?? '-'}, ${r.sector ?? '-'}): skor=${
          Math.round(r.combinedScore)
        }, SEPA=${Math.round(r.sepaScore)}, Stage=${r.stage}, RS=${r.rsRank}, EPS=${
          r.epsGrowthPct?.toFixed(1) ?? 'N/A'
        }%, ROE=${r.roe?.toFixed(1) ?? 'N/A'}%, ${r.reasons[0] ?? ''}`
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
            `Saham-saham teratas AI berdasarkan analisis ${mode} untuk ${
              String(date).slice(0, 4)
            }-${String(date).slice(4, 6)}-${String(date).slice(6, 8)}:\n\n${contextStr}\n\n` +
            `Tulis ringkasan narasi singkat tentang kesamaan mereka, sektor yang kuat, dan setup individual yang perlu diperhatikan.`
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
    // Silently fail on timeout/network error
  }

  return undefined
}

// ─── Main Endpoint ──────────────────────────────────────────────────────────

export async function GET(ctx: Context) {
  const modeStr = Utils.queryString(ctx.query('mode')) ?? 'combined'
  const mode = (
    modeStr === 'technical' || modeStr === 'fundamental' || modeStr === 'combined'
      ? modeStr
      : 'combined'
  ) as Types.AiRecommendationMode
  const limit = Math.min(100, Utils.parseNumber(Utils.queryString(ctx.query('limit'))) ?? 30)
  const minTechScore = Utils.parseNumber(Utils.queryString(ctx.query('minTechScore'))) ?? 50
  const minFundScore = Utils.parseNumber(Utils.queryString(ctx.query('minFundScore'))) ?? 40

  // Latest date
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.AiRecommendationResponse = { date: 0, mode, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -400)

  // ── IHSG proxy (for RS Line) ─────────────────────────────────────────────
  const ihsgRaw = await Database.select({
    date: Schemas.summary.date,
    ihsg: sql<number>`SUM(${Schemas.summary.individualIndex} * ${Schemas.summary.weightForIndex})`
  })
    .from(Schemas.summary)
    .where(
      and(
        gte(Schemas.summary.date, dateStart),
        lte(Schemas.summary.date, dateRef),
        isNotNull(Schemas.summary.individualIndex),
        isNotNull(Schemas.summary.weightForIndex)
      )
    )
    .groupBy(Schemas.summary.date)
    .orderBy(asc(Schemas.summary.date))

  const ihsgByDate = new Map<number, number>()
  for (const row of ihsgRaw) {
    const v = Number(row.ihsg)
    if (Number.isFinite(v) && v > 0) {
      ihsgByDate.set(Number(row.date), v)
    }
  }

  // ── OHLC + float data ────────────────────────────────────────────────────
  const summaryRows = await Database.select({
    stockCode: Schemas.summary.stockCode,
    date: Schemas.summary.date,
    priceClose: Schemas.summary.priceClose,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow,
    volume: Schemas.summary.volume,
    value: Schemas.summary.value,
    listedShares: Schemas.summary.listedShares,
    tradableShares: Schemas.summary.tradableShares
  })
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateStart), lte(Schemas.summary.date, dateRef)))
    .orderBy(asc(Schemas.summary.stockCode), asc(Schemas.summary.date))

  type OhlcEntry = {
    date: number
    close: number
    high: number
    low: number
    volume: number
    value: number
  }
  const ohlcByCode = new Map<string, OhlcEntry[]>()
  const floatByCode = new Map<string, { listed: number; tradable: number }>()

  for (const row of summaryRows) {
    const close = row.priceClose != null && Number.isFinite(Number(row.priceClose))
      ? Number(row.priceClose)
      : null
    if (close == null || close <= 0) {
      continue
    }
    const high = row.priceHigh != null && Number.isFinite(Number(row.priceHigh))
      ? Number(row.priceHigh)
      : close
    const low = row.priceLow != null && Number.isFinite(Number(row.priceLow))
      ? Number(row.priceLow)
      : close
    const volume = Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0
    const value = Number.isFinite(Number(row.value)) ? Number(row.value) : 0
    const list = ohlcByCode.get(row.stockCode) ?? []
    list.push({ date: Number(row.date), close, high, low, volume, value })
    ohlcByCode.set(row.stockCode, list)
    // Track latest float data
    if (row.listedShares != null && row.tradableShares != null) {
      floatByCode.set(row.stockCode, {
        listed: Number(row.listedShares),
        tradable: Number(row.tradableShares)
      })
    }
  }

  // ── Screener data ────────────────────────────────────────────────────────
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    marketCapital: Schemas.screener.marketCapital,
    notation: Schemas.screener.notation,
    umaDate: Schemas.screener.umaDate,
    per: Schemas.screener.per,
    roe: Schemas.screener.roe,
    der: Schemas.screener.der,
    npm: Schemas.screener.npm
  }).from(Schemas.screener)

  type ScRow = {
    name: string | null
    sector: string | null
    marketCapital: number | null
    notation: string | null
    umaDate: string | null
    per: number | null
    roe: number | null
    der: number | null
    npm: number | null
  }
  const screenerMap = new Map<string, ScRow>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, {
      name: row.name ?? null,
      sector: row.sector ?? null,
      marketCapital: row.marketCapital != null ? Number(row.marketCapital) : null,
      notation: row.notation ?? null,
      umaDate: row.umaDate ?? null,
      per: row.per != null ? Number(row.per) : null,
      roe: row.roe != null ? Number(row.roe) : null,
      der: row.der != null ? Number(row.der) : null,
      npm: row.npm != null ? Number(row.npm) : null
    })
  }

  // ── Financial history ────────────────────────────────────────────────────
  const financialRows = await Database.select({
    stockCode: Schemas.financialHistory.stockCode,
    year: Schemas.financialHistory.year,
    quarter: Schemas.financialHistory.quarter,
    eps: Schemas.financialHistory.eps,
    profitAttrOwner: Schemas.financialHistory.profitAttrOwner,
    sales: Schemas.financialHistory.sales
  }).from(Schemas.financialHistory)

  const historyByCode = new Map<string, HistRow[]>()
  for (const row of financialRows) {
    const list = historyByCode.get(row.stockCode) ?? []
    list.push({
      year: row.year,
      quarter: row.quarter,
      eps: row.eps ?? null,
      profitAttrOwner: row.profitAttrOwner ?? null,
      sales: row.sales ?? null
    })
    historyByCode.set(row.stockCode, list)
  }

  // ── RS Ranks ─────────────────────────────────────────────────────────────
  const rsScores = new Map<string, { score: number; rank: number }>()
  for (const [code, entries] of ohlcByCode) {
    if (entries.length < 252) {
      continue
    }
    const closes = entries.map((e) => e.close)
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
    const rsScore = (r3m ?? 0) * 0.40 + (r6m ?? 0) * 0.20 + (r9m ?? 0) * 0.20 +
      (r12m ?? 0) * 0.20
    rsScores.set(code, { score: rsScore, rank: 0 })
  }
  const sortedByRs = Array.from(rsScores.entries()).sort((a, b) => b[1].score - a[1].score)
  for (let i = 0; i < sortedByRs.length; i++) {
    const pct = Math.round(((i / sortedByRs.length) * 99) + 1)
    rsScores.get(sortedByRs[i][0])!.rank = pct
  }

  // ── Process each stock ───────────────────────────────────────────────────
  const results: Types.AiRecommendationRow[] = []

  for (const [code, entries] of ohlcByCode) {
    if (entries.length < 50) {
      continue
    }

    const lastEntry = entries[entries.length - 1]
    const price = lastEntry.close
    const lastDate = lastEntry.date
    const sc = screenerMap.get(code)
    const histRows = historyByCode.get(code) ?? []
    const closes = entries.map((e) => e.close)
    const highs = entries.map((e) => e.high)
    const lows = entries.map((e) => e.low)
    const volumes = entries.map((e) => e.volume)

    // ── Gorengan Score ──────────────────────────────────────────────────
    let gorenganScore = 0
    if (sc?.notation === 'X') {
      gorenganScore += 40
    }

    if (sc?.umaDate) {
      try {
        const umaTime = new Date(sc.umaDate).getTime()
        const refStr = String(lastDate)
        const refTime = new Date(
          `${refStr.slice(0, 4)}-${refStr.slice(4, 6)}-${refStr.slice(6, 8)}`
        ).getTime()
        if (!isNaN(umaTime) && refTime - umaTime < 30 * 24 * 60 * 60 * 1000) {
          gorenganScore += 25
        }
      } catch { /* ignore */ }
    }

    const marketCap = sc?.marketCapital ?? 0
    if (marketCap < 100_000_000_000) {
      gorenganScore += 25
    } else if (marketCap < 500_000_000_000) {
      gorenganScore += 15
    }

    const floatData = floatByCode.get(code)
    if (floatData && floatData.listed > 0 && floatData.tradable / floatData.listed < 0.20) {
      gorenganScore += 15
    }

    const avgVol20d = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    if (volumes[volumes.length - 1] > avgVol20d * 10) {
      gorenganScore += 10
    }

    if (histRows.length === 0) {
      gorenganScore += 5
    }

    if (gorenganScore >= 60) {
      continue
    }

    // ── Technical signals ───────────────────────────────────────────────
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    const ma200prev = closes.length > 22 ? closes[closes.length - 23] : closes[0]
    const ma200SlopePct = ma200 != null ? returnPct(ma200, ma200prev) : null

    const high52w = Math.max(...highs)
    const low52w = Math.min(...lows)
    const rsRank = rsScores.get(code)?.rank ?? 0

    const criteria: Types.TrendTemplateCriteria = {
      aboveMa150Ma200: ma150 != null && ma200 != null && price > ma150 && price > ma200,
      ma150AboveMa200: ma150 != null && ma200 != null && ma150 > ma200,
      ma200Trending: ma200SlopePct != null && ma200SlopePct > 0,
      ma50AboveMa150Ma200: ma50 != null && ma150 != null && ma200 != null && ma50 > ma150 &&
        ma50 > ma200,
      aboveMa50: ma50 != null && price > ma50,
      above52wLowBy30Pct: low52w > 0 && price >= low52w * 1.3,
      within25PctOf52wHigh: high52w > 0 && price >= high52w * 0.75,
      rsRank70: rsRank >= 70
    }
    const trendCriteriaCount = Object.values(criteria).filter(Boolean).length
    const trendScore = (trendCriteriaCount / 8) * 40
    const rsScore30 = (rsRank / 99) * 30

    const stage = determineStage(price, ma50, ma150, ma200, ma200SlopePct)

    // Eksklusi saham fase distribusi (stage 3) dan markdown (stage 4)
    if (stage === 3 || stage === 4) continue

    // ── EPS & Fundamental ───────────────────────────────────────────────
    const epsInfo = calcEpsInfo(histRows)
    const roe = sc?.roe ?? 0
    const npm = sc?.npm ?? 0
    const der = sc?.der ?? 999
    const per = sc?.per ?? 0

    let fundScoreFull = epsInfo.score
    // ROE + NPM (15 pts from sepa)
    fundScoreFull += Math.min(roe / 25, 1) * 9 + Math.min(npm / 20, 1) * 6
    // DER (10 pts)
    if (der <= 0.5) {
      fundScoreFull += 10
    } else if (der <= 1.0) {
      fundScoreFull += 7
    } else if (der <= 2.0) {
      fundScoreFull += 4
    }
    // Revenue growth (10 pts)
    if (histRows.length > 0) {
      const byKey = new Map<string, HistRow>()
      for (const r of histRows) {
        byKey.set(`${r.year}_${r.quarter}`, r)
      }
      let lYear: number | null = null
      let lQ: number | null = null
      salesSearch: for (const y of [2025, 2024, 2023, 2022]) {
        for (const q of [4, 3, 2, 1]) {
          if (byKey.get(`${y}_${q}`)?.sales != null) {
            lYear = y
            lQ = q
            break salesSearch
          }
        }
      }
      if (lYear && lQ) {
        const curSales = byKey.get(`${lYear}_${lQ}`)?.sales ?? 0
        const priorSales = byKey.get(`${lYear - 1}_${lQ}`)?.sales ?? 0
        if (priorSales > 0) {
          const revGrowth = ((curSales - priorSales) / priorSales) * 100
          if (revGrowth >= 15) {
            fundScoreFull += 10
          } else if (revGrowth >= 5) {
            fundScoreFull += 6
          } else if (revGrowth >= 0) {
            fundScoreFull += 2
          }
        }
      }
    }
    // PER (5 pts)
    if (per >= 5 && per <= 20) {
      fundScoreFull += 5
    } else if (per > 20 && per <= 30) {
      fundScoreFull += 3
    } else if (per > 30 && per <= 50) {
      fundScoreFull += 1
    }

    const sepaScore = Math.min(
      100,
      trendScore + rsScore30 + epsInfo.score +
        Math.min(roe / 25, 1) * 9 + Math.min(npm / 20, 1) * 6
    )

    // ── RS Line New High ────────────────────────────────────────────────
    let rsLineNewHigh = false
    if (ihsgByDate.size > 0) {
      const firstIhsg = ihsgByDate.values().next().value ?? 1
      let rsLine52wHigh = 0
      let rsLineCurrent = 0
      for (const e of entries) {
        const ihsg = ihsgByDate.get(e.date)
        if (ihsg == null) {
          continue
        }
        const rsLineVal = e.close / (ihsg / firstIhsg)
        if (rsLineVal > rsLine52wHigh) {
          rsLine52wHigh = rsLineVal
        }
        if (e.date === lastDate) {
          rsLineCurrent = rsLineVal
        }
      }
      rsLineNewHigh = rsLine52wHigh > 0 && rsLineCurrent >= rsLine52wHigh * 0.999
    }

    // ── Pocket Pivot (last 5 sessions) ──────────────────────────────────
    let hasPocketPivot = false
    if (entries.length >= 15) {
      const ma10 = calcMA(closes, 10)
      const maxDownVol10d = Math.max(
        ...entries.slice(-10).filter((e, i, a) => i > 0 && e.close < a[i - 1].close).map((e) =>
          e.volume
        ).concat([0])
      )
      for (let i = entries.length - 5; i < entries.length; i++) {
        if (i <= 0) {
          continue
        }
        const prev = entries[i - 1]
        const cur = entries[i]
        if (
          cur.close > prev.close && cur.volume > maxDownVol10d && ma10 != null &&
          cur.close >= ma10
        ) {
          hasPocketPivot = true
          break
        }
      }
    }

    // ── Base Pattern (simplified flat base detection) ───────────────────
    let patternType: Types.BasePatternType = 'none'
    if (entries.length >= 25) {
      const last25H = highs.slice(-25)
      const last25L = lows.slice(-25)
      const range = Math.max(...last25H) - Math.min(...last25L)
      const midPrice = (Math.max(...last25H) + Math.min(...last25L)) / 2
      if (midPrice > 0 && range / midPrice <= 0.15) {
        patternType = 'flat'
      }
    }

    // ── Power Play / Low Cheat ──────────────────────────────────────────
    let setupType: Types.PowerPlaySetupType = 'none'
    if (closes.length >= 5) {
      const last5 = closes.slice(-5)
      const range = Math.max(...last5) - Math.min(...last5)
      const avg = last5.reduce((a, b) => a + b) / 5
      if (avg > 0) {
        if (range / avg < 0.03) {
          setupType = 'power-play'
        } else if (range / avg < 0.05) {
          setupType = 'low-cheat'
        }
      }
    }

    // ── Technical Score (0–100) ─────────────────────────────────────────
    let techScore = (sepaScore / 100) * 50
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

    // ── Fundamental Score (0–100) ───────────────────────────────────────
    const finalFundScore = Math.min(100, fundScoreFull)

    // ── Combined Score ──────────────────────────────────────────────────
    const combinedScore = techScore * 0.6 + finalFundScore * 0.4

    // ── Filter by mode ──────────────────────────────────────────────────
    if (mode === 'technical' && techScore < minTechScore) {
      continue
    }
    if (mode === 'fundamental' && finalFundScore < minFundScore) {
      continue
    }
    if (mode === 'combined' && combinedScore < Math.min(minTechScore, minFundScore)) {
      continue
    }

    // ── Reasons ─────────────────────────────────────────────────────────
    const reasons: string[] = []
    if (sepaScore >= 60) {
      reasons.push(`SEPA ${Math.round(sepaScore)} — Stage ${stage}, RS ${rsRank}`)
    }
    if (rsLineNewHigh) {
      reasons.push('RS Line New High terkonfirmasi')
    }
    if (epsInfo.latestGrowthPct != null) {
      let msg = `EPS ${epsInfo.latestGrowthPct >= 0 ? '+' : ''}${
        epsInfo.latestGrowthPct.toFixed(1)
      }% YoY`
      if (epsInfo.acceleration) {
        msg += ', akselerasi'
      }
      if (epsInfo.consecutiveGrowthQ >= 2) {
        msg += `, ${epsInfo.consecutiveGrowthQ}Q berturut`
      }
      reasons.push(msg)
    }
    if (roe > 20 || npm > 15) {
      reasons.push(`ROE ${roe.toFixed(1)}%, NPM ${npm.toFixed(1)}%`)
    }
    if (hasPocketPivot) {
      reasons.push('Pocket Pivot terdeteksi')
    }
    if (patternType !== 'none') {
      reasons.push(
        patternType === 'htf'
          ? 'High Tight Flag pattern'
          : patternType === 'cup-handle'
          ? 'Cup-and-Handle pattern'
          : 'Flat Base pattern'
      )
    }
    if (setupType !== 'none') {
      reasons.push(setupType === 'power-play' ? 'Power Play setup' : 'Low Cheat setup')
    }
    if (reasons.length === 0) {
      reasons.push(`Skor ${mode}: ${Math.round(combinedScore)}`)
    }

    results.push({
      code,
      name: sc?.name ?? null,
      sector: sc?.sector ?? null,
      price,
      techScore,
      fundScore: finalFundScore,
      combinedScore,
      gorenganScore,
      stage,
      rsRank,
      sepaScore,
      epsGrowthPct: epsInfo.latestGrowthPct,
      roe: roe > 0 ? roe : null,
      der: der < 999 ? der : null,
      hasRsLineNewHigh: rsLineNewHigh,
      hasPocketPivot,
      patternType,
      setupType,
      reasons
    })
  }

  // Sort and slice
  if (mode === 'technical') {
    results.sort((a, b) => b.techScore - a.techScore)
  } else if (mode === 'fundamental') {
    results.sort((a, b) => b.fundScore - a.fundScore)
  } else {
    results.sort((a, b) => b.combinedScore - a.combinedScore)
  }

  const sliced = results.slice(0, limit)

  // Claude narrative (optional)
  let claudeNarrative: string | undefined
  try {
    claudeNarrative = await getClaudeNarrative(dateRef, mode, sliced)
  } catch { /* ignore */ }

  const response: Types.AiRecommendationResponse = {
    date: dateRef,
    mode,
    totalCount: results.length,
    data: sliced,
    ...(claudeNarrative && { claudeNarrative })
  }

  return ctx.send.json(response)
}
