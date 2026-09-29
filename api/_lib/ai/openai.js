// Managed OpenAI provider (Responses API, official SDK). One Integro-owned
// project key; per-tenant attribution happens in revenue_ai_usage, never via
// customer-supplied keys (no BYOM in Revenue).

export class AIUnavailable extends Error {
  constructor(reason, message) { super(message ?? reason); this.name = 'AIUnavailable'; this.reason = reason }
}

/**
 * Normalized response:
 * { status:'completed'|'incomplete'|'failed', text, output, toolCalls:[{call_id,name,arguments}],
 *   refusal, incompleteReason, usage:{input,output,cached}, model }
 */
export function createOpenAIProvider(config, { clientFactory } = {}) {
  const { apiKey, model, timeoutMs, maxRetries, maxOutputTokens } = config.openai
  const available = Boolean(apiKey && model)
  let client
  async function getClient() {
    if (client) return client
    if (clientFactory) return (client = clientFactory())
    const { default: OpenAI } = await import('openai')
    return (client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries }))
  }
  return {
    available, model: model ?? null, maxOutputTokens,
    async respond({ instructions, input, tools, schema, maxTokens, timeoutMs: callTimeoutMs }) {
      if (!available) throw new AIUnavailable('not_configured', 'OPENAI_API_KEY / OPENAI_MODEL are not configured')
      const c = await getClient()
      let resp
      try {
        resp = await c.responses.create({
          model, instructions, input, store: false, parallel_tool_calls: false,
          max_output_tokens: maxTokens ?? maxOutputTokens,
          ...(tools?.length ? { tools } : {}),
          ...(schema ? { text: { format: { type: 'json_schema', name: schema.name, strict: true, schema: schema.schema } } } : {}),
        // A caller with a hard deadline (Ask) bounds THIS call: total time = one attempt, no hidden SDK retries.
        }, callTimeoutMs ? { timeout: callTimeoutMs, maxRetries: 0 } : undefined)
      } catch (e) {
        if (e?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(e?.message ?? '')) throw new AIUnavailable('timeout', 'The AI request timed out')
        throw new AIUnavailable('provider_error', `AI provider error${e?.status ? ` (${e.status})` : ''}`)
      }
      return normalizeResponse(resp, model)
    },
  }
}

export function normalizeResponse(resp, model) {
  const output = Array.isArray(resp?.output) ? resp.output : []
  let refusal = null
  for (const item of output) for (const part of item?.content ?? []) if (part?.type === 'refusal') refusal = part.refusal ?? 'refused'
  const toolCalls = output.filter(i => i?.type === 'function_call').map(i => ({ call_id: i.call_id, name: i.name, arguments: i.arguments, item: i }))
  return {
    status: resp?.status ?? 'completed', text: typeof resp?.output_text === 'string' ? resp.output_text : '', output, toolCalls, refusal,
    incompleteReason: resp?.incomplete_details?.reason ?? null,
    usage: { input: resp?.usage?.input_tokens ?? 0, output: resp?.usage?.output_tokens ?? 0, cached: resp?.usage?.input_tokens_details?.cached_tokens ?? 0 },
    model: resp?.model ?? model,
  }
}

/**
 * Reserve quota atomically, run, then settle with real usage. Denials surface as
 * AIUnavailable so callers fall back to the deterministic product.
 */
export async function withAIQuota({ store, orgId, userId, feature, reserveTokens, requestId, jobId = null, model, run }) {
  const r = await store.rpc('rv_reserve_ai_usage', { _org: orgId, _user: userId ?? null, _feature: feature, _reserve_tokens: reserveTokens, _request_id: requestId ?? null, _job: jobId })
  const row = Array.isArray(r) ? r[0] : r
  if (!row?.usage_id) throw new AIUnavailable(row?.denied_reason ?? 'denied', quotaMessage(row?.denied_reason))
  const usage = { input: 0, output: 0, cached: 0 }
  let status = 'ok'
  try {
    return await run(u => { usage.input += u.input; usage.output += u.output; usage.cached += u.cached })
  } catch (e) {
    status = e instanceof AIUnavailable && e.reason === 'refused' ? 'refused' : e instanceof AIUnavailable && e.reason === 'incomplete' ? 'incomplete' : 'error'
    throw e
  } finally {
    await store.rpc('rv_settle_ai_usage', { _org: orgId, _id: row.usage_id, _status: status, _model: model ?? null, _in: usage.input, _out: usage.output, _cached: usage.cached }).catch(() => {})
  }
}

const quotaMessage = r => ({
  budget_exhausted: 'This organization has used its monthly AI budget. Deterministic diagnostics remain available.',
  rate_limited: 'Too many AI requests in the last hour. Try again later.',
  not_configured: 'AI usage limits are not configured for this organization.',
}[r] ?? 'AI is temporarily unavailable.')
