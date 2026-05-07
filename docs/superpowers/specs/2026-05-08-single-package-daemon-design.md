# Single-package distribution + daemon lifecycle

Status: Draft (awaiting user review)
Date: 2026-05-08
Branch: `feat/single-package-daemon`

## Goal

`npm install -g agent-buddy` 한 번으로 CLI, API 서버, 대시보드 정적 자산이 모두 설치되고, `agent-buddy start`로 백그라운드 데몬이 실행되어 `agent-buddy stop`으로 종료할 수 있는 구조를 만든다.

## Non-goals

- 로그 회전 (size/time 기반) — `KNOWN_ISSUES.md`에 기록만.
- launchd / systemd 자동 등록.
- Windows 데몬 동작. 구현 보장 범위는 macOS / Linux. Windows는 `--foreground` 권장.
- HTTPS / TLS termination.
- 멀티 인스턴스 동시 실행 (PID 파일이 단일이라 1대1).
- `core` / `server` / `dashboard`를 npm에 별도 발행.

## Architecture

### Monorepo 구조 (변경 없음)

```
packages/
├── core/        @agent-buddy/core    (private, leaf)
├── server/      @agent-buddy/server  (private, depends on core)
├── cli/         agent-buddy          (publishable, depends on core+server, copies dashboard build)
└── dashboard/   @agent-buddy/dashboard (private, depends on core)
```

`docs/architecture/DEPENDENCY_RULES.md`의 단방향 그래프 그대로 적용. `cli`가 `dashboard`를 devDependency로 받지만 import는 안 하고 build 산출물만 복사하므로 `scripts/lint-architecture.mjs`의 import 검사를 통과한다.

### Publish artifact

`packages/cli/`만 npm에 발행한다. `package.json` 변경:

| 필드 | 값 |
|---|---|
| `name` | `agent-buddy` |
| `bin` | `{ "agent-buddy": "./dist/cli.js" }` |
| `files` | `["dist", "README.md"]` |
| `dependencies` | 외부 런타임 deps만 (commander, ora, picocolors, @inquirer/prompts, hono, @hono/zod-validator, zod) — workspace deps는 prepack 시 제거 |

`core` / `server` / `dashboard` 패키지의 `package.json`에 `"private": true`를 추가해 npm 발행 사고를 막는다.

### 빌드 산출물

```
packages/cli/dist/
├── cli.js              # tsup 번들: cli + server + core 인라인. shebang 포함.
└── dashboard/          # vite build 결과 복사본
    ├── index.html
    └── assets/
```

발행 시 사용자 머신의 `node_modules/agent-buddy/dist/`가 자체 완결.

### 빌드 도구 선택

- `tsup` (esbuild 기반): cli 번들. ESM, target=node22, `noExternal: [/^@agent-buddy\//]`로 workspace deps를 인라인. 외부 런타임 deps는 `external` 유지.
- `vite build`: 대시보드 (기존 그대로).
- `scripts/bundle-dashboard.mjs`: dashboard `dist`를 `cli/dist/dashboard`로 복사하는 글루.

### Turbo build chain

`packages/cli/package.json`의 `build` 스크립트:

```json
"build": "node ../../scripts/bundle-dashboard.mjs && tsup"
```

`packages/cli/package.json`에 `"@agent-buddy/dashboard": "*"`을 devDependency로 추가하면 turbo의 `dependsOn: ["^build"]`가 자동으로 dashboard build를 cli build 이전에 실행.

빌드 순서: `core` → (`server`, `dashboard`) → `cli`.

## CLI 명령 표면

```
agent-buddy <command>

Lifecycle:
  init                    Initialize configuration (interactive)
  start [--port N]        Start agent-buddy daemon (server + dashboard)
        [--foreground]    Run in foreground (logs to stdout, no PID file)
  stop                    Stop the running daemon
  status                  Show daemon status
  logs [--tail N] [-f]    Show daemon logs

Config / domain:
  config <get|set|unset|show|reset>
  doctor
  repo <add|remove|list|rules>
  buddy <create|list|delete|export|import|analyze|update|rollback>
  review <owner/repo> <pr-number> [--buddy <id>] [--high-context]
  completion              Generate shell completion script

Deprecated:
  serve                   alias for `start`, prints deprecation warning
```

