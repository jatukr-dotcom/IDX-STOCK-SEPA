// Import KSEI shareholder TSV into stock_shareholder table
// Usage: deno run -A src/server/IngestShareholders.ts <tsv-file>
import { createClient } from 'npm:@libsql/client'

const tsvPath = Deno.args[0]
if (!tsvPath) { console.error('Usage: deno run -A IngestShareholders.ts <tsv>'); Deno.exit(1) }

const dbPath = new URL('../../data/database.sqlite', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const client = createClient({ url: `file:${dbPath}` })

// Create table and index
await client.execute(`
  CREATE TABLE IF NOT EXISTS stock_shareholder (
    code TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    investor_name TEXT NOT NULL,
    investor_type TEXT,
    local_foreign TEXT,
    nationality TEXT,
    domicile TEXT,
    total_shares INTEGER NOT NULL,
    percentage REAL NOT NULL,
    PRIMARY KEY (code, snapshot_date, investor_name)
  )
`)
await client.execute(`
  CREATE INDEX IF NOT EXISTS idx_shareholder_code ON stock_shareholder(code, snapshot_date DESC)
`)

const content = await Deno.readTextFile(tsvPath)
const lines = content.trim().split('\n').slice(1)  // skip header
let inserted = 0
let skipped = 0

// Batch insert using transactions
const BATCH_SIZE = 200
for (let i = 0; i < lines.length; i += BATCH_SIZE) {
  const batch = lines.slice(i, i + BATCH_SIZE)
  const stmts = []
  for (const line of batch) {
    const [date, code, investor, type, lf, nat, dom, total, pct] = line.split('\t')
    if (!date || !code || !investor) { skipped++; continue }
    stmts.push({
      sql: `INSERT OR REPLACE INTO stock_shareholder
        (snapshot_date, code, investor_name, investor_type, local_foreign, nationality, domicile, total_shares, percentage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        date, code, investor,
        type || null, lf || null, nat || null, dom || null,
        parseInt(total!), parseFloat(pct!)
      ]
    })
    inserted++
  }
  if (stmts.length > 0) await client.batch(stmts, 'write')
}

console.log(`Inserted ${inserted} rows, skipped ${skipped}`)
client.close()
