/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import * as Services from '@app/server/services/index.ts'
import type * as Types from '@app/server/Types.ts'

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()
  const start = Utils.parseDate(Utils.queryString(ctx.query('start')))
  const end = Utils.parseDate(Utils.queryString(ctx.query('end')))
  if (start === null || end === null) {
    return ctx.send.json({ error: 'start and end required (yyyymmdd, 8 digits)' }, { status: 400 })
  }
  if (end < start) {
    return ctx.send.json({ error: 'end must be >= start' }, { status: 400 })
  }
  const dateParsed = Utils.parseDate(Utils.queryString(ctx.query('date')))
  const dateInt = dateParsed ?? Services.CronDate.todayDateInt()
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    industry: Schemas.screener.industry,
    subSector: Schemas.screener.subSector,
    per: Schemas.screener.per,
    pbv: Schemas.screener.pbv,
    roa: Schemas.screener.roa,
    roe: Schemas.screener.roe,
    der: Schemas.screener.der,
    npm: Schemas.screener.npm,
    eps: Schemas.screener.eps,
    bookValue: Schemas.screener.bookValue,
    marketCapital: Schemas.screener.marketCapital,
    week4PC: Schemas.screener.week4PC,
    week13PC: Schemas.screener.week13PC,
    week26PC: Schemas.screener.week26PC,
    week52PC: Schemas.screener.week52PC,
    notation: Schemas.screener.notation,
    corpAction: Schemas.screener.corpAction,
    umaDate: Schemas.screener.umaDate,
    dividendYield: Schemas.screener.dividendYield
  })
    .from(Schemas.screener)
    .where(eq(Schemas.screener.code, stockCode))
  const screenerRow = screenerRows[0]
  if (screenerRow == null) {
    return ctx.send.json({ error: 'Stock not found' }, { status: 404 })
  }

  // Compute price performance from OHLC as fallback when screener values are null
  let computedWeek4PC = screenerRow.week4PC
  let computedWeek13PC = screenerRow.week13PC
  let computedWeek26PC = screenerRow.week26PC
  let computedWeek52PC = screenerRow.week52PC

  if (
    computedWeek4PC == null || computedWeek13PC == null ||
    computedWeek26PC == null || computedWeek52PC == null
  ) {
    const perfStart = Utils.addDaysToDateInt(dateInt, -400)
    const perfRows = await Database.select({
      date: Schemas.summary.date,
      priceClose: Schemas.summary.priceClose
    })
      .from(Schemas.summary)
      .where(
        and(
          eq(Schemas.summary.stockCode, stockCode),
          gte(Schemas.summary.date, perfStart),
          lte(Schemas.summary.date, dateInt)
        )
      )
      .orderBy(asc(Schemas.summary.date))

    const validPerf = perfRows.filter(
      (r) =>
        r.priceClose != null && Number.isFinite(Number(r.priceClose)) && Number(r.priceClose) > 0
    )

    if (validPerf.length >= 2) {
      const currentClose = Number(validPerf[validPerf.length - 1]!.priceClose)

      const findReturnByDays = (calendarDays: number): number | null => {
        const targetDate = Utils.addDaysToDateInt(dateInt, -calendarDays)
        let bestIdx: number | null = null
        for (let i = validPerf.length - 2; i >= 0; i--) {
          if (validPerf[i]!.date <= targetDate) {
            bestIdx = i
            break
          }
        }
        if (bestIdx == null) {
          return null
        }
        const pastClose = Number(validPerf[bestIdx]!.priceClose)
        return pastClose > 0 ? ((currentClose - pastClose) / pastClose) * 100 : null
      }

      if (computedWeek4PC == null) {
        computedWeek4PC = findReturnByDays(28)
      }
      if (computedWeek13PC == null) {
        computedWeek13PC = findReturnByDays(91)
      }
      if (computedWeek26PC == null) {
        computedWeek26PC = findReturnByDays(182)
      }
      if (computedWeek52PC == null) {
        computedWeek52PC = findReturnByDays(365)
      }
    }
  }

  // Query latest listed_shares and price_close for this stock
  const latestSummaryRows = await Database.select({
    listedShares: Schemas.summary.listedShares,
    priceClose: Schemas.summary.priceClose
  })
    .from(Schemas.summary)
    .where(
      and(
        eq(Schemas.summary.stockCode, stockCode),
        gte(Schemas.summary.listedShares, 1)
      )
    )
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestSummary = latestSummaryRows[0]
  const listedShares = latestSummary?.listedShares ?? null
  const currentPrice = latestSummary?.priceClose ?? null

  // Compute accurate market cap from current price × listed shares
  const computedMarketCap = currentPrice != null && listedShares != null && listedShares > 0
    ? currentPrice * listedShares
    : screenerRow.marketCapital

  const allScreenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    per: Schemas.screener.per,
    pbv: Schemas.screener.pbv,
    roa: Schemas.screener.roa,
    roe: Schemas.screener.roe,
    der: Schemas.screener.der,
    week26PC: Schemas.screener.week26PC,
    week52PC: Schemas.screener.week52PC
  }).from(Schemas.screener)
  const rowsForScore: Types.ScreenerRow[] = allScreenerRows.map((row) => {
    const isCurrentStock = row.code === stockCode
    return {
      code: row.code,
      name: row.name,
      sector: row.sector,
      per: row.per,
      pbv: row.pbv,
      roa: row.roa,
      roe: row.roe,
      der: row.der,
      week26PC: isCurrentStock ? computedWeek26PC : row.week26PC,
      week52PC: isCurrentStock ? computedWeek52PC : row.week52PC
    }
  })
  const rankedRows = Services.Composite.computeRanked(rowsForScore)
  const rankedRow = rankedRows.find((rankedItem) => rankedItem.code === stockCode)
  const valueSummaryRows = await Database.select({
    value: Schemas.summary.value,
    volume: Schemas.summary.volume
  })
    .from(Schemas.summary)
    .where(and(eq(Schemas.summary.stockCode, stockCode), eq(Schemas.summary.date, dateInt)))
  const summaryRow = valueSummaryRows[0]
  const ohlcRows = await Database.select({
    date: Schemas.summary.date,
    priceOpen: Schemas.summary.priceOpen,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow,
    priceClose: Schemas.summary.priceClose,
    volume: Schemas.summary.volume,
    change: Schemas.summary.change
  })
    .from(Schemas.summary)
    .where(
      and(
        eq(Schemas.summary.stockCode, stockCode),
        gte(Schemas.summary.date, start),
        lte(Schemas.summary.date, end)
      )
    )
    .orderBy(asc(Schemas.summary.date))
  const hasNotation = Utils.isNonEmptyString(screenerRow.notation)
  const hasCorpAction = Utils.isNonEmptyString(screenerRow.corpAction)
  const hasUma = Utils.isNonEmptyString(screenerRow.umaDate)

  const detail: Types.StockDetail = {
    code: screenerRow.code,
    name: screenerRow.name,
    sector: screenerRow.sector,
    industry: screenerRow.industry,
    subSector: screenerRow.subSector,
    per: screenerRow.per,
    pbv: screenerRow.pbv,
    roa: screenerRow.roa,
    roe: screenerRow.roe,
    der: screenerRow.der,
    npm: screenerRow.npm,
    eps: screenerRow.eps ?? null,
    bookValue: screenerRow.bookValue ?? null,
    marketCapital: computedMarketCap,
    week4PC: computedWeek4PC,
    week13PC: computedWeek13PC,
    week26PC: computedWeek26PC,
    week52PC: computedWeek52PC,
    hasNotation,
    hasCorpAction,
    hasUma,
    valueScore: rankedRow?.valueScore ?? 0,
    qualityScore: rankedRow?.qualityScore ?? 0,
    momentumScore: rankedRow?.momentumScore ?? 0,
    compositeScore: rankedRow?.compositeScore ?? 0,
    rank: rankedRow?.rank ?? 0,
    value: summaryRow?.value ?? null,
    volume: summaryRow?.volume ?? null,
    listedShares: listedShares ?? null,
    currentPrice: currentPrice ?? null,
    dividendYield: screenerRow.dividendYield ?? null,
    ohlc: ohlcRows.map((row) => ({
      date: row.date,
      open: row.priceOpen,
      high: row.priceHigh,
      low: row.priceLow,
      close: row.priceClose,
      volume: row.volume,
      change: row.change
    }))
  }
  return ctx.send.json(detail)
}
