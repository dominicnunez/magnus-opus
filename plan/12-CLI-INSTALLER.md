## 12. CLI and Installer

<!-- =============================================================================
WHY: Installer Design (btca research: oh-my-opencode)
================================================================================

1. NPX-BASED INSTALLER
   - oh-my-opencode uses `npx oh-my-opencode install` pattern
   - More user-friendly than manual JSON editing
   - Supports both interactive (TUI) and non-interactive modes

2. COMPANION TOOL INTEGRATION
   - antigravity-auth provides free Claude/Gemini via Google OAuth
   - mgrep provides semantic code search
   - Both enhance Magnus Opus but are optional

3. PLUGIN ORDERING MATTERS
   - antigravity-auth must come BEFORE other plugins
   - Handles authentication before plugins that use authenticated models

4. MGREP DELEGATION
   - mgrep has its own `install-opencode` command
   - Handles its own auth, MCP server, and tool file
   - No need to duplicate its integration logic

============================================================================= -->

### 12.1 Installer Overview

Magnus Opus provides an interactive installer for easy setup:

```bash
npx magnus-opus install
```

The installer:
1. Backs up existing `~/.config/opencode/opencode.json`
2. Prompts for companion tool installation
3. Configures plugins and model definitions
4. Delegates mgrep setup to `mgrep install-opencode`

### 12.2 Companion Tools

| Tool | Purpose | Default |
|------|---------|---------|
| opencode-antigravity-auth | Free Claude Opus 4.5, Sonnet 4.5, Gemini 3 via Google OAuth | Yes |
| mgrep | Semantic code search by Mixedbread | Yes (prompted) |

**opencode-antigravity-auth**: Required for any Google model access. Provides access to Claude and Gemini models through Google's Antigravity IDE quota via OAuth.

**mgrep**: Semantic code search that replaces grep with natural language queries. Syncs code to Mixedbread's cloud for indexing. Installs an MCP server and tool file via `mgrep install-opencode`.

### 12.3 Final opencode.json Structure

After full installation with all companion tools:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-antigravity-auth@latest",
    "magnus-opus@latest"
  ],
  "provider": {
    "google": {
      "name": "Google",
      "models": {
        "antigravity-gemini-3-pro": {
          "name": "Gemini 3 Pro (Antigravity)",
          "thinking": true,
          "attachment": true,
          "limit": { "context": 1048576, "output": 65535 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-gemini-3-flash": {
          "name": "Gemini 3 Flash (Antigravity)",
          "attachment": true,
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5 (Antigravity)",
          "attachment": true,
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking (Antigravity)",
          "attachment": true,
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "antigravity-claude-opus-4-5-thinking": {
          "name": "Claude Opus 4.5 Thinking (Antigravity)",
          "attachment": true,
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "gemini-2.5-pro": {
          "name": "Gemini 2.5 Pro (Gemini CLI)",
          "attachment": true,
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-2.5-flash": {
          "name": "Gemini 2.5 Flash (Gemini CLI)",
          "attachment": true,
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
      }
    }
  },
  "mcp": {
    "mgrep": {
      "type": "local",
      "command": ["mgrep", "mcp"],
      "enabled": true
    }
  }
}
```

### 12.4 CLI Implementation Structure

```
src/
├── cli/
│   ├── index.ts              # CLI entry point (commander.js)
│   └── commands/
│       └── install.ts        # Install command handler
├── installer/
│   ├── index.ts              # Main orchestration
│   ├── types.ts              # TypeScript types
│   ├── config-manager.ts     # Read/write/backup opencode.json
│   ├── prompts.ts            # Interactive TUI (@clack/prompts)
│   ├── antigravity.ts        # Antigravity plugin + model configs
│   └── mgrep.ts              # mgrep install helper (delegates to mgrep)
```

### 12.5 Non-Interactive Mode

For LLM agents or CI/CD automation:

```bash
# All companions (antigravity default yes, mgrep explicit)
npx magnus-opus install --no-tui --mgrep

# Skip antigravity (not recommended - loses Google model access)
npx magnus-opus install --no-tui --no-antigravity

# Magnus Opus only (no companion tools)
npx magnus-opus install --no-tui --no-antigravity --no-mgrep
```

### 12.6 Post-Install Steps

After installation, users must complete authentication:

```bash
# 1. Authenticate with Google (required for antigravity models)
opencode auth login

# 2. Enable semantic search (if mgrep installed)
mgrep login        # Authenticate with Mixedbread
mgrep watch        # Start background indexing in project directory
```

### 12.7 Using Without Antigravity Auth

If you decline antigravity-auth during installation (or prefer not to use Google OAuth), Magnus Opus still works with OpenCode's built-in free models:

| Model ID | Description | Best For |
|----------|-------------|----------|
| `opencode/grok-code` | Code-focused Grok | Fast exploration, code review |
| `opencode/big-pickle` | Community model | General tasks |
| `opencode/glm-4.7-free` | Free GLM model | General tasks |
| `opencode/gpt-5-nano` | Lightweight GPT | Quick responses |
| `opencode/minimax-m2.1-free` | Free MiniMax | General tasks |

**Limitations without antigravity-auth:**
- No access to Claude Opus 4.5, Sonnet 4.5 (thinking variants)
- No access to Gemini 3 Pro/Flash
- Free models may have rate limits
- Reduced capabilities for complex orchestration tasks

**Configuration for free models only:**

```json
{
  "agents": {
    "orchestrator": { "model": "opencode/grok-code" },
    "architect": { "model": "opencode/grok-code" },
    "reviewer": { "model": "opencode/grok-code" }
  },
  "reviewModels": {
    "codeReview": ["opencode/grok-code", "opencode/big-pickle"]
  }
}
```

For best results, we recommend using antigravity-auth to access Claude and Gemini models.