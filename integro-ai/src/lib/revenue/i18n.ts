// Central dictionary for all Revenue Manager copy. The app UI is English today,
// so `en` is the source of truth; `es` overrides what is translated and any key
// missing there falls back to English. Add a locale by adding another table.

type Dict = Record<string, string>

const en: Dict = {
  'nav.overview': 'Overview', 'nav.doctor': 'Pipeline Doctor', 'nav.deals': 'Deals', 'nav.brief': 'Revenue Brief', 'nav.ask': 'Ask Integro', 'nav.actions': 'Actions', 'nav.integrations': 'Settings / Integrations',
  'group.revenue': 'Revenue Manager',
  'common.loading': 'Loading…', 'common.retry': 'Try again', 'common.cancel': 'Cancel', 'common.save': 'Save', 'common.close': 'Close', 'common.unknown': 'Unknown', 'common.none': '—',
  'common.request_ref': 'Reference', 'common.open_hubspot': 'Open in HubSpot', 'common.data_as_of': 'Data as of', 'common.run_sync': 'Run sync', 'common.syncing': 'Syncing…',
  'common.no_permission': 'Your role does not allow this action.', 'common.network': 'Cannot reach the server. Check your connection and try again.',
  'common.unavailable': 'A dependency is temporarily unavailable. Your session is fine — try again shortly.',
  'state.not_enabled.title': 'Revenue Manager is not enabled', 'state.not_enabled.desc': 'This workspace has not been switched to Integro Revenue Manager yet. Ask an Integro admin to enable it.',
  'state.not_connected.title': 'Connect HubSpot to get started', 'state.not_connected.desc': 'Pipeline Doctor reads your HubSpot deals, activities and stages. No data is shown until a real connection exists.',
  'state.no_snapshot.title': 'No analysis yet', 'state.no_snapshot.desc': 'Finish setup and run the first sync. Nothing is shown until real HubSpot data has been analyzed.',
  'state.reconnect.title': 'HubSpot connection expired', 'state.reconnect.desc': 'HubSpot rejected our credentials. Reconnect to resume syncing. Your last valid diagnosis is still shown.',
  'state.partial.title': 'Some HubSpot data could not be read', 'state.partial.desc': 'Rules that depend on it are marked "unknown" instead of guessed, and deals with low coverage are excluded from the Revenue Score.',
  'overview.title': 'Revenue overview', 'overview.score': 'Revenue Score', 'overview.score.note': 'Average Deal Health of eligible open deals. Not a probability of winning.',
  'overview.pipeline': 'Open pipeline', 'overview.at_risk': 'At high risk', 'overview.at_risk.provisional': 'Risk detected with incomplete data', 'overview.issues': 'Open issues',
  'overview.last_sync': 'Last sync', 'overview.priorities': 'Top priorities', 'overview.eligible': 'eligible of', 'overview.open_deals': 'open deals',
  'overview.coverage': 'Data coverage', 'overview.unknown_amounts': 'deal(s) without an amount', 'overview.no_score': 'No eligible deals to score yet',
  'doctor.title': 'Pipeline Doctor', 'doctor.subtitle': 'Explainable diagnosis from deterministic rules',
  'doctor.empty': 'No findings match these filters.', 'doctor.dismiss': 'Dismiss', 'doctor.snooze': 'Snooze', 'doctor.reason': 'Reason (required)', 'doctor.until': 'Snooze until',
  'doctor.note_hidden': 'Hiding a finding does not change evidence or the score.', 'doctor.unique_deals': 'unique deals', 'doctor.age_days': 'days open', 'doctor.propose_task': 'Propose task',
  'cat.inactivity': 'Inactivity', 'cat.next_step': 'No next step', 'cat.stalled': 'Stalled in stage', 'cat.close_date': 'Overdue close date', 'cat.single_contact': 'Single-threaded', 'cat.owner': 'No owner', 'cat.data_quality': 'Data quality',
  'sev.high': 'High', 'sev.medium': 'Medium', 'sev.low': 'Low', 'sev.info': 'Info',
  'deals.title': 'Deals', 'deals.search': 'Search deals', 'deals.health': 'Deal Health', 'deals.coverage': 'Coverage', 'deals.empty': 'No deals to show yet.',
  'band.healthy': 'Healthy', 'band.attention': 'Needs attention', 'band.high_risk': 'High risk', 'band.provisional': 'Provisional', 'band.not_evaluable': 'Not evaluable', 'band.not_applicable': 'Closed',
  'brief.title': 'Revenue Brief', 'brief.generate': 'Generate brief', 'brief.baseline': 'Baseline — first comparable snapshot, so no trend is shown.', 'brief.rules_changed': 'The rules version changed since the previous snapshot, so a direct comparison is not available.',
  'brief.empty': 'No briefs yet. Generate the first one after a sync.', 'brief.sources': 'Sources', 'brief.ai_off': 'AI narrative unavailable', 'brief.risks': 'Priority risks', 'brief.actions': 'Recommended actions', 'brief.changes': 'Changes since last snapshot',
  'ask.title': 'Ask Integro', 'ask.placeholder': 'Ask about your pipeline…', 'ask.send': 'Ask', 'ask.suggested': 'Suggested questions',
  'ask.q1': 'Which deals are most at risk and why?', 'ask.q2': 'Which late-stage deals have no next step?', 'ask.q3': 'What changed in my pipeline since the last brief?', 'ask.q4': 'Which deals depend on a single contact?',
  'ask.insufficient': 'Not enough data to answer this reliably.', 'ask.unverified': 'Answer withheld: its figures could not be verified against your data.', 'ask.limitations': 'Limitations',
  'ask.ai_unavailable': 'AI is unavailable right now, but your diagnostics still work.', 'ask.reason.flag_disabled': 'AI is not enabled for this organization.', 'ask.reason.not_configured': 'AI is not configured on this deployment.',
  'ask.reason.budget_exhausted': 'This organization used its monthly AI budget.', 'ask.reason.rate_limited': 'Too many AI requests in the last hour.', 'ask.reason.timeout': 'The AI request timed out.', 'ask.reason.refused': 'The model declined this request.', 'ask.reason.incomplete': 'The answer was cut off; try a narrower question.', 'ask.reason.invalid_output': 'The model returned an unreadable answer.', 'ask.reason.provider_error': 'The AI provider returned an error.',
  'actions.title': 'Actions', 'actions.subtitle': 'Changes to HubSpot only happen after a manager or admin approves the exact version.', 'actions.empty': 'No proposed actions yet.',
  'actions.approve': 'Approve', 'actions.reject': 'Reject', 'actions.edit': 'Edit', 'actions.author': 'Proposed by', 'actions.approver': 'Approved by', 'actions.version': 'Version', 'actions.rationale': 'Rationale', 'actions.result': 'Result',
  'actions.edit_invalidates': 'Editing creates a new version and cancels any earlier approval.', 'actions.disabled': 'HubSpot write actions are not enabled for this organization. Drafts can be reviewed but not approved.',
  'kind.create_task': 'Create HubSpot task', 'kind.update_deal_fields': 'Update deal fields', 'kind.email_draft': 'Email draft (copy only — never sent)',
  'status.proposed': 'Proposed', 'status.approved': 'Approved', 'status.executing': 'Executing', 'status.succeeded': 'Done', 'status.rejected': 'Rejected', 'status.cancelled': 'Cancelled', 'status.expired': 'Expired', 'status.conflict': 'Conflict — deal changed', 'status.failed': 'Failed', 'status.needs_review': 'Needs review — outcome uncertain',
  'settings.title': 'Settings / Integrations', 'settings.connect': 'Connect HubSpot', 'settings.reconnect': 'Reconnect HubSpot', 'settings.disconnect': 'Disconnect', 'settings.connected': 'Connected', 'settings.not_configured': 'HubSpot OAuth is not configured on this deployment.',
  'settings.step.connect': '1. Connect HubSpot', 'settings.step.sync': '2. Load data (sync)', 'settings.step.pipeline': '3. Pipeline and stages', 'settings.step.confirm': '4. Currency and time zone', 'settings.step.rules': '5. Rules', 'settings.step.ai': 'AI and actions',
  'settings.stage_note': 'Closed stages come from HubSpot metadata. Map each open stage to a category; suggestions are based on order only, please confirm.',
  'settings.write_note': 'Read access is enough for diagnosis. Reconnect and grant write access only if you want to approve HubSpot tasks from Integro.',
}

