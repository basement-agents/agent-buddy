# domain-buddy

A Buddy is a core domain object that defines an AI reviewer persona.

## Buddy Entity

```
Buddy {
  id: string              # Unique identifier (alphanumeric, dots, hyphens, underscores)
  name: string            # Display name
  soul: SoulDoc           # Review philosophy, priorities, communication style
  user: UserDoc           # Expertise areas, seniority, preferred tools
  memory: MemoryIndex      # Index of individual review memories
  createdAt: Date
  updatedAt: Date
}
```

## SOUL.md

Review philosophy, priorities, communication style.

```
# SOUL

## Review Philosophy
[How this buddy approaches code review]

## Priorities
- Priority 1
- Priority 2

## Communication Style
[How feedback is delivered]

## Focus Areas
- [Area 1]
- [Area 2]

## Anti-Patterns
[What this buddy flags aggressively]
```

## USER.md

Expertise areas, seniority, preferred tools.

```
# USER

## Expertise
- [Domain 1]
- [Domain 2]

## Seniority
[Junior / Mid / Senior / Staff / Principal]

## Preferred Tools
- [Tool 1]
- [Tool 2]

## Background
[Relevant experience]
```

## MEMORY.md

Index of individual review memories.

```
# MEMORY

## Reviews
| Date | PR | Summary | Tags |
|------|-----|---------|------|
| ... | ... | ... | ... |
```

## Storage

Path: `~/.agent-buddy/buddy/[id]/`

```
[ID]/
├── soul.md
├── user.md
├── memory.md
└── reviews/
    └── [review-id].md
```

## Operations

### Create Buddy
1. Validate ID (alphanumeric, dots, hyphens, underscores only)
2. Check for path traversal attack
3. Create directory structure
4. Initialize SOUL.md, USER.md, MEMORY.md with templates

### Delete Buddy
1. Verify buddy exists
2. Remove all files
3. Remove directory

### Export/Import
- Export: tar.gz archive of buddy directory
- Import: validate structure, extract to new ID
