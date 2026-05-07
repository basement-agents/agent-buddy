# Single-package distribution + daemon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm install -g agent-buddy` 한 번으로 cli/server/dashboard가 모두 깔리고, `agent-buddy start/stop/status/logs`로 데몬 라이프사이클을 제어할 수 있게 만든다.

**Architecture:** monorepo는 그대로 유지하고 `packages/cli`를 tsup으로 단일 번들 npm 패키지(`agent-buddy`)로 발행. dashboard `vite build` 산출물을 `cli/dist/dashboard/`로 복사. 서버는 `/api/*` 외 GET 요청을 SPA 정적 자산으로 fallback 서빙. 데몬은 `child_process.spawn(detached)` + PID 파일.

**Tech Stack:** tsup (esbuild), Vite, Hono, Commander, Node `child_process`, Node ≥ 22.

**Spec:** [`docs/superpowers/specs/2026-05-08-single-package-daemon-design.md`](../specs/2026-05-08-single-package-daemon-design.md)

---

## Task 1: 빌드 인프라 셋업 — tsup + bundle script

**Goal:** `npm run build`가 cli/dist/cli.js (번들) + cli/dist/dashboard/ (정적 자산)을 만들도록 한다. 아직 daemon 로직은 추가하지 않음.

**Files:**
- Create: `packages/cli/tsup.config.ts`
- Create: `scripts/bundle-dashboard.mjs`
- Modify: `packages/cli/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/server/package.json`
- Modify: `packages/dashboard/package.json`

- [ ] **Step 1: tsup devDependency 추가**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm install -D tsup -w packages/cli
```

Expected: `packages/cli/package.json`의 devDependencies에 `"tsup": "^8.x.x"` 추가됨.

- [ ] **Step 2: tsup config 작성**

Create `packages/cli/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  shims: false,
  splitting: false,
  bundle: true,
  noExternal: [/^@agent-buddy\//],
  external: [
    "commander",
    "ora",
    "picocolors",
    "@inquirer/prompts",
    "hono",
    "@hono/zod-validator",
    "zod",
  ],
  banner: { js: "#!/usr/bin/env node" },
});
```

`entry: { cli: "src/cli.ts" }`는 출력 파일이 `dist/cli.js`가 되게 한다. `noExternal`이 workspace 패키지를 인라인 번들에 포함시키고, `external`은 사용자 머신의 `node_modules`에서 해석하도록 둔다.

- [ ] **Step 3: bundle-dashboard 스크립트 작성**

Create `scripts/bundle-dashboard.mjs`:

```js
#!/usr/bin/env node
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = resolve(repoRoot, "packages/dashboard");
const cliDir = resolve(repoRoot, "packages/cli");
const dashboardDist = resolve(dashboardDir, "dist");
const targetDir = resolve(cliDir, "dist/dashboard");

if (!existsSync(dashboardDist)) {
  console.log("[bundle-dashboard] running vite build...");
  execSync("npm run build", { cwd: dashboardDir, stdio: "inherit" });
}

mkdirSync(resolve(cliDir, "dist"), { recursive: true });
if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
cpSync(dashboardDist, targetDir, { recursive: true });
console.log(`[bundle-dashboard] copied ${dashboardDist} -> ${targetDir}`);
```

- [ ] **Step 4: cli/package.json 변경**

Replace `packages/cli/package.json` content:

```json
{
  "name": "agent-buddy",
  "version": "0.1.0",
  "type": "module",
  "description": "AI code review bot that learns reviewer personas",
  "bin": {
    "agent-buddy": "./dist/cli.js"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "node ../../scripts/bundle-dashboard.mjs && tsup",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@inquirer/prompts": "^8.4.1",
    "commander": "^13.1.0",
    "hono": "^4.7.0",
    "@hono/zod-validator": "^0.7.6",
    "zod": "^3.25.76",
    "ora": "^8.2.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@agent-buddy/core": "*",
    "@agent-buddy/server": "*",
    "@agent-buddy/dashboard": "*",
    "@types/node": "^22.19.17",
    "oxfmt": "^0.47.0",
    "oxlint": "^1.62.0",
    "tsup": "^8.5.0",
    "typescript": "^5.8.0",
    "ultracite": "^7.6.2",
    "vitest": "^4.1.4"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

핵심 변경:
- `name`이 `agent-buddy`.
- `bin` 경로가 `./dist/cli.js`.
- workspace 패키지 (`core`, `server`, `dashboard`)는 devDependencies로 이동 — tsup 인라인이라 publish 시 외부 deps 만 남고, 사용자가 `npm i -g agent-buddy`할 때 receive하지 않음.
- 외부 런타임 deps (hono, zod, ...)는 dependencies에 유지.

- [ ] **Step 5: core/server/dashboard에 "private": true 추가**

`packages/core/package.json` — 첫 줄 `{` 다음에 `  "private": true,` 추가.

```json
{
  "name": "@agent-buddy/core",
  "private": true,
  "version": "0.1.0",
  ...
}
```

같은 작업을 `packages/server/package.json`, `packages/dashboard/package.json`에도 적용.

- [ ] **Step 6: cli/src/cli.ts placeholder 작성**

Create `packages/cli/src/cli.ts`:

```ts
#!/usr/bin/env node
console.log("agent-buddy 0.1.0 (placeholder)");
```

기존 `packages/cli/src/index.ts`는 다음 task에서 옮긴다. 지금은 빌드만 통과시키는 게 목표.

- [ ] **Step 7: 빌드 실행**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm run build
```

Expected:
- 콘솔에 `[bundle-dashboard] copied .../packages/dashboard/dist -> .../packages/cli/dist/dashboard` 출력.
- `packages/cli/dist/cli.js` 생성 (shebang 포함).
- `packages/cli/dist/dashboard/index.html` 존재.
- 에러 없이 종료.

확인:

```bash
head -1 packages/cli/dist/cli.js
ls packages/cli/dist/dashboard/index.html
node packages/cli/dist/cli.js
```

Expected:
- 첫 줄: `#!/usr/bin/env node`
- index.html 경로 출력
- `agent-buddy 0.1.0 (placeholder)` 출력

- [ ] **Step 8: 커밋**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
git add packages/cli/tsup.config.ts scripts/bundle-dashboard.mjs \
  packages/cli/package.json packages/core/package.json \
  packages/server/package.json packages/dashboard/package.json \
  packages/cli/src/cli.ts package-lock.json
# 기존 index.ts는 task 3에서 정리하므로 아직 안 지움
git commit -m "$(cat <<'EOF'
build: add tsup bundle config and dashboard copy script

Bundle cli/server/core into a single dist/cli.js via tsup, and copy
dashboard vite build output into dist/dashboard so the cli package can be
published as a self-contained agent-buddy npm package.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Server에 정적 자산 서빙 추가

**Goal:** `serve()`가 `dashboardDir` 옵션을 받으면 `/api/*`을 제외한 GET 요청을 SPA로 fallback한다.

**Files:**
- Create: `packages/server/src/lib/static.ts`
- Create: `packages/server/src/__tests__/static.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/server/src/__tests__/static.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serveStatic } from "../lib/static.js";

describe("serveStatic", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-buddy-static-"));
    writeFileSync(join(dir, "index.html"), "<html><body>spa</body></html>");
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "main.js"), "console.log('hi')");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns index.html for /", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("spa");
  });

  it("returns asset file when path matches", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    const res = await app.request("/assets/main.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("console.log");
  });

  it("falls back to index.html for SPA routes", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    const res = await app.request("/buddy/abc/show");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("spa");
  });

  it("does not handle /api/* paths (passes to next)", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    app.get("/api/health", (c) => c.json({ status: "ok" }));
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 404 when directory missing", async () => {
    const app = new Hono();
    app.use("*", serveStatic("/nonexistent/path"));
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });

  it("does not serve POST requests", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    app.post("/api/x", (c) => c.json({ ok: true }));
    const res = await app.request("/api/x", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npx vitest run packages/server/src/__tests__/static.test.ts
```

Expected: `Cannot find module '../lib/static.js'` 에러로 모든 테스트 fail.

- [ ] **Step 3: serveStatic 구현**

Create `packages/server/src/lib/static.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME[path.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

function safeJoin(root: string, requested: string): string | null {
  const decoded = decodeURIComponent(requested);
  const joined = normalize(join(root, decoded));
  if (!joined.startsWith(normalize(root))) return null;
  return joined;
}

export function serveStatic(dir: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const path = c.req.path;
    if (path.startsWith("/api/")) return next();
    if (!existsSync(dir)) {
      const indexPath = join(dir, "index.html");
      if (!existsSync(indexPath)) return next();
    }

    const indexPath = join(dir, "index.html");
    if (!existsSync(indexPath)) return next();

    const target = safeJoin(dir, path === "/" ? "/index.html" : path);
    if (target && existsSync(target) && statSync(target).isFile()) {
      const buf = readFileSync(target);
      return c.body(buf, 200, { "content-type": mimeFor(target) });
    }

    const html = readFileSync(indexPath);
    return c.body(html, 200, { "content-type": "text/html; charset=utf-8" });
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npx vitest run packages/server/src/__tests__/static.test.ts
```

Expected: 6개 테스트 모두 PASS.

- [ ] **Step 5: serveStatic 시그니처를 spaFallback 분리로 정리**

API 라우트가 정적 핸들러보다 먼저 매칭되어야 하는데, hono의 `app.use("*", ...)`는 *그 이후 정의되는* 라우트에 적용된다. 따라서 두 단계로 나눈다:

1. 정적 자산 매칭만 하는 핸들러 (asset 있으면 응답, 없으면 next): `spaFallback: false`로 라우트 *이전*에 mount.
2. SPA fallback: `app.notFound` 안에서 `index.html` 반환.

이를 위해 `serveStatic` 시그니처를 `(dir, opts?: { spaFallback?: boolean })`로 확장한다.

`packages/server/src/lib/static.ts`를 다음으로 교체:

```ts
import type { MiddlewareHandler } from "hono";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function mimeFor(p: string): string {
  const dot = p.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME[p.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

function safeJoin(root: string, requested: string): string | null {
  const decoded = decodeURIComponent(requested);
  const joined = normalize(join(root, decoded));
  if (!joined.startsWith(normalize(root))) return null;
  return joined;
}

export interface ServeStaticOptions {
  spaFallback?: boolean;
}

export function serveStatic(dir: string, opts: ServeStaticOptions = { spaFallback: true }): MiddlewareHandler {
  const spaFallback = opts.spaFallback ?? true;
  return async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const p = c.req.path;
    if (p.startsWith("/api/")) return next();
    if (!existsSync(dir)) return next();

    const target = safeJoin(dir, p === "/" ? "/index.html" : p);
    if (target && existsSync(target) && statSync(target).isFile()) {
      const buf = readFileSync(target);
      return c.body(buf, 200, { "content-type": mimeFor(target) });
    }

    if (!spaFallback) return next();

    const indexPath = join(dir, "index.html");
    if (!existsSync(indexPath)) return next();
    const html = readFileSync(indexPath);
    return c.body(html, 200, { "content-type": "text/html; charset=utf-8" });
  };
}
```

이제 `serve()` 시그니처를 변경하고 정적 미들웨어를 두 위치에 등록한다.

`packages/server/src/index.ts`에서:

a) 시그니처 교체:
```ts
export interface ServeOptions {
  port?: number;
  dashboardDir?: string;
}

export async function serve(options: ServeOptions = {}): Promise<void> {
  const config = await loadConfig();
  const actualPort = options.port || config.server?.port || 3000;
  // (이하 기존 본문 유지: jobs 로딩, persistence interval, listen, shutdown handler)
```

b) 파일 상단에 import 추가:
```ts
import { serveStatic } from "./lib/static.js";
```

