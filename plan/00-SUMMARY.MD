# Magnus Opus - Complete Implementation Plan

## Executive Summary

**Magnus Opus** is an OpenCode plugin that ports the MAG Claude Code plugin concepts to OpenCode, targeting **SvelteKit + Convex** as the development stack.

This plan follows the **oh-my-opencode architecture pattern** for OpenCode plugin integration, using the `config` hook to inject agents and MCP servers programmatically.

### Goals
1. Port MAG's multi-agent orchestration workflows to OpenCode's plugin architecture
2. Adapt all patterns for SvelteKit (frontend) and Convex (backend)
3. Maintain MAG's sophisticated phase system, quality gates, and multi-model validation
4. Use local file-based persistence (no external database for the plugin itself)

### Non-Goals
- Not depending on oh-my-opencode code; patterns are referenced/adapted only
- Not implementing oh-my-opencode specific features.
- Not maintaining Claude Code compatibility (OpenCode only)
- Not building a new marketplace system

---

## Architecture Overview

### Implementation Decisions

See `DECISIONS.md` for OpenCode vs MAG differences and orchestration policy decisions.

### OpenCode Plugin Integration Pattern

Magnus Opus follows the **oh-my-opencode pattern** for plugin integration.

Rationale and scope decisions live in `DECISIONS.md` (Decisions 004–005).

## Success Criteria

The plugin is complete when:

- [ ] Plugin loads successfully in OpenCode
- [ ] All agents are injected via config hook
- [ ] All MCP servers are injected via config hook
- [ ] /implement runs full 8+ phase workflow
- [ ] /implement-api runs API-focused workflow
- [ ] Multi-model review works with OpenCode's native multi-model support
- [ ] Sessions provide artifact isolation
- [ ] Quality gates enforce user approvals
- [ ] Configuration allows model/agent customization
- [ ] Documentation is complete
- [ ] delegate_task enables parallel agent execution
- [ ] background_task enables simple direct background launches
- [ ] BackgroundManager tracks async agent tasks
- [ ] 4-Message Pattern documented and supported

## Appendix

### Appendix A: Key Differences from Original Plan

| Aspect | Original Plan | Revised Plan |
|--------|---------------|--------------|
| Agent Registration | Return `agent:` property | Use `config` hook mutation |
| MCP Registration | Return `mcp:` property | Use `config` hook mutation |
| Plugin Type | `Plugin<PluginConfig>` | `Plugin` (no generic) |
| Config Hook | Returned modified config | Mutates config in place |
| Agent Files | Functions returning AgentConfig | Objects exported directly |
| Skill System | Code-based loaders | Markdown files + BuiltinSkill objects |

---

### Appendix B: Review Corrections Applied (2026-01-18)

This plan was reviewed against three goals:
1. OpenCode as the target platform (not Claude Code)
2. oh-my-opencode plugin patterns (local types, config hook mutation, chat.message hook)
3. MAG Claude Code concepts (multi-agent orchestration, quality gates, workflows)

#### Corrections Applied

| Issue | Original | Corrected |
|-------|----------|-----------|
| Type imports | Local `src/types/plugin.ts` claiming `@opencode-ai/plugin` doesn't exist | Import from `@opencode-ai/plugin` and `@opencode-ai/sdk`; only extend locally |
| AgentConfig tools | Used deprecated `tools: { write: false }` | Use `permission: { write: "deny" }` (permission-only) |
| PluginInput docs | Only documented `ctx.directory` | Documented all: `client`, `directory`, `project`, `worktree`, `serverUrl`, `$` |
| Session API | Initially assumed `session.todo()` didn't exist | Confirmed API exists; use native `ctx.client.session.todo()` (see Appendix E) |
| Model providers | Used `xai/grok-4` | Use `opencode/grok-code` (available in OpenCode) |
| Haiku model ID | Used `anthropic/claude-haiku` | Use `anthropic/claude-haiku-4-5` (4.5 series) |

#### Verified Patterns (Correct in Original)

- Config hook mutation pattern for agent/MCP injection
- `chat.message` hook for agent variants and keyword detection
- Experimental hooks (`chat.system.transform`, `chat.messages.transform`)
- ContextCollector pattern for dynamic context injection
- Session state tracking (main session, per-session agent)
- All MAG concepts: workflow detection, phase system, quality gates, multi-model review

