/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { eq, gte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'

interface FRRow {
  stockCode: string
  year: number
  quarter: number
  eps: number | null
  bookValue: number | null
  profitAttrOwner: number | null
}

interface LatestSummary {
  stockCode: string
  listedShares: number
  priceClose: number
}

/** Compute TTM (Trailing 12 Months) profit in same unit as profitAttrOwner. */
function computeTtmProfit(rows: FRRow[]): number | null {
  if (rows.length === 0) {
    return null
  }
  const sorted = [...rows].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.quarter - a.quarter
  )
  const latest = sorted[0]!
  if (latest.profitAttrOwner == null) {
    return null
  }

  // Q4 = full year, TTM is directly the annual figure
  if (latest.quarter === 4) {
    return latest.profitAttrOwner
  }

  // For Q1-Q3: TTM = currentYtd + (prevFY - prevSameQ)
  const currentYtd = latest.profitAttrOwner
  const prevFy = sorted.find((r) => r.year === latest.year - 1 && r.quarter === 4)
  if (prevFy?.profitAttrOwner == null) {
    return currentYtd // best-effort: use YTD
  }

  const prevSameQ = sorted.find((r) => r.year === latest.year - 1 && r.quarter === latest.quarter)
  if (prevSameQ?.profitAttrOwner != null) {
    return currentYtd + (prevFy.profitAttrOwner - prevSameQ.profitAttrOwner)
  }
  // Approximate: annualise current YTD with prev-FY trailing quarters
  return currentYtd + prevFy.profitAttrOwner * (4 - latest.quarter) / 4
}

/** Compute corrected Book Value Per Share using current listed shares. */
function computeCorrectedBvps(rows: FRRow[], listedShares: number): number | null {
  if (listedShares <= 0) {
    return null
  }

  // Prefer latest Q4 (annual filing — most reliable shares count)
  const q4rows = rows
    .filter((r) => r.quarter === 4 && r.bookValue != null)
    .sort((a, b) => b.year - a.year)
  const allWithBv = rows
    .filter((r) => r.bookValue != null)
    .sort((a, b) => a.year !== b.year ? b.year - a.year : b.quarter - a.quarter)

  const useRow = q4rows[0] ?? allWithBv[0]
  if (useRow == null || useRow.bookValue == null) {
    return null
  }

  const rawBvps = useRow.bookValue

  // For Q4 rows, apply shares-count correction if company did a corporate action
  // derivedShares = annual profit / annual EPS (gives weighted-avg shares used in calculation)
  if (
    useRow.quarter === 4 &&
    useRow.eps != null &&
    Math.abs(useRow.eps) > 0.001 &&
    useRow.profitAttrOwner != null
  ) {
    const derivedShares = (useRow.profitAttrOwner * 1e9) / useRow.eps
    if (derivedShares > 0) {
      const ratio = derivedShares / listedShares
      // Only correct if shares differ by more than 1% (avoids floating-point noise)
      if (Math.abs(ratio - 1) > 0.01) {
        return rawBvps * ratio
      }
    }
  }

  return rawBvps
}

