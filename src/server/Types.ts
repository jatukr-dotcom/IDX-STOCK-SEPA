/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

export type { Client } from '@app/server/services/Client.ts'

export type BrowserHeaders = Record<string, string>

export interface IdxClient {
  get(url: string): Promise<Response>
  ensureSession(): Promise<void>
}

export interface ScreenerResult {
  stockCode?: string
  companyName?: string
  industry?: string
  sector?: string
  subSector?: string
  subIndustry?: string
  subIndustryCode?: string
  indexCode?: string
  marketCapital?: number
  tRevenue?: number
  npm?: number
  per?: number
  pbv?: number
  roa?: number
  roe?: number
  der?: number
  week4PC?: number
  week13PC?: number
  week26PC?: number
  week52PC?: number
  ytdpc?: number
  mtdpc?: number
  umaDate?: string
  notation?: string
  status?: string
  corpAction?: string
  corpActionDate?: string
}

export interface ScreenerApiResponse {
  results?: ScreenerResult[]
}

export interface BreakoutRow {
  code: string
  name: string | null
  sector: string | null
  price: number
  stage: number
  rsRank: number
  breakoutSignal: 'breakout' | 'approaching' | 'none'
  pivotPoint: number | null
  breakoutVolRatio: number | null
  atr: number | null
  atrPct: number | null
  bbSqueeze: boolean
  bbWidth: number | null
  vcpIsVcp: boolean
  shakeoutDetected: boolean
  patternType: string
  trendCriteriaCount: number
  pctFrom52wHigh: number | null
}

export interface BreakoutsResponse {
  date: number
  totalCount: number
  data: BreakoutRow[]
}

export interface StockSummaryItem {
  Date?: string
  StockCode?: string
  StockName?: string
  Remarks?: string
  Previous?: number
  OpenPrice?: number
  FirstTrade?: number
  High?: number
  Low?: number
  Close?: number
  Change?: number
  Volume?: number
  Value?: number
  Frequency?: number
  IndexIndividual?: number
  Offer?: number
  OfferVolume?: number
  Bid?: number
  BidVolume?: number
  ListedShares?: number
  TradebleShares?: number
  WeightForIndex?: number
  ForeignBuy?: number
  ForeignSell?: number
}

export interface StockSummaryApiResponse {
  draw?: number
  recordsTotal?: number
  recordsFiltered?: number
  data: StockSummaryItem[]
}

export interface ScreenerRow {
  code: string
  name: string | null
  sector: string | null
  per: number | null
  pbv: number | null
  roa: number | null
  roe: number | null
  der: number | null
  week26PC: number | null
  week52PC: number | null
}

export interface RankedRow {
  code: string
  name: string | null
  sector: string | null
  valueScore: number
  qualityScore: number
  momentumScore: number
  compositeScore: number
  rank: number
}

export interface CompositeWeights {
  valueWeight?: number
  qualityWeight?: number
  momentumWeight?: number
}

export interface CompositeResolvedWeights {
  valueWeight: number
  qualityWeight: number
  momentumWeight: number
}

export interface RankedRowWithFlags extends RankedRow {
  hasNotation: boolean
  hasCorpAction: boolean
  hasUma: boolean
  per: number | null
  roe: number | null
  der: number | null
  week26PC: number | null
  week52PC: number | null
}

export interface RankedRowWithSectorRank extends RankedRowWithFlags {
  sectorRank: number
  sectorPercentile: number
}

export interface SectorStrengthRow {
  sector: string
  avgMomentum: number
  count: number
  rank: number
}

export interface CandidateRow extends RankedRowWithFlags {
  value: number | null
  volume: number | null
  changePct: number | null
  compositePercentile: number
}

export interface CandidateRowWithSectorRank extends CandidateRow {
  sectorRank: number
  sectorPercentile: number
}