c) 라우트 등록 *바로 위*에 정적 핸들러 mount:
```ts
const dashboardDir = options.dashboardDir;
if (dashboardDir) {
  app.use("*", serveStatic(dashboardDir, { spaFallback: false }));
}
app.route("/", createReposRoutes());
// (기존 라우트들...)
```

d) 기존 `app.notFound` 핸들러를 SPA fallback 시도 후 404 JSON 반환으로 교체:
```ts
app.notFound(async (c) => {
  if (dashboardDir) {
    const handler = serveStatic(dashboardDir, { spaFallback: true });
    let captured: Response | undefined;
    await handler(c, async () => undefined as unknown as Response);
    captured = c.res;
    if (captured && captured.status === 200) return captured;
  }
  return c.json(apiNotFound("route", c.req.path), 404);
});
```

- [ ] **Step 6: 정적 테스트 업데이트**

Step 1의 테스트는 `serveStatic(dir)` (default spaFallback: true)로 호출했으므로 그대로 동작. 추가로 spaFallback false 케이스 테스트 한 가지 추가:

```ts
it("does not fall back when spaFallback=false and asset missing", async () => {
  const app = new Hono();
  app.use("*", serveStatic(dir, { spaFallback: false }));
  app.get("*", (c) => c.text("not-found", 404));
  const res = await app.request("/buddy/abc/show");
  expect(res.status).toBe(404);
  const body = await res.text();
  expect(body).toBe("not-found");
});
```

테스트 다시 실행:
```bash
npx vitest run packages/server/src/__tests__/static.test.ts
```

Expected: 7개 테스트 PASS.

- [ ] **Step 7: 기존 server 테스트가 계속 통과하는지 확인**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npx vitest run packages/server
```

Expected: 모든 server 테스트 PASS. `serve()` 시그니처 변경했으므로 직접 호출하는 테스트가 있는지 확인 — 없을 가능성이 높지만 있다면 `serve({ port: N })` 형태로 업데이트.

- [ ] **Step 8: 커밋**

```bash
git add packages/server/src/lib/static.ts \
  packages/server/src/__tests__/static.test.ts \
  packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): serve dashboard SPA assets from same port

