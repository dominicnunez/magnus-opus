# Magnus Opus Decisions

This document records implementation decisions and their rationale. It complements `PLAN.md`, which contains the actionable implementation specification.

---

## Decision 001: OpenCode vs MAG Implementation Differences

Status: Accepted
Date: 2026-01-19

Context
OpenCode provides native model selection, permission controls, and session APIs that differ from the MAG (Claude Code) environment. The plan must avoid Claude-specific workarounds.

Decision
- Do not use MAG `PROXY_MODE`; use native OpenCode `model` parameters.
- Use `permission` rules only (no legacy `tools` format).
- Rely on `ctx.client.session.todo()` for reading todo state and `todowrite` for updates.

Consequences
- Agent configs remain compatible with OpenCode’s permission model.
- Orchestrator code can use native model selection without prompt hacks.
- Todo enforcement can read from the official API instead of tracking state locally.

---

## Decision 002: 4-Message Pattern as Orchestration Policy

Status: Accepted
Date: 2026-01-19

Context
Parallel agent orchestration requires deterministic coordination to avoid sequential execution and mixed-tool calls. MAG uses a structured 4-message pattern to enforce parallelism.

Decision
Magnus Opus codifies the 4-message pattern in orchestration logic:
1) Preparation (Bash-only)
2) Parallel execution (Task-only)
3) Consolidation (Task-only)
4) Present results

Consequences
- Parallel tasks launch together for consistent performance.
- Consolidation ordering is deterministic.
- Workflow code must enforce message boundaries.

---

## Decision 003: Hook Inventory Documentation

Status: Accepted
Date: 2026-01-19

Context
Maintaining a centralized hook inventory can drift as implementations evolve.

Decision
Do not keep a separate hook list. Hooks are documented where they are implemented in `PLAN.md`.

Consequences
- Fewer duplication points.
- Hook usage is always located near the relevant implementation details.

---

## Decision 004: Local Type Extension Boundaries

Status: Accepted
Date: 2026-01-19

Context
OpenCode SDK types are shared across agents, tools, and hooks. Extending them in multiple places risks drift and ambiguous contracts.

Decision
Keep SDK type extensions in a single module and keep feature-specific types local to each feature.

Consequences
- SDK changes require updates in only one place.
- Feature modules remain self-contained without implicit global type changes.

---

## Decision 005: Architectural Pattern Selection

Status: Accepted
Date: 2026-01-19

Context
The plugin architecture must support agent/MCP injection, custom tools, and OpenCode’s hook lifecycle without non-standard return fields.

Decision
Use the oh-my-opencode integration pattern with config hook mutation for agents/MCPs and native OpenCode tool registration.

Consequences
- Agent and MCP registration align with OpenCode’s supported interfaces.
- Tool registration stays native and predictable.

---

## Decision 006: Agent Architecture and Model Specialization

Status: Accepted
Date: 2026-01-19

Context
Different workflows require distinct expertise and cost/performance tradeoffs. MAG shows benefits from role separation and model specialization.

Decision
Use multiple specialized agents with distinct responsibilities and model assignments for architecture, implementation, review, and testing.

Consequences
- Better quality through specialization.
- Lower cost versus running all tasks on high-tier models.

---

## Decision 007: Tool/Command Segmentation

Status: Accepted
Date: 2026-01-19

Context
A single monolithic command increases coupling and makes validation/review loops harder to isolate.

Decision
Keep /implement, /implement-api, /validate-ui, and /review as separate commands with explicit purposes.

Consequences
- Workflows can skip or repeat phases independently.
- UI validation remains decoupled from implementation.

---

## Decision 008: MCP Server Selection

Status: Accepted
Date: 2026-01-19

Context
MCP servers should map directly to workflow needs and avoid redundant providers.

Decision
Select MCP servers based on OpenCode ecosystem conventions and coverage of required domains.

