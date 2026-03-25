/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

export interface CandidateRow {
  code: string
  name: string | null
  sector: string | null
  valueScore: number
  qualityScore: number
  momentumScore: number
  compositeScore: number
  rank: number
  hasNotation: boolean
  hasCorpAction: boolean
  hasUma: boolean
  per: number | null
  roe: number | null
  der: number | null
  week26PC: number | null
  week52PC: number | null
  value: number | null
  volume: number | null
  changePct: number | null
  compositePercentile: number
}

export interface CandidateRowWithSectorRank extends CandidateRow {
  sectorRank: number
  sectorPercentile: number
}

export type CandidateTableRow = CandidateRow | CandidateRowWithSectorRank

export interface CandidatesParams {
  date?: string
  limit?: number
  offset?: number
  defaultFilter?: boolean
  excludeNotation?: boolean
  excludeCorpAction?: boolean
  excludeUma?: boolean
  minValue?: number
  minVolume?: number
  perMin?: number
  perMax?: number
  roeMin?: number
  derMax?: number
  momentumWeek?: 26 | 52
  momentumMin?: number
  withSectorRank?: boolean
  sector?: string
  search?: string
}

export interface CandidatesResponse {
  date: number
  totalCount: number
  limit: number
  offset: number
  serverTimestamp: string
  data: CandidateRow[] | CandidateRowWithSectorRank[]
}

export interface CandidatesTableProps {
  data: CandidateTableRow[]
  limit: number
  offset: number
  totalCount: number
  totalCountLabel?: string
  onPage: (newOffset: number) => void
  onRowClick: (code: string) => void
  searchValue?: string
  onSearchChange?: (searchQuery: string) => void
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  watchlistCodes?: string[]
  onWatchlistToggle?: (code: string, row?: CandidateTableRow) => void
}

export interface ClientOptions {
  signal?: AbortSignal
}

export interface DashboardHeaderProps {
  totalCount: number
  date: number
  onRefresh: () => void
  loading?: boolean
}

export type DetailTab = 'fundamental' | 'technical' | 'eps' | 'volume'

export interface FilterPanelProps {
  params: CandidatesParams
  sectors: string[]
  sectorFilter: string
  onSectorFilterChange: (sector: string) => void
  onParamsChange: (partialParams: Partial<CandidatesParams>) => void
  onApply: () => void
  onDefaultFilter: () => void
}

export interface ForeignFlowRow {
  date: number
  buy: number | null
  sell: number | null
  net: number | null
}

export type ForeignPeriodDays = 30 | 60 | 90 | 180 | 360

export interface ForeignPeriodOption {
  days: ForeignPeriodDays
  label: string
}

export interface ForeignResponse {
  code: string
  start: number
  end: number
  data: ForeignFlowRow[]
  summary: {
    totalBuy: number
    totalSell: number
    totalNet: number
    dayCount: number
  }
}

export interface GeneralResponse {
  stockList: { code: string; name: string }[]
  industries: string[]
  sectors: string[]
  subSectors: string[]
  subIndustries: string[]
}

export interface HistoryBidOfferByDateEntry {
  date: number
  sectors: Record<string, HistorySectorAggregate>
}

export interface HistoryBidOfferResponse {
  start: number
  end: number
  byDate: HistoryBidOfferByDateEntry[]
  bySector: HistoryBidOfferSectorItem[]
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

export interface HistorySectorAggregate {
  bidVolume: number
  offerVolume: number
  count: number
}

export type HomeTab = 'methodology' | 'score' | 'filter' | 'howTo'

export type MainAnalysisTab = 'fundamental' | 'technical' | 'watchlist' | 'trendTemplate' | 'rsRanking' | 'newHighs' | 'sepa' | 'volumeAnalysis' | 'momentum'

export interface OhlcApiRow extends StockDetailOhlcRow {
  bidVolume: number | null
  offerVolume: number | null
}

export interface RsiResponse {
  code: string
  start: number
  end: number
  period: number
  data: RsiRow[]
  sector: string | null
  sectorData: RsiRow[]
}

export interface RsiRow {
  date: number
  rsi: number | null
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

export interface ScreenerRsiItem {
  code: string
  name: string | null
  sector: string | null
  rsi: number | null
}

export interface ScreenerRsiResponse {
  date: number
  period: number
  data: { byCode: ScreenerRsiItem[]; bySector: Record<string, ScreenerRsiItem[]> }
}

export interface RsiMarketViewProps {
  data: ScreenerRsiResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
}

export interface BidOfferMarketViewProps {
  data: ScreenerBidOfferResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
}

export interface SectorStrengthProps {
  data: SectorStrengthRow[] | null
  loading: boolean
  week: 26 | 52
  onWeekChange: (week: 26 | 52) => void
}

export interface SectorStrengthRow {
  sector: string
  avgMomentum: number
  count: number
  rank: number
}

export interface SectorStrengthTooltipPayload {
  sector: string
  avgMomentum: number
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

export type RsiChartPoint = { date: string; rsi: number; sectorRsi: number | null }

export interface StockDetailModalProps {
  detail: StockDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
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

export type PriceLinePoint = { date: string; close: number }

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

export interface TrendTemplateViewProps {
  data: TrendTemplateResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
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

export interface RsRankingViewProps {
  data: RsRankingResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
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

export interface NewHighsViewProps {
  data: NewHighsResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
}

export type StageNumber = 1 | 2 | 3 | 4

export interface SepaCandidateRow {
  code: string
  name: string | null
  sector: string | null
  price: number | null
  rsRank: number
  rsScore: number
  return3m: number | null
  return6m: number | null
  trendCriteriaCount: number
  criteria: TrendTemplateCriteria
  ma50: number | null
  ma150: number | null
  ma200: number | null
  pctFrom52wHigh: number | null
  pctFrom52wLow: number | null
  high52w: number | null
  low52w: number | null
  per: number | null
  roe: number | null
  der: number | null
  npm: number | null
  epsGrowthPct: number | null
  epsAcceleration: boolean
  epsConsecutiveGrowth: number
  avgVolume20d: number | null
  avgValue20d: number | null
  stage: StageNumber
  sepaScore: number
}

export type MomentumSubTab = 'stage' | 'pocketPivot' | 'rsLine' | 'basePatterns' | 'powerPlay'

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

export interface MomentumViewProps {
  onRowClick: (code: string) => void
}

export interface SepaResponse {
  date: number
  totalCount: number
  data: SepaCandidateRow[]
}

export interface SepaViewProps {
  data: SepaResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
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

export interface VolumeAnalysisViewProps {
  data: VolumeScreenerResponse | null
  loading: boolean
  error: string | null
  onRefetch: () => void
}
