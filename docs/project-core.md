# project-core

## Goal

Shared types, interfaces, and utilities for Agent Buddy.

## Path

```
packages/core/src/
```

## Users

- CLI, Server, Dashboard 모두 import하여 사용

## In Scope

- 공통 타입 정의 (Buddy, Review, Rule 등)
- LLM provider abstraction
- GitHub client utilities
- Storage interface definitions

## Out of Scope

- CLI-specific logic
- Server-specific logic
- Dashboard-specific UI logic