## Daemon lifecycle

### Filesystem layout (`~/.agent-buddy/`)

```
~/.agent-buddy/
├── config.json              # 기존 그대로
├── buddy/                   # 기존 그대로
├── jobs/                    # 기존 그대로
├── runtime/
│   ├── agent-buddy.pid      # 데몬 PID
│   └── agent-buddy.port     # 바인딩된 포트
└── logs/
    └── agent-buddy.log      # stdout/stderr 합본 (rotate 미구현)
```

### `agent-buddy start`

1. `runtime/agent-buddy.pid` 존재 확인:
   - 살아있으면 `Already running on port N (PID M). Use 'agent-buddy stop' first.` → exit 1.
   - 죽은 PID (stale)면 파일 삭제 후 진행.
2. 포트 사용 가능 확인 (`net.createServer().listen(port)` 시도). 사용 중이면 `Port N in use. Use --port or stop conflicting process` → exit 1.
3. `runtime/`, `logs/` 디렉터리 보장.
4. 자식 spawn (`bundledEntry`는 현재 실행 중인 `cli.js`의 절대 경로 = `process.argv[1]`):
   ```ts
   const logFd = fs.openSync(logPath, "a");
   const child = spawn(process.execPath, [bundledEntry, "__daemon__"], {
     detached: true,
     stdio: ["ignore", logFd, logFd],
     env: { ...process.env, AGENT_BUDDY_PORT: String(port) },
   });
   child.unref();
   ```
5. 자식 spawn 직후 1초 동안 `child.on("exit")` 리스너로 즉시 종료 감지. 1초 안에 exit하면 `Daemon failed to start. Check ~/.agent-buddy/logs/agent-buddy.log` → exit 1.
6. 1초 통과 시 `runtime/agent-buddy.pid` (atomic, `O_EXCL`) + `runtime/agent-buddy.port` 작성. 부모는 `Started agent-buddy on http://localhost:N (PID M)` 출력 후 종료.

`--foreground`: 자식 spawn 없이 현재 프로세스에서 직접 server 실행. PID 파일 / 포트 파일 미생성.

### `agent-buddy stop`

1. PID 파일 없으면 `Not running` → exit 0 (idempotent).
2. PID 읽고 `process.kill(pid, "SIGTERM")`.
3. 최대 35초 동안 `process.kill(pid, 0)`로 살아있는지 polling (1초 간격). 죽으면 PID/port 파일 정리 후 `Stopped` 출력.
4. 35초 초과 시 `process.kill(pid, "SIGKILL")` + stderr 경고 + 파일 정리 + exit 0.

서버 측 graceful shutdown은 기존 `packages/server/src/index.ts` 핸들러 그대로 사용 (running jobs 30초 대기).

### `agent-buddy status`

1. PID 파일 없으면 `not running` 한 줄.
2. PID 살아있으면 port 파일 읽고 `running, port=N, pid=M, uptime=...` 출력.
3. PID 죽었으면 `stale (cleaning up)` + 파일 정리.
4. 살아있는 경우 `GET /api/health` 호출해 응답 요약 추가.

### `agent-buddy logs`

- 기본: `~/.agent-buddy/logs/agent-buddy.log` 마지막 200줄 출력.
- `--tail N`: 마지막 N줄.
- `-f`: tail follow 모드 (Node `fs.watch`).
- 로그 파일 없으면 `No logs yet` 출력 후 exit 0.

### Daemon entry 분기

`packages/cli/src/cli.ts`:

```ts
#!/usr/bin/env node
if (process.argv[2] === "__daemon__") {
  const { runDaemon } = await import("./daemon/run.js");
  await runDaemon();
} else {
  const { runCli } = await import("./cli-main.js");
  await runCli();
}
```

`__daemon__`은 internal 인자로 사용자에게 노출하지 않음 (commander에 등록 안 함). 자식 프로세스가 server를 직접 listen하고 SIGTERM 핸들러 통해 graceful shutdown.

## 정적 자산 서빙

`packages/server/src/lib/static.ts` 신규:

- `serveStatic(dir: string)` Hono 미들웨어 반환.
- `/api/*`이 아닌 GET 요청에 대해:
  1. `dir` 안의 파일 매칭 시도 (예: `/assets/index-abc.js` → `dir/assets/index-abc.js`).
  2. 매칭 실패 시 SPA fallback: `dir/index.html` 반환.
  3. `dir` 자체가 없거나 `index.html`이 없으면 404 (개발 모드).

`packages/server/src/index.ts`의 `serve(port)`를 `serve({ port, dashboardDir? })`로 변경. `dashboardDir`이 주어지면 라우트 정의 후 정적 미들웨어를 mount.

CLI의 daemon entry는 번들 `__dirname`을 기준으로 `dashboard/` 경로를 해석:

```ts
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.join(here, "dashboard");
```

## Error handling matrix

| 상황 | 동작 |
|---|---|
| `start`: PID 파일 + 살아있는 PID | exit 1, "Already running on port N (PID M)" |
| `start`: PID 파일 + 죽은 PID | stale 정리 후 진행 |
| `start`: 포트 사용 중 | exit 1, "Port N in use" |
| `start`: 자식 1초 내 즉시 exit | PID 파일 미작성, exit 1, log 경로 안내 |
| `stop`: PID 파일 없음 | exit 0, "Not running" |
| `stop`: SIGTERM 후 35초 초과 | SIGKILL, stderr 경고, exit 0 |
| `status`: stale PID 파일 | "stale (cleaning up)", 파일 정리 |
| `logs`: 로그 파일 없음 | exit 0, "No logs yet" |
| 정적 자산 누락 | API만 서빙, 부팅 시 warn 로그 |
| `serve` 명령 호출 | stderr "deprecated, use 'start'", `start` 동작 실행 |

PID 파일 atomic create는 `O_EXCL`로 race condition 방지. 동시 `start` 두 개 중 한쪽만 성공.

## Testing

`packages/cli/src/__tests__/daemon.test.ts` (vitest, 통합):
- `start` → `status` (running) → `stop` → `status` (not running) 골든 패스.
- 중복 `start` exit 1 확인.
- stale PID 자동 정리.
- 포트 충돌 exit 1.
- `--foreground` spawn 없이 직접 listen.
- 자식 즉시 죽는 케이스 (mock으로 server entry가 throw).

`packages/cli/src/__tests__/static-serving.test.ts`:
- 임시 디렉터리 + index.html로 server 띄우고 `GET /` → index.html.
- `GET /api/health` → JSON.
- `GET /spa/route` → index.html (SPA fallback).
- `dashboardDir` 미지정 시 `/`은 404, `/api/*`만 정상.

`packages/cli/src/__tests__/build-output.test.ts` (sanity):
- `dist/cli.js` shebang 존재.
- `node dist/cli.js --version` 정상 출력.
- `dist/dashboard/index.html` 존재.

기존 `serve` 호출하는 테스트가 있으면 deprecation alias 유지 덕에 통과. 없으면 추가 안 함.

## 문서 갱신

- `CLAUDE.md` Monorepo Structure에 `dist/dashboard` publish 산출물 한 줄 추가.
- `docs/project-cli.md`에 `start/stop/status/logs` 명령 + 데몬 동작 섹션 추가.
- `docs/project-server.md`에 정적 자산 서빙 옵션 추가.
- `docs/architecture/DECISIONS.md`에 ADR "Single npm package via tsup bundle" 추가.
- `docs/quality/KNOWN_ISSUES.md`에 "log rotation 미구현" 한 줄 추가.
- `README.md` 사용법 업데이트: `npm install -g agent-buddy`, `agent-buddy start`.

## Risks / open questions

- `tsup`이 server의 dynamic import (`createServer = await import("node:http")`) 등을 깨뜨릴 가능성. 빌드 산출물에 대한 sanity 테스트로 1차 방어.
- 대시보드의 API base URL이 dev에서는 `http://localhost:3000` 가정. 같은 origin 서빙으로 변경되면 dashboard가 상대 경로로 호출하도록 검토 필요.
- `serve()` 시그니처 변경 (`serve({ port, dashboardDir? })`)이 server 패키지의 외부 호출자(현재 cli만)에 영향. cli도 함께 변경하므로 문제 없음.
