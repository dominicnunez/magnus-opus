# Magnus Opus Decisions

This document records implementation decisions and their rationale. It complements the `plan/` directory, which contains the actionable implementation specifications.

## Decision Index by Plan Section

| Plan Section | Decisions | Purpose |
|--------------|------------|---------|
| 01-PLATFORM-OVERVIEW | D001 | OpenCode vs MAG platform differences |
| 02-AGENT-DEFINITIONS | D006, D009, D030 | Agent architecture, registration, role specialization |
| 03-TOOL-DEFINITIONS | D007 | Command segmentation and separation |
| 04-MCP-SERVER-DEFINITIONS | D008 | Server selection and configuration |
| 05-CONFIG-SCHEMA | D009 | Zod schema validation |
| 06-WORKFLOW-SYSTEM | D010, D011, D031 | Permission-only policy, phase system, quality gates |
| 07-SESSION-MANAGEMENT | D012 | File-based session storage |
| 08-SKILLS-SYSTEM | D013 | Skills vs direct prompts |
| 09-CONTEXT-COLLECTION-INJECTION | D014 | ContextCollector pattern |
| 10-BACKGROUND-AGENT-SYSTEM | D015, D016 | Hybrid completion detection, concurrency |
| 11-ADVANCED-HOOKS | D017, D018, D019, D032 | Hook architecture, message handling |
| 12-CLI-INSTALLER | D020, D021, D022 | Interactive installer, companion tools |
| Multiple | D023, D024, D025, D026, D027, D028, D029 | Cross-cutting concerns |

---

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
- Agent configs remain compatible with OpenCode's permission model.
- Orchestrator code can use native model selection without prompt hacks.
- Todo enforcement can read from the official API instead of tracking state locally.

Related WHY Sections
- 01-PLATFORM-OVERVIEW.md#section-1 - Platform Differences
- 11-ADVANCED-HOOKS.md#section-11.3 - Token Calculation

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

Related WHY Sections
- 06-WORKFLOW-SYSTEM.md#section-6.4 - 4-Message Pattern
- 10-BACKGROUND-AGENT-SYSTEM.md#section-10.1 - BackgroundManager

---

## Decision 003: Hook Inventory Documentation

Status: Accepted
Date: 2026-01-19

Context
Maintaining a centralized hook inventory can drift as implementations evolve.

Decision
Do not keep a separate hook list. Hooks are documented where they are implemented in the plan/ files.

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

Related WHY Sections
- 02-AGENT-DEFINITIONS.md#section-2 - Agent Architecture
- 03-TOOL-DEFINITIONS.md#section-3.1 - Tool Helper Pattern

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
Source: btca research (oh-my-opencode)

Context
Multiple hooks can contribute context to a session, and naive injection risks duplication and ordering issues. AI models give more weight to earlier context, so ordering matters for effectiveness.

Decision
Use a ContextCollector to aggregate contexts before injecting them at the end of the hook pipeline.

Key design choices:
1. **Priority-based ordering**: Entries sorted by priority (`critical` > `high` > `normal` > `low`), then by timestamp. Critical information (ultrawork mode, safety constraints) appears first where models give it more weight.
2. **Deduplication via composite key**: Key format `${source}:${id}` allows same ID from different sources (different entries) while same ID from same source overwrites the previous entry.
3. **Session isolation**: Each session has independent context collection to prevent cross-contamination between conversations.
4. **Consume-and-clear pattern**: Context is consumed once and cleared after injection to prevent duplicate injection and ensure efficient token usage.

Consequences
- Context injection is deterministic and deduplicated.
- Hooks remain decoupled from each other.
- Most important context appears first in the merged output.
- No duplicate context wasting limited token space.

---

## Decision 015: Hybrid Background Completion Detection

Status: Accepted
Date: 2026-01-19
Source: btca research (oh-my-opencode)

Context
Background tasks may not always emit clear completion signals; relying on a single signal risks false positives or stuck tasks. No single detection method is reliable due to the asynchronous nature of AI agent sessions—idle events may fire prematurely, late, or not at all; different AI models have varying completion patterns; and network issues can cause false signals.

Decision
Combine idle-event detection, polling, and stability heuristics to determine completion, and validate output before marking done.

