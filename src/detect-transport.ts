/* eslint-disable prettier/prettier */
// Detect whether an MCP server at `baseUrl` speaks the **new Streamable HTTP** transport ("http"),
// the **legacy HTTP+SSE** transport ("sse"), or cannot be determined ("unknown").
//
// - Never throws; always resolves to "http" | "sse" | "unknown".
// - No external deps; works in modern browsers and Node 18+ (fetch, AbortController, TextDecoder).

export type McpTransportKind = 'http' | 'sse' | 'unknown'

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string
  method: 'initialize'
}

type FirstSseEvent = {
  event?: string
  data?: string
  id?: string
}

export async function detectMcpTransport(
  baseUrl: string,
  opts?: {
    timeoutMs?: number
    headers?: Record<string, string>
  },
): Promise<McpTransportKind> {
  const timeoutMs = opts?.timeoutMs ?? 5000

  // Build a minimally valid initialize request per spec.
  const initReq: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: `init-${Date.now()}`,
    method: 'initialize',
  }

  // --- Step 1: POST initialize (Streamable HTTP must accept this) ---
  const postHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    // Spec requires clients to list both types they can accept.
    Accept: 'application/json, text/event-stream',
    // Many servers validate Origin for DNS‑rebinding protection.
    Origin: 'http://localhost',
    ...opts?.headers,
  }

  const postRes = await safeFetch(
    baseUrl,
    {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify(initReq),
    },
    timeoutMs,
  )

  if (postRes) {
    const ct = contentType(postRes.headers.get('content-type'))
    if (postRes.ok && (ct === 'application/json' || ct === 'text/event-stream')) {
      // Per spec, a JSON-RPC *request* must yield either JSON or an SSE stream.
      return 'http'
    }

    // If POST failed with a definitive "method/url not supported" style 4xx,
    // run the legacy probe. Auth-related 401/403 can't be reliably classified.
    if (postRes.status >= 400 && postRes.status < 500 && postRes.status !== 401 && postRes.status !== 403) {
      const legacy = await legacyProbe(baseUrl, timeoutMs, opts?.headers)
      if (legacy !== 'unknown') return legacy
    }

    // Some servers might still expose GET SSE and return non-OK here; try the legacy probe anyway.
    const legacyFallback = await legacyProbe(baseUrl, timeoutMs, opts?.headers)
    if (legacyFallback !== 'unknown') return legacyFallback
  } else {
    // POST timed out/couldn't connect — try legacy probe just in case.
    const legacy = await legacyProbe(baseUrl, timeoutMs, opts?.headers)
    if (legacy !== 'unknown') return legacy
  }

  return 'unknown'
}

// --- Helpers -----------------------------------------------------------------

async function legacyProbe(
  baseUrl: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<McpTransportKind> {
  const getHeaders: Record<string, string> = {
    Accept: 'text/event-stream',
    Origin: 'http://localhost',
    ...extraHeaders,
  }

  const getRes = await safeFetch(
    baseUrl,
    {
      method: 'GET',
      headers: getHeaders,
    },
    timeoutMs,
  )

  if (!getRes) return 'unknown'

  if (getRes.status === 405) {
    // New transport is allowed to say GET not supported.
    return 'http'
  }

  const ct = contentType(getRes.headers.get('content-type'))
  if (ct !== 'text/event-stream') {
    // If it's not an SSE stream, we can't classify as legacy.
    return 'unknown'
  }

  const first = await readFirstSseEvent(getRes, timeoutMs)
  if (!first) return 'unknown'

  // Legacy transport mandates the first event is `event: endpoint`
  // providing the POST endpoint in `data`.
  if ((first.event ?? '').trim() === 'endpoint') {
    return 'sse'
  }

  // If an SSE stream opens but the first event is not `endpoint`,
  // this matches the new transport's optional GET stream.
  return 'http'
}

function contentType(raw: string | null): string | undefined {
  if (!raw) return undefined
  const semi = raw.split(';')[0]?.trim().toLowerCase()
  return semi || undefined
}

async function safeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ac.signal })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function readFirstSseEvent(res: Response, timeoutMs: number): Promise<FirstSseEvent | null> {
  const body = res.body
  if (!body) return null

  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  const event: FirstSseEvent = {}
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    reader.cancel().catch(() => undefined)
  }, timeoutMs)

  try {
    while (!timedOut) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let idx: number
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)

        // Parse single SSE frame.
        const lines = frame.split(/\r?\n/)
        const dataLines: string[] = []
        for (const line of lines) {
          if (line.startsWith(':')) continue // comment
          const colon = line.indexOf(':')
          const field = (colon === -1 ? line : line.slice(0, colon)).trim()
          const valueStr = colon === -1 ? '' : line.slice(colon + 1).replace(/^\s*/, '')
          if (field === 'event') event.event = valueStr
          else if (field === 'data') dataLines.push(valueStr)
          else if (field === 'id') event.id = valueStr
          // ignore retry and unknown fields
        }
        if (dataLines.length) event.data = dataLines.join('\n')

        // Return immediately on first complete frame.
        return event
      }
    }
  } catch {
    // fall through to null
  } finally {
    clearTimeout(timer)
  }
  return null
}
