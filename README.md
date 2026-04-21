# Agent Buddy

AI code review bot that learns reviewer personas from past PR reviews and performs intelligent code reviews.

## Features

- **Buddy System**: Create AI personas ("buddies") that learn from real code reviewers' history
- **Dual Review Modes**: Low-context (diff-based) and high-context (impact analysis) reviews
- **Webhook Integration**: Automatic reviews on PR events via GitHub webhooks
- **Dashboard**: React-based UI for managing repos, buddies, and reviews
- **CLI**: Full-featured command-line interface
- **Multi-Repo Support**: Monitor and review across multiple repositories
- **Custom Rules**: Define repository-specific review rules with regex patterns
- **Scheduling**: Configure periodic review checks for open PRs
- **Feedback System**: Track and learn from feedback on review comments
- **Settings API**: Manage configuration via REST API

## Architecture

```
agent-buddy/
├── packages/
│   ├── core/          # Core library (types, storage, analysis, review engine)
│   ├── cli/           # Commander.js CLI
│   ├── server/        # Hono API server + webhook handler
│   └── dashboard/     # React + Vite + Tailwind dashboard
├── turbo.json
└── package.json
```

## Quick Start

### Prerequisites

- Node.js 22+
- GitHub Personal Access Token (repo + pull_request scopes)
- Anthropic API key

### Installation

```bash
npm install
npm run build
```

### CLI Usage

```bash
# Initialize configuration
npx agent-buddy init

# Add a repository
npx agent-buddy repo add owner/repo

# Create a buddy from a reviewer's history
npx agent-buddy buddy analyze username --repo owner/repo

# Perform a manual review
npx agent-buddy review owner/repo 42

# Start the webhook server
npx agent-buddy serve --port 3000
```

### Dashboard

```bash
# Start the server
npx agent-buddy serve

# In another terminal, start the dashboard dev server
cd packages/dashboard && npm run dev
```

## Configuration

Configuration is stored at `~/.agent-buddy/config.json`:

```json
{
  "version": "1.0.0",
  "repos": [
    {
      "id": "owner/repo",
      "owner": "owner",
      "repo": "repo",
      "autoReview": true,
      "triggerMode": "pr_opened"
    }
  ],
  "server": {
    "port": 3000,
    "webhookSecret": "your-secret",
    "apiKey": "your-api-key"
  },
  "review": {
    "defaultSeverity": "suggestion",
    "maxComments": 50
  }
}
```

## Buddy System

A "buddy" is an AI persona that mimics a real code reviewer's style. Buddies learn from:

- **SOUL.md**: Review philosophy, priorities, communication style
- **USER.md**: Expertise areas, seniority level, preferred tools
- **MEMORY.md**: Index of specific review memories

Buddies are stored at `~/.agent-buddy/buddy/[id]/`.

### Creating a Buddy

```bash
npx agent-buddy buddy analyze reviewer-username --repo owner/repo
```

This analyzes the reviewer's past PR reviews to build a comprehensive profile.

### Using a Buddy for Reviews

Assign a buddy to a repo, and all automatic reviews will use that buddy's style:

```bash
npx agent-buddy repo add owner/repo --buddy reviewer-username
```

## Advanced Features

### Custom Rules

Define repository-specific review rules using regex patterns:

```bash
# Via API
curl -X POST http://localhost:3000/api/repos/owner/repo/rules \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "id": "no-console",
    "name": "No console.log",
    "description": "Remove console.log statements in production code",
    "pattern": "console\\.log\\(",
    "severity": "warning",
    "enabled": true
  }'
```

Rules are automatically evaluated during reviews and generate comments for matching code.

### Scheduled Reviews

Configure periodic checks for open PRs:

```bash
# Enable scheduling for a repo
curl -X POST http://localhost:3000/api/repos/owner/repo/schedule \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "enabled": true,
    "intervalMinutes": 60
  }'
```

The server will check for open PRs at the specified interval and create reviews if none exist in the last 24 hours.

### Feedback System

Track feedback on review comments to improve buddy performance:

```bash
# Record feedback
curl -X POST http://localhost:3000/api/buddies/buddy-id/feedback \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "reviewId": "review-123",
    "commentId": "comment-456",
    "wasHelpful": true,
    "userResponse": "This caught an important issue"
  }'

# Get feedback summary
curl http://localhost:3000/api/buddies/buddy-id/feedback \
  -H "x-api-key: YOUR_API_KEY"
```

### Settings API

Manage configuration via the REST API:

```bash
# Get all settings
curl http://localhost:3000/api/config \
  -H "x-api-key: YOUR_API_KEY"

# Update server settings
curl -X PATCH http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "server": {
      "port": 3001,
      "webhookSecret": "new-secret"
    }
  }'
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Development mode
npm run dev

# Type checking
npm run typecheck
```

## License

MIT