export interface CandidatesResponse {
  date: number
  totalCount: number
  limit: number
  offset: number
  serverTimestamp: string
  data: CandidateRow[] | CandidateRowWithSectorRank[]
}

export interface CandidatesResponseMeta {
  date: number
  totalCount: number
  limit: number
  offset: number
  serverTimestamp: string
}

export interface StockDetailOhlcRow {
  date: number
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  change: number | null
}

export interface StockDetail {
  code: string
  name: string | null
  sector: string | null
  industry: string | null
  subSector: string | null
  per: number | null
  pbv: number | null
  roa: number | null
  roe: number | null
  der: number | null
  npm: number | null
  eps: number | null
  bookValue: number | null
  marketCapital: number | null
  week4PC: number | null
  week13PC: number | null
  week26PC: number | null
  week52PC: number | null
  hasNotation: boolean
  hasCorpAction: boolean
  hasUma: boolean
  valueScore: number
  qualityScore: number
  momentumScore: number
  compositeScore: number
  rank: number
  value: number | null
  volume: number | null
  listedShares: number | null
  currentPrice: number | null
  dividendYield: number | null
  ohlc: StockDetailOhlcRow[]
}

export interface FinancialHistoryRow {
  year: number
  quarter: number
  periodDate: string | null
  eps: number | null
  bookValue: number | null
  sales: number | null
  profit: number | null
  profitAttrOwner: number | null
}

export interface FinancialHistoryResponse {
  code: string
  data: FinancialHistoryRow[]
}

export interface DenoCron {
  cron(scheduleName: string, schedule: string, handler: () => Promise<void>): void
}

export interface FundamentalFilter {
  perMin?: number
  perMax?: number
  roeMin?: number
  derMax?: number
  momentumMin?: number
  momentumWeek: 26 | 52
}

export interface FundamentalsRowInput {
  code: string
  per: unknown
  roe: unknown
  der: unknown
  week26PC: unknown
  week52PC: unknown
}

export interface FundamentalsValues {
  per: number | null
  roe: number | null
  der: number | null
  week26PC: number | null
  week52PC: number | null
}

export interface LimitOffset {
  limit: number
  offset: number
}

export interface PaginationResult<T> {
  data: T[]
  totalCount: number
}

export interface DateCloseRow {
  date: number
  close: number
}

export interface DateCloseNullableRow {
  date: number
  close: number | null
}

export interface RsiSeriesRow {
  date: number
  rsi: number | null
}

export interface RsiApiResponse {
  code: string
  start: number
  end: number
  period: number
  data: RsiSeriesRow[]
  sector: string | null
  sectorData: RsiSeriesRow[]
}

export interface ScreenerRsiItem {
  code: string
  name: string | null
  sector: string | null
  rsi: number | null
}

export interface ScreenerRsiDataResponse {
  date: number
  period: number
  data: { byCode: ScreenerRsiItem[]; bySector: Record<string, ScreenerRsiItem[]> }
}

export interface ForeignFlowRow {
  date: number
  buy: number | null
  sell: number | null
  net: number | null
}

export interface ForeignSummary {
  totalBuy: number
  totalSell: number
  totalNet: number
  dayCount: number
}

export interface ForeignApiResponse {
  code: string
  start: number
  end: number
  data: ForeignFlowRow[]
  summary: ForeignSummary
}

export interface OhlcRowApi {
  date: number
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  change: number | null
  bidVolume: number | null
  offerVolume: number | null
}

export interface BidOfferRowApi {
  date: number
  bidVolume: number | null
  offerVolume: number | null
}

export interface SectorBidOfferAggregate {
  bidVolume: number
  offerVolume: number
  count: number
}

export interface ScreenerBidOfferItem {
  sector: string
  bidVolume: number
  offerVolume: number
  count: number
}

export interface ScreenerBidOfferResponse {
  date: number
  data: ScreenerBidOfferItem[]
}

