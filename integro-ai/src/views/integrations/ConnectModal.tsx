import { useState } from 'react'
import { testConnection as testHubspot } from '../../lib/integrations/hubspot'
import { testConnection as testApollo } from '../../lib/integrations/apollo'
import { testConnection as testSlack } from '../../lib/integrations/slack'
import { testConnection as testKlaviyo } from '../../lib/integrations/klaviyo'
import { testConnection as testSalesforce } from '../../lib/integrations/salesforce'
import { testConnection as testOutreach } from '../../lib/integrations/outreach'
import { testConnection as testLinkedin } from '../../lib/integrations/linkedin'
import { testConnection as testGong } from '../../lib/integrations/gong'
import { testConnection as testIntercom } from '../../lib/integrations/intercom'
import { testConnection as testZapier } from '../../lib/integrations/zapier'
import { testConnection as testGA4 } from '../../lib/integrations/ga4'
import { startOAuthFlow, tokensToKey, isOAuthProvider } from '../../lib/integrations/oauth'
import { Icon } from '../../components/ui/Icon'
import type { Provider, TestResult } from '../../lib/integrations/types'

interface ConnectConfig {
  label: string
  placeholder: string
  instructions: string
  scopes: string[]
  connectUrl: string
  connectLabel: string
  secondFieldLabel?: string
  secondFieldPlaceholder?: string
}

