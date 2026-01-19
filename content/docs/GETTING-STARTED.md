# Getting Started with Magnus Opus

## Prerequisites

- [OpenCode](https://opencode.ai) installed
- Node.js 20+ (or Bun)
- A SvelteKit + Convex project (or willingness to create one)

## Installation

### Option 1: Interactive Installer (Recommended)

```bash
npx magnus-opus install
```

The installer will guide you through:
1. Adding magnus-opus to your OpenCode plugins
2. Installing **opencode-antigravity-auth** for free Claude/Gemini access (recommended)
3. Installing **mgrep** for semantic code search (optional)

### Option 2: Non-Interactive

```bash
# With all companion tools
npx magnus-opus install --no-tui --mgrep

# Magnus Opus only
npx magnus-opus install --no-tui --no-antigravity --no-mgrep
```

### Option 3: Manual

Add magnus-opus to your OpenCode configuration (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["magnus-opus"]
}
```

### Post-Install Steps

After installation, complete the setup:

```bash
# 1. Authenticate with Google (if antigravity-auth installed)
opencode auth login

# 2. Enable semantic search (if mgrep installed)
mgrep watch  # Run in your project directory
```

### Verify Installation

```bash
opencode
/help
```

You should see magnus-opus commands listed.

## Companion Tools

Magnus Opus works great on its own, but these optional companions enhance the experience:

### opencode-antigravity-auth

Provides **free access** to Claude Opus 4.5, Claude Sonnet 4.5, and Gemini 3 models via Google OAuth. This means you can use Magnus Opus's full agent capabilities without separate API subscriptions.

- [GitHub](https://github.com/NoeFabris/opencode-antigravity-auth)
- **Setup**: Run `opencode auth login` after installation

### mgrep

Semantic code search by [Mixedbread](https://mixedbread.com). Instead of regex-based grep, search your codebase with natural language queries like "where do we handle authentication?"

- [GitHub](https://github.com/mixedbread-ai/mgrep)
- **Setup**: Run `mgrep login` then `mgrep watch` in your project
- **Note**: Syncs code to Mixedbread's cloud for indexing

## Quick Start

### Your First Implementation

```bash
# Start OpenCode in your project directory
cd my-sveltekit-convex-project
opencode

# Run a simple implementation
/implement Create a user profile component that displays name, email, and avatar
```

The workflow will:
1. Create a session for tracking
2. Detect this is UI work
3. Launch architect to plan
4. Ask for your approval
5. Implement with developer agent
6. Validate design (if Figma provided)
7. Review code
8. Present final result

### Backend-Only Work

For Convex functions without UI:

```bash
/implement-api Create CRUD operations for a blog posts table with author reference
```

### Code Review

Get multi-model review of existing code:

```bash
/review src/lib/components/UserCard.svelte
```

## Configuration

Create `~/.config/opencode/magnus-opus.json`:

```json
{
  "agents": {
    "orchestrator": {
      "model": "anthropic/claude-opus-4"
    }
  },
  "reviewModels": {
    "codeReview": ["openrouter/grok-4", "google/gemini-2.5-flash"],
    "autoUse": true
  }
}
```

## Understanding Sessions

Each `/implement` creates a session folder:

```
ai-docs/sessions/impl-20260118-143052-abc123/
├── session-meta.json       # Progress tracking
├── implementation-plan.md  # Architecture plan
├── quick-reference.md      # Implementation checklist
└── reviews/
    └── code-review/
        └── consolidated.md # Review results
```

Sessions persist your work and enable recovery if interrupted.

## Next Steps

- Read [Agents](AGENTS.md) to understand the specialized agents
- Read [Workflows](WORKFLOWS.md) to learn about UI/API/Mixed workflows
- Read [Configuration](CONFIGURATION.md) for advanced options

## Troubleshooting

### "Agent not found"

Make sure magnus-opus is in your OpenCode plugin list.

### "External model failed"

Check that the model is configured in your OpenCode provider settings. Run `opencode config` to verify available models and provider credentials.

### "Session directory not created"

Ensure you have write permissions to `ai-docs/` directory.

## Getting Help

```bash
/help              # All topics
/help agents       # Agent reference
/help workflows    # Workflow types
/help config       # Configuration options
```
