/**
 * Phase 0: Probe IDX API for per-stock broker summary endpoint.
 * Run: deno run --allow-net scripts/probe-broker-api.ts
 */

const origin = 'https://www.idx.co.id'
const browserHeaders: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  Referer: `${origin}/`,
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest'
}

async function getSession(): Promise<string> {
  console.log('Establishing session...')
  const indexResponse = await fetch(`${origin}/id`, { headers: browserHeaders })
  const setCookieHeaders = indexResponse.headers.getSetCookie?.() ?? []
  const sessionCookie = setCookieHeaders.join('; ')
  await indexResponse.text().catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))

  const validationResponse = await fetch(`${origin}/primary/home/GetIndexList`, {
    headers: { ...browserHeaders, ...(sessionCookie ? { Cookie: sessionCookie } : {}) }
  })
  await validationResponse.text().catch(() => {})
  console.log(`Session established (cookie length: ${sessionCookie.length})`)
  return sessionCookie
}

async function probeUrl(cookie: string, url: string, label: string): Promise<void> {
  console.log(`\n[${label}]`)
  console.log(`URL: ${url}`)
  try {
    const res = await fetch(url, {
      headers: { ...browserHeaders, ...(cookie ? { Cookie: cookie } : {}) }
    })
    console.log(`Status: ${res.status} ${res.statusText}`)
    const text = await res.text()
    const preview = text.slice(0, 500)
    console.log(`Response preview: ${preview}`)

    if (res.status === 200) {
      try {
        const json = JSON.parse(text)
        const keys = Object.keys(json)
        console.log(`JSON keys: ${keys.join(', ')}`)
        if (Array.isArray(json.data) && json.data.length > 0) {
          console.log(`data[0] keys: ${Object.keys(json.data[0]).join(', ')}`)
          console.log(`data[0]: ${JSON.stringify(json.data[0], null, 2).slice(0, 400)}`)
        } else if (Array.isArray(json) && json.length > 0) {
          console.log(`arr[0] keys: ${Object.keys(json[0]).join(', ')}`)
        }
        console.log('*** FOUND VALID RESPONSE ***')
      } catch {
        console.log('(not valid JSON)')
      }
    }
  } catch (e) {
    console.log(`Error: ${e}`)
  }
  await new Promise((r) => setTimeout(r, 1000))
}

// Use a recent trading day (last Friday or today if market open)
const date = '20260328' // Friday 28 March 2026
const testCode = 'BBRI'

const cookie = await getSession()

await probeUrl(
  cookie,
  `${origin}/primary/TradingSummary/GetBrokerSummary?date=${date}&stockCode=${testCode}`,
  '1: GetBrokerSummary with stockCode param'
)

await probeUrl(
  cookie,
  `${origin}/primary/TradingSummary/GetBrokerSummary?date=${date}&kodeEmiten=${testCode}`,
  '2: GetBrokerSummary with kodeEmiten param'
)

await probeUrl(
  cookie,
  `${origin}/primary/StockData/GetBrokerSummary?stockCode=${testCode}&date=${date}`,
  '3: StockData/GetBrokerSummary'
)

await probeUrl(
  cookie,
  `${origin}/primary/ListedCompany/GetTradingInfoBroker?code=${testCode}`,
  '4: GetTradingInfoBroker'
)

await probeUrl(
  cookie,
  `${origin}/primary/StockData/GetStockBrokerSummary?kodeEmiten=${testCode}&date=${date}`,
  '5: GetStockBrokerSummary'
)

await probeUrl(
  cookie,
  `${origin}/primary/TradingSummary/GetTradingBrokerSummary?stockCode=${testCode}&date=${date}`,
  '6: GetTradingBrokerSummary'
)

await probeUrl(
  cookie,
  `${origin}/primary/Home/GetTopBroker?stockCode=${testCode}&date=${date}`,
  '7: GetTopBroker'
)

console.log('\n=== Probe complete ===')
