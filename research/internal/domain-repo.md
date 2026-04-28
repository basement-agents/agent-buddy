# domain-repo

Repo represents a GitHub repository configuration.

## Repo Entity

```
Repo {
  id: string              # owner/repo format
  webhookId: string?      # GitHub webhook ID
  buddyId?: string        # Assigned buddy ID
  rules: Rule[]           # Repo-specific rules
  enabled: boolean
  createdAt: Date
}
```

## Operations

### Add Repo
1. Validate owner/repo format
2. Check if already exists
3. Register webhook with GitHub
4. Store config

### Remove Repo
1. Remove webhook from GitHub
2. Delete config

### Update Rules
- Add/remove/edit rules per repo
- Rules are merged with global rules

## Known Unknowns

- Webhook secret validation timing
- Multi-org repo handling