#### Package Dependencies Added

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.1.25",
    "@opencode-ai/sdk": "^1.1.25",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "bun-types": "^1.3.6"
  }
}
```

Versions verified via npm registry on 2026-01-18.

---

### Appendix C: Smoke Test Findings (Derived From Actual Testing)

The following findings were validated by running OpenCode locally (Nix dev shell + `opencode run`) against the smoke plugin in `src/index.ts`:

- `smoke` tool executes successfully and returns session/message IDs.
- `background_task` can create child sessions and post prompts when using the session ID returned from `session.create`.
- `background_output` successfully retrieves the last assistant output when given the background session ID (example output: `Background task output: Ran.`).
- `chat.message` variant override test (`variant-test`) triggered an interactive OpenCode question during `opencode run`; the hook fired, but the run timed out waiting for input. This should be re-validated in an interactive session.

These results come from actual runtime testing (not btca), so they reflect current OpenCode behavior as of 2026-01-19.


For AI agent development guidelines, btca resource references, and OpenCode vs Claude Code differences, see **AGENTS.md**.

---

### Appendix E: Review Corrections Applied (2026-01-18 Update 2)

Additional patterns added from oh-my-opencode analysis:

| Pattern | Section | Description |
|---------|---------|-------------|
| First Message Variant Gate | 11.1.1 | Robust gate pattern replacing simple Set |
| Tool Output Truncator | 11.3 | Context-aware output truncation |
| Dynamic Truncator | 11.3 | Session-aware truncation with token estimation |
| Model Context Caching | 5.3 | Cache provider model limits |
| Consensus Analysis | 6.3 | Multi-model review prioritization |
| OpenCode vs MAG differences | Section 1.4 | PROXY_MODE not needed, native model support |
| Legacy tools clarification | Section 1.4 | Use `permission` only, no migration needed |
| Session API note | AGENTS.md | `session.todo()` API exists for reading todos |
| btca resource reference | AGENTS.md | Correct resource names for queries |

---

### Appendix F: Available Models (2026-01-18)

Models available in OpenCode for use in agent configurations. Models without dates are aliases pointing to the latest version; dated models are pinned snapshots for reproducibility.

## Models

### OpenCode Free/Community Models

| Model ID | Description |
|----------|-------------|
| `opencode/big-pickle` | Community model |
| `opencode/glm-4.7-free` | Free GLM model |
| `opencode/gpt-5-nano` | Lightweight GPT variant |
| `opencode/grok-code` | Code-focused Grok |
| `opencode/minimax-m2.1-free` | Free MiniMax model |

### Anthropic Claude 4.5 Models

| Model ID | Type | Notes |
|----------|------|-------|
| `anthropic/claude-haiku-4-5` | Alias | Points to latest Haiku 4.5 |
| `anthropic/claude-sonnet-4-5` | Alias | Points to latest Sonnet 4.5 |
| `anthropic/claude-opus-4-5` | Alias | Points to latest Opus 4.5 |

### OpenAI Models

| Model ID | Description |
|----------|-------------|
| `openai/gpt-5.2` | Latest GPT-5.2 |
| `openai/gpt-5.2-codex` | Code-optimized GPT-5.2 |

### Google Models (via opencode-antigravity-auth)

Google models require the `opencode-antigravity-auth` plugin, which provides free access via Google OAuth. The installer (`npx magnus-opus install`) configures this automatically.

**Antigravity Quota (Claude + Gemini 3):**

| Model ID | Description |
|----------|-------------|
| `google/antigravity-claude-opus-4-5-thinking` | Claude Opus 4.5 with extended thinking |
| `google/antigravity-claude-sonnet-4-5-thinking` | Claude Sonnet 4.5 with extended thinking |
| `google/antigravity-claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `google/antigravity-gemini-3-pro` | Gemini 3 Pro with thinking |
| `google/antigravity-gemini-3-flash` | Gemini 3 Flash |

**Gemini CLI Quota (separate pool):**

| Model ID | Description |
|----------|-------------|
| `google/gemini-2.5-pro` | Gemini 2.5 Pro |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash |

Setup: Run `npx magnus-opus install` then `opencode auth login`.

### Model Selection Guidelines

| Use Case | Recommended Model |
|----------|-------------------|
| Orchestration | `anthropic/claude-opus-4-5` |
| Architecture/Planning | `anthropic/claude-sonnet-4-5` |
| Implementation | `anthropic/claude-sonnet-4-5` |
| Fast exploration | `anthropic/claude-haiku-4-5` or `opencode/grok-code` |
| Code review | `anthropic/claude-sonnet-4-5` |
| Design validation | `google/antigravity-gemini-3-pro` |
| Cost-sensitive tasks | `opencode/*` free models or `anthropic/claude-haiku-4-5` |