const es: Dict = {
  'nav.overview': 'Resumen', 'nav.doctor': 'Pipeline Doctor', 'nav.deals': 'Negocios', 'nav.brief': 'Revenue Brief', 'nav.ask': 'Pregunta a Integro', 'nav.actions': 'Acciones', 'nav.integrations': 'Ajustes / Integraciones',
  'group.revenue': 'Revenue Manager', 'common.loading': 'Cargando…', 'common.retry': 'Reintentar', 'common.cancel': 'Cancelar', 'common.save': 'Guardar', 'common.close': 'Cerrar', 'common.unknown': 'Desconocido',
  'common.open_hubspot': 'Abrir en HubSpot', 'common.data_as_of': 'Datos al', 'common.run_sync': 'Sincronizar', 'common.syncing': 'Sincronizando…',
  'overview.title': 'Resumen de ingresos', 'overview.score': 'Revenue Score', 'overview.pipeline': 'Pipeline abierto', 'overview.at_risk': 'En riesgo alto', 'overview.issues': 'Problemas abiertos', 'overview.last_sync': 'Última sincronización', 'overview.priorities': 'Tres prioridades',
  'doctor.title': 'Pipeline Doctor', 'deals.title': 'Negocios', 'brief.title': 'Revenue Brief', 'ask.title': 'Pregunta a Integro', 'actions.title': 'Acciones', 'settings.title': 'Ajustes / Integraciones',
  'settings.connect': 'Conectar HubSpot', 'settings.disconnect': 'Desconectar', 'actions.approve': 'Aprobar', 'actions.reject': 'Rechazar',
}

const tables: Record<string, Dict> = { en, es }

export function getLocale(): string {
  try {
    const saved = localStorage.getItem('integro_locale')
    if (saved && tables[saved]) return saved
  } catch { /* storage unavailable */ }
  return 'en'
}

export function setLocale(l: string) {
  try { localStorage.setItem('integro_locale', l) } catch { /* ignore */ }
  window.location.reload()
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const s = tables[getLocale()]?.[key] ?? en[key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? '')) : s
}

export type TranslationKey = keyof typeof en