Adds serveStatic middleware that returns asset files for matching
paths and falls back to index.html for SPA client routes. /api/* is
left untouched. serve() now accepts { port, dashboardDir }.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: CLI entry 분리 — cli.ts (분기) + cli-main.ts (commander)

**Goal:** `dist/cli.js`가 `process.argv[2] === "__daemon__"`이면 daemon entry로, 아니면 commander로 분기. 기존 `index.ts`의 commander 코드를 `cli-main.ts`로 옮긴다.

**Files:**
- Modify: `packages/cli/src/cli.ts` (placeholder → 분기)
- Create: `packages/cli/src/cli-main.ts` (현재 `index.ts` 내용)
- Create: `packages/cli/src/daemon/run.ts` (placeholder)
- Delete: `packages/cli/src/index.ts`
- Modify: `packages/cli/tsup.config.ts` (entry 그대로지만 확인)

- [ ] **Step 1: cli-main.ts로 기존 index.ts 내용 이동**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
mv packages/cli/src/index.ts packages/cli/src/cli-main.ts
```

- [ ] **Step 2: cli-main.ts 상단 수정 — shebang 제거, runCli 함수로 감싸기**

`packages/cli/src/cli-main.ts`:

기존:
```ts
#!/usr/bin/env node

import { Command } from "commander";
...
const program = new Command();
... // 모든 program.command(...) 등록
program.parse();
```

변경: shebang 제거 + 마지막 `program.parse()` 호출을 `export async function runCli()` 안으로 이동.

```ts
import { Command } from "commander";
...
export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name("agent-buddy")
    .description("AI code review bot that learns reviewer personas")
    .version("0.1.0");

  // (기존 모든 program.command(...) 정의를 함수 본문 안으로 이동)
  ...

  await program.parseAsync();
}
```

상단의 import 문과 헬퍼 함수들 (`getGitHubToken`, `parseRepoArg`, etc.)은 그대로 모듈 스코프에 둔다. `program` 정의와 `program.command(...)` 등록만 함수 안으로.

기존 코드의 `await import("./commands/doctor.js")` 같은 dynamic import는 함수 안에 있어야 한다 (`registerDoctorCommand` 호출 자리).

- [ ] **Step 3: cli.ts를 분기 entry로 갱신**

Replace `packages/cli/src/cli.ts`:

```ts
#!/usr/bin/env node
async function main(): Promise<void> {
  if (process.argv[2] === "__daemon__") {
    const { runDaemon } = await import("./daemon/run.js");
    await runDaemon();
    return;
  }
  const { runCli } = await import("./cli-main.js");
  await runCli();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 4: daemon/run.ts placeholder 생성**

Create `packages/cli/src/daemon/run.ts`:

```ts
import { serve } from "@agent-buddy/server";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function runDaemon(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dashboardDir = path.join(here, "dashboard");
  const port = process.env.AGENT_BUDDY_PORT
    ? Number(process.env.AGENT_BUDDY_PORT)
    : undefined;
  await serve({ port, dashboardDir });
}
```

`import.meta.url` 기반의 디렉터리 계산은 번들 후 `dist/cli.js` 위치에서 dashboard 디렉터리를 찾는 데 사용된다. 번들 시 `here`이 `dist/`로 해석되므로 `dist/dashboard/`가 정답.

- [ ] **Step 5: 빌드 + 빌드 산출물 확인**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm run build
```

Expected: 에러 없이 완료. `packages/cli/dist/cli.js` 첫 줄에 shebang.

```bash
node packages/cli/dist/cli.js --version
```

Expected: `0.1.0` 출력.

- [ ] **Step 6: 기존 cli 테스트 통과 확인**

```bash
npx vitest run packages/cli
```

Expected: 모든 cli 테스트가 PASS. import 경로 (`../index.js` → `../cli-main.js` 등) 변경이 필요할 수 있으므로 실패하면 import 경로 수정.

- [ ] **Step 7: 커밋**

```bash
git add packages/cli/src/cli.ts packages/cli/src/cli-main.ts \
  packages/cli/src/daemon/run.ts
git rm packages/cli/src/index.ts 2>/dev/null || true
# (mv로 이미 git에 반영되어 있으면 rm 불필요. git status로 확인)
git commit -m "$(cat <<'EOF'
refactor(cli): split entry into cli.ts dispatcher and cli-main.ts

cli.ts dispatches to runCli() (commander) or runDaemon() based on a
hidden "__daemon__" argv marker, so the same bundled binary can act
as the user-facing CLI or as the spawned background server.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Daemon helpers — runtime paths, PID file, process utils

**Goal:** PID 파일 생성/검사/정리, 포트 파일 읽기/쓰기, 프로세스 살아있는지 검사.

**Files:**
- Create: `packages/cli/src/daemon/runtime-paths.ts`
- Create: `packages/cli/src/daemon/pidfile.ts`
- Create: `packages/cli/src/daemon/process-utils.ts`
- Create: `packages/cli/src/__tests__/runtime-paths.test.ts`
- Create: `packages/cli/src/__tests__/pidfile.test.ts`
- Create: `packages/cli/src/__tests__/process-utils.test.ts`

- [ ] **Step 1: runtime-paths 실패 테스트**

Create `packages/cli/src/__tests__/runtime-paths.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { runtimePaths } from "../daemon/runtime-paths.js";
import path from "node:path";
import os from "node:os";

describe("runtimePaths", () => {
  it("returns paths under ~/.agent-buddy by default", () => {
    delete process.env.AGENT_BUDDY_HOME;
    const p = runtimePaths();
    const expected = path.join(os.homedir(), ".agent-buddy");
    expect(p.base).toBe(expected);
    expect(p.pidFile).toBe(path.join(expected, "runtime", "agent-buddy.pid"));
    expect(p.portFile).toBe(path.join(expected, "runtime", "agent-buddy.port"));
    expect(p.logFile).toBe(path.join(expected, "logs", "agent-buddy.log"));
    expect(p.runtimeDir).toBe(path.join(expected, "runtime"));
    expect(p.logDir).toBe(path.join(expected, "logs"));
  });

  it("honors AGENT_BUDDY_HOME env var", () => {
    process.env.AGENT_BUDDY_HOME = "/tmp/custom-home";
    const p = runtimePaths();
    expect(p.base).toBe("/tmp/custom-home");
    expect(p.pidFile).toBe("/tmp/custom-home/runtime/agent-buddy.pid");
    delete process.env.AGENT_BUDDY_HOME;
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run packages/cli/src/__tests__/runtime-paths.test.ts
```

Expected: `Cannot find module '../daemon/runtime-paths.js'`.

- [ ] **Step 3: runtime-paths 구현**

Create `packages/cli/src/daemon/runtime-paths.ts`:

```ts
import path from "node:path";
import os from "node:os";

export interface RuntimePaths {
  base: string;
  runtimeDir: string;
  logDir: string;
  pidFile: string;
  portFile: string;
  logFile: string;
}

export function runtimePaths(): RuntimePaths {
  const base = process.env.AGENT_BUDDY_HOME ?? path.join(os.homedir(), ".agent-buddy");
  const runtimeDir = path.join(base, "runtime");
  const logDir = path.join(base, "logs");
  return {
    base,
    runtimeDir,
    logDir,
    pidFile: path.join(runtimeDir, "agent-buddy.pid"),
    portFile: path.join(runtimeDir, "agent-buddy.port"),
    logFile: path.join(logDir, "agent-buddy.log"),
  };
}
```

- [ ] **Step 4: runtime-paths 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/runtime-paths.test.ts
```

Expected: 2개 테스트 PASS.

- [ ] **Step 5: process-utils 실패 테스트**

Create `packages/cli/src/__tests__/process-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAlive } from "../daemon/process-utils.js";

describe("isAlive", () => {
  it("returns true for current process", () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it("returns false for clearly-dead PID", () => {
    expect(isAlive(99999999)).toBe(false);
  });

  it("returns false for zero or negative", () => {
    expect(isAlive(0)).toBe(false);
    expect(isAlive(-1)).toBe(false);
  });
});
```

- [ ] **Step 6: process-utils 구현**

Create `packages/cli/src/daemon/process-utils.ts`:

```ts
export function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

export async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
```

- [ ] **Step 7: process-utils 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/process-utils.test.ts
```

Expected: 3개 테스트 PASS.

- [ ] **Step 8: pidfile 실패 테스트**

Create `packages/cli/src/__tests__/pidfile.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writePidFile, readPidFile, clearPidFile } from "../daemon/pidfile.js";

describe("pidfile", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ab-pid-"));
    file = join(dir, "agent-buddy.pid");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes and reads back a pid", () => {
    writePidFile(file, 12345);
    expect(readPidFile(file)).toBe(12345);
  });

  it("readPidFile returns null when file missing", () => {
    expect(readPidFile(file)).toBeNull();
  });

  it("readPidFile returns null when content not a number", () => {
    writePidFile(file, 12345);
    // overwrite with garbage
    const fs = require("node:fs") as typeof import("node:fs");
    fs.writeFileSync(file, "garbage");
    expect(readPidFile(file)).toBeNull();
  });

  it("writePidFile fails if file exists (atomic)", () => {
    writePidFile(file, 12345);
    expect(() => writePidFile(file, 67890)).toThrow();
  });

  it("clearPidFile removes the file", () => {
    writePidFile(file, 12345);
    clearPidFile(file);
    expect(existsSync(file)).toBe(false);
  });

  it("clearPidFile is idempotent", () => {
    expect(() => clearPidFile(file)).not.toThrow();
  });
});
```

- [ ] **Step 9: pidfile 구현**

Create `packages/cli/src/daemon/pidfile.ts`:

```ts
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

export function writePidFile(file: string, pid: number): void {
  // O_CREAT | O_WRONLY | O_EXCL — atomic create that fails if file exists
  const fd = openSync(file, "wx");
  try {
    writeFileSync(fd, String(pid));
  } finally {
    closeSync(fd);
  }
}

export function readPidFile(file: string): number | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function clearPidFile(file: string): void {
  try {
    unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
```

- [ ] **Step 10: pidfile 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/pidfile.test.ts
```

Expected: 6개 테스트 PASS.

- [ ] **Step 11: 커밋**

```bash
git add packages/cli/src/daemon/runtime-paths.ts \
  packages/cli/src/daemon/pidfile.ts \
  packages/cli/src/daemon/process-utils.ts \
  packages/cli/src/__tests__/runtime-paths.test.ts \
  packages/cli/src/__tests__/pidfile.test.ts \
  packages/cli/src/__tests__/process-utils.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): add daemon helpers — runtime paths, pid file, process utils

writePidFile uses O_EXCL for atomic creation, isAlive uses kill(pid, 0)
to detect liveness, waitForExit polls every 250ms until timeout. These
support start/stop/status commands in the next tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Port availability check helper

**Goal:** 주어진 포트가 바인딩 가능한지 확인. start 명령에서 포트 충돌 감지에 사용.

**Files:**
- Create: `packages/cli/src/daemon/port-utils.ts`
- Create: `packages/cli/src/__tests__/port-utils.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `packages/cli/src/__tests__/port-utils.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { isPortAvailable } from "../daemon/port-utils.js";

describe("isPortAvailable", () => {
  let server: Server | null = null;
  afterEach(() => {
    if (server) server.close();
    server = null;
  });

  it("returns true for a likely-free port", async () => {
    expect(await isPortAvailable(0)).toBe(true);
  });

  it("returns false when port is in use", async () => {
    server = createServer();
    const port: number = await new Promise((resolve) => {
      server!.listen(0, () => {
        const addr = server!.address();
        if (addr && typeof addr === "object") resolve(addr.port);
      });
    });
    expect(await isPortAvailable(port)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run packages/cli/src/__tests__/port-utils.test.ts
```

Expected: module not found.

- [ ] **Step 3: 구현**

Create `packages/cli/src/daemon/port-utils.ts`:

```ts
import { createServer } from "node:net";

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
      .once("error", (err: NodeJS.ErrnoException) => {
        resolve(err.code !== "EADDRINUSE" && err.code !== "EACCES" ? false : false);
      })
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(port);
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/port-utils.test.ts
```

Expected: 2개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/cli/src/daemon/port-utils.ts \
  packages/cli/src/__tests__/port-utils.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): add isPortAvailable helper using net.createServer

Used by `agent-buddy start` to fail fast with a clear message when
the configured port is already in use.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `agent-buddy start` 명령

**Goal:** detached spawn으로 자식 데몬 띄우고 PID/port 파일 작성. `--foreground`이면 spawn 없이 직접 listen.

**Files:**
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/__tests__/start-command.test.ts`
- Modify: `packages/cli/src/cli-main.ts`

- [ ] **Step 1: start 명령 단위 테스트 (foreground 모드)**

Daemon mode는 실제 자식 프로세스를 spawn해야 해서 통합 테스트 성격. Foreground 모드는 직접 함수 호출이 가능. 우선 foreground/검증 분기를 단위 테스트로 다룬다.

Create `packages/cli/src/__tests__/start-command.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockServe = vi.fn().mockResolvedValue(undefined);
vi.mock("@agent-buddy/server", () => ({ serve: mockServe }));

describe("start command — preflight checks", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-start-"));
    process.env.AGENT_BUDDY_HOME = home;
    mockServe.mockClear();
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("rejects start when PID file exists with live process", async () => {
    const { startCommand } = await import("../commands/start.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), String(process.pid));
    const result = await startCommand({ port: 0, foreground: false });
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/already running/i);
  });

  it("clears stale PID file and proceeds (foreground)", async () => {
    const { startCommand } = await import("../commands/start.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), "99999999");
    const result = await startCommand({ port: 0, foreground: true });
    expect(result.code).toBe(0);
    expect(mockServe).toHaveBeenCalledTimes(1);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });

  it("foreground mode calls serve and does not write PID file", async () => {
    const { startCommand } = await import("../commands/start.js");
    const result = await startCommand({ port: 0, foreground: true });
    expect(result.code).toBe(0);
    expect(mockServe).toHaveBeenCalledWith({ port: undefined, dashboardDir: expect.any(String) });
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });
});
```

`port: 0`은 "포트 미지정 = 기본값 사용". `isPortAvailable(0)`은 항상 true이므로 단위 테스트에서 충돌 안 남.

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run packages/cli/src/__tests__/start-command.test.ts
```

Expected: module not found.

- [ ] **Step 3: start 명령 구현**

Create `packages/cli/src/commands/start.ts`:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runtimePaths } from "../daemon/runtime-paths.js";
import { writePidFile, readPidFile, clearPidFile } from "../daemon/pidfile.js";
import { isAlive } from "../daemon/process-utils.js";
import { isPortAvailable } from "../daemon/port-utils.js";

export interface StartOptions {
  port: number;
  foreground: boolean;
}

export interface StartResult {
  code: number;
  message: string;
}

const SPAWN_VERIFY_MS = 1000;

export async function startCommand(opts: StartOptions): Promise<StartResult> {
  const paths = runtimePaths();
  mkdirSync(paths.runtimeDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });

  const existingPid = readPidFile(paths.pidFile);
  if (existingPid !== null) {
    if (isAlive(existingPid)) {
      return {
        code: 1,
        message: `Already running (PID ${existingPid}). Use 'agent-buddy stop' first.`,
      };
    }
    clearPidFile(paths.pidFile);
  }

  const port = opts.port > 0 ? opts.port : 0;
  if (port > 0) {
    const available = await isPortAvailable(port);
    if (!available) {
      return {
        code: 1,
        message: `Port ${port} is in use. Use --port or stop the conflicting process.`,
      };
    }
  }

  if (opts.foreground) {
    const { runDaemon } = await import("../daemon/run.js");
    if (port > 0) process.env.AGENT_BUDDY_PORT = String(port);
    await runDaemon();
    return { code: 0, message: "Daemon exited (foreground)." };
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const entry = process.argv[1] ?? path.join(here, "cli.js");
  const logFd = openSync(paths.logFile, "a");

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (port > 0) env.AGENT_BUDDY_PORT = String(port);

  const child: ChildProcess = spawn(process.execPath, [entry, "__daemon__"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });

  let exitedEarly = false;
  let earlyExitCode: number | null = null;
  child.on("exit", (code) => {
    exitedEarly = true;
    earlyExitCode = code;
  });

  await new Promise<void>((resolve) => setTimeout(resolve, SPAWN_VERIFY_MS));

  if (exitedEarly) {
    return {
      code: 1,
      message: `Daemon failed to start (exit ${earlyExitCode}). Check ${paths.logFile}`,
    };
  }

  const childPid = child.pid;
  if (typeof childPid !== "number") {
    return { code: 1, message: "Failed to obtain daemon PID." };
  }

  try {
    writePidFile(paths.pidFile, childPid);
  } catch (err) {
    return { code: 1, message: `Failed to write PID file: ${(err as Error).message}` };
  }
  if (port > 0) writeFileSync(paths.portFile, String(port));
  child.unref();

  return {
    code: 0,
    message: `Started agent-buddy${port > 0 ? ` on http://localhost:${port}` : ""} (PID ${childPid})`,
  };
}
```

- [ ] **Step 4: cli-main.ts에 start 명령 등록**

`packages/cli/src/cli-main.ts`의 `runCli` 함수 안에서, 기존 `serve` 명령 등록 *위*(혹은 적당한 위치)에 추가:

```ts
program
  .command("start")
  .description("Start agent-buddy daemon (server + dashboard)")
  .option("-p, --port <port>", "Server port", "0")
  .option("--foreground", "Run in foreground (no daemon, logs to stdout)", false)
  .action(async (opts: { port: string; foreground: boolean }) => {
    const { startCommand } = await import("./commands/start.js");
    const result = await startCommand({
      port: Number.parseInt(opts.port, 10) || 0,
      foreground: opts.foreground,
    });
    if (result.code !== 0) console.error(pc.red(result.message));
    else console.log(result.message);
    process.exit(result.code);
  });
```

`pc`는 이미 cli-main.ts에서 `import pc from "picocolors"`로 import되어 있다.

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/start-command.test.ts
```

Expected: 3개 테스트 PASS.

- [ ] **Step 6: 빌드 후 수동 검증 (foreground)**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm run build
node packages/cli/dist/cli.js start --foreground --port 3456 &
SERVER_PID=$!
sleep 3
curl -s http://localhost:3456/api/health | head -50
curl -s http://localhost:3456/ | head -5
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
```

Expected:
- `/api/health` JSON 응답.
- `/` HTML 응답 (대시보드 index.html).

- [ ] **Step 7: 커밋**

```bash
git add packages/cli/src/commands/start.ts \
  packages/cli/src/__tests__/start-command.test.ts \
  packages/cli/src/cli-main.ts
git commit -m "$(cat <<'EOF'
feat(cli): agent-buddy start command with daemon spawn

Atomic PID file (O_EXCL) plus 1s post-spawn liveness check guards
against silent failure. --foreground runs serve() in-process for dev.
Stale PID files from crashed daemons are auto-cleaned.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `agent-buddy stop` 명령

**Goal:** PID 파일 읽고 SIGTERM, 35초 polling 후 SIGKILL fallback.

**Files:**
- Create: `packages/cli/src/commands/stop.ts`
- Create: `packages/cli/src/__tests__/stop-command.test.ts`
- Modify: `packages/cli/src/cli-main.ts`

- [ ] **Step 1: 실패 테스트**

Create `packages/cli/src/__tests__/stop-command.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("stop command", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-stop-"));
    process.env.AGENT_BUDDY_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("returns 'Not running' when no PID file", async () => {
    const { stopCommand } = await import("../commands/stop.js");
    const result = await stopCommand();
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/not running/i);
  });

  it("clears stale PID file and reports stopped", async () => {
    const { stopCommand } = await import("../commands/stop.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), "99999999");
    const result = await stopCommand();
    expect(result.code).toBe(0);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });

  it("sends SIGTERM and waits for exit (using a real spawned sleeper)", async () => {
    const { stopCommand } = await import("../commands/stop.js");
    const { spawn } = await import("node:child_process");
    const sleeper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], {
      detached: true,
      stdio: "ignore",
    });
    sleeper.unref();
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), String(sleeper.pid));
    const result = await stopCommand({ timeoutMs: 5000 });
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/stopped/i);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run packages/cli/src/__tests__/stop-command.test.ts
```

Expected: module not found.

- [ ] **Step 3: stop 구현**

Create `packages/cli/src/commands/stop.ts`:

```ts
import { runtimePaths } from "../daemon/runtime-paths.js";
import { readPidFile, clearPidFile } from "../daemon/pidfile.js";
import { isAlive, waitForExit } from "../daemon/process-utils.js";
import { existsSync, unlinkSync } from "node:fs";

export interface StopOptions {
  timeoutMs?: number;
}

export interface StopResult {
  code: number;
  message: string;
}

const DEFAULT_TIMEOUT_MS = 35_000;

export async function stopCommand(opts: StopOptions = {}): Promise<StopResult> {
  const paths = runtimePaths();
  const pid = readPidFile(paths.pidFile);
  if (pid === null) {
    return { code: 0, message: "Not running." };
  }

  if (!isAlive(pid)) {
    clearPidFile(paths.pidFile);
    if (existsSync(paths.portFile)) unlinkSync(paths.portFile);
    return { code: 0, message: "Stopped (cleaned up stale PID file)." };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    return { code: 1, message: `Failed to signal PID ${pid}: ${(err as Error).message}` };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exited = await waitForExit(pid, timeoutMs);

  let warning = "";
  if (!exited) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* may have died between checks */
    }
    warning = ` (forced after ${Math.round(timeoutMs / 1000)}s timeout)`;
  }

  clearPidFile(paths.pidFile);
  if (existsSync(paths.portFile)) unlinkSync(paths.portFile);

  return { code: 0, message: `Stopped${warning}.` };
}
```

- [ ] **Step 4: cli-main에 stop 등록**

`packages/cli/src/cli-main.ts` runCli 안에:

```ts
program
  .command("stop")
  .description("Stop the running daemon")
  .action(async () => {
    const { stopCommand } = await import("./commands/stop.js");
    const result = await stopCommand();
    if (result.code !== 0) console.error(pc.red(result.message));
    else console.log(result.message);
    process.exit(result.code);
  });
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/stop-command.test.ts
```

Expected: 3개 테스트 PASS.

- [ ] **Step 6: 빌드 후 수동 start/stop 라운드트립 검증**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm run build
node packages/cli/dist/cli.js start --port 3456
sleep 3
curl -s http://localhost:3456/api/health | head -10
node packages/cli/dist/cli.js stop
```

