# Magnus Opus

> OpenCode plugin for SvelteKit + Convex development with multi-agent orchestration

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

**Magnus Opus** is an [OpenCode](https://github.com/anomalyco/opencode) plugin that brings sophisticated multi-agent orchestration to **SvelteKit + Convex** development. It adapts concepts from the [MAG Claude Code plugins](https://github.com/MadAppGang/claude-code) to OpenCode's TypeScript plugin architecture, following the [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin patterns.

### Key Features

- **Multi-agent orchestration** - 11 specialized agents coordinated by a central orchestrator
- **Intelligent workflow detection** - Automatically routes UI_FOCUSED, API_FOCUSED, or MIXED tasks
- **Full-cycle implementation** - `/implement` command with 8+ phases and quality gates
- **Multi-model validation** - Parallel code review using multiple AI models with consensus analysis
- **Background agent execution** - True parallel execution via the 4-Message Pattern
- **Session-based artifacts** - Isolated session folders with metadata tracking
- **SvelteKit + Convex expertise** - Skills for Svelte 5 runes, SvelteKit 2, Convex patterns

### Architecture

Implementation details live in `PLAN.md`. Rationale and policy decisions live in `DECISIONS.md`.

Magnus Opus follows the **oh-my-opencode plugin pattern**:

```typescript
const MagnusOpusPlugin: Plugin = async (ctx) => {
  return {
    config: async (config) => {
      // Inject agents and MCPs via config mutation
      config.agent = { ...builtinAgents, ...existingAgents };
      config.mcp = { ...builtinMcps, ...existingMcp };
    },
    tool: { ... },                    // Custom commands
    event: async (input) => { ... },  // Event handling
    "tool.execute.before": ...,       // Tool lifecycle hooks
    "tool.execute.after": ...,
    "chat.message": ...,              // Message handling
  };
};
```

## Nix dev shell

This repo includes a minimal Nix flake to install Bun for local testing.

```bash
nix develop
bun install
bun run build
```

## Installation

### Quick Install (Recommended)

```bash
npx magnus-opus install
```

The interactive installer will:
1. Add **magnus-opus** to your OpenCode plugins
2. Optionally install **[opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)** for free Claude/Gemini access via Google OAuth
3. Optionally install **[mgrep](https://github.com/mixedbread-ai/mgrep)** for semantic code search

### Non-Interactive Install

```bash
# With all companion tools
npx magnus-opus install --no-tui --mgrep

# Magnus Opus only (no companions)
npx magnus-opus install --no-tui --no-antigravity --no-mgrep
```

### Manual Install

Add to your OpenCode configuration (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["magnus-opus"]
}
```

### Post-Install Steps

1. **Authenticate with Google** (if antigravity-auth installed):
   ```bash
   opencode auth login
   ```

2. **Enable semantic search** (if mgrep installed):
   ```bash
   mgrep watch  # Run in your project directory
   ```

### Companion Tools

| Tool | Description | Default |
|------|-------------|---------|
| [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) | Free Claude Opus 4.5, Sonnet 4.5, and Gemini 3 via Google OAuth | Yes |
| [mgrep](https://github.com/mixedbread-ai/mgrep) | Semantic code search by Mixedbread (replaces grep with natural language) | Prompted |

## Quick Start

```bash
# Start OpenCode
opencode

# Full-cycle feature implementation
/implement Create a user profile page with avatar upload

# Convex-only backend implementation
/implement-api Create user CRUD operations with real-time sync

# Design validation against Figma
/validate-ui Check navbar matches Figma design

# Multi-model code review
/review Review the authentication implementation

# Ultrawork mode - aggressive parallel execution
ultrawork Implement the complete dashboard with charts and data tables
```

## Agents

| Agent | Purpose | Model | Writes Code? |
|-------|---------|-------|--------------|
| `orchestrator` | Coordinates work, never writes code | Claude Opus 4 | Never |
| `architect` | Architecture planning | Claude Sonnet 4 | No |
| `developer` | SvelteKit implementation | Claude Sonnet 4 | Yes |
| `backend` | Convex implementation | Claude Sonnet 4 | Yes |
| `designer` | UI/design validation | Gemini 2.5 Pro | No (review) |
| `ui-developer` | UI fixes | Claude Sonnet 4 | Yes |
| `reviewer` | Code review | Configurable | No |
| `plan-reviewer` | Architecture review | Configurable | No |
| `tester` | Browser testing | Claude Haiku | No |
| `explorer` | Fast codebase search | Grok 4 | No |
| `cleaner` | Artifact cleanup | Claude Haiku | Yes (deletion) |

## Workflow Types

Magnus Opus automatically detects the type of work:

| Type | Description | Agents Used |
|------|-------------|-------------|
| **UI_FOCUSED** | Components, pages, styling | developer, designer, ui-developer |
| **API_FOCUSED** | Convex functions, schema | backend, TDD loop |
| **MIXED** | Both UI and API work | Parallel tracks |

## Commands

| Command | Purpose | Key Phases |
|---------|---------|------------|
| `/implement` | Full-cycle feature | Architecture → Implementation → Review → Testing |
| `/implement-api` | Convex backend only | Architecture → TDD → Review |
| `/validate-ui` | Design validation | Screenshot → Compare → Report |
| `/review` | Multi-model code review | Parallel reviews → Consensus |
| `/cleanup` | Session cleanup | List/remove artifacts |
| `/help` | Plugin documentation | - |

## Credits

- Inspired by [MAG Claude Code Plugins](https://github.com/MadAppGang/claude-code)
- Architecture based on [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin patterns
- Target platform: [OpenCode](https://github.com/anomalyco/opencode) by Anomaly

## License

MIT