const CONFIGS: Partial<Record<Provider, ConnectConfig>> = {
  hubspot: {
    label: 'Private App Token',
    placeholder: 'pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    instructions: 'In HubSpot, go to Settings → Integrations → Private Apps. Create a new private app, grant the required scopes, and copy the access token.',
    scopes: ['crm.objects.contacts.read/write', 'crm.objects.deals.read/write', 'timeline'],
    connectUrl: 'https://app.hubspot.com/private-apps',
    connectLabel: 'Open HubSpot Private Apps',
  },
  apollo: {
    label: 'API Key',
    placeholder: 'ap_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'In Apollo.io, go to Settings → Integrations → API. Generate a new API key and copy it here.',
    scopes: ['contacts:read/write', 'emailer_campaigns:read/write', 'organizations:read'],
    connectUrl: 'https://app.apollo.io/#/settings/integrations/api',
    connectLabel: 'Open Apollo.io API Settings',
  },
  slack: {
    label: 'Bot Token',
    placeholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'Create a Slack app, install it to your workspace, and copy the Bot User OAuth Token from OAuth & Permissions.',
    scopes: ['channels:read', 'chat:write', 'users:read'],
    connectUrl: 'https://api.slack.com/apps',
    connectLabel: 'Open Slack App Dashboard',
  },
  klaviyo: {
    label: 'Private API Key',
    placeholder: 'pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'In Klaviyo, go to Account → Settings → API Keys. Create a Private API Key with the required permissions.',
    scopes: ['lists:read', 'profiles:read', 'campaigns:read/write'],
    connectUrl: 'https://www.klaviyo.com/account#api-keys-tab',
    connectLabel: 'Open Klaviyo API Keys',
  },
  gong: {
    label: 'Access Key',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'In Gong, go to Settings → Ecosystem → API. Create API credentials and copy both the Access Key and Secret.',
    scopes: ['calls:read', 'users:read', 'library:read'],
    connectUrl: 'https://app.gong.io/settings/api',
    connectLabel: 'Open Gong API Settings',
    secondFieldLabel: 'Access Key Secret',
    secondFieldPlaceholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  zapier: {
    label: 'Webhook URL',
    placeholder: 'https://hooks.zapier.com/hooks/catch/xxxxxxx/xxxxxxx/',
    instructions: 'In Zapier, create a Zap with "Webhooks by Zapier" as the trigger, select "Catch Hook", then copy the webhook URL.',
    scopes: ['POST events from IntegroAI agents'],
    connectUrl: 'https://zapier.com/app/zaps',
    connectLabel: 'Open Zapier',
  },
}

const OAUTH_PERMISSIONS: Partial<Record<Provider, string[]>> = {
  salesforce: ['Read and write Contacts and Opportunities', 'Access Account and Lead records', 'Sync activity timeline'],
  outreach: ['Read and manage Prospects and Sequences', 'Access Account data', 'Manage sequence enrollment'],
  linkedin: ['Read your profile information', 'Access connection data', 'Post on your behalf (optional)'],
  intercom: ['Read contact and user data', 'Access conversation history', 'Send messages to users'],
  ga4: ['Read Google Analytics properties', 'Access traffic and conversion reports', 'View campaign attribution data'],
}

interface Props {
  provider: Provider
  name: string
  logo: string
  logoColor: string
  mode: 'connect' | 'reconnect'
  onClose: () => void
  onSuccess: (key: string, testResult?: TestResult) => void
}

type Step = 1 | 2 | 3

async function runTest(provider: Provider, key: string, secondKey?: string): Promise<TestResult> {
  const credential = secondKey ? `${key}:${secondKey}` : key
  if (provider === 'hubspot') return testHubspot(credential)
  if (provider === 'apollo') return testApollo(credential)
  if (provider === 'slack') return testSlack(credential)
  if (provider === 'klaviyo') return testKlaviyo(credential)
  if (provider === 'salesforce') return testSalesforce(credential)
  if (provider === 'outreach') return testOutreach(credential)
  if (provider === 'linkedin') return testLinkedin(credential)
  if (provider === 'gong') return testGong(credential)
  if (provider === 'intercom') return testIntercom(credential)
  if (provider === 'zapier') return testZapier(credential)
  if (provider === 'ga4') return testGA4(credential)
  await new Promise(r => setTimeout(r, 800))
  return { ok: true }
}

export default function ConnectModal({ provider, name, logo, logoColor, mode, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [apiKey, setApiKey] = useState('')
  const [secondKey, setSecondKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  const cfg = CONFIGS[provider]
  const isOAuth = isOAuthProvider(provider)
  const oauthPerms = OAUTH_PERMISSIONS[provider] ?? ['Read and write CRM records', 'Access contact and account data', 'Sync activity timeline']

  const handleTest = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    const result = await runTest(provider, apiKey.trim(), secondKey.trim() || undefined)
    setTestResult(result)
    setTesting(false)
    if (result.ok) setTimeout(() => setStep(3), 400)
  }

  const handleOAuth = async () => {
    setOauthLoading(true)
    setOauthError(null)
    const result = await startOAuthFlow(provider)
    setOauthLoading(false)
    if (result.ok && result.tokens) {
      const credential = tokensToKey(result.tokens)
      const testRes = await runTest(provider, credential)
      setTestResult(testRes)
      if (testRes.ok) {
        onSuccess(credential, testRes)
        onClose()
      } else {
        setOauthError(testRes.error ?? 'Connection test failed after OAuth')
      }
    } else {
      setOauthError(result.error ?? 'OAuth authorization failed')
    }
  }

  const handleConnect = () => {
    const credential = cfg?.secondFieldLabel && secondKey.trim()
      ? `${apiKey.trim()}:${secondKey.trim()}`
      : apiKey.trim()
    onSuccess(credential, testResult ?? undefined)
    onClose()
  }

  const steps = ['Overview', 'Credentials', 'Verify']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(26,23,20,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card fade-in" style={{
        width: '100%', maxWidth: 560, padding: 0, overflow: 'hidden',
        background: 'rgba(250,247,242,0.97)',
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(26,23,20,0.22)',
      }}>
        {/* Step progress bar */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.4)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14 }}>
            {steps.map((s, i) => {
              const idx = i + 1
              const done = step > idx
              const active = step === idx
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? 'var(--green, #2a7d4f)' : active ? 'var(--ink)' : 'rgba(122,114,104,0.15)',
                      border: done ? '1px solid rgba(42,125,79,0.3)' : active ? '1px solid rgba(26,23,20,0.2)' : '1px solid rgba(122,114,104,0.2)',
                      transition: 'all 0.25s',
                    }}>
                      {done
                        ? <Icon name="check" size={13} style={{ color: '#fff' }} />
                        : <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: active ? '#fff' : 'var(--ink-l)' }}>{idx}</span>
                      }
                    </div>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase', color: active ? 'var(--ink)' : 'var(--ink-l)', whiteSpace: 'nowrap' }}>{s}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: done ? 'rgba(42,125,79,0.35)' : 'rgba(122,114,104,0.2)', margin: '0 8px', marginBottom: 18 }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px' }}>
          {/* Integration header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: logoColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: '#fff' }}>{logo}</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{mode === 'reconnect' ? `Reconnect ${name}` : `Connect ${name}`}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 2 }}>
                {mode === 'reconnect' ? 'Your token expired. Reconnect to restore sync.' : 'Authorize Integro AI to access your account.'}
              </div>
            </div>
          </div>

          {/* Step 1: Overview */}
          {step === 1 && (
            <div>
              {mode === 'reconnect' && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fdecea', border: '1px solid rgba(192,57,43,0.25)', marginBottom: 16, fontSize: 12, color: '#c0392b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="warning" size={13} style={{ color: '#c0392b', flexShrink: 0 }} />
                  Authentication expired — syncing is paused. Reconnect to resume.
                </div>
              )}

              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', marginBottom: 16 }}>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>
                  {isOAuth ? 'Permissions requested' : 'Required scopes'}
                </div>
                {(isOAuth ? oauthPerms : cfg?.scopes ?? []).map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12, color: 'var(--ink-m)' }}>
                    <Icon name="check" size={11} style={{ color: '#2a7d4f', flexShrink: 0 }} />
                    {isOAuth ? p : <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{p}</span>}
                  </div>
                ))}
              </div>

              {isOAuth ? (
                <p style={{ fontSize: 12, color: 'var(--ink-l)', lineHeight: 1.6, margin: 0 }}>
                  Clicking <strong>Continue</strong> will open a {name} authorization window. After you approve, you'll be returned here automatically.
                </p>
              ) : cfg ? (
                <p style={{ fontSize: 13, color: 'var(--ink-m)', lineHeight: 1.6, margin: 0 }}>{cfg.instructions}</p>
              ) : null}
            </div>
          )}

          {/* Step 2: Credentials */}
          {step === 2 && (
            <div>
              {/* Big connect button — OAuth triggers auth flow, API key opens credentials page */}
              <p style={{ fontSize: 13, color: 'var(--ink-m)', marginBottom: 20, lineHeight: 1.5 }}>
                {isOAuth
                  ? <>Click the button below to be redirected to <strong>{name}</strong> for OAuth authorization. A popup window will open — allow it if your browser blocks it.</>
                  : <>Click the button below to open <strong>{name}</strong> and copy your API credentials. Then paste them in the field below.</>
                }
              </p>

              {oauthError && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fdecea', border: '1px solid rgba(192,57,43,0.25)', marginBottom: 16, fontSize: 12, color: '#c0392b', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Icon name="error" size={13} style={{ color: '#c0392b', flexShrink: 0, marginTop: 1 }} />
                  <span>{oauthError}</span>
                </div>
              )}

              <button
                className="btn-sm btn-sm-primary"
                style={{ width: '100%', padding: '14px', fontSize: 14 }}
                onClick={isOAuth ? handleOAuth : () => window.open(cfg?.connectUrl, '_blank')}
                disabled={oauthLoading}
              >
                {oauthLoading ? (
                  <span className="btn-loading"><span />Waiting for authorization...</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isOAuth ? `Connect with ${name}` : (cfg?.connectLabel ?? `Open ${name}`)}
                    <Icon name="arrowRight" size={12} />
                  </span>
                )}
              </button>

              <div style={{ textAlign: 'center', margin: '16px 0 12px', color: 'var(--ink-l)', fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {isOAuth ? 'or use a manual token' : 'then paste your key below'}
              </div>

              <div className="form-group" style={{ marginBottom: cfg?.secondFieldLabel ? 12 : 8 }}>
                <label className="form-label">{isOAuth ? 'Access Token (advanced)' : (cfg?.label ?? 'API Key')}</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder={isOAuth ? 'Paste OAuth access token directly...' : (cfg?.placeholder ?? '')}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestResult(null); setOauthError(null) }}
                />
              </div>

              {!isOAuth && cfg?.secondFieldLabel && (
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">{cfg.secondFieldLabel}</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={cfg.secondFieldPlaceholder}
                    value={secondKey}
                    onChange={e => { setSecondKey(e.target.value); setTestResult(null) }}
                  />
                </div>
              )}

              {testResult && !testResult.ok && (
                <div style={{ fontSize: 11, color: '#c0392b', marginTop: 6, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="error" size={11} style={{ color: '#c0392b', flexShrink: 0 }} /> {testResult.error}
                </div>
              )}
              {testResult && testResult.ok && (
                <div style={{ fontSize: 11, color: '#2a7d4f', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="check" size={11} style={{ color: '#2a7d4f', flexShrink: 0 }} /> Connection verified
                  {testResult.data?.total !== undefined && ` — ${testResult.data.total.toLocaleString()} records`}
                  {testResult.data?.team && ` — workspace: ${testResult.data.team}`}
                  {testResult.data?.credits_limit !== undefined && ` — ${testResult.data.credits_used?.toLocaleString() ?? 0} / ${testResult.data.credits_limit.toLocaleString()} credits`}
                </div>
              )}

              {!isOAuth && apiKey.trim() && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 8 }}>
                    Keys are encrypted before storage and never exposed in the UI after saving.
                  </div>
                  <button
                    className="btn-sm btn-sm-ghost"
                    style={{ marginTop: 12, fontSize: 11 }}
                    onClick={handleTest}
                    disabled={testing}
                  >
                    {testing ? <span className="btn-loading"><span />Testing...</span> : 'Test Connection'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Verify */}
          {step === 3 && (
            <div>
              <div style={{ padding: '20px', borderRadius: 12, background: '#eaf5ee', border: '1px solid rgba(42,125,79,0.25)', textAlign: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: '#2a7d4f' }}>
                  <Icon name="checkCircle" size={28} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2a7d4f', marginBottom: 4 }}>Connection verified</div>
                <div style={{ fontSize: 12, color: '#2a7d4f' }}>
                  {testResult?.data?.total !== undefined && `${testResult.data.total.toLocaleString()} records ready to sync`}
                  {testResult?.data?.team && `Connected to workspace: ${testResult.data.team}`}
                  {testResult?.data?.credits_limit !== undefined && `${testResult.data.credits_used?.toLocaleString() ?? 0} / ${testResult.data.credits_limit.toLocaleString()} credits`}
                  {!testResult?.data?.total && !testResult?.data?.team && !testResult?.data?.credits_limit && 'Ready to sync data'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-l)', lineHeight: 1.5, marginBottom: 4 }}>
                Click <strong>Connect</strong> to save credentials and start syncing. Your first full sync will begin automatically.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.25)' }}>
          <button className="btn-sm btn-sm-ghost" onClick={onClose}>Cancel</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && (
              <button className="btn-sm btn-sm-ghost" onClick={() => setStep(s => (s - 1) as Step)}>Back</button>
            )}
            {step < 3 && !(step === 2 && isOAuth && !apiKey.trim()) && (
              <button
                className="btn-sm btn-sm-primary"
                onClick={() => {
                  if (step === 2 && apiKey.trim() && !testResult?.ok) {
                    handleTest()
                  } else {
                    setStep(s => (s + 1) as Step)
                  }
                }}
                disabled={step === 2 && !apiKey.trim()}
              >
                {step === 2 && apiKey.trim() && !testResult?.ok ? 'Test & Continue' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    Continue <Icon name="arrowRight" size={11} />
                  </span>
                )}
              </button>
            )}
            {step === 3 && (
              <button className="btn-sm btn-sm-primary" onClick={handleConnect}>
                Connect {name}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
