# Agent Buddy

AI code review bot that learns reviewer personas from past PR reviews and performs both low-context (diff-based) and high-context (impact analysis) reviews.

## Monorepo Structure

```
agent-buddy/
├── packages/
│   ├── core/          # Shared types, interfaces, utilities
│   ├── cli/           # CLI tool (commander)
│   ├── server/        # API server (Hono)
│   └── dashboard/     # Web UI (React + Vite + TanStack Router)
├── turbo.json
├── tsconfig.base.json
└── package.json
```

## Build Commands

- `npm run build` — Build all packages
- `npm run dev` — Start dev servers
- `npm run lint` — Lint all packages
- `npm run typecheck` — Type check all packages
- `npm run test` — Run all tests

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Frontend**: React 19, Vite 6, TanStack Router, Tailwind CSS v4, shadcn/ui, @base-ui/react
- **Backend**: Hono, Node.js
- **CLI**: Commander.js
- **Monorepo**: Turborepo
- **LLM**: Anthropic Claude API

## Buddy System

Buddies are AI personas learned from real code reviewers. Each buddy has three core files:

- **SOUL.md** — Review philosophy, priorities, communication style
- **USER.md** — Expertise areas, seniority, preferred tools
- **MEMORY.md** — Index of individual review memories

Storage: `~/.agent-buddy/buddy/[id]/`

## Coding Conventions

- ESM modules (`"type": "module"`)
- NodeNext module resolution for packages (bundler for dashboard)
- Strict TypeScript
- Prettier for formatting
- ESLint for linting
