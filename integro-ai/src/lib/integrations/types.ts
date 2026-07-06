export type IntegrationStatus = 'connected' | 'error' | 'configure' | 'available'
export type AuthType = 'api_key' | 'oauth' | 'private_app_token'
export type Provider =
  | 'hubspot'
  | 'apollo'
  | 'slack'
  | 'klaviyo'
  | 'salesforce'
  | 'outreach'
  | 'linkedin'
  | 'gong'
  | 'intercom'
  | 'zapier'
  | 'ga4'
  | 'gmail'
export type SyncEventType = 'sync_complete' | 'sync_failed' | 'webhook_received' | 'rate_limit'

export interface IntegrationConfig {
  outbound: boolean
  demandGen: boolean
  customerSuccess: boolean
  revenueIntelligence: boolean
  syncContacts: boolean
  syncDeals: boolean
  syncActivities: boolean
  webhookEnabled: boolean
  syncFrequency: 'realtime' | 'hourly' | 'daily'
}

export interface Integration {
  id: string
  provider: Provider
  name: string
  logo: string
  logoColor: string
  logoBg: string
  description: string
  tags: string[]
  status: IntegrationStatus
  authType: AuthType
  lastSync?: string
  recordCount?: number
  workspaceName?: string
  errorMessage?: string
  config: IntegrationConfig
}

export interface SyncEvent {
  id: string
  integrationId: string
  eventType: SyncEventType
  message: string
  recordCount?: number
  createdAt: string
}

export interface HubSpotContact {
  id: string
  properties: {
    firstname: string
    lastname: string
    email: string
    jobtitle: string
    company: string
  }
}

export interface HubSpotDeal {
  id: string
  properties: {
    dealname: string
    amount: string
    dealstage: string
    closedate: string
  }
}

export interface ApolloContact {
  id: string
  first_name: string
  last_name: string
  email: string
  title: string
  organization_name: string
}

export interface SlackChannel {
  id: string
  name: string
  purpose: { value: string }
  num_members: number
  is_enabled?: boolean
}

export interface TestResult {
  ok: boolean
  error?: string
  data?: {
    total?: number
    team?: string
    credits_used?: number
    credits_limit?: number
  }
}

export interface OAuthScope {
  scope: string
  description: string
  accessLevel: 'read' | 'write' | 'admin'
  usedBy: string[]
  granted: boolean
}