export class DataEnrichment {
  static async run(): Promise<void> {
    console.log('[DataEnrichment] Starting enrichment...')
    // 1. Load all financial ratio rows
    const frRows = await Database
      .select({
        stockCode: Schemas.financialHistory.stockCode,
        year: Schemas.financialHistory.year,
        quarter: Schemas.financialHistory.quarter,
        eps: Schemas.financialHistory.eps,
        bookValue: Schemas.financialHistory.bookValue,
        profitAttrOwner: Schemas.financialHistory.profitAttrOwner
      })
      .from(Schemas.financialHistory)

    // Group by stockCode
    const byCode = new Map<string, FRRow[]>()
    for (const r of frRows) {
      let arr = byCode.get(r.stockCode)
      if (arr == null) {
        arr = []
        byCode.set(r.stockCode, arr)
      }
      arr.push(r as FRRow)
    }
    console.log(`[DataEnrichment] Loaded ${frRows.length} financial rows for ${byCode.size} stocks`)

    // 2. Load latest listed_shares + price_close per stock from stock_summary
    const allSummary = await Database.select({
      stockCode: Schemas.summary.stockCode,
      listedShares: Schemas.summary.listedShares,
      priceClose: Schemas.summary.priceClose,
      date: Schemas.summary.date
    }).from(Schemas.summary)

    const summaryMap = new Map<string, LatestSummary>()
    const latestByCode = new Map<string, typeof allSummary[0]>()
    for (const row of allSummary) {
      if (row.stockCode == null || row.listedShares == null || row.priceClose == null) {
        continue
      }
      if (row.listedShares <= 0 || row.priceClose <= 0) {
        continue
      }
      const current = latestByCode.get(row.stockCode)
      if (current == null || (row.date ?? 0) > (current.date ?? 0)) {
        latestByCode.set(row.stockCode, row)
      }
    }
    for (const [code, row] of Array.from(latestByCode.entries())) {
      summaryMap.set(code, {
        stockCode: code,
        listedShares: Number(row.listedShares),
        priceClose: Number(row.priceClose)
      })
    }
    console.log(`[DataEnrichment] Loaded summary for ${summaryMap.size} stocks`)

    // 3. Load dividend data for yield calculation (last 12 months)
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const cutoffDate = twelveMonthsAgo.toISOString().slice(0, 10) // YYYY-MM-DD
    const dividendRows = await Database
      .select({
        stockCode: Schemas.dividend.stockCode,
        cashPerShare: Schemas.dividend.cashPerShare,
        exDate: Schemas.dividend.exDate
      })
      .from(Schemas.dividend)
      .where(gte(Schemas.dividend.exDate, cutoffDate))

    // Group dividends by stockCode, sum last 12 months
    const dividendByCode = new Map<string, number>()
    for (const d of dividendRows) {
      if (d.cashPerShare == null || d.cashPerShare <= 0) {
        continue
      }
      dividendByCode.set(d.stockCode, (dividendByCode.get(d.stockCode) ?? 0) + d.cashPerShare)
    }

    // 4. Compute and update each stock in screener
    console.log(`[DataEnrichment] Computing TTM EPS for ${byCode.size} stocks...`)
    let updateCount = 0
    for (const [code, rows] of Array.from(byCode.entries())) {
      const summary = summaryMap.get(code)
      if (summary == null) {
        continue
      }

      const { listedShares, priceClose } = summary
      if (listedShares <= 0 || priceClose <= 0) {
        continue
      }

      // TTM EPS
      const ttmProfit = computeTtmProfit(rows)
      const ttmEps = ttmProfit != null ? (ttmProfit * 1e9) / listedShares : null

      // Corrected BVPS
      const correctedBvps = computeCorrectedBvps(rows, listedShares)

      // Market Cap
      const marketCap = priceClose * listedShares

      // Dividend Yield (%)
      const totalDiv = dividendByCode.get(code)
      const divYield = totalDiv != null && priceClose > 0
        ? Math.round((totalDiv / priceClose) * 10000) / 100
        : null

      await Database
        .update(Schemas.screener)
        .set({
          eps: ttmEps != null ? Math.round(ttmEps * 100) / 100 : null,
          bookValue: correctedBvps != null ? Math.round(correctedBvps * 100) / 100 : null,
          marketCapital: Math.round(marketCap),
          dividendYield: divYield
        })
        .where(eq(Schemas.screener.code, code))
      updateCount++
    }
    console.log(`[DataEnrichment] Updated ${updateCount} stocks with TTM EPS and BVPS`)

    // Also update stocks that only have dividend data (even without financialHistory)
    for (const [code, totalDiv] of Array.from(dividendByCode.entries())) {
      if (byCode.has(code)) {
        continue // already handled above
      }
      const summary = summaryMap.get(code)
      if (summary == null || summary.priceClose <= 0) {
        continue
      }
      const divYield = Math.round((totalDiv / summary.priceClose) * 10000) / 100
      await Database
        .update(Schemas.screener)
        .set({ dividendYield: divYield })
        .where(eq(Schemas.screener.code, code))
    }
    console.log('[DataEnrichment] Enrichment complete')
  }
}
