# project-cli

## Goal

Commander.js 기반 CLI 도구. Buddy 관리, 리포지토리 설정, 수동 리뷰 실행을 지원한다.

## Path

```
packages/cli/src/
```

## Users

- 개발자: CLI를 통해 buddy 생성/조회, 리포지토리 등록, 수동 리뷰 실행

## In Scope

- `buddy` 하위 명령 (create, list, delete, export, import)
- `repo` 하위 명령 (add, remove, list, rules)
- `review` 명령 (수동 PR 리뷰 실행)
- `doctor` 명령 (환경 설정 검증)

## Out of Scope

- 서버 실행 (server 패키지)
- 대시보드 실행 (dashboard 패키지)

## Architecture

```
packages/cli/src/
├── commands/
│   ├── buddy.ts      # buddy 관리 명령
│   ├── repo.ts       # repo 관리 명령
│   ├── review.ts     # review 명령
│   └── doctor.ts     # doctor 명령
├── index.ts          # CLI entry point
└── types.ts         # CLI-specific types
```
