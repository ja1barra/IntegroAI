# Integro AI — Revenue OS

AI operating system for SaaS companies. Four autonomous agents — Outbound Sales, Demand Generation, Customer Success, and Growth Playbooks — all managed from a single dashboard.

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

| # | Agent | Description |
|---|-------|-------------|
| 01 | Outbound Sales Machine | ICP identification, sequence execution, meeting booking |
| 02 | Demand Generation | Content signals, paid performance, MQL routing |
| 03 | Customer Success Engine | Health monitoring, churn risk, expansion tracking |
| 04 | SaaS Growth Playbooks | Win/loss analysis, coaching signals, playbook generation |

## Design System

All design tokens live in `:root` inside `index.css`. The Tweaks panel (toolbar toggle) exposes:
- **Theme**: Light / Dark
- **Accent color**: Orange / Teal / Violet
- **Density**: Default / Compact
