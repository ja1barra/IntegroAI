import type { HubSpotContact, HubSpotDeal, ApolloContact, SlackChannel, SyncEvent, OAuthScope } from './types'

export const MOCK_HUBSPOT_CONTACTS: HubSpotContact[] = [
  { id: '1', properties: { firstname: 'Sarah', lastname: 'Chen', email: 'sarah.chen@acmecorp.com', jobtitle: 'VP of Sales', company: 'Acme Corp' } },
  { id: '2', properties: { firstname: 'Marcus', lastname: 'Rodriguez', email: 'm.rodriguez@techflow.io', jobtitle: 'Head of Revenue', company: 'TechFlow' } },
  { id: '3', properties: { firstname: 'Emily', lastname: 'Park', email: 'epark@growthlab.com', jobtitle: 'CEO', company: 'GrowthLab' } },
  { id: '4', properties: { firstname: 'James', lastname: 'Wilson', email: 'jwilson@scalepro.io', jobtitle: 'VP Marketing', company: 'ScalePro' } },
  { id: '5', properties: { firstname: 'Priya', lastname: 'Sharma', email: 'p.sharma@datastack.co', jobtitle: 'Head of GTM', company: 'DataStack' } },
  { id: '6', properties: { firstname: 'Alex', lastname: 'Turner', email: 'a.turner@revops.xyz', jobtitle: 'RevOps Director', company: 'RevOps.xyz' } },
  { id: '7', properties: { firstname: 'Lisa', lastname: 'Wang', email: 'lwang@cloudpilot.dev', jobtitle: 'CRO', company: 'CloudPilot' } },
  { id: '8', properties: { firstname: 'Tom', lastname: 'Bradley', email: 'tbradley@fusionco.io', jobtitle: 'VP Sales', company: 'FusionCo' } },
  { id: '9', properties: { firstname: 'Nina', lastname: 'Okafor', email: 'n.okafor@scalex.ai', jobtitle: 'Director of Sales', company: 'ScaleX AI' } },
  { id: '10', properties: { firstname: 'Ravi', lastname: 'Menon', email: 'ravi@pipelineiq.com', jobtitle: 'Founder', company: 'PipelineIQ' } },
]

export const MOCK_HUBSPOT_DEALS: HubSpotDeal[] = [
  { id: 'd1', properties: { dealname: 'Acme Corp — Enterprise', amount: '48000', dealstage: 'closedwon', closedate: '2025-06-15' } },
  { id: 'd2', properties: { dealname: 'TechFlow — Growth', amount: '24000', dealstage: 'proposaldelivered', closedate: '2025-07-01' } },
  { id: 'd3', properties: { dealname: 'ScalePro — Starter', amount: '12000', dealstage: 'appointmentscheduled', closedate: '2025-06-30' } },
  { id: 'd4', properties: { dealname: 'DataStack — Enterprise', amount: '96000', dealstage: 'contractsent', closedate: '2025-06-20' } },
  { id: 'd5', properties: { dealname: 'CloudPilot — Growth', amount: '36000', dealstage: 'presentationscheduled', closedate: '2025-07-15' } },
  { id: 'd6', properties: { dealname: 'RevOps.xyz — Platform', amount: '60000', dealstage: 'decisionmakerboughtin', closedate: '2025-06-25' } },
]

export const MOCK_APOLLO_CONTACTS: ApolloContact[] = [
  { id: 'a1', first_name: 'Daniel', last_name: 'Foster', email: 'd.foster@syntheticai.com', title: 'CTO', organization_name: 'SyntheticAI' },
  { id: 'a2', first_name: 'Rachel', last_name: 'Kim', email: 'r.kim@nexastack.io', title: 'Head of Growth', organization_name: 'NexaStack' },
  { id: 'a3', first_name: 'Carlos', last_name: 'Vega', email: 'cvega@pulsehq.com', title: 'VP of Engineering', organization_name: 'PulseHQ' },
  { id: 'a4', first_name: 'Nina', last_name: 'Patel', email: 'nina@stackwise.io', title: 'CEO', organization_name: 'StackWise' },
  { id: 'a5', first_name: 'Owen', last_name: 'Miller', email: 'o.miller@driftlab.com', title: 'Director of Sales', organization_name: 'DriftLab' },
  { id: 'a6', first_name: 'Sophie', last_name: 'Laurent', email: 's.laurent@amplifycrm.com', title: 'CMO', organization_name: 'AmplifyCRM' },
  { id: 'a7', first_name: 'Ivan', last_name: 'Petrov', email: 'ipetrov@cloudcore.dev', title: 'Head of RevOps', organization_name: 'CloudCore' },
  { id: 'a8', first_name: 'Mei', last_name: 'Zhang', email: 'm.zhang@propellant.io', title: 'VP Product', organization_name: 'Propellant' },
  { id: 'a9', first_name: 'Josh', last_name: 'Hartley', email: 'j.hartley@growloop.com', title: 'VP Sales', organization_name: 'GrowLoop' },
  { id: 'a10', first_name: 'Amara', last_name: 'Diallo', email: 'a.diallo@nexrev.io', title: 'CRO', organization_name: 'NexRev' },
]

