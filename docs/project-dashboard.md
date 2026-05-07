# project-dashboard

## Goal

React 기반 Web UI. Buddy 관리, 리포지토리 설정, 리뷰 결과 확인, 설정 변경을 UI로 지원한다.

## Path

```
packages/dashboard/src/
```

## Users

- 최종 사용자: 브라우저를 통해 Buddy 시스템 조작

## In Scope

- Buddy CRUD UI
- Repo 설정 UI
- Review 결과 대시보드
- 설정 페이지 (API keys, LLM providers)
- 빌드 산출물은 `scripts/bundle-dashboard.mjs`로 `packages/cli/dist/dashboard/`에 복사되어 `agent-buddy` 단일 npm 패키지의 일부로 발행된다.

## Out of Scope

- Server backend logic
- CLI commands

## Architecture

```
packages/dashboard/src/
├── app/              # entry/routing (router.tsx, providers.tsx)
├── api/              # API boundary types
├── components/
│   ├── common/       # kebab-case files shared by ≥2 routes
│   ├── system/       # design system — button/, input/, card/
│   └── layout/       # layout components (sidebar, header)
├── lib/              # utilities/hooks shared by ≥2 routes
└── pages/<route>/
    ├── <route>-page.tsx
    ├── _components/  # kebab-case files scoped to this route
    ├── _hooks/       # hooks scoped to this route
    └── _lib/         # utilities scoped to this route
```

상세 라우트 구조 → `research/internal/domain-dashboard.md`