export interface HistorySectorAggregate {
  bidVolume: number
  offerVolume: number
  count: number
}

export interface HistoryBidOfferByDateEntry {
  date: number
  sectors: Record<string, HistorySectorAggregate>
}

export interface HistoryBidOfferSectorItem {
  sector: string
  totalBid: number
  totalOffer: number
  dayCount: number
  avgBid: number
  avgOffer: number
  ratio: number | null
}

export interface HistoryBidOfferResponse {
  start: number
  end: number
  byDate: HistoryBidOfferByDateEntry[]
  bySector: HistoryBidOfferSectorItem[]
}

export interface LiquiditySnapshot {
  value: number | null
  volume: number | null
}

export interface CodeFlags {
  notation: string | null
  corpAction: string | null
  umaDate: string | null
}

export interface GeneralApiResponse {
  stockList: { code: string; name: string }[]
  industries: string[]
  sectors: string[]
  subSectors: string[]
  subIndustries: string[]
}

export interface TrendTemplateCriteria {
  aboveMa150Ma200: boolean
  ma150AboveMa200: boolean
  ma200Trending: boolean
  ma50AboveMa150Ma200: boolean
  aboveMa50: boolean
  above52wLowBy30Pct: boolean
  within25PctOf52wHigh: boolean
  rsRank70: boolean
}

export interface TrendTemplateRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  ma50: number | null
  ma150: number | null
  ma200: number | null
  low52w: number | null
  high52w: number | null
  criteriaCount: number
  criteria: TrendTemplateCriteria
  rsRank: number | null
  pctFrom52wLow: number | null
  pctFrom52wHigh: number | null
}

export interface TrendTemplateResponse {
  date: number
  totalCount: number
  data: TrendTemplateRow[]
}

export interface RsRankingRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  rsScore: number
  rsRank: number
  return3m: number | null
  return6m: number | null
  return9m: number | null
  return12m: number | null
  trendCriteriaCount: number
}

export interface RsRankingResponse {
  date: number
  totalCount: number
  data: RsRankingRow[]
}

export interface NewHighRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  high52w: number | null
  low52w: number | null
  pctFrom52wHigh: number | null
  pctFrom52wLow: number | null
  rsRank: number | null
  trendCriteriaCount: number
}

export interface NewHighsResponse {
  date: number
  totalCount: number
  data: NewHighRow[]
}

export interface SepaCandidateRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  // RS
  rsRank: number
  rsScore: number
  return3m: number | null
  return6m: number | null
  // Trend Template
  trendCriteriaCount: number
  criteria: TrendTemplateCriteria
  ma50: number | null
  ma150: number | null
  ma200: number | null
  // 52w
  pctFrom52wHigh: number | null
  pctFrom52wLow: number | null
  high52w: number | null
  low52w: number | null
  // Fundamentals
  per: number | null
  roe: number | null
  der: number | null
  npm: number | null
  // EPS Growth
  epsGrowthPct: number | null
  epsAcceleration: boolean
  epsConsecutiveGrowth: number
  // Liquidity
  avgVolume20d: number | null
  avgValue20d: number | null
  // Stage
  stage: StageNumber
  // Composite
  sepaScore: number
}

export interface SepaResponse {
  date: number
  totalCount: number
  data: SepaCandidateRow[]
}

export interface VcpResult {
  isVcp: boolean
  contractions: number
  volumeDrying: boolean
}

export interface VolumeAnalysisSeriesRow {
  date: number
  close: number
  volume: number
  adLine: number
  obv: number
  cmf: number | null
  mfi: number | null
  netForeign: number
}

export interface VolumeAnalysisResponse {
  code: string
  series: VolumeAnalysisSeriesRow[]
  signal: 'accumulation' | 'distribution' | 'neutral'
  cmfCurrent: number | null
  mfiCurrent: number | null
  obvTrend: 'up' | 'down' | 'flat'
  volSurgePct: number | null
  vcp: VcpResult
}

