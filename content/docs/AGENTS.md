# Agents Reference

Magnus Opus uses specialized agents for different tasks. The orchestrator coordinates all work, delegating to specialists.

## Agent Overview

| Agent | Role | Writes Code? | Default Model |
|-------|------|--------------|---------------|
| orchestrator | Coordinates workflow | ❌ Never | Claude Opus 4 |
| architect | Plans architecture | ❌ No | Claude Sonnet 4 |
| developer | SvelteKit frontend | ✅ Yes | Claude Sonnet 4 |
| backend | Convex functions | ✅ Yes | Claude Sonnet 4 |
| designer | Design validation | ❌ No | Gemini 2.5 Pro |
| ui-developer | UI fixes | ✅ Yes | Claude Sonnet 4 |
| reviewer | Code review | ❌ No | Configurable |
| plan-reviewer | Plan review | ❌ No | Configurable |
| tester | Testing | ❌ No | Claude Haiku |
| explorer | Codebase search | ❌ No | Grok 4 |
| cleaner | Cleanup | ✅ Deletion | Claude Haiku |

## Orchestrator

**The conductor of the orchestra.**

The orchestrator NEVER writes code directly. It:
- Detects workflow type (UI/API/Mixed)
- Creates sessions and tracks progress
- Delegates to specialized agents
- Enforces quality gates
- Manages iteration loops
- Reports to user

**Constraints:**
- Can use: Task, Bash, Read, Glob, Grep, TodoWrite, AskUserQuestion
- Cannot use: Write, Edit

## Architect

**The planner.**

Creates comprehensive implementation plans:
- Gap analysis (asks clarifying questions)
- Data model design (Convex schema)
- API design (queries, mutations, actions)
- Component structure (SvelteKit routes)
- Implementation phases
- Risk assessment
- Time estimates

**Output:**
- `implementation-plan.md` - Detailed plan
- `quick-reference.md` - Checklist

## Developer

**The SvelteKit expert.**

Implements frontend code:
- Svelte 5 components with runes
- SvelteKit routes and layouts
- Form actions and load functions
- Tailwind CSS styling
- shadcn-svelte components

**Expertise:**
- $state, $derived, $effect, $props
- +page.svelte, +page.server.ts
- Real-time subscriptions with convex-svelte

## Backend

**The Convex expert.**

Implements backend code:
- Schema definitions
- Queries (read, real-time)
- Mutations (write, transactional)
- Actions (external APIs)
- Internal functions
- Cron jobs

**Expertise:**
- Convex validators (v.string(), v.id(), etc.)
- Index design for performance
- Error handling
- File storage

## Designer

**The design validator.**

Validates UI against designs:
- Visual fidelity to Figma
- Spacing and layout accuracy
- Color and typography
- Component completeness
- Responsive behavior

**Note:** Does not write code. Reports issues for ui-developer to fix.

## UI Developer

**The UI fixer.**

Fixes UI issues:
- Spacing adjustments
- Color corrections
- Layout fixes
- Component refinements
- Responsive fixes

**Called after:** Designer finds issues.

## Reviewer

**The code critic.**

Reviews code for:
- Code quality and patterns
- Type safety
- Error handling
- Performance
- Security
- Best practices

**Supports:** Multi-model review via PROXY_MODE.

## Plan Reviewer

**The architecture critic.**

Reviews implementation plans for:
- Architectural issues
- Missing considerations
- Alternative approaches
- Risk assessment
- Completeness

**Supports:** Multi-model review via PROXY_MODE.

## Tester

**The quality assurer.**

Handles testing:
- Browser testing
- UI interaction validation
- Integration testing
- Test-driven development loops

## Explorer

**The codebase navigator.**

Fast codebase exploration:
- Pattern matching
- File discovery
- Code search
- Dependency analysis

**Used for:** Quick lookups during planning and debugging.

## Cleaner

**The janitor.**

Cleans up artifacts:
- Temporary files
- Old sessions
- Build artifacts

## Customizing Agents

Override models in `magnus-opus.json`:

```json
{
  "agents": {
    "orchestrator": { "model": "anthropic/claude-opus-4" },
    "developer": { "model": "anthropic/claude-sonnet-4" },
    "designer": { "model": "google/gemini-2.5-pro" }
  }
}
```

Disable agents:

```json
{
  "disabled_agents": ["cleaner"]
}
```
