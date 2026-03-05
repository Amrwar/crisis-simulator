# CrisisSim — Business Crisis Simulator

An addictive CEO-level business simulation for university training, set in Egypt/MENA context. Built with Next.js 14, Prisma/SQLite, TailwindCSS, and AI (Anthropic Claude or OpenAI).

## Features

- **10-turn simulation** with real consequences across turns
- **Deterministic rules engine** — AI only handles narrative, numbers follow strict rules
- **Egypt/MENA context** — EGP currency, Cairo business environment, local culture
- **Recurring characters** — CFO, HR, Ops, Marketing, Investor
- **Competitor system** — price war, premium brand, fast expansion, poach talent
- **Hidden variables** — supplier reliability, employee loyalty, demand volatility
- **5 ending types** — Growth Win, Survival, Takeover, Bankruptcy, Scandal
- **4 achievements** — Crisis Manager, Negotiator, Turnaround Artist, Brand Guardian
- **Free-text decisions** — AI analyzes your text and extracts strategy tags
- **Final report** — skill breakdown, strengths, improvements, learning path
- **Seeded RNG** — reproducible outcomes per simulation

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: TailwindCSS (dark theme, CEO dashboard aesthetic)
- **Database**: Prisma + SQLite (local dev)
- **Auth**: iron-session (cookie-based, bcrypt password hashing)
- **AI**: Anthropic Claude (claude-opus-4-6) or OpenAI GPT-4o
- **Validation**: Zod (all API inputs + all LLM outputs)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="your-32-char-secret-here-make-it-long"
LLM_PROVIDER="anthropic"          # or "openai"
ANTHROPIC_API_KEY="sk-ant-..."    # if using Anthropic
OPENAI_API_KEY="sk-..."           # if using OpenAI
OPENAI_MODEL="gpt-4o"             # optional, default gpt-4o
```

### 3. Run database migration

```bash
npx prisma migrate dev --name init
```

Or if you just want to push the schema (no migration history):

```bash
npx prisma db push
```

### 4. Generate Prisma client

```bash
npx prisma generate
```

### 5. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to Play

1. **Register** an account
2. **Create a new simulation** — choose industry, difficulty, company size
3. The AI generates your company profile and opens the first crisis
4. **Each turn**: read the event, hear from your team, make a decision
   - Choose option A–D (predefined strategies), OR
   - Write your own free-text decision (AI analyzes and extracts tags)
5. Watch your metrics change — every decision has tradeoffs
6. Survive 10 turns or meet an early ending condition
7. Review your **final performance report** with skill breakdown

## Game Mechanics

### Visible Metrics
| Metric | Description |
|--------|-------------|
| Cash | Available funds (EGP) |
| Monthly Revenue | Income per turn |
| Burn Rate | Expenses per turn |
| Reputation | Brand & public trust (0-100) |
| Morale | Employee satisfaction (0-100) |
| Churn | Customer attrition rate (0-100) |
| Legal Risk | Regulatory/legal exposure (0-100) |
| Market Share | % of industry market (0-100) |

### Hidden Variables (affect outcomes silently)
- Supplier Reliability
- Employee Loyalty
- Demand Volatility
- Competitor Aggression

### Decision Tags
Tags are the atomic units of strategy extracted from decisions:

`raise_prices` · `discount_prices` · `negotiate_supplier` · `switch_supplier` · `take_loan` · `cut_costs` · `increase_marketing` · `cut_marketing` · `improve_quality` · `reduce_quality` · `layoffs` · `hire_staff` · `delay_payments` · `pay_on_time` · `compliance_investment` · `ignore_compliance` · `customer_refund` · `deny_refund` · `expand_branch` · `pause_expansion` · `upgrade_tech` · `ignore_tech_debt` · `employee_training` · `ignore_training` · `strengthen_security` · `ignore_security`

### Endings
| Ending | Condition |
|--------|-----------|
| 🏆 Growth Win | High market share (≥35%) + strong cash at turn 10 |
| 🛡️ Survival | Completed all turns without winning big |
| 🔄 Investor Takeover | Poor performance after turn 6 or weak final metrics |
| 💸 Bankruptcy | Cash reaches 0 |
| ⚠️ Scandal | Legal risk ≥88 AND reputation ≤22 |

## LLM Provider Notes

### Anthropic (Claude)
Uses `claude-opus-4-6` by default. Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.

### OpenAI
Uses `gpt-4o` by default. Set `LLM_PROVIDER=openai` and `OPENAI_API_KEY`. Optionally set `OPENAI_MODEL` to a different model.

Both providers use JSON mode / structured output to ensure valid responses. The system auto-retries once on invalid JSON.

## Database Commands

```bash
npm run db:migrate    # Create migration and apply
npm run db:push       # Push schema without migration history
npm run db:studio     # Open Prisma Studio (DB GUI)
npm run db:generate   # Regenerate Prisma client
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/         # register, login, logout, me
│   │   └── simulations/  # create, list, get, submit-turn
│   ├── auth/             # login + register pages
│   ├── dashboard/        # user dashboard
│   ├── new/              # create new simulation
│   └── sim/[id]/         # simulation game + report
├── components/sim/       # EventPanel, DecisionPanel, MetricsSidebar, Timeline
├── lib/
│   ├── auth.ts           # iron-session helpers
│   ├── db.ts             # Prisma singleton
│   ├── game/
│   │   ├── rules-engine.ts    # deterministic metric updates
│   │   ├── tags.ts            # allowed tags + keyword extraction
│   │   ├── rng.ts             # seeded PRNG (Mulberry32)
│   │   ├── endings.ts         # ending conditions + achievements
│   │   └── starting-metrics.ts # per-industry/difficulty starting state
│   └── llm/
│       ├── index.ts           # LLM calls (Anthropic / OpenAI)
│       └── schemas.ts         # Zod schemas for all LLM outputs
└── middleware.ts         # Route protection
```
