# HubSpot capabilities matrix

> **Verification status — read this first.** The HubSpot developer documentation (`developers.hubspot.com`) was **blocked by the
> sandbox's egress proxy** during implementation, so endpoints/scopes below come from prior knowledge and the URLs listed in the task,
> **not from a live re-check**. Every row marked ⚠ must be confirmed against the current docs (and a sandbox portal) before production.
> No sandbox portal or HubSpot credentials were available either: all integration tests run against an in-memory HubSpot fake
> (`test/helpers/fakeHubspot.js`, `fakeFetch.js`). Nothing here is claimed as "connected to a real portal".

API family pinned: **CRM v3 objects/pipelines/properties/owners + v4 associations + OAuth v1 token endpoints.** No other generation is mixed.

## OAuth
| Item | Value | Status |
|---|---|---|
| Authorize | `https://app.hubspot.com/oauth/authorize` (`client_id, redirect_uri, scope, optional_scope, state`) | ⚠ |
| Token / refresh | `POST https://api.hubapi.com/oauth/v1/token` (form) | ⚠ |
| Portal id + granted scopes | `GET /oauth/v1/access-tokens/{token}` → `hub_id`, `scopes[]` | ⚠ |
| Revoke | `DELETE /oauth/v1/refresh-tokens/{token}` | ⚠ |
| Account defaults (tz/currency) | `GET /account-info/v3/details` | ⚠ (best effort; failure ignored) |
| Refresh rotation | Handled generically: whatever refresh token comes back is stored atomically under a lease | tested with a rotating fake |

Scopes requested — **required (read):** `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.owners.read`, `crm.schemas.deals.read` ⚠ (the last one for pipelines/properties metadata; confirm it is the right scope for `/crm/v3/pipelines/deals`).
**Optional (`optional_scope`):** `crm.objects.contacts.write` (the task-creation reference cited in the brief), `crm.objects.deals.write` (deal field updates). Nothing like a generic `activities.read` / `tasks.write` scope is requested. The scopes in the HubSpot app configuration must include everything requested.
Reading calls/meetings/tasks/notes/emails may require additional scopes (e.g. sales-email read for logged emails) ⚠ — if HubSpot answers 403, the sync records `activities_<type>: denied`, coverage becomes `partial` and the affected rules are `unknown` (never "no activity").

## Object → endpoint → properties
| Data | Endpoint | Properties / notes | ⚠ |
|---|---|---|---|
| Pipelines & stages | `GET /crm/v3/pipelines/deals` | stage `metadata.isClosed`, `metadata.probability` → `is_closed`, `is_won` (closed/won taken from metadata, never label text) | ⚠ |
| Owners | `GET /crm/v3/owners` (+`archived=true`) | id, name, email, archived | ⚠ |
| Deals | `POST /crm/v3/objects/deals/search` | `dealname, amount, deal_currency_code, closedate, dealstage, pipeline, hubspot_owner_id, createdate, hs_lastmodifieddate, hs_is_closed` + `hs_date_entered_<stageId>` per stage. Filter groups: open (`hs_is_closed=false`) OR closed within 400 days; sort by `hs_lastmodifieddate` ascending; `limit=100` | ⚠ property names |
| Search limits | ≤10,000 results per query; sync restarts the window at the last modified timestamp when it reaches ~9,800; ~5 req/s throttled client-side | ⚠ |
| Stage history | `POST /crm/v3/objects/deals/batch/read` with `propertiesWithHistory:["dealstage"]` (50 per call) | ⚠ |
| Associations | `POST /crm/v4/associations/deals/{contacts,companies,calls,emails,meetings,tasks}/batch/read` (1000 inputs) | ⚠ |
| Contacts / companies | `POST /crm/v3/objects/{contacts,companies}/batch/read` | minimal fields only (no e-mail) | ⚠ |
| Activities | `POST /crm/v3/objects/{calls,emails,meetings,tasks}/batch/read` | timestamps, status/outcome, direction, subject (truncated 200). **Notes are not synced** (internal, not "commercial contact") | ⚠ |
| Archived deals | `GET /crm/v3/objects/deals?archived=true` (full runs only) | absence from a page never means deletion | ⚠ |
| Create task | `POST /crm/v3/objects/tasks` with `associations: [{types:[{associationCategory:"HUBSPOT_DEFINED",associationTypeId:216}]}]` | typeId 216 = task→deal ⚠ ; needs `crm.objects.contacts.write` per the v3 reference cited in the brief ⚠ | ⚠ |
| Update deal | `PATCH /crm/v3/objects/deals/{id}` | only `hs_next_step`, `closedate` (allow-list) | ⚠ |
| Verify / reconcile task | `GET /crm/v3/objects/tasks/{id}`; `POST …/tasks/search` with `hs_task_body CONTAINS_TOKEN <marker>` | search indexing lag ⇒ absence is inconclusive | ⚠ |

## Coverage & limitations (as designed)
* "Emails logged in HubSpot" ≠ the user's mailbox. Integro never claims full call/meeting/e-mail coverage unless every type synced without a permission error **and** the association read completed.
* Stage entry: `hs_date_entered_<currentStage>` first, else the latest `dealstage` history entry for the current stage, else **unknown** — never `createdate`.
* HubSpot has no compare-and-set: a small window remains between the pre-write read and the write; the result is verified after and the marker allows reconciliation.
* Region hosts (EU/other data centers): deep links use `app.hubspot.com/contacts/{portal}/record/0-3/{id}` ⚠ (HubSpot redirects by portal).
* Rate limits: `Retry-After` honoured; waits ≤4 s inline, otherwise the job is re-queued with `run_after`.
* Webhooks: not implemented (optional). Reconciliation covers changes without them.
