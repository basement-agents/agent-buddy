# CLI Reference

## Commands

### `agent-buddy init`

Initialize agent-buddy configuration.

Creates `~/.agent-buddy/` directory structure and prompts for GitHub token and Anthropic API key.

```bash
npx agent-buddy init
```

### `agent-buddy serve`

Start the webhook server.

```bash
npx agent-buddy serve [--port <port>]
```

Options:
- `-p, --port <port>` - Server port (default: 3000)

### `agent-buddy review`

Perform a manual code review on a PR.

```bash
npx agent-buddy review <owner/repo> <pr-number> [--buddy <id>] [--high-context]
```

Options:
- `--buddy <id>` - Use a specific buddy profile
- `--high-context` - Enable high-context analysis

### `agent-buddy repo`

Manage repositories.

#### `agent-buddy repo add <owner/repo>`

Add a repository to monitor.

```bash
npx agent-buddy repo add owner/repo [--buddy <id>]
```

Options:
- `-b, --buddy <id>` - Pre-assign a buddy

#### `agent-buddy repo list`

List configured repositories.

#### `agent-buddy repo remove <owner/repo>`

Remove a repository.

### `agent-buddy buddy`

Manage buddy profiles.

#### `agent-buddy buddy analyze <username>`

Create a buddy from a reviewer's history.

```bash
npx agent-buddy buddy analyze <username> --repo <owner/repo> [--max-prs <number>]
```

Options:
- `-r, --repo <owner/repo>` - Repository to analyze (required)
- `--max-prs <number>` - Max PRs to analyze (default: 20)

#### `agent-buddy buddy list`

List all buddies.

```bash
npx agent-buddy buddy list [--verbose]
```

#### `agent-buddy buddy show <id>`

Show full buddy profile.

#### `agent-buddy buddy update <id>`

Update buddy with new review data.

```bash
npx agent-buddy buddy update <id> [--repo <owner/repo>]
```

#### `agent-buddy buddy delete <id>`

Delete a buddy.

## Environment Variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GH_TOKEN` | Alternative to GITHUB_TOKEN |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `LOG_LEVEL` | Log level (debug, info, warn, error) |

## Common Workflows

### Setup from scratch

```bash
npx agent-buddy init
npx agent-buddy repo add my-org/my-repo
npx agent-buddy buddy analyze senior-dev --repo my-org/my-repo
npx agent-buddy serve
```

### Manual review with buddy

```bash
npx agent-buddy review my-org/my-repo 123 --buddy senior-dev --high-context
```

### Update buddy with new reviews

```bash
npx agent-buddy buddy update senior-dev --repo my-org/my-repo
```
