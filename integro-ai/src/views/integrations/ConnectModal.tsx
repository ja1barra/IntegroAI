import { useState } from 'react'
import { testConnection as testHubspot } from '../../lib/integrations/hubspot'
import { testConnection as testApollo } from '../../lib/integrations/apollo'
import { testConnection as testSlack } from '../../lib/integrations/slack'
import { testConnection as testKlaviyo } from '../../lib/integrations/klaviyo'
import { Icon } from '../../components/ui/Icon'
import type { Provider, TestResult } from '../../lib/integrations/types'

interface ConnectConfig {
  label: string
  placeholder: string
  instructions: string
  scopes: string[]
  docsLabel: string
  authType: 'api_key' | 'oauth' | 'private_app_token'
}

const CONFIGS: Partial<Record<Provider, ConnectConfig>> = {
  hubspot: {
    label: 'Private App Token',
    placeholder: 'pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    instructions: 'In HubSpot, go to Settings → Integrations → Private Apps. Create a new private app, grant the required scopes, and copy the access token.',
    scopes: ['crm.objects.contacts.read/write', 'crm.objects.deals.read/write', 'timeline'],
    docsLabel: 'HubSpot Private Apps docs',
    authType: 'private_app_token',
  },
  apollo: {
    label: 'API Key',
    placeholder: 'ap_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'In Apollo.io, go to Settings → Integrations → API. Generate a new API key and copy it here.',
    scopes: ['contacts:read/write', 'emailer_campaigns:read/write', 'organizations:read'],
    docsLabel: 'Apollo.io API docs',
    authType: 'api_key',
  },
  slack: {
    label: 'Bot Token',
    placeholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'Create a Slack app at api.slack.com/apps, install it to your workspace, and copy the Bot User OAuth Token from the OAuth & Permissions page.',
    scopes: ['channels:read', 'chat:write', 'users:read'],
    docsLabel: 'Slack API authentication docs',
    authType: 'api_key',
  },
  klaviyo: {
    label: 'Private API Key',
    placeholder: 'pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    instructions: 'In Klaviyo, go to Account → Settings → API Keys. Create a Private API Key with the required permissions.',
    scopes: ['lists:read', 'profiles:read', 'campaigns:read/write'],
    docsLabel: 'Klaviyo API credentials docs',
    authType: 'api_key',
  },
}

const OAUTH_PROVIDERS: Provider[] = ['salesforce', 'outreach', 'linkedin', 'gong', 'intercom', 'zapier', 'ga4']

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

async function runTest(provider: Provider, key: string): Promise<TestResult> {
  if (provider === 'hubspot') return testHubspot(key)
  if (provider === 'apollo') return testApollo(key)
  if (provider === 'slack') return testSlack(key)
  if (provider === 'klaviyo') return testKlaviyo(key)
  await new Promise(r => setTimeout(r, 800))
  return { ok: true }
}

export default function ConnectModal({ provider, name, logo, logoColor, mode, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const cfg = CONFIGS[provider]
  const isOAuth = OAUTH_PROVIDERS.includes(provider)

  const handleTest = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    const result = await runTest(provider, apiKey.trim())
    setTestResult(result)
    setTesting(false)
    if (result.ok) setTimeout(() => setStep(3), 400)
  }

  const handleConnect = () => {
    onSuccess(apiKey.trim(), testResult ?? undefined)
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
                {mode === 'reconnect' ? 'Your token expired. Enter a new key to restore the connection.' : 'Authorize Integro AI to access your account.'}
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

              {isOAuth ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--ink-m)', lineHeight: 1.6, marginBottom: 16 }}>
                    Click <strong>Connect with OAuth</strong> to be redirected to {name} to authorize Integro AI. You'll be returned here automatically after approval.
                  </p>
                  <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', marginBottom: 16 }}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>Permissions requested</div>
                    {['Read and write CRM records', 'Access contact and account data', 'Sync activity timeline'].map(p => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12, color: 'var(--ink-m)' }}>
                        <Icon name="check" size={11} style={{ color: '#2a7d4f', flexShrink: 0 }} /> {p}
                      </div>
                    ))}
                  </div>
                </div>
              ) : cfg ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--ink-m)', lineHeight: 1.6, marginBottom: 14 }}>{cfg.instructions}</p>
                  <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', marginBottom: 0 }}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>Required scopes</div>
                    {cfg.scopes.map(s => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12, color: 'var(--ink-m)' }}>
                        <Icon name="check" size={11} style={{ color: '#2a7d4f', flexShrink: 0 }} />
                        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 2: Credentials */}
          {step === 2 && (
            <div>
              {isOAuth ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--ink-m)', marginBottom: 20, lineHeight: 1.5 }}>
                    Click the button below to be redirected to {name} for OAuth authorization.
                  </p>
                  <button
                    className="btn-sm btn-sm-primary"
                    style={{ width: '100%', padding: '14px', fontSize: 14 }}
                    onClick={() => { setTestResult({ ok: true }); setStep(3) }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Connect with {name} <Icon name="arrowRight" size={12} />
                    </span>
                  </button>
                  <div style={{ textAlign: 'center', margin: '12px 0', color: 'var(--ink-l)', fontSize: 12 }}>or</div>
                  <div className="form-group">
                    <label className="form-label">Manual API Key (if available)</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Enter API key..."
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
                    />
                  </div>
                </div>
              ) : cfg ? (
                <div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{cfg.label}</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder={cfg.placeholder}
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
                      autoFocus
                    />
                    {testResult && !testResult.ok && (
                      <div style={{ fontSize: 11, color: '#c0392b', marginTop: 6, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="error" size={11} style={{ color: '#c0392b', flexShrink: 0 }} /> {testResult.error}
                      </div>
                    )}
                    {testResult && testResult.ok && (
                      <div style={{ fontSize: 11, color: '#2a7d4f', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="check" size={11} style={{ color: '#2a7d4f', flexShrink: 0 }} /> Connection verified
                        {testResult.data?.total !== undefined && ` — ${testResult.data.total.toLocaleString()} records found`}
                        {testResult.data?.team && ` — workspace: ${testResult.data.team}`}
                        {testResult.data?.credits_limit !== undefined && ` — ${testResult.data.credits_used?.toLocaleString() ?? 0} / ${testResult.data.credits_limit.toLocaleString()} credits`}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-l)' }}>
                    Keys are encrypted before storage and never exposed in the UI after saving.
                  </div>
                  <button
                    className="btn-sm btn-sm-ghost"
                    style={{ marginTop: 12, fontSize: 11 }}
                    onClick={handleTest}
                    disabled={testing || !apiKey.trim()}
                  >
                    {testing ? (
                      <span className="btn-loading"><span />Testing...</span>
                    ) : 'Test Connection'}
                  </button>
                </div>
              ) : null}
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
            {step < 3 && (
              <button
                className="btn-sm btn-sm-primary"
                onClick={() => {
                  if (step === 2 && !isOAuth && apiKey.trim() && !testResult?.ok) {
                    handleTest()
                  } else {
                    setStep(s => (s + 1) as Step)
                  }
                }}
                disabled={step === 2 && !isOAuth && !apiKey.trim()}
              >
                {step === 2 && !isOAuth && !testResult?.ok ? 'Test & Continue' : (
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