Three-layered detection approach:
1. **Idle events (primary, fastest)**: Session.idle events provide immediate notification when OpenCode determines a session is idle. Fast path when working correctly.
2. **Status polling (reliable fallback)**: Poll `session.status()` at regular intervals to catch tasks that complete but don't trigger idle events.
3. **Stability detection (safety net)**: After `MIN_STABILITY_TIME_MS` (10s), track message count across polls. Require `STABILITY_THRESHOLD` (3) consecutive unchanged polls before declaring complete.

Critical edge guards:
- **Early idle protection**: `MIN_IDLE_TIME_MS` (5s) prevents completion when idle events fire immediately after session creation.
- **Output validation**: Verify session has actual assistant/tool output before marking complete.
- **Todo continuation check**: Wait for incomplete todos that should trigger continuation.
- **Stale task detection**: Mark tasks as error after `STALE_TIMEOUT_MS` (3 min) of inactivity.

Consequences
- Fewer false completions through redundant detection methods.
- Stuck or silent tasks are handled predictably via stability detection.
- Fast path available when idle events work correctly.
- Guaranteed concurrency slot cleanup prevents resource leaks.

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
Source: btca research (oh-my-opencode)

Context
Hooks operate at different layers (message, tool, system prompt) and must cooperate without order-dependent coupling. Multiple hooks may produce context that needs to be aggregated before injection.

Decision
Use a layered hook architecture with production hooks early and consumption hooks late.

Hook execution order:
1. **Production hooks (early)**: Keyword detection, rules loading, directory context discovery. These register context with the ContextCollector.
2. **Consumption hooks (late)**: Context injection, output truncation. These consume aggregated context and transform outputs.

Hook categories:
- **Event hooks**: Session lifecycle (`session.created`, `session.deleted`). Used for state initialization and cleanup.
- **Tool hooks**: Before/after tool execution (`tool.execute.before`, `tool.execute.after`). Used for argument transformation, output truncation, and directory context injection.
- **Message hooks**: Chat message interception (`chat.message`). Used for agent variant selection and keyword detection.
- **Transform hooks**: System prompt and message modification (`experimental.chat.system.transform`, `experimental.chat.messages.transform`). Used for skill injection and synthetic context parts.

Consequences
- Context is collected before injection, ensuring all sources contribute.
- Hooks remain composable and predictable without implicit ordering dependencies.
- Each hook can be disabled independently via `disabled_hooks` config.
- ContextCollector aggregates and deduplicates across all production hooks.

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

---

## Decision 020: Interactive Installer with Companion Tools

Status: Accepted
Date: 2026-01-18

Context
Magnus Opus benefits from companion tools that enhance the development experience:
- **opencode-antigravity-auth**: Provides free Claude/Gemini access via Google OAuth, enabling users to use Magnus Opus's full agent capabilities without separate API subscriptions. This is required for any Google model access in OpenCode.
- **mgrep**: Semantic code search by Mixedbread that helps agents find relevant code faster than regex-based grep.

These tools are optional but recommended. Installation should be user-friendly while allowing opt-out.

Decision
Provide an interactive installer (`npx magnus-opus install`) following the oh-my-opencode pattern:

1. **Plugin ordering**: antigravity-auth listed BEFORE magnus-opus in the plugin array (auth must initialize first)
2. **Model configuration**: Explicitly write all 7 antigravity model definitions to opencode.json (don't rely on auto-registration)
3. **mgrep delegation**: Let mgrep handle its own OpenCode integration via `mgrep install-opencode` (it manages its own auth, MCP server entry, and tool file)
4. **Config backup**: Create timestamped backup before modifying opencode.json
5. **Defaults**: antigravity-auth defaults to Yes; mgrep defaults to Yes but prompts user

Non-interactive mode supported via `--no-tui` with explicit flags.

Consequences
- Users get a streamlined setup experience with recommended companion tools
- Config backup prevents accidental data loss
- Delegating to mgrep avoids maintaining duplicate integration code
- Plugin ordering ensures correct initialization sequence
- Google models (both Claude via Antigravity and Gemini) become accessible

---

## Decision 021: Agent-Driven Consensus Analysis

Status: Accepted
Date: 2026-01-18

Context
Multi-model code review requires consolidating findings from multiple AI models and determining consensus on which issues are real problems vs false positives. MAG implements this via prompt engineering to a consolidation agent rather than runtime code.

Research
btca research on mag-cp confirmed:
- MAG calculates consensus via the consolidation agent prompt, not runtime code
- The consolidation agent reads all review files and applies semantic matching
- Consensus levels: UNANIMOUS (100%), STRONG (67%+), DIVERGENT (<50%)
- Quality gate parses the consolidated output for blocking issues

Decision
Follow the MAG pattern: consensus analysis is performed by the consolidation agent via prompt, not by runtime code.

Implementation:
1. `/review` command launches parallel reviewers (4-Message Pattern)
2. Consolidation agent reads all review files and calculates per-issue consensus
3. Agent outputs structured markdown with consensus counts
4. Quality gate (`checkAllReviewersApprove`) parses the markdown for UNANIMOUS count
5. Gate fails if any UNANIMOUS issues exist (all reviewers agree it must be fixed)

Consensus levels (per-issue basis):
- **UNANIMOUS**: All N models flag the same issue → MUST FIX (blocking)
- **STRONG**: 2/3+ models agree → RECOMMENDED (non-blocking)
- **DIVERGENT**: Only 1 model flags → OPTIONAL (may be false positive)

Consequences
- AI models handle semantic matching of similar issues across reviews (better than regex)
- Quality gate code remains simple (just parse counts from markdown)
- Consistent with MAG's proven approach
- Flexible to different review formats without code changes

---

## Decision 022: Cost Gates Out of Scope

Status: Accepted
Date: 2026-01-18

Context
MAG includes cost estimation and cost gates before expensive operations (multi-model review, large-scale refactoring). This provides transparency and allows users to approve costs before proceeding.

Decision
Cost gates are out of scope for Magnus Opus v1.

Rationale:
1. OpenCode's pricing model differs from Claude Code's direct API billing
2. Antigravity-auth provides free access to Claude/Gemini via Google quota
3. OpenCode's built-in free models reduce cost concerns for most users
4. Cost estimation adds complexity without clear user value in this context
5. Can be added in a future version if users request it

Consequences
- Simpler implementation without cost tracking
- Users with paid API keys should be aware of potential costs
- No cost-based quality gates in workflows
- Future enhancement opportunity if needed

---

## Decision 023: Expanded Agent Set for MAG Parity

Status: Accepted
Date: 2026-01-18

Context
Magnus Opus initially focused on SvelteKit+Convex development with a limited agent set. MAG provides additional specialized agents (debugger, devops, researcher, doc-writer) that enable standalone workflows and broader functionality.

Research
btca research on mag-cp revealed:
- `debugger`: Read-only agent for systematic error analysis (no Write/Edit tools)
- `devops`: Infrastructure specialist using opus model for extended thinking
- `researcher`: Deep research agent for web and local investigation
- `doc-writer`: Documentation specialist (no TodoWrite - orchestrator owns todo list)

Decision
Add four new agents to achieve MAG feature parity:

| Agent | Model | Key Constraint |
|-------|-------|----------------|
| `debugger` | sonnet | Read-only (`permission: { write: "deny" }`) |
| `devops` | opus | Full access, extended thinking for complex infra decisions |
| `researcher` | sonnet | Full access, web + local investigation |
| `doc-writer` | sonnet | No TodoWrite (orchestrator owns todo list) |

Consequences
- Enables standalone `/debug`, `/architect`, `/doc` commands
- Broader workflow support beyond SvelteKit+Convex
- Consistent with MAG's proven agent specialization patterns
- Debugger's read-only constraint ensures separation of concerns (analyze vs fix)

---

## Decision 024: Configurable Iteration Limits

Status: Accepted
Date: 2026-01-18

Context
Quality gate loops (pass_or_fix, TDD, review) need iteration limits to prevent infinite loops while allowing user customization for complex projects.

Research
MAG uses:
- Max 10 iterations for TDD loops
- Max 5 rounds for user feedback loops
- Escalation to user when limits exceeded

Decision
Add configurable iteration limits via `magnus-opus.json`:

```json
{
  "workflowLimits": {
    "maxIterations": 5,
    "maxReviewRounds": 3,
    "maxTddIterations": 10
  }
}
```

Key design choices:
1. **No hard ceiling**: Users can configure any value (trust user judgment)
2. **Sensible defaults**: 5/3/10 match MAG's proven patterns
3. **Escalation behavior**: When limit reached, escalate to user with options (continue, more iterations, cancel)

Consequences
- Prevents infinite loops in automated workflows
- Users can tune limits for project complexity
- Consistent with MAG's iteration patterns
- Clear escalation path when limits exceeded

---

## Decision 025: TDD Loop Formalization

Status: Accepted
Date: 2026-01-18

Context
MAG implements a sophisticated TDD loop as Phase 2.5 in the development workflow. The key innovation is distinguishing TEST_ISSUE from IMPLEMENTATION_ISSUE to determine whether to fix the test or the code.

Research
btca research on mag-cp confirmed:
- 5-step loop: Write tests → Run → Check → Analyze → Fix → Repeat
- test-architect writes tests in black-box mode (no implementation access)
- Failure classification determines fix responsibility
- Default to IMPLEMENTATION_ISSUE when ambiguous (tests are authoritative)

Decision
Formalize the TDD loop in plan/06-WORKFLOW-SYSTEM.md Section 6.5 with:

**Classification Criteria:**

| Type | Indicators | Action |
|------|------------|--------|
| `TEST_ISSUE` | Test expects behavior not in requirements; test is flaky; test checks implementation details | test-architect fixes test |
| `IMPLEMENTATION_ISSUE` | Code doesn't match requirements; violates API contract; missing functionality | developer fixes code |

**Default Rule:** If ambiguous, classify as `IMPLEMENTATION_ISSUE` (tests are authoritative)

**Iteration Limit:** Configurable via `workflowLimits.maxTddIterations` (default: 10)

Consequences
- Clear ownership of fixes (test-architect vs developer)
- Prevents endless ping-pong between test and code fixes
- Tests written blind to implementation ensure true black-box testing
- Consistent with MAG's proven TDD patterns

---

## Decision 026: Hook System Adaptation for OpenCode

Status: Accepted
Date: 2026-01-18

Context
MAG uses Claude Code's hook system which differs from OpenCode's. Magnus Opus must adapt MAG patterns to OpenCode's available hooks while preserving equivalent functionality.

Research
MAG hooks:
- `SessionStart`: Session initialization
- `PreToolUse`: Before tool execution
- `PostToolUse`: After tool execution
- `SubagentStop`: Background task completion

OpenCode hooks:
- `event`: Session lifecycle events (session.created, session.deleted, session.idle)
- `tool.execute.before`: Before tool execution
- `tool.execute.after`: After tool execution
- `chat.message`: Message interception for variants/keywords
- `experimental.chat.system.transform`: System prompt modification
- `experimental.chat.messages.transform`: Message modification

Decision
Document the following hook mapping:

| MAG Hook | OpenCode Hook | Notes |
|----------|---------------|-------|
| `SessionStart` | `event` (session.created) | Same purpose |
| `PreToolUse` | `tool.execute.before` | Same purpose |
| `PostToolUse` | `tool.execute.after` | Same purpose |
| `SubagentStop` | `event` (session.idle) | Different trigger point; requires stability detection |
| - | `chat.message` | OpenCode-specific; used for variant selection |
| - | `experimental.chat.*.transform` | OpenCode-specific; used for skill/context injection |

Consequences
- Clear mapping enables porting MAG patterns to OpenCode
- OpenCode's additional hooks (`chat.message`, transforms) enable features MAG lacks
- `SubagentStop` adaptation requires hybrid completion detection (see D015)
- Documentation prevents confusion when referencing MAG patterns

---

## Decision 028: Defer oh-my-opencode Productivity Hooks

Status: Accepted
Date: 2026-01-19

Context
oh-my-opencode provides many productivity hooks (todo-continuation-enforcer, comment-checker, directory-readme-injector, context-window-monitor, rules-injector, tool-output-truncator) but these are features, not core MAG orchestration concepts.

Decision
Defer oh-my-opencode productivity hooks from v1 scope. Magnus Opus focuses on porting MAG concepts to OpenCode, not duplicating oh-my-opencode features.

Consequences
- Users can install both plugins complementarily
- Magnus Opus remains focused on orchestration patterns
- v1 implementation scope is manageable

---

## Decision 029: Defer tool-output-truncator

Status: Accepted
Date: 2026-01-19

Context
Tool output truncation can remove important context that mgrep (recommended optional install) handles more effectively.

Decision
Defer tool-output-truncator implementation. mgrep addresses grep verbosity without context loss.

Consequences
- Lower risk of truncating important information
- Users get better solution via mgrep
- Cleaner plugin codebase

---

## Decision 030: Defer session-recovery hook

Status: Accepted
Date: 2026-01-19

Context
oh-my-opencode's session-recovery hook handles protocol/format errors. MAG's error-recovery skill handles semantic errors via prompts. OpenCode manages session stability internally.

Decision
Defer session-recovery hook implementation. Skill-based error recovery covers semantic errors; OpenCode handles protocol layer.

Consequences
- Cleaner separation of concerns
- No duplicate error handling logic
- Trust OpenCode's session management

---

## Decision 031: Defer Interactive Installer

Status: Deferred
Date: 2026-01-19

Context
Interactive installer (D020) was decided but not specified in plan/12-CLI-INSTALLER.md. Implementation phase is better time to design this based on actual plugin structure.

Decision
Defer interactive installer design until pre-implementation phase. Focus on core plugin functionality first.

Consequences
- Earlier implementation start
- Installer designed with real plugin experience
- Better validation of installation scenarios

---

## Decision 032: Remove PRD from Project

Status: Accepted
Date: 2026-01-19

Context
PRD.md became outdated as the plan/ files evolved. Keeping outdated requirements causes confusion.

Decision
Remove PRD.md and all references to it. The plan/ directory is now the single source of truth.

Consequences
- Single source of requirements
- No confusion from outdated documents
- Cleaner project structure

---

## Decision 027: Standalone Commands for MAG Parity

Status: Accepted
Date: 2026-01-18

Context
MAG provides standalone commands (`/debug`, `/architect`, `/doc`) that enable focused workflows without running the full `/implement` pipeline. Magnus Opus initially bundled these capabilities into `/implement`.

Research
btca research on mag-cp confirmed:
- `/dev:debug`: 6-phase systematic debugging workflow
- `/dev:architect`: Standalone architecture planning
- `/dev:doc`: Documentation generation with 15 best practices

Decision
Add three standalone commands matching MAG patterns:

| Command | Primary Agent | Workflow |
|---------|---------------|----------|
| `/debug` | debugger → developer | 6-phase: Initialize → Analyze → Investigate → Fix → Validate → Report |
| `/architect` | architect | 4-phase: Gather requirements → Design → Review → Document |
| `/doc` | doc-writer | 5-phase: Context → Template → Generate → Verify → Write |

**Critical `/debug` constraint:** Debugger agent analyzes (read-only); developer agent applies fixes. This separation ensures thorough analysis before any code changes.

Consequences
- Users can run focused workflows without full `/implement` overhead
- Consistent with MAG's command structure
- Enables better tooling discoverability

## Decision 033: Remove oh-my-opencode Specific Features

Status: Accepted
Date: 2026-01-19

Context
The goal of Magnus Opus is to port MAG concepts to OpenCode, specifically avoiding oh-my-opencode specific features to maintain scope and branding separation.
- **Ultrawork**: A branded oh-my-opencode feature ("magic keyword" `ulw`) tied to a specific "Ultrawork Manifesto" philosophy not present in MAG.
- **Comment Checker**: An oh-my-opencode utility for detecting excessive comments, which is not a core MAG quality gate.

Decision
Remove these features from the v1 plan:
1. Remove "Keyword Detector Hook" (Ultrawork implementation).
2. Remove "Comment Checker Hook".

Future Consideration:
- The "Ultrawork" behavior (aggressive parallelism, background delegation) is valuable. It should be considered for a future release, potentially integrated directly into the default Orchestrator behavior rather than as a hidden "mode" or keyword.

Consequences
- Strict adherence to "Non-Goal: Not implementing oh-my-opencode specific features".
- Cleaner scope focused purely on MAG parity.
- "Ultrawork" concept preserved for future architectural integration.

