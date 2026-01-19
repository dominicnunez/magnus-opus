# AGENTS.md - Magnus Opus Development Guidelines

## Overview

Magnus Opus is an OpenCode plugin that brings multi-agent orchestration to SvelteKit + Convex development. This file contains instructions for AI agents working on this codebase.

**Key references:**
- `PLAN.md` - Detailed implementation specification (3,500+ lines)
- `README.md` - User-facing documentation
- `PRD.md` - Product requirements document

---

## btca Resource Reference

Use `btca` to query source repositories for up-to-date information. Always prefer btca over training data for questions about the technologies used in this project.

### Usage

```bash
# Single resource
btca ask --resource <resource> --question "<question>"

# Multiple resources
btca ask --resource opencode --resource oh-my-opencode --question "How do I define a plugin hook?"

# Interactive mode
btca chat --resource opencode
```

### Core Resources for Magnus Opus Development

| Resource | Description | Key Directories |
|----------|-------------|-----------------|
| `opencode` | OpenCode source - plugin API, SDK types, hooks | - |
| `oh-my-opencode` | Reference plugin patterns (use branch: dev) | - |
| `mag-cp` | MAG Claude Code orchestration patterns | Watch for Claude-specific patterns |

### Stack-Specific Resources

| Resource | Description | Key Directories |
|----------|-------------|-----------------|
| `sveltekit` | SvelteKit framework | `documentation` folder |
| `svelte` | Svelte docs website | `content` directory |
| `shadcn-svelte` | shadcn components for Svelte | - |
| `tailwind` | TailwindCSS source | - |

### Convex Resources

| Resource | Description | Key Directories |
|----------|-------------|-----------------|
| `convex-backend` | Convex backend source | `npm-packages/docs` folder |
| `convex-js` | TypeScript/JavaScript client library | - |
| `convex-helpers` | Utility library with helpers and patterns | - |
| `convex-workos` | WorkOS AuthKit integration | - |
| `convex-rate-limiter` | Rate limiter component | - |
| `convexStripe` | Stripe integration | - |

### Utility Resources

| Resource | Description |
|----------|-------------|
| `zod` | Schema validation (used for config) |
| `effect` | Effect-TS for typed error handling (optional) |
| `better-context` | btca CLI source code |

---

## Implementation References (in PLAN.md)

Implementation details live in `PLAN.md` to keep this file focused on instructions. Use these sections:

- OpenCode vs MAG implementation differences: **PLAN.md Section 1.4**
- Agent registration and AgentConfig format: **PLAN.md Section 2**
- Permission format and model providers: **PLAN.md Sections 2 and 5**
- Workflow routing and 4-message pattern: **PLAN.md Section 6**
- Session APIs (including `session.todo`): **PLAN.md Section 7**
- Hook inventory and hook implementations: **PLAN.md Section 11**

When porting MAG patterns, confirm OpenCode compatibility using PLAN Section 1.4 before implementing.

---

## File Creation Guidelines

Put new files where similar files already exist. Use this structure as the canonical map when adding new code:

```
magnus-opus/
├── AGENTS.md              # AI development guidelines (this file)
├── DECISIONS.md           # Rationale and policy decisions
├── PLAN.md                # Implementation specification
├── README.md              # User-facing documentation
├── PRD.md                 # Product requirements
├── flake.nix              # Nix dev shell
├── flake.lock             # Nix lockfile
├── package.json
├── tsconfig.json
├── magnus-opus.schema.json
├── content/
│   ├── skills/            # Skill markdown files (SVELTEKIT.md, CONVEX.md, etc.)
│   └── docs/              # Plugin documentation
└── src/
    ├── index.ts           # Plugin entry point
    ├── plugin-config.ts   # Config loader (Zod validation)
    ├── plugin-handlers/   # Hook registration wrappers
    ├── agents/            # Agent definitions
    ├── tools/             # Command tools (/implement, /review, etc.)
    ├── hooks/             # Event and tool hooks
    ├── workflows/         # Phase and gate definitions
    ├── sessions/          # Session management
    ├── skills/            # Skill loading and injection
    ├── mcp/               # MCP server configs
    ├── config/            # Zod schema and loaders
    ├── features/          # Background agents, context injection, etc.
    └── types/             # Core type re-exports + extensions
```