Expected:
- start 후 "Started agent-buddy on http://localhost:3456 (PID N)" 출력.
- /api/health JSON 응답.
- stop 후 "Stopped." 출력.
- `~/.agent-buddy/runtime/agent-buddy.pid` 파일이 사라짐.

⚠️ 주의: 이 수동 검증은 사용자의 실제 `~/.agent-buddy/`를 건드림. 테스트 후 `~/.agent-buddy/runtime/` 정리되어 있는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add packages/cli/src/commands/stop.ts \
  packages/cli/src/__tests__/stop-command.test.ts \
  packages/cli/src/cli-main.ts
git commit -m "$(cat <<'EOF'
feat(cli): agent-buddy stop command with graceful shutdown

SIGTERM, then poll up to 35s for the process to exit. Falls back to
SIGKILL with a warning. PID and port files are removed in both paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `agent-buddy status` 명령 (daemon 정보)

**Goal:** daemon이 떠있으면 PID/port/uptime + /api/health 요약을 표시. 기존 `status` 명령(설정/잡 통계)은 그대로 유지하고 daemon 섹션을 *위에* 추가.

**Files:**
- Create: `packages/cli/src/commands/daemon-status.ts`
- Create: `packages/cli/src/__tests__/daemon-status.test.ts`
- Modify: `packages/cli/src/cli-main.ts` (기존 status 핸들러에 daemon 섹션 prepend)

