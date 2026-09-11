# Integro AI — Revenue OS

AI operating system for SaaS companies. All four agents are live. Outbound
syncs prospects from your CRM, generates AI-personalized email sequences, and
sends through a connected mailbox. Demand Gen scores MQLs from HubSpot and
reports GA4 traffic/channel performance, with one-click routing into Outbound.
Customer Success scores account health from Intercom and tracks expansion
pipeline from HubSpot, with one-click follow-up tasks. Growth Playbooks drafts
tactical plays from CRM win/loss data or live web research.

## Outbound Sales Machine (Agent 01)

The working pipeline:

1. **Sync prospects** — pull contacts from a connected HubSpot / Apollo account
   (or add them manually). Persisted to Supabase.
2. **Build a sequence** — a multi-step email sequence used as the personalization
   template.
3. **Enroll & generate** — select prospects and the agent writes a personalized
   first email for each (Claude via `/api/agent/generate`), landing them in the
   review queue.
4. **Review & approve** — edit any draft, then approve.
5. **Send** — approved emails send through your connected Gmail mailbox
   (`/api/agent/send`).
6. **Follow up** — when a step is sent, the next email step of the sequence is
   scheduled for its delay. Once due, "Prepare follow-ups" personalizes the next
   touch and drops it back into the review queue (skipping anyone who replied).
   Upcoming touches are listed in the Review tab.

Every step degrades gracefully: with no AI provider configured it falls back to
deterministic mail-merge personalization, and with no mailbox connected sends are
simulated — so the product is always demoable.

## Demand Generation (Agent 02)

No new integrations required — it's built entirely on the HubSpot and GA4 libs
already used elsewhere in the app:

- **MQL Queue** — pulls HubSpot contacts and runs them through a transparent,
  deterministic 0–100 score (lifecycle stage + title seniority + recency +
  channel), so a rep can see *why* a lead is ranked where it is. "Route to
  Outbound" adds the contact straight into the Outbound prospect list
  (`lib/outbound/store.ts`'s `upsertProspects`).
- **Traffic & Channel Performance** — a 30-day GA4 report by channel
  (sessions/conversions/revenue) and by landing page ("Top Landing Pages"),
  via `lib/integrations/ga4.ts`'s `runReport` / `runLandingPageReport`.
- **CAC** and **Pipeline from Inbound** are left as "—" rather than a fabricated
  number — they'd need an ad-spend integration and a deal↔contact-source join
  that don't exist yet.

Same demo-fallback pattern as every other agent: with no HubSpot/GA4 connected
it shows realistic demo data (a small banner says so) so the page is never
empty; connect either in Integrations for live numbers.

## Customer Success Engine (Agent 03)

Also built entirely on existing integration libs — Intercom and HubSpot:

- **Account Health Overview** — every Intercom contact with role "user" (as
  opposed to a "lead"/trial) gets a transparent 0–100 health score from how
  recently they were last seen active plus how many support conversations are
  still open, via `lib/success/accounts.ts`. Sorted worst-first so the accounts
  that need attention are at the top. "Flag for Follow-up" drops a pre-filled
  task (health score, last-active, open conversations) straight into Tasks —
  no Supabase auth required for that part since Tasks is local-first.
- **Expansion Opportunities** — sums open HubSpot deals whose `dealtype` is
  "existingbusiness" (a standard HubSpot property distinguishing new business
  from expansion/upsell, not a custom field), via `lib/success/expansion.ts`.
- Renewal tracking isn't implemented — there's no contract/subscription
  end-date signal available from either integration yet.

Same demo-fallback pattern: no Intercom/HubSpot connected shows realistic
demo data with a banner saying so.

## Bring your own AI

Instead of running every user's generation on Integro's own key, each user can
connect their own AI provider from the **AI Provider** panel at the top of
Integrations — Anthropic Claude, OpenAI, Google Gemini, or any
OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, Groq, Azure OpenAI,
a self-hosted model, etc.). Once connected, `/api/agent/generate` and
`/api/agent/generate-sequence` run on that user's key and account — Integro is
never billed for it. The server's `ANTHROPIC_API_KEY` (if set) is only a
fallback for users who haven't connected their own provider yet. See
`api/agent/_provider.js` for the provider abstraction and
`supabase/ai-provider-schema.sql` for where credentials are stored (RLS-scoped
to each user, same pattern as the CRM integrations below). Web-research
playbooks currently require the effective provider to be Anthropic (the only
one wired up with a web-search tool); other providers get a clear error and
can still generate CRM-grounded playbooks.

