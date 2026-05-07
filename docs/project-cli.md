# project-cli

## Goal

Commander.js 기반 CLI 도구. 데몬 라이프사이클 (`start`/`stop`/`status`/`logs`) + Buddy 관리, 리포지토리 설정, 수동 리뷰 실행을 지원한다. `agent-buddy`라는 단일 npm 패키지로 발행되며 cli/server/core가 tsup으로 번들되고 dashboard 빌드 산출물이 함께 포함된다.

## Path

```
packages/cli/src/
```

## Users

- 개발자: CLI를 통해 데몬 라이프사이클 제어, buddy 생성/조회, 리포지토리 등록, 수동 리뷰 실행

## In Scope

- `start` / `stop` / `status` / `logs` (daemon lifecycle)
- `buddy` 하위 명령 (analyze, list, show, update, delete, export, import, rollback, versions, compare)
- `repo` 하위 명령 (add, remove, list, assign)
- `review` 명령 (수동 PR 리뷰 실행)
- `doctor` 명령 (환경 설정 검증)
- `serve` 명령 (deprecated — `start --foreground` 별칭)

## Out of Scope

- Server 라우팅 / 비즈니스 로직 (server 패키지)
- Dashboard UI (dashboard 패키지)

## Architecture

```
packages/cli/src/
├── cli.ts               # entry: process.argv[2] === "__daemon__" 분기
├── cli-main.ts          # commander 설정 (runCli)
├── commands/
│   ├── start.ts         # detached spawn + PID 파일
│   ├── stop.ts          # SIGTERM + 35s polling + SIGKILL fallback
│   ├── daemon-status.ts # PID/port/uptime + /api/health 요약
│   ├── logs.ts          # tail / follow
│   ├── doctor.ts
│   ├── buddy-handlers.ts
│   └── history.ts
├── daemon/
│   ├── run.ts           # 자식 프로세스가 실행하는 server entry
│   ├── runtime-paths.ts # ~/.agent-buddy/{runtime,logs}/* 경로
│   ├── pidfile.ts       # atomic create / read / clear
│   ├── process-utils.ts # isAlive, waitForExit
│   └── port-utils.ts    # isPortAvailable
├── lib/
│   └── helpers.ts
└── __tests__/
```

## 빌드 산출물

`packages/cli/dist/`:

- `cli.js` (tsup 번들: cli + server + core 인라인, shebang 포함)
- `dashboard/` (vite build 결과 복사본)

발행 시 `files: ["dist", "README.md"]`만 npm 패키지에 포함된다. workspace 의존성 (`@agent-buddy/core`, `@agent-buddy/server`, `@agent-buddy/dashboard`)은 `devDependencies`로 두므로 publish artifact에 들어가지 않는다.
