/**
 * Single serverless entry point for:
 *   /api/revenue/*                       (Revenue Manager API)
 *   /api/integrations/hubspot/{connect,callback,status,disconnect}   (customer OAuth)
 *   /api/integrations/hubspot            (legacy private-token proxy, unchanged behaviour)
 * Routed here by rewrites in /vercel.json so the deployment stays within the
 * 12-function Hobby limit. All logic lives in ./_lib/router.js.
 */
import { createHandler } from './_lib/router.js'
import legacyHubspotProxy from './_lib/legacyHubspotProxy.js'

const handler = createHandler()

export default async function entry(req, res) {
  const path = String(req.query?.__path ?? '')
  if (path === 'integrations/hubspot') return legacyHubspotProxy(req, res)
  return handler(req, res)
}