- [ ] **Step 1: 실패 테스트**

Create `packages/cli/src/__tests__/daemon-status.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("daemonStatus", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-status-"));
    process.env.AGENT_BUDDY_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("returns not-running when no PID file", async () => {
    const { daemonStatus } = await import("../commands/daemon-status.js");
    const s = await daemonStatus();
    expect(s.running).toBe(false);
    expect(s.pid).toBeNull();
  });

  it("returns running with current pid when PID file is alive", async () => {
    const { daemonStatus } = await import("../commands/daemon-status.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), String(process.pid));
    writeFileSync(join(home, "runtime", "agent-buddy.port"), "3456");
    const s = await daemonStatus({ skipHealthCheck: true });
    expect(s.running).toBe(true);
    expect(s.pid).toBe(process.pid);
    expect(s.port).toBe(3456);
  });

  it("cleans up stale PID file and reports not-running", async () => {
    const { daemonStatus } = await import("../commands/daemon-status.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), "99999999");
    const s = await daemonStatus();
    expect(s.running).toBe(false);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run packages/cli/src/__tests__/daemon-status.test.ts
```

Expected: module not found.

- [ ] **Step 3: 구현**

Create `packages/cli/src/commands/daemon-status.ts`:

```ts
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { runtimePaths } from "../daemon/runtime-paths.js";
import { readPidFile, clearPidFile } from "../daemon/pidfile.js";
import { isAlive } from "../daemon/process-utils.js";

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
  uptimeMs: number | null;
  health: unknown | null;
}

export interface DaemonStatusOptions {
  skipHealthCheck?: boolean;
}

export async function daemonStatus(opts: DaemonStatusOptions = {}): Promise<DaemonStatus> {
  const paths = runtimePaths();
  const pid = readPidFile(paths.pidFile);
  if (pid === null) {
    return { running: false, pid: null, port: null, uptimeMs: null, health: null };
  }
  if (!isAlive(pid)) {
    clearPidFile(paths.pidFile);
    if (existsSync(paths.portFile)) unlinkSync(paths.portFile);
    return { running: false, pid: null, port: null, uptimeMs: null, health: null };
  }

  let port: number | null = null;
  if (existsSync(paths.portFile)) {
    const raw = readFileSync(paths.portFile, "utf8").trim();
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n > 0) port = n;
  }

  let uptimeMs: number | null = null;
  try {
    const st = statSync(paths.pidFile);
    uptimeMs = Date.now() - st.mtimeMs;
  } catch { /* ignore */ }

  let health: unknown = null;
  if (!opts.skipHealthCheck && port !== null) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) health = await res.json();
    } catch { /* daemon may be starting */ }
  }

  return { running: true, pid, port, uptimeMs, health };
}

export function formatUptime(ms: number | null): string {
  if (ms == null) return "?";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
```

