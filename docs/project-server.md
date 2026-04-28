# project-server

## Goal

Hono 기반 API 서버. GitHub webhook을 수신하고, 리뷰 작업을 큐에 넣으며, SSE로 결과를 스트리밍한다.

## Path

```
packages/server/src/
```

## Users

- GitHub: webhook events
- Dashboard: REST API
- CLI: job status 查询

## In Scope

- GitHub webhook handler (PR events)
- Job queue management
- SSE streaming endpoint
- REST API ( buddies, repos, rules CRUD)

## Out of Scope

- CLI specific commands
- Dashboard UI

## Architecture

```
packages/server/src/
├── index.ts          # Hono app entry
├── routes/
│   ├── webhooks.ts   # GitHub webhook handlers
│   ├── api.ts        # REST API routes
│   └── sse.ts        # SSE streaming
├── jobs/
│   └── review.ts     # Review job processing
└── middleware/
    └── auth.ts       # Authentication middleware
```