export const MOCK_SLACK_CHANNELS: SlackChannel[] = [
  { id: 'C001', name: 'revenue-alerts', purpose: { value: 'Real-time pipeline and deal alerts from Integro AI agents' }, num_members: 8, is_enabled: true },
  { id: 'C002', name: 'agent-approvals', purpose: { value: 'Pending actions that need human approval before execution' }, num_members: 5, is_enabled: true },
  { id: 'C003', name: 'outbound-reports', purpose: { value: 'Daily outbound sequence performance reports' }, num_members: 12, is_enabled: false },
  { id: 'C004', name: 'customer-success', purpose: { value: 'Churn risk alerts and health score changes' }, num_members: 7, is_enabled: true },
  { id: 'C005', name: 'demand-gen', purpose: { value: 'Inbound MQL routing and content performance updates' }, num_members: 9, is_enabled: false },
  { id: 'C006', name: 'general', purpose: { value: 'Company-wide announcements and updates' }, num_members: 24, is_enabled: false },
]

export const MOCK_SYNC_EVENTS: Record<string, SyncEvent[]> = {
  hubspot: [
    { id: 'e1', integrationId: 'hubspot', eventType: 'sync_complete', message: 'Full contact sync completed — 1,247 records processed', recordCount: 1247, createdAt: new Date(Date.now() - 2 * 60000).toISOString() },
    { id: 'e2', integrationId: 'hubspot', eventType: 'webhook_received', message: 'Contact property updated — sarah.chen@acmecorp.com', recordCount: 1, createdAt: new Date(Date.now() - 8 * 60000).toISOString() },
    { id: 'e3', integrationId: 'hubspot', eventType: 'sync_complete', message: 'Deal pipeline synced — 89 active deals updated', recordCount: 89, createdAt: new Date(Date.now() - 62 * 60000).toISOString() },
    { id: 'e4', integrationId: 'hubspot', eventType: 'webhook_received', message: 'New deal created — TechFlow Growth ($24,000)', recordCount: 1, createdAt: new Date(Date.now() - 4 * 3600000).toISOString() },
    { id: 'e5', integrationId: 'hubspot', eventType: 'sync_complete', message: 'Incremental sync — 14 new contacts, 3 deals updated', recordCount: 17, createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
    { id: 'e6', integrationId: 'hubspot', eventType: 'rate_limit', message: 'Rate limit approached (9,800/10,000 daily calls) — sync throttled', recordCount: 0, createdAt: new Date(Date.now() - 26 * 3600000).toISOString() },
    { id: 'e7', integrationId: 'hubspot', eventType: 'sync_complete', message: 'Daily full sync completed — all records up to date', recordCount: 1198, createdAt: new Date(Date.now() - 27 * 3600000).toISOString() },
  ],
  apollo: [
    { id: 'ae1', integrationId: 'apollo', eventType: 'sync_complete', message: 'Prospect database synced — 8,432 contacts refreshed', recordCount: 8432, createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: 'ae2', integrationId: 'apollo', eventType: 'sync_complete', message: 'New prospects added to Outbound sequence — 156 contacts', recordCount: 156, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 'ae3', integrationId: 'apollo', eventType: 'sync_complete', message: 'Sequence reply data synced — 48 replies processed', recordCount: 48, createdAt: new Date(Date.now() - 6 * 3600000).toISOString() },
    { id: 'ae4', integrationId: 'apollo', eventType: 'sync_failed', message: 'Enrichment sync failed — credits exhausted (10,000/10,000)', recordCount: 0, createdAt: new Date(Date.now() - 12 * 3600000).toISOString() },
    { id: 'ae5', integrationId: 'apollo', eventType: 'sync_complete', message: 'Credits refreshed — resuming enrichment sync', recordCount: 0, createdAt: new Date(Date.now() - 24 * 3600000).toISOString() },
  ],
  slack: [
    { id: 'se1', integrationId: 'slack', eventType: 'webhook_received', message: 'Agent alert sent to #revenue-alerts — deal moved to Closed Won', recordCount: 1, createdAt: new Date(Date.now() - 60000).toISOString() },
    { id: 'se2', integrationId: 'slack', eventType: 'webhook_received', message: 'Approval request posted to #agent-approvals — outbound sequence draft', recordCount: 1, createdAt: new Date(Date.now() - 15 * 60000).toISOString() },
    { id: 'se3', integrationId: 'slack', eventType: 'sync_complete', message: 'Channel list refreshed — 6 channels available', recordCount: 6, createdAt: new Date(Date.now() - 60 * 60000).toISOString() },
    { id: 'se4', integrationId: 'slack', eventType: 'webhook_received', message: 'Churn risk alert sent to #customer-success — CloudPilot score dropped', recordCount: 1, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
  ],
  klaviyo: [
    { id: 'ke1', integrationId: 'klaviyo', eventType: 'sync_failed', message: 'Authentication failed — API token expired. Reconnect to resume.', recordCount: 0, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: 'ke2', integrationId: 'klaviyo', eventType: 'sync_failed', message: 'Retry attempt 3/3 failed — token still invalid', recordCount: 0, createdAt: new Date(Date.now() - 3 * 3600000 - 5 * 60000).toISOString() },
    { id: 'ke3', integrationId: 'klaviyo', eventType: 'sync_complete', message: 'Email list sync completed — 12,840 subscribers', recordCount: 12840, createdAt: new Date(Date.now() - 28 * 3600000).toISOString() },
    { id: 'ke4', integrationId: 'klaviyo', eventType: 'sync_complete', message: 'Campaign data synced — 8 campaigns, 4 active', recordCount: 8, createdAt: new Date(Date.now() - 29 * 3600000).toISOString() },
  ],
}

export const OAUTH_SCOPES: Record<string, OAuthScope[]> = {
  hubspot: [
    { scope: 'crm.objects.contacts.read', description: 'Read contact records and properties', accessLevel: 'read', usedBy: ['Outbound', 'Customer Success'], granted: true },
    { scope: 'crm.objects.contacts.write', description: 'Create and update contact records', accessLevel: 'write', usedBy: ['Outbound'], granted: true },
    { scope: 'crm.objects.deals.read', description: 'Read deal pipeline and stages', accessLevel: 'read', usedBy: ['Revenue Intel', 'Demand Gen'], granted: true },
    { scope: 'crm.objects.deals.write', description: 'Create and update deal records', accessLevel: 'write', usedBy: ['Outbound'], granted: true },
    { scope: 'timeline', description: 'Log activities to contact timeline', accessLevel: 'write', usedBy: ['Outbound', 'Customer Success'], granted: true },
    { scope: 'crm.objects.companies.read', description: 'Read company and account data', accessLevel: 'read', usedBy: ['Demand Gen'], granted: false },
  ],
  apollo: [
    { scope: 'contacts:read', description: 'Access contact database and search', accessLevel: 'read', usedBy: ['Outbound', 'Demand Gen'], granted: true },
    { scope: 'contacts:write', description: 'Create and update contacts', accessLevel: 'write', usedBy: ['Outbound'], granted: true },
    { scope: 'emailer_campaigns:read', description: 'View sequences and campaign data', accessLevel: 'read', usedBy: ['Outbound'], granted: true },
    { scope: 'emailer_campaigns:write', description: 'Create sequences and add contacts', accessLevel: 'write', usedBy: ['Outbound'], granted: true },
    { scope: 'organizations:read', description: 'Read company and firmographic data', accessLevel: 'read', usedBy: ['Demand Gen'], granted: true },
    { scope: 'email_accounts:read', description: 'Access configured sending accounts', accessLevel: 'read', usedBy: ['Outbound'], granted: false },
  ],
  slack: [
    { scope: 'channels:read', description: 'View channel list and metadata', accessLevel: 'read', usedBy: ['All Agents'], granted: true },
    { scope: 'chat:write', description: 'Send messages as the Integro bot', accessLevel: 'write', usedBy: ['Outbound', 'Customer Success'], granted: true },
    { scope: 'users:read', description: 'View user profiles and list', accessLevel: 'read', usedBy: ['Customer Success'], granted: true },
    { scope: 'files:read', description: 'Read and download shared files', accessLevel: 'read', usedBy: ['Revenue Intel'], granted: false },
    { scope: 'channels:history', description: 'Read message history in channels', accessLevel: 'read', usedBy: ['Revenue Intel'], granted: false },
  ],
  klaviyo: [
    { scope: 'lists:read', description: 'Read subscriber list data', accessLevel: 'read', usedBy: ['Demand Gen', 'Customer Success'], granted: false },
    { scope: 'profiles:read', description: 'Access contact profile attributes', accessLevel: 'read', usedBy: ['Customer Success'], granted: false },
    { scope: 'campaigns:read', description: 'View email campaign stats', accessLevel: 'read', usedBy: ['Demand Gen'], granted: false },
    { scope: 'campaigns:write', description: 'Create and trigger campaigns', accessLevel: 'write', usedBy: ['Demand Gen'], granted: false },
  ],
}

export const AGENT_DATA_TAGS: Record<string, Record<string, string[]>> = {
  hubspot: {
    outbound: ['Contacts', 'Deals', 'Timeline'],
    demandGen: ['Contacts', 'Forms', 'Landing Pages'],
    customerSuccess: ['Contacts', 'Deals', 'Properties'],
    revenueIntelligence: ['Deals', 'Pipeline', 'Forecasts'],
  },
  apollo: {
    outbound: ['Prospects', 'Sequences', 'Email Data'],
    demandGen: ['Contacts', 'Organizations', 'Intent'],
    customerSuccess: [],
    revenueIntelligence: [],
  },
  slack: {
    outbound: ['Deal Alerts', 'Meeting Notes'],
    demandGen: ['MQL Alerts', 'Content Signals'],
    customerSuccess: ['Churn Alerts', 'Escalations', 'QBR Reminders'],
    revenueIntelligence: [],
  },
  klaviyo: {
    outbound: [],
    demandGen: ['Email Lists', 'Campaign Data', 'Segments'],
    customerSuccess: ['Lifecycle Stage', 'Unsubscribes'],
    revenueIntelligence: [],
  },
}