- [ ] **Step 4: cli-main의 기존 status 명령에 daemon 섹션 prepend**

`packages/cli/src/cli-main.ts`에서 기존 `program.command("status")` 핸들러 시작부 (renderStatus 함수 안 또는 그 직전)에 daemon 정보 출력 추가. JSON 모드도 호환되도록.

기존 코드 (대략):
```ts
const renderStatus = async () => {
  ...
  if (opts.json) { console.log(JSON.stringify(...)); return; }
  console.clear();
  console.log(pc.bold(pc.cyan("agent-buddy status")));
  ...
};
```

변경:
```ts
const { daemonStatus, formatUptime } = await import("./commands/daemon-status.js");
const renderStatus = async () => {
  const dStatus = await daemonStatus();
  ...
  if (opts.json) {
    console.log(JSON.stringify({
      daemon: {
        running: dStatus.running,
        pid: dStatus.pid,
        port: dStatus.port,
        uptimeMs: dStatus.uptimeMs,
      },
      // 기존 필드들...
    }, null, 2));
    return;
  }
  console.clear();
  console.log();
  console.log(pc.bold(pc.cyan("agent-buddy status")));
  console.log(pc.dim("─".repeat(40)));
  if (dStatus.running) {
    console.log(pc.dim("  Daemon:    ") + pc.green("running"));
    console.log(pc.dim("  PID:       ") + pc.bold(String(dStatus.pid)));
    if (dStatus.port !== null) console.log(pc.dim("  Port:      ") + pc.bold(String(dStatus.port)));
    if (dStatus.uptimeMs !== null) console.log(pc.dim("  Uptime:    ") + pc.bold(formatUptime(dStatus.uptimeMs)));
  } else {
    console.log(pc.dim("  Daemon:    ") + pc.yellow("not running"));
  }
  console.log();
  // 기존 출력 (Repositories / Buddies / ...) 그대로
  ...
};
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/daemon-status.test.ts
```

Expected: 3개 테스트 PASS.

- [ ] **Step 6: 빌드 후 수동 검증**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm run build
node packages/cli/dist/cli.js status   # not running
node packages/cli/dist/cli.js start --port 3456
sleep 3
node packages/cli/dist/cli.js status   # running, port=3456, uptime
node packages/cli/dist/cli.js stop
```

- [ ] **Step 7: 커밋**

```bash
git add packages/cli/src/commands/daemon-status.ts \
  packages/cli/src/__tests__/daemon-status.test.ts \
  packages/cli/src/cli-main.ts
git commit -m "$(cat <<'EOF'
feat(cli): show daemon status (running, pid, port, uptime) on `status`

The existing `status` command keeps its config and job summary; a new
daemon section is rendered above it (and surfaced in --json output as
a `daemon` field). Stale PID files are cleaned up on read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `agent-buddy logs` 명령

**Goal:** `~/.agent-buddy/logs/agent-buddy.log` 마지막 N줄 출력 또는 follow 모드.

**Files:**
- Create: `packages/cli/src/commands/logs.ts`
- Create: `packages/cli/src/__tests__/logs-command.test.ts`
- Modify: `packages/cli/src/cli-main.ts`

- [ ] **Step 1: 실패 테스트**

Create `packages/cli/src/__tests__/logs-command.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("logsCommand", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-logs-"));
    process.env.AGENT_BUDDY_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("returns no-logs message when file missing", async () => {
    const { tailLogFile } = await import("../commands/logs.js");
    const out = await tailLogFile({ tail: 200 });
    expect(out).toMatch(/no logs yet/i);
  });

  it("returns last N lines", async () => {
    const { tailLogFile } = await import("../commands/logs.js");
    mkdirSync(join(home, "logs"), { recursive: true });
    const lines = Array.from({ length: 10 }, (_, i) => `line-${i + 1}`).join("\n") + "\n";
    writeFileSync(join(home, "logs", "agent-buddy.log"), lines);
    const out = await tailLogFile({ tail: 3 });
    expect(out).toContain("line-8");
    expect(out).toContain("line-9");
    expect(out).toContain("line-10");
    expect(out).not.toContain("line-7");
  });

  it("returns full content when tail > total lines", async () => {
    const { tailLogFile } = await import("../commands/logs.js");
    mkdirSync(join(home, "logs"), { recursive: true });
    writeFileSync(join(home, "logs", "agent-buddy.log"), "a\nb\nc\n");
    const out = await tailLogFile({ tail: 100 });
    expect(out).toContain("a");
    expect(out).toContain("b");
    expect(out).toContain("c");
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run packages/cli/src/__tests__/logs-command.test.ts
```

Expected: module not found.

- [ ] **Step 3: 구현**

Create `packages/cli/src/commands/logs.ts`:

```ts
import { existsSync, readFileSync, watch } from "node:fs";
import { runtimePaths } from "../daemon/runtime-paths.js";
import { promises as fsp } from "node:fs";

export interface TailOptions {
  tail: number;
}

export async function tailLogFile(opts: TailOptions): Promise<string> {
  const paths = runtimePaths();
  if (!existsSync(paths.logFile)) return "No logs yet.";
  const text = readFileSync(paths.logFile, "utf8");
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-opts.tail).join("\n");
}

export async function followLogFile(): Promise<void> {
  const paths = runtimePaths();
  if (!existsSync(paths.logFile)) {
    process.stdout.write("No logs yet. Waiting for daemon to write...\n");
  }
  let position = 0;
  if (existsSync(paths.logFile)) {
    const stat = await fsp.stat(paths.logFile);
    position = stat.size;
  }
  // print existing tail (200 lines) first
  process.stdout.write(await tailLogFile({ tail: 200 }) + "\n");
  watch(paths.logFile.replace(/\/[^/]+$/, ""), async (event, filename) => {
    if (filename !== "agent-buddy.log") return;
    if (!existsSync(paths.logFile)) return;
    const stat = await fsp.stat(paths.logFile);
    if (stat.size <= position) {
      position = stat.size;
      return;
    }
    const fd = await fsp.open(paths.logFile, "r");
    try {
      const buf = Buffer.alloc(stat.size - position);
      await fd.read(buf, 0, buf.length, position);
      process.stdout.write(buf.toString("utf8"));
    } finally {
      await fd.close();
    }
    position = stat.size;
  });
  // keep process alive
  await new Promise(() => { /* never resolves */ });
}
```