Consequences
- MCP configuration stays minimal and aligned with supported usage.
- Future servers can be evaluated against explicit selection criteria.

---

## Decision 009: Zod for Config Validation

Status: Accepted
Date: 2026-01-19

Context
The plugin needs a schema-driven config with strong validation and good developer ergonomics.

Decision
Use Zod for schema definition and validation.

Consequences
- Config errors are caught early with clear messages.
- Schema is co-located with TypeScript types.

---

## Decision 010: Permission-Only Overrides

Status: Accepted
Date: 2026-01-19

Context
OpenCode supports permission rules but legacy tools overrides are deprecated and inconsistent.

Decision
All overrides use permission rules only.

Consequences
- Agent/tool configuration stays compatible with OpenCode’s permission model.
- No migration or dual formats needed.

---

## Decision 011: Phase System and Quality Gates

Status: Accepted
Date: 2026-01-19

Context
Multi-step workflows need structured checkpoints for correctness, user approval, and multi-model validation.

Decision
Use a multi-phase workflow with explicit quality gate types and conditional phase skipping based on workflow type.

Consequences
- Predictable orchestration and validation sequencing.
- Avoids unnecessary phases for focused workflows.

---

## Decision 012: File-Based Session Storage

Status: Accepted
Date: 2026-01-19

Context
The plugin needs local persistence without external dependencies.

Decision
Use file-based session storage within the project directory.

Consequences
- No external database requirements.
- Easy inspection and cleanup of session artifacts.

---

## Decision 013: Skill System over Direct Prompts

Status: Accepted
Date: 2026-01-19

Context
Static prompts are harder to manage and reuse across agents and workflows.

Decision
Use a skill system with reusable markdown skill content injected by hooks.

Consequences
- Skills can be updated independently of code.
- Consistent knowledge injection across agents.

---

## Decision 014: ContextCollector Pattern

Status: Accepted
Date: 2026-01-19

Context
Multiple hooks can contribute context to a session, and naive injection risks duplication and ordering issues.

Decision
Use a ContextCollector to aggregate contexts before injecting them at the end of the hook pipeline.

Consequences
- Context injection is deterministic and deduplicated.
- Hooks remain decoupled from each other.

---

## Decision 015: Hybrid Background Completion Detection

Status: Accepted
Date: 2026-01-19

Context
Background tasks may not always emit clear completion signals; relying on a single signal risks false positives or stuck tasks.

Decision
Combine idle-event detection, polling, and stability heuristics to determine completion, and validate output before marking done.

Consequences
- Fewer false completions.
- Stuck or silent tasks are handled predictably.

---

## Decision 016: Optional Session Summarization

Status: Accepted
Date: 2026-01-19

Context
Background task outputs can be large, and summarization can reduce context pressure but adds latency and cost.

Decision
Treat session summarization as an optional optimization for large outputs rather than a default step.

Consequences
- Lower cost for simple tasks.
- Summaries remain available for heavy outputs when needed.

---

## Decision 017: Hook System Architecture

Status: Accepted
Date: 2026-01-19

Context
Hooks operate at different layers (message, tool, system prompt) and must cooperate without order-dependent coupling.

Decision
Use a layered hook architecture with production hooks early and consumption hooks late.

Consequences
- Context is collected before injection.
- Hooks remain composable and predictable.

---

## Decision 018: Proactive Session Status Checks

Status: Accepted
Date: 2026-01-19

Context
Countdown-based reminders can be noisy when sessions are still active.

Decision
Check `session.status()` before initiating reminder logic.

Consequences
- Fewer unnecessary reminders.
- Cleaner user experience during long-running tasks.

---

## Decision 019: Complete Token Accounting

Status: Accepted
Date: 2026-01-19

Context
Token usage includes reasoning and cache tokens that still count against context limits.

Decision
Account for input, output, reasoning, and cached tokens in context calculations.

Consequences
- More accurate context window monitoring.
- Fewer unexpected truncation errors.
