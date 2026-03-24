/**
 * Debug script — cek raw response IDX API untuk financial ratio
 */

import * as Services from '@app/server/services/index.ts'

if (import.meta.main) {
  const client = new Services.Client()
  await client.ensureSession()

  const base =
    'https://www.idx.co.id/primary/DigitalStatistic/GetApiDataPaginated' +
    '?urlName=LINK_FINANCIAL_DATA_RATIO&periodYear=2024&periodMonth=9&periodType=monthly&isPrint=False&cumulative=false'

  // Try different pagination params
  const variants = [
    `${base}&pageSize=9999`,
    `${base}&length=9999`,
    `${base}&limit=9999`,
    `${base}&indexFrom=0&pageSize=9999`,
    `${base}&start=0&length=9999`,
  ]

  for (const url of variants) {
    const paramPart = url.split('&').slice(-2).join('&')
    const response = await client.get(url)
    const raw = await response.json()
    console.log(`[${paramPart}] data length: ${raw?.data?.length ?? 0}, keys: ${Object.keys(raw ?? {}).join(', ')}`)
  }
}