- [ ] **Step 4: cli-main에 logs 등록**

```ts
program
  .command("logs")
  .description("Show daemon logs")
  .option("--tail <n>", "Show last N lines", "200")
  .option("-f, --follow", "Follow log output", false)
  .action(async (opts: { tail: string; follow: boolean }) => {
    const mod = await import("./commands/logs.js");
    if (opts.follow) {
      await mod.followLogFile();
      return;
    }
    const tail = Math.max(1, Number.parseInt(opts.tail, 10) || 200);
    const out = await mod.tailLogFile({ tail });
    console.log(out);
  });
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run packages/cli/src/__tests__/logs-command.test.ts
```

Expected: 3개 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add packages/cli/src/commands/logs.ts \
  packages/cli/src/__tests__/logs-command.test.ts \
  packages/cli/src/cli-main.ts
git commit -m "$(cat <<'EOF'
feat(cli): agent-buddy logs (tail and -f follow)

tailLogFile reads the last N lines (default 200). followLogFile prints
the existing tail and watches for appends via fs.watch on the log dir.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `serve` deprecation alias

**Goal:** 기존 `agent-buddy serve [--port N]` 호출 시 stderr 경고 후 `start --foreground` 동작 (현재 호출자가 foreground 동작을 기대하므로 호환성 유지).

**Files:**
- Modify: `packages/cli/src/cli-main.ts`

- [ ] **Step 1: 기존 serve 핸들러를 alias로 변경**

`packages/cli/src/cli-main.ts`에서 기존:

```ts
program
  .command("serve")
  .description("Start the webhook server")
  .option("-p, --port <port>", "Server port", "3000")
  .action(async (opts: { port: string }) => {
    ... // 기존 직접 serve 호출
  });
```

대체:

```ts
program
  .command("serve")
  .description("[deprecated] alias for `start --foreground`")
  .option("-p, --port <port>", "Server port", "3000")
  .action(async (opts: { port: string }) => {
    process.stderr.write("[deprecated] `agent-buddy serve` is deprecated. Use `agent-buddy start [--foreground]`.\n");
    const { startCommand } = await import("./commands/start.js");
    const result = await startCommand({
      port: Number.parseInt(opts.port, 10) || 0,
      foreground: true,
    });
    if (result.code !== 0) console.error(pc.red(result.message));
    process.exit(result.code);
  });
```

- [ ] **Step 2: 빌드 후 수동 검증**

```bash
npm run build
node packages/cli/dist/cli.js serve --port 3457 &
PID=$!
sleep 1
# stderr에 deprecation 경고가 떠있어야 함
kill $PID 2>/dev/null
wait $PID 2>/dev/null
```

(stderr 확인은 visual. 자동 테스트로 만들 가치는 낮음.)

- [ ] **Step 3: 커밋**

```bash
git add packages/cli/src/cli-main.ts
git commit -m "$(cat <<'EOF'
refactor(cli): make `serve` a deprecation alias for `start --foreground`

Existing scripts that call `agent-buddy serve` keep working but get a
stderr warning. New code should use `start` (daemon) or
`start --foreground` (dev).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 빌드 산출물 sanity 테스트 + end-to-end smoke

**Goal:** `dist/cli.js`, `dist/dashboard/index.html`이 존재하고 spawn한 데몬이 정적 자산을 서빙하는지 확인.

**Files:**
- Create: `packages/cli/src/__tests__/build-output.test.ts`
- Create: `packages/cli/src/__tests__/daemon-e2e.test.ts`

- [ ] **Step 1: build-output 테스트**

Create `packages/cli/src/__tests__/build-output.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const cliDist = resolve(__dirname, "../../dist/cli.js");
const dashboardIndex = resolve(__dirname, "../../dist/dashboard/index.html");

