import { serveDir } from 'jsr:@std/http/file-server'

const API_URL = 'http://127.0.0.1:50270'

Deno.serve({ port: 50260 }, async (req) => {
  const url = new URL(req.url)

  if (url.pathname.startsWith('/api')) {
    const target = API_URL + url.pathname + url.search
    return fetch(target, { method: req.method, headers: req.headers, body: req.body })
  }

  const isAsset = url.pathname.startsWith('/assets') || url.pathname.includes('.')
  if (isAsset) {
    return serveDir(req, { fsRoot: './dist', quiet: true })
  }

  // SPA fallback — return index.html for all other routes
  const html = await Deno.readFile('./dist/index.html')
  return new Response(html, { headers: { 'content-type': 'text/html' } })
})

console.log('Server running at http://127.0.0.1:50260')