export interface VolumeScreenerRow {
  code: string
  name: string | null
  sector: string | null
  close: number
  cmf: number | null
  mfi: number | null
  obvTrend: 'up' | 'down' | 'flat'
  signal: 'accumulation' | 'distribution' | 'neutral'
  foreignNetPct: number | null
  volSurgePct: number | null
  criteriaCount: number
  vcp: VcpResult
}

export interface VolumeScreenerResponse {
  date: number
  totalCount: number
  data: VolumeScreenerRow[]
}

export type StageNumber = 1 | 2 | 3 | 4

export interface StageAnalysisRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  stage: StageNumber
  stageLabel: string
  ma50: number | null
  ma150: number | null
  ma200: number | null
  ma200SlopePct: number | null
  rsRank: number | null
  trendCriteriaCount: number
  pctFrom52wHigh: number | null
  pctFrom52wLow: number | null
  avgVolume20d: number | null
  avgValue20d: number | null
}

export interface StageAnalysisResponse {
  date: number
  totalCount: number
  data: StageAnalysisRow[]
}

export interface PocketPivotRow {
  code: string
  name: string | null
  sector: string | null
  price: number
  pivotDate: number
  pivotVolume: number
  maxDownVol10d: number
  ma10: number | null
  pctAboveMa10: number | null
  rsRank: number
  trendCriteriaCount: number
  stage: StageNumber
}

export interface PocketPivotResponse {
  date: number
  totalCount: number
  data: PocketPivotRow[]
}

export interface RsLineRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  rsLineValue: number | null
  rsLineNewHigh: boolean
  rsLinePctFrom52wHigh: number | null
  rsRank: number | null
  pctFrom52wHigh: number | null
  trendCriteriaCount: number
}

export interface RsLineResponse {
  date: number
  totalCount: number
  data: RsLineRow[]
}

export type BasePatternType = 'flat' | 'cup-handle' | 'htf' | 'none'

export interface BasePatternRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  patternType: BasePatternType
  baseCount: number
  baseDepthPct: number | null
  baseLengthDays: number | null
  rsRank: number | null
  stage: StageNumber
  trendCriteriaCount: number
  pctFrom52wHigh: number | null
}

export interface BasePatternsResponse {
  date: number
  totalCount: number
  data: BasePatternRow[]
}

export type PowerPlaySetupType = 'power-play' | 'low-cheat' | 'none'

export interface PowerPlayRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  setupType: PowerPlaySetupType
  tightRangePct: number | null
  consolidationDays: number
  volumeDryUpPct: number | null
  rsRank: number | null
  stage: StageNumber
  nearBreakout: boolean
  trendCriteriaCount: number
  pctFrom52wHigh: number | null
}

export interface PowerPlayResponse {
  date: number
  totalCount: number
  data: PowerPlayRow[]
}

export type AiRecommendationMode = 'technical' | 'fundamental' | 'combined'

export interface AiRecommendationRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  techScore: number
  fundScore: number
  combinedScore: number
  gorenganScore: number
  stage: StageNumber
  rsRank: number
  sepaScore: number
  epsGrowthPct: number | null
  roe: number | null
  der: number | null
  hasRsLineNewHigh: boolean
  hasPocketPivot: boolean
  patternType: BasePatternType
  setupType: PowerPlaySetupType
  reasons: string[]
}

export interface AiRecommendationResponse {
  date: number
  mode: AiRecommendationMode
  totalCount: number
  data: AiRecommendationRow[]
  claudeNarrative?: string
}

// ─── Advanced Technical Indicators ──────────────────────────────────────────

export interface MacdSeriesRow {
  date: number
  macdLine: number | null
  signalLine: number | null
  histogram: number | null
}

export interface StochRsiSeriesRow {
  date: number
  k: number | null
  d: number | null
}