describe("build output", () => {
  it("dist/cli.js exists and starts with shebang", () => {
    expect(existsSync(cliDist)).toBe(true);
    const head = readFileSync(cliDist, "utf8").slice(0, 20);
    expect(head.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("dist/dashboard/index.html exists", () => {
    expect(existsSync(dashboardIndex)).toBe(true);
  });

  it("`node dist/cli.js --version` prints 0.1.0", () => {
    const out = execFileSync(process.execPath, [cliDist, "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe("0.1.0");
  });

  it("`node dist/cli.js --help` lists start, stop, status, logs", () => {
    const out = execFileSync(process.execPath, [cliDist, "--help"], { encoding: "utf8" });
    expect(out).toContain("start");
    expect(out).toContain("stop");
    expect(out).toContain("status");
    expect(out).toContain("logs");
  });
});
```

- [ ] **Step 2: daemon-e2e 테스트**

Create `packages/cli/src/__tests__/daemon-e2e.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const cliDist = resolve(__dirname, "../../dist/cli.js");

function runCli(args: string[], env: NodeJS.ProcessEnv): { stdout: string; status: number } {
  try {
    const out = execFileSync(process.execPath, [cliDist, ...args], { encoding: "utf8", env });
    return { stdout: out, status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? ""),
      status: e.status ?? 1,
    };
  }
}

async function fetchUntilReady(url: string, timeoutMs: number): Promise<Response | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

describe("daemon end-to-end", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-e2e-"));
  });

  afterEach(() => {
    try { runCli(["stop"], { ...process.env, AGENT_BUDDY_HOME: home }); } catch { /* */ }
    rmSync(home, { recursive: true, force: true });
  });

  it("start → /api/health 200 → / serves dashboard html → stop", async () => {
    const port = 30000 + Math.floor(Math.random() * 1000);
    const env = { ...process.env, AGENT_BUDDY_HOME: home };

    const startResult = runCli(["start", "--port", String(port)], env);
    expect(startResult.status).toBe(0);
    expect(startResult.stdout).toMatch(/Started agent-buddy/);

    const health = await fetchUntilReady(`http://localhost:${port}/api/health`, 10000);
    expect(health).not.toBeNull();
    const healthJson = await health!.json() as { status: string };
    expect(healthJson.status).toBe("ok");

    const root = await fetch(`http://localhost:${port}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/html");

    const stopResult = runCli(["stop"], env);
    expect(stopResult.status).toBe(0);
  }, 30000);
});
```

- [ ] **Step 3: 테스트 실행 (build 선행)**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
npm run build
npx vitest run packages/cli/src/__tests__/build-output.test.ts \
                packages/cli/src/__tests__/daemon-e2e.test.ts
```

Expected:
- build-output 4개 PASS.
- daemon-e2e 1개 PASS (10-30초 소요).

만약 daemon-e2e가 실패하면 로그 확인:
```bash
cat $TMPDIR/ab-e2e-*/logs/agent-buddy.log
```

- [ ] **Step 4: 커밋**

```bash
git add packages/cli/src/__tests__/build-output.test.ts \
  packages/cli/src/__tests__/daemon-e2e.test.ts
git commit -m "$(cat <<'EOF'
test(cli): sanity tests for dist/cli.js shebang and end-to-end daemon

build-output verifies the bundled binary, version, help output, and
that dashboard assets ship with the package. daemon-e2e spawns the
daemon, fetches /api/health and /, then stops it cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 문서 갱신

**Goal:** README, CLAUDE.md, project-cli/server, DECISIONS.md, KNOWN_ISSUES.md, project-dashboard 변화 반영.

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/project-cli.md`
- Modify: `docs/project-server.md`
- Modify: `docs/architecture/DECISIONS.md`
- Modify: `docs/quality/KNOWN_ISSUES.md`

- [ ] **Step 1: README.md 사용법 갱신**

기존 README의 install/start 섹션을 다음 내용으로 변경 (section 위치는 README 내용에 맞춰):

```markdown
## Installation

```bash
npm install -g agent-buddy
```

## Quick start

```bash
agent-buddy init           # interactive setup (GitHub token, Anthropic key)
agent-buddy start          # spawn daemon (server + dashboard)
open http://localhost:3000 # dashboard
agent-buddy stop           # graceful shutdown
agent-buddy status         # daemon health, jobs summary
agent-buddy logs -f        # tail daemon logs
```

## CLI

| Command | Purpose |
|---|---|
| `agent-buddy start [--port N] [--foreground]` | Start daemon (or run in-foreground) |
| `agent-buddy stop` | Stop daemon |
| `agent-buddy status` | Daemon health + config + jobs |
| `agent-buddy logs [--tail N] [-f]` | Show / follow daemon logs |
| `agent-buddy buddy ...` | Manage buddy profiles |
| `agent-buddy repo ...` | Manage repositories |
| `agent-buddy review <owner/repo> <pr-number>` | One-shot review |
```

기존 `agent-buddy serve` 언급은 제거하거나 "deprecated, use start" 한 줄로.

- [ ] **Step 2: CLAUDE.md 갱신**

`CLAUDE.md`의 Monorepo Structure 섹션에 한 줄 추가:

```
packages/cli/dist/dashboard/  # vite build output, bundled into the published agent-buddy package
```

그리고 Buddy System 섹션 아래에 새 섹션 (Daemon Lifecycle) 추가:

```markdown
## Daemon Lifecycle

- `agent-buddy start` spawns a detached child via `child_process.spawn`. PID and port files live in `~/.agent-buddy/runtime/`. Logs go to `~/.agent-buddy/logs/agent-buddy.log`.
- `agent-buddy stop` sends SIGTERM and waits up to 35s before SIGKILL. Server graceful shutdown waits up to 30s for running jobs.
- `agent-buddy start --foreground` skips the spawn and runs the server in the current process — used for development.
```

- [ ] **Step 3: project-cli.md 갱신**

`docs/project-cli.md`의 `In Scope` 항목에 daemon 명령 추가:

```markdown
- `start` / `stop` / `status` / `logs` (daemon lifecycle)
- `buddy` 하위 명령 (create, list, delete, export, import)
- `repo` 하위 명령 (add, remove, list, rules)
- `review` 명령 (수동 PR 리뷰 실행)
- `doctor` 명령 (환경 설정 검증)
```

`Architecture` 섹션의 디렉터리 트리에 추가:

```
packages/cli/src/
├── commands/
│   ├── start.ts
│   ├── stop.ts
│   ├── daemon-status.ts
│   ├── logs.ts
│   ├── ...
├── daemon/
│   ├── run.ts            # 자식 프로세스가 실행하는 server entry
│   ├── runtime-paths.ts  # PID/port/log 파일 경로
│   ├── pidfile.ts        # atomic create/read/clear
│   ├── process-utils.ts  # isAlive, waitForExit
│   └── port-utils.ts     # isPortAvailable
├── cli.ts                # entry: __daemon__ 분기
├── cli-main.ts           # commander 설정
└── ...
```

- [ ] **Step 4: project-server.md 갱신**

`docs/project-server.md`의 `In Scope`에 추가:

```
- 정적 자산 SPA 서빙 (`serve({ port, dashboardDir })`로 활성화)
```

`Architecture` 섹션 디렉터리 트리의 `lib/`에 `static.ts` 추가.

- [ ] **Step 5: DECISIONS.md ADR 추가**

`docs/architecture/DECISIONS.md` 끝에 추가 (날짜는 2026-05-08):

```markdown
## 2026-05-08: Single npm package via tsup bundle

Status: accepted

`agent-buddy`는 외부에는 단일 npm 패키지로 노출하되 monorepo 구조는 유지한다. `packages/cli`를 tsup으로 번들해 `core`/`server`를 인라인 포함하고, dashboard build output을 `dist/dashboard/`로 복사. 사용자는 `npm install -g agent-buddy` 한 줄로 cli + 서버 + 대시보드 정적 자산을 모두 받는다. `core`/`server`/`dashboard`는 `"private": true`로 발행하지 않는다. 

대안 — 4개 패키지 별도 발행 또는 `agent-buddy` 메타 패키지 — 은 release surface와 버전 동기화 부담만 늘리고 사용자 가치는 동일하다.
```

- [ ] **Step 6: KNOWN_ISSUES.md 갱신**

`docs/quality/KNOWN_ISSUES.md`에 추가 (파일이 비어 있으면 헤더 포함):

```markdown
## Daemon log rotation 미구현

`~/.agent-buddy/logs/agent-buddy.log`는 추가만 되고 회전되지 않는다. 장시간 운영 시 디스크 사용량 증가. 임시 대처: `node packages/cli/dist/cli.js stop && rm ~/.agent-buddy/logs/agent-buddy.log && node ... start`. 회전(size 또는 time 기반)은 후속 작업.
```

- [ ] **Step 7: project-dashboard.md 한 줄 갱신**

`docs/project-dashboard.md`의 `In Scope`에 추가:

```
- 빌드 산출물은 `packages/cli/dist/dashboard/`로 복사되어 agent-buddy 단일 패키지의 일부로 발행됨
```

- [ ] **Step 8: doc-link 검사**

```bash
cd /Users/haklee/Projects/github.com/basement-agents/agent-buddy
node scripts/check-doc-links.mjs
```

Expected: 모든 링크 OK. 깨진 링크 있으면 수정.

- [ ] **Step 9: 커밋**

```bash
git add README.md CLAUDE.md docs/
git commit -m "$(cat <<'EOF'
docs: update for single-package distribution and daemon lifecycle

- README: install/quickstart/CLI table reflect npm i -g + start/stop/status/logs.
- CLAUDE.md: daemon lifecycle section + dist/dashboard layout note.
- project-cli/server/dashboard: in-scope and architecture trees updated.
- DECISIONS.md: ADR for the tsup single-package strategy.
- KNOWN_ISSUES.md: log rotation gap recorded.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: 전체 CI 베이스라인 통과 + 마지막 검증

**Goal:** `npm run typecheck`, `npm run lint`, `npm run test`, doc-link, lint-architecture가 모두 통과.

- [ ] **Step 1: doc link 검사**

```bash
node scripts/check-doc-links.mjs
```

Expected: PASS.

- [ ] **Step 2: dependency lint**

```bash
node scripts/lint-architecture.mjs
```

Expected: `Architecture rules pass.`

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: lint**

```bash
npm run lint
```

Expected: PASS (또는 기존 baseline 위반은 그대로).

- [ ] **Step 5: 전체 테스트**

```bash
npm run test -- --run
```

Expected: 모든 테스트 PASS. daemon-e2e는 30초까지 걸릴 수 있음.

- [ ] **Step 6: 실패 시 핀포인트 수정**

위 단계에서 깨진 게 있으면 그 task 단위로 수정 후 amend 아닌 새 커밋.

- [ ] **Step 7: 최종 수동 검증**

```bash
npm run build
node packages/cli/dist/cli.js start --port 3500
sleep 4
curl -fsS http://localhost:3500/api/health > /dev/null && echo "health OK"
curl -fsS http://localhost:3500/ > /dev/null && echo "dashboard OK"
node packages/cli/dist/cli.js status
node packages/cli/dist/cli.js stop
node packages/cli/dist/cli.js status
```

Expected:
- health OK
- dashboard OK
- status: running, port=3500
- stop: Stopped.
- status: not running

- [ ] **Step 8: 마무리 커밋 (필요한 경우만)**

수정 사항이 있으면 commit, 없으면 skip.

```bash
git status   # 변경 없으면 PR 준비 완료
```

---

## 참고: PR 만들 때 (사용자가 요청 시에만)

이 plan은 `feat/single-package-daemon` 브랜치에서 진행. 모든 task 완료 후 사용자가 PR을 요청하면:

```bash
git push -u origin feat/single-package-daemon
gh pr create --title "feat: single-package distribution + daemon lifecycle" --body "..."
```

PR body에는 spec 링크 + 주요 변경점 (publish 형태, daemon 명령) 요약. 사용자 명시 요청 전에는 push/PR 자동 생성 금지.
