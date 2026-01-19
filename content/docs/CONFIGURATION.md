# Configuration Guide

Magnus Opus can be configured via `~/.config/opencode/magnus-opus.json`.

## Full Configuration Schema

```json
{
  "agents": {
    "orchestrator": { "model": "anthropic/claude-opus-4" },
    "architect": { "model": "anthropic/claude-sonnet-4" },
    "developer": { "model": "anthropic/claude-sonnet-4" },
    "backend": { "model": "anthropic/claude-sonnet-4" },
    "designer": { "model": "google/gemini-2.5-pro" },
    "ui-developer": { "model": "anthropic/claude-sonnet-4" },
    "reviewer": { "model": "anthropic/claude-sonnet-4" },
    "plan-reviewer": { "model": "anthropic/claude-sonnet-4" },
    "tester": { "model": "anthropic/claude-haiku" },
    "explorer": { "model": "openrouter/grok-4" },
    "cleaner": { "model": "anthropic/claude-haiku" }
  },
  "disabled_agents": [],
  "disabled_mcps": [],
  "disabled_skills": [],
  "reviewModels": {
    "planReview": ["openrouter/grok-4", "openai/gpt-5"],
    "codeReview": ["openrouter/grok-4", "google/gemini-2.5-flash"],
    "autoUse": false
  },
  "sessionSettings": {
    "includeDescriptor": true,
    "autoCleanup": false,
    "retentionDays": 30
  }
}
```

## Agent Configuration

### Override Agent Models

```json
{
  "agents": {
    "orchestrator": { "model": "anthropic/claude-opus-4" },
    "developer": { "model": "anthropic/claude-sonnet-4" }
  }
}
```

### Disable Agents

```json
{
  "disabled_agents": ["cleaner", "explorer"]
}
```

Disabled agents won't be loaded. Workflows using those agents will fail gracefully.

## MCP Configuration

### Disable MCP Servers

```json
{
  "disabled_mcps": ["figma", "websearch"]
}
```

Available MCPs:
- `websearch` - Exa AI web search
- `context7` - Documentation lookup
- `grep_app` - GitHub code search
- `chrome-devtools` - Browser automation
- `figma` - Figma integration

## Review Models

### Configure External Models

```json
{
  "reviewModels": {
    "planReview": ["openrouter/grok-4", "openai/gpt-5"],
    "codeReview": ["openrouter/grok-4", "google/gemini-2.5-flash"],
    "autoUse": true
  }
}
```

### Available Models

| Model | ID | Use Case | Cost |
|-------|-----|----------|------|
| Grok 4 | `openrouter/grok-4` | Fast coding | ~$0.10 |
| GPT-5 | `openai/gpt-5` | Advanced reasoning | ~$0.25 |
| MiniMax M2 | `minimax/minimax-m2` | Pattern recognition | ~$0.15 |
| Gemini Flash | `google/gemini-2.5-flash` | Balanced | ~$0.05 |
| Gemini Flash 2 | `google/gemini-2.0-flash` | Fast/Free tier | FREE |

### Auto-Use Mode

When `autoUse: true`:
- Skip model selection UI
- Use configured models automatically
- Faster workflow execution

## Session Settings

### Descriptors

```json
{
  "sessionSettings": {
    "includeDescriptor": true
  }
}
```

When true, prompts for session descriptor:
- `impl-20260118-143052-abc123-user-profile`

When false:
- `impl-20260118-143052-abc123`

### Auto Cleanup

```json
{
  "sessionSettings": {
    "autoCleanup": true,
    "retentionDays": 7
  }
}
```

Automatically clean sessions older than `retentionDays`.

## Environment Variables

Some features require environment variables:

```bash
# For Exa web search
export EXA_API_KEY="your-key"

# For Figma integration
export FIGMA_ACCESS_TOKEN="your-token"
```

Note: Model provider credentials are configured through OpenCode's provider settings, not through Magnus Opus directly.

## Project-Level Configuration

Create `.opencode/magnus-opus.json` in your project for project-specific settings:

```json
{
  "reviewModels": {
    "codeReview": ["openrouter/grok-4"],
    "autoUse": true
  }
}
```

Project config is merged with user config (project takes precedence).

## Default Configuration

If no config file exists, these defaults are used:

```json
{
  "agents": {},
  "disabled_agents": [],
  "disabled_mcps": [],
  "disabled_skills": [],
  "reviewModels": {
    "planReview": ["openrouter/grok-4", "openai/gpt-5"],
    "codeReview": ["openrouter/grok-4", "google/gemini-2.5-flash"],
    "autoUse": false
  },
  "sessionSettings": {
    "includeDescriptor": true,
    "autoCleanup": false,
    "retentionDays": 30
  }
}
```

## Troubleshooting

### "Model not found"

Ensure the model ID is correct (use OpenCode format: `provider/model-name`) and that the provider is configured in your OpenCode settings.

### "MCP server failed to start"

Check that required environment variables are set (e.g., `FIGMA_ACCESS_TOKEN`).

### "Configuration not loading"

Ensure JSON is valid. Use a JSON validator to check syntax.