export interface SRLevel {
  price: number
  type: 'support' | 'resistance'
  touchCount: number
  lastTouchDate: number
  strength: 'strong' | 'moderate' | 'weak'
}

export interface SupportResistanceData {
  currentClose: number
  levels: SRLevel[]
}

export interface FibonacciLevel {
  ratio: number
  label: string
  price: number
}

export interface FibonacciData {
  swingHigh: number
  swingHighDate: number
  swingLow: number
  swingLowDate: number
  trend: 'up' | 'down'
  levels: FibonacciLevel[]
}

export interface DivergenceSignal {
  type: 'bullish' | 'bearish'
  indicator: 'rsi' | 'stochRsi'
  startDate: number
  endDate: number
  priceStart: number
  priceEnd: number
  indicatorStart: number
  indicatorEnd: number
}

export interface TechnicalAnalysisApiResponse {
  code: string
  start: number
  end: number
  macd: MacdSeriesRow[]
  stochRsi: StochRsiSeriesRow[]
  supportResistance: SupportResistanceData
  fibonacci: FibonacciData | null
  divergences: DivergenceSignal[]
}

// ─── Smart Money Tracker ─────────────────────────────────────────────────────

export interface SmartMoneyRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  smtScore: number
  foreignFlowScore: number
  foreignStreakScore: number
  volumePriceScore: number
  tradeSizeScore: number
  bidOfferScore: number
  crossSignalScore: number
  brokerScore: number | null
  foreignNet5d: number | null
  foreignNet20d: number | null
  foreignAcceleration: number | null
  consecutiveForeignBuyDays: number
  avgTradeSize: number | null
  avgTradeSizeChange: number | null
  bidOfferRatio: number | null
  signal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'
  reasons: string[]
  topBrokerConcentration: number | null
  dominantBrokerName: string | null
  accumulatingBrokers: string[] | null // broker names consistently present in top 10
}

export interface SmartMoneyResponse {
  date: number
  totalCount: number
  hasBrokerData: boolean
  data: SmartMoneyRow[]
}

export interface SmartMoneyViewProps {
  data: SmartMoneyResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
  onRowClick?: (code: string) => void
}

export interface BrokerFlowTopBroker {
  brokerCode: string
  brokerName: string
  volume: number
  value: number
  frequency: number
  volumePct: number
}

export interface BrokerFlowResponse {
  code: string
  date: number
  brokerCount: number | null
  top3VolumePct: number | null
  top5VolumePct: number | null
  dominantBrokerCode: string | null
  dominantBrokerName: string | null
  dominantBrokerVolumePct: number | null
  topBrokers: BrokerFlowTopBroker[]
  accumulatingBrokers: { code: string; name: string; days: number; avgRank: number }[]
}

export interface StockListItem {
  code: string
  name: string | null
  sector: string | null
  industry: string | null
  compositeScore: number
  rank: number
  per: number | null
  roe: number | null
  der: number | null
}

export interface StockListResponse {
  totalCount: number
  limit: number
  offset: number
  data: StockListItem[]
}

// ─── Broker History Tracker ──────────────────────────────────────────────────

export interface BrokerTrendItem {
  brokerCode: string
  brokerName: string
  daysPresent: number // how many days present in top 10
  totalDays: number // total trading days in the window
  avgRank: number // average rank position (lower = better)
  bestRank: number // best rank achieved
  rankTrend: 'improving' | 'declining' | 'stable'
  totalVolume: number // cumulative volume across all days
  isAccumulating: boolean // heuristic: present ≥50% days, avgRank ≤5, not declining
}

export interface BrokerHistoryDay {
  date: number
  brokers: {
    brokerCode: string
    brokerName: string
    rank: number
    volume: number
    volumePct: number
  }[]
}

export interface BrokerHistoryResponse {
  code: string
  startDate: number
  endDate: number
  totalDays: number
  history: BrokerHistoryDay[]
  trend: BrokerTrendItem[]
}
