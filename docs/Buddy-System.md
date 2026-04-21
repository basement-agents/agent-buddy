# Buddy System

## Concept

A "buddy" is an AI persona that mimics a real code reviewer's review style, preferences, and communication patterns. The system analyzes past PR reviews to build a comprehensive profile.

## Profile Structure

Each buddy has three markdown files stored at `~/.agent-buddy/buddy/[id]/`:

### SOUL.md

Captures the reviewer's review philosophy and style:
- **Review Philosophy**: Overall approach to code reviews
- **Priorities**: What they value most in code
- **Communication Style**: How they give feedback
- **Pet Peeves**: Things that consistently trigger comments
- **Approval Criteria**: What must be true before they approve

### USER.md

Captures the reviewer's background and expertise:
- **Expertise Areas**: Domains/languages/frameworks they know best
- **Seniority Level**: junior, mid, senior, staff, or principal
- **Preferred Tools**: Tools and frameworks they recommend
- **Review Stats**: Based on analyzed data

### MEMORY.md

An index of specific review memories:
- Links to individual memory entries
- Each entry captures key learnings from a specific PR review
- Entries are named `org-repo-pr-[num].md`

## How Analysis Works

1. **Fetch**: Retrieve PRs reviewed by the target user from GitHub
2. **Extract**: Collect all review comments and review bodies
3. **Analyze**: Use LLM to identify patterns in review style
4. **Build**: Generate SOUL.md and USER.md from the analysis
5. **Store**: Save profiles and memory entries to filesystem

## Creating a Buddy

```bash
npx agent-buddy buddy analyze username --repo owner/repo
```

The system will:
1. Fetch up to 20 PRs (configurable with `--max-prs`)
2. Extract all reviews and comments by the user
3. Run LLM analysis on the review patterns
4. Generate SOUL.md and USER.md profiles
5. Create memory entries for each PR

## Using a Buddy

### Auto-review

Assign a buddy to a repo to use their style for all automatic reviews:

```bash
npx agent-buddy repo add owner/repo --buddy username
```

### Manual review

```bash
npx agent-buddy review owner/repo 42 --buddy username
```

### Updating

Buddies can be updated with new review data:

```bash
npx agent-buddy buddy update username --repo owner/repo
```

## Customization

You can manually edit SOUL.md and USER.md to fine-tune a buddy's behavior. The system reads these files directly when performing reviews.

## Storage

All buddy data is stored in `~/.agent-buddy/buddy/[id]/`:

```
~/.agent-buddy/
├── config.json
└── buddy/
    └── username/
        ├── SOUL.md
        ├── USER.md
        ├── MEMORY.md
        └── memory/
            ├── org-repo-pr-1.md
            ├── org-repo-pr-2.md
            └── ...
```