## Setup

1. **Database** — in the Supabase SQL Editor, run `supabase/schema.sql`, then
   `supabase/outbound-schema.sql`, then `supabase/playbooks-schema.sql`, then
   `supabase/ai-provider-schema.sql`, then `supabase/avatars-storage.sql`
   (all idempotent).
2. **Frontend env** — copy `.env.example` → `.env.local` and fill in your
   Supabase URL + anon key.
3. **Server env (Vercel)** — set the variables in the repo-root `.env.example`
   (`ANTHROPIC_API_KEY` for live AI, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   for Gmail sending).

## Troubleshooting

**"Failed to fetch" on sign-in / slow to load** — the browser can't reach the
Supabase backend. It's almost always one of:

1. **Supabase env vars not set in Vercel.** In Vercel → Project → Settings →
   Environment Variables, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Production + Preview), then **redeploy** — Vite bakes these at build time, so
   a redeploy is required after changing them. The sign-in screen now shows a
   "Backend not configured" banner when these are missing or still placeholders.
2. **Supabase project is paused.** Free-tier projects pause after ~7 days idle.
   Open the Supabase dashboard and click **Restore / Resume**.
3. **Wrong URL/key.** Copy them from Supabase → Project Settings → API.

After the backend is reachable, run `supabase/schema.sql`, then
`supabase/outbound-schema.sql`, then `supabase/playbooks-schema.sql` in the SQL
editor so sign-up and the app tables exist.

## Stack

- **React 18** + **TypeScript**
- **Vite 5** for development and production builds
- **DM Sans / DM Mono / Bebas Neue** via Google Fonts
- CSS custom properties — no CSS-in-JS, no Tailwind
- Apple-style liquid glass UI with frosted panels and mesh gradients

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click **Continue with Demo Account** to log in.

## Build for Production

```bash
npm run build
npm run preview
```

Output lands in `dist/` — drop it on any static host (Vercel, Netlify, S3 + CloudFront).

## Project Structure

```
src/
├── App.tsx                  # Root — auth gate
├── AppShell.tsx             # App layout + global state
├── index.css                # All styles (CSS variables + glass tokens)
├── types.ts                 # Shared TypeScript types
├── hooks/
│   └── useCountUp.ts        # Animated number counter hook
├── components/
│   ├── ui/                  # AgentPill, StatCard, HealthRing, StageBadge, SparkBars, Toast
│   └── layout/              # AppHeader, Sidebar, NotificationPanel, TweaksPanel
└── views/                   # One file per screen
    ├── SignIn.tsx
    ├── Dashboard.tsx
    ├── OutboundView.tsx
    ├── DemandView.tsx
    ├── SuccessView.tsx
    ├── PlaybookAgentView.tsx
    ├── PlaybooksView.tsx
    ├── ReportsView.tsx
    ├── IntegrationsView.tsx
    └── TeamView.tsx
```

## Agents

| # | Agent | Status | Description |
|---|-------|--------|-------------|
| 01 | Outbound Sales Machine | **Live** | CRM sync, AI sequencing, human review, mailbox send |
| 02 | Demand Generation | **Live** | GA4 traffic & channel performance, scored MQL queue from HubSpot, route-to-Outbound |
| 03 | Customer Success Engine | **Live** | Intercom-scored account health, churn risk, HubSpot expansion pipeline |
| 04 | SaaS Growth Playbooks | **Live** | Win/loss analysis, coaching signals, playbook generation |

## Design System

All design tokens live in `:root` inside `index.css`. The Tweaks panel (toolbar toggle) exposes:
- **Theme**: Light / Dark
- **Accent color**: Orange / Teal / Violet
- **Density**: Default / Compact