---

## Adding WHY Sections to PLAN.md

Every major section in PLAN.md should have a WHY comment block explaining the technical rationale. This helps future AI agents (and developers) understand design decisions.

**Why this matters:** Magnus Opus ports MAG patterns (Claude Code) to OpenCode, but the platforms differ significantly. MAG had workarounds (`PROXY_MODE`, `tools: {}` format) for limitations that don't exist in OpenCode. WHY sections prevent reimplementing unnecessary workarounds and document which patterns are OpenCode-native vs MAG adaptations.

### When to Add a WHY Section

Add a WHY section when:
- Creating a new section in PLAN.md
- The rationale for a pattern/approach isn't obvious
- Multiple valid approaches exist and one was chosen
- The pattern comes from external sources (MAG, oh-my-opencode)

### WHY Section Format

Use HTML comments so they're visible to AI but don't render in markdown:

```markdown
## X. Section Name

<!-- =============================================================================
WHY: Section Title (source of research)
================================================================================

1. FIRST KEY DECISION
   - Rationale point 1
   - Rationale point 2
   - Example or comparison

2. SECOND KEY DECISION
   - Why this approach over alternatives
   - Benefits and tradeoffs

============================================================================= -->

### X.1 Subsection
```

### Research Process

Before adding a WHY section, investigate using btca:

```bash
# Query relevant resources
btca ask --resource mag-cp --question "Why does MAG use [pattern]?"
btca ask --resource oh-my-opencode --question "How does oh-my-opencode implement [feature]?"
btca ask --resource opencode --question "What APIs does OpenCode provide for [use case]?"
```

### Key Topics to Address

For each major section, the WHY should cover:

| Section Type | Topics to Address |
|--------------|-------------------|
| **Agents** | Why this agent exists, why this model, why these permissions |
| **Tools** | Why this command, what problem it solves, why this interface |
| **Hooks** | Why this hook point, what it enables, execution order |
| **Workflows** | Why these phases, why these gates, skip conditions |
| **Config** | Why this schema, why Zod, validation requirements |
| **Patterns** | Why this pattern over alternatives, tradeoffs |

### Existing WHY Sections

PLAN.md currently has WHY sections in:
- Section 2 (Agents) - agent architecture design
- Section 3 (Tools) - command design and separation rationale
- Section 4 (MCP Servers) - server selection rationale
- Section 5 (Configuration) - why Zod
- Section 6 (Workflows) - phase system and quality gates
- Section 7 (Sessions) - file-based storage rationale
- Section 8 (Skills) - skills vs direct prompts
- Section 9 (Context Injection) - ContextCollector pattern
- Section 10.1 (BackgroundManager) - hybrid completion detection
- Section 11 (Hooks) - hook system architecture
- Section 11.2 (Todo Enforcer) - session.status() check
- Section 11.3 (Token Calculation) - complete token counting

Use these as templates for new sections.

### Updating Existing WHY Sections

When to update a WHY section:
- API changes that affect the rationale
- New btca research reveals better alternatives
- Pattern proves problematic in practice
- Corrections discovered (like session.todo() API existence)

How to update:
- Preserve decision history (add "UPDATE:" notes, don't just overwrite)
- Note the date and reason for the change
- If rationale changes significantly, add to Appendix as correction
- Cross-reference related corrections (e.g., "see Appendix D")

Example update format:
```markdown
<!-- UPDATE (2026-01-20): btca research confirmed session.todo() exists.
     Previous rationale about internal tracking no longer applies.
     See Appendix D for correction history. -->
```

---

## Implementation Reference

For detailed implementation specifications including:
- Full TypeScript code examples
- Complete file structure
- Phase and workflow definitions
- Hook implementations
- Session management patterns

See **PLAN.md** (3,500+ lines of detailed specifications).
