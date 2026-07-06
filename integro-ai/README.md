# Integro AI — Revenue OS

AI operating system for SaaS companies. **Agent 01 — Outbound Sales Machine** is
live end-to-end: sync prospects from your CRM, generate AI-personalized email
sequences, review them, and send through a connected mailbox. Demand Generation,
Customer Success, and Growth Playbooks are on the roadmap.

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

Every step degrades gracefully: with no `ANTHROPIC_API_KEY` it falls back to
deterministic mail-merge personalization, and with no mailbox connected sends are
simulated — so the product is always demoable.

## Setup

1. **Database** — in the Supabase SQL Editor, run `supabase/schema.sql` then
   `supabase/outbound-schema.sql` (both idempotent).
2. **Frontend env** — copy `.env.example` → `.env.local` and fill in your
   Supabase URL + anon key.
3. **Server env (Vercel)** — set the variables in the repo-root `.env.example`
   (`ANTHROPIC_API_KEY` for live AI, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   for Gmail sending).

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
| 02 | Demand Generation | Roadmap | Content signals, paid performance, MQL routing |
| 03 | Customer Success Engine | Roadmap | Health monitoring, churn risk, expansion tracking |
| 04 | SaaS Growth Playbooks | Roadmap | Win/loss analysis, coaching signals, playbook generation |

## Design System

All design tokens live in `:root` inside `index.css`. The Tweaks panel (toolbar toggle) exposes:
- **Theme**: Light / Dark
- **Accent color**: Orange / Teal / Violet
- **Density**: Default / Compact
