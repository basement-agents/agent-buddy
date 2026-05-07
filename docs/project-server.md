# project-server

## Goal

Hono 기반 API 서버. GitHub webhook을 수신하고, 리뷰 작업을 큐에 넣으며, REST API로 결과를 반환한다. 같은 포트에서 대시보드 SPA 정적 자산을 함께 서빙할 수 있다.

## Path

```
packages/server/src/
```

## Users

- GitHub: webhook events
- Dashboard: REST API + 정적 자산
- CLI: job status 조회 / 데몬 진입점 (`runDaemon` → `serve`)

## In Scope

- GitHub webhook handler (PR events)
- Job queue management
- REST API (buddies, repos, rules CRUD)
- 정적 자산 SPA 서빙 (`serve({ port, dashboardDir })`로 활성화)

## Out of Scope

- CLI specific commands
- Dashboard UI build

## Architecture

```
packages/server/src/
├── index.ts             # Hono app + serve(options) entry
├── routes/
│   ├── webhooks.ts      # GitHub webhook handlers
│   ├── repos.ts
│   ├── buddies.ts
│   ├── reviews.ts
│   ├── settings.ts
│   ├── search.ts
│   └── metrics.ts
├── jobs/
│   ├── persistence.ts
│   ├── scheduler.ts
│   └── state.ts
├── lib/
│   ├── api-response.ts
│   ├── health-check.ts
│   └── static.ts        # serveStatic 미들웨어 (asset + SPA fallback)
└── middleware/
    ├── auth.ts
    ├── rate-limit.ts
    ├── request-id.ts
    └── security-headers.ts
```

## serve() 시그니처

```ts
export interface ServeOptions {
  port?: number;
  dashboardDir?: string;
}

export async function serve(options: ServeOptions = {}): Promise<void>;
```

`dashboardDir`이 주어지면 `serveStatic` 미들웨어가 라우트 등록 *전*에 mount되어 자산 매칭 시 응답하고, 매칭 실패 시 `notFound` 핸들러에서 SPA fallback (index.html) 반환. `/api/*`은 항상 정적 핸들러를 통과한다.
