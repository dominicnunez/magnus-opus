# Multi-Agent Coordination

**Version:** 1.0.0
**Purpose:** Patterns for coordinating multiple agents in complex workflows
**Status:** Production Ready

## Overview

Multi-agent coordination is the foundation of sophisticated workflows. This skill provides battle-tested patterns for orchestrating multiple specialized agents to accomplish complex tasks.

The key challenge in multi-agent systems is **dependencies**. Some tasks must execute sequentially (one agent's output feeds into another), while others can run in parallel (independent validations from different perspectives).

## Core Patterns

### Pattern 1: Sequential vs Parallel Execution

**When to Use Sequential:**

Use sequential execution when there are **dependencies** between agents:
- Agent B needs Agent A's output as input
- Workflow phases must complete in order (plan → implement → test → review)
- Each agent modifies shared state (same files)

**Example: Multi-Phase Implementation**

```
Phase 1: Architecture Planning
  Task: architect
    Output: ai-docs/architecture-plan.md
    Wait for completion ✓

Phase 2: Implementation (depends on Phase 1)
  Task: developer
    Input: Read ai-docs/architecture-plan.md
    Output: src/feature.ts
    Wait for completion ✓

Phase 3: Testing (depends on Phase 2)
  Task: tester
    Input: Read src/feature.ts
    Output: tests/feature.test.ts
```

**When to Use Parallel:**

Use parallel execution when agents are **independent**:
- Multiple validation perspectives (designer + tester + reviewer)
- Multiple AI models reviewing same code
- Multiple feature implementations in separate files

**Example: Multi-Perspective Validation**

```
Single Message with Multiple Task Calls:

Task: designer
  Prompt: Validate UI against Figma design
  Output: ai-docs/design-review.md
---
Task: tester
  Prompt: Test UI in browser for usability
  Output: ai-docs/testing-report.md
---
Task: reviewer
  Prompt: Review code quality and patterns
  Output: ai-docs/code-review.md

All three execute simultaneously (3x speedup!)
Wait for all to complete, then consolidate results.
```

**The 4-Message Pattern for True Parallel Execution:**

This pattern is **MANDATORY** for achieving true parallelism. Mixing tool types in the same message **breaks parallelism**.

```
Message 1: Preparation (Bash Only)
  - Create workspace directories
  - Validate inputs
  - Write context files
  - Calculate cost estimates
  - NO Task calls, NO TodoWrite

Message 2: Parallel Execution (Task Only)
  - Launch ALL agents in SINGLE message
  - ONLY Task tool calls
  - Each Task is independent
  - All execute simultaneously (3-5x speedup!)

Message 3: Consolidation (Task Only)
  - Wait for N ≥ 2 agents to complete
  - Launch consolidation agent
  - Apply consensus analysis

Message 4: Present Results
  - Show user final consolidated results
  - Include links to detailed reports
  - Any tools allowed
```

### Complete 4-Message Pattern Example

Here's a concrete example of multi-model code review using the 4-Message Pattern:

```markdown
## MESSAGE 1: Preparation (Bash Only)

# Create review workspace
mkdir -p ai-docs/sessions/review-20260118/reviews

# Gather code context
git diff HEAD~1 > ai-docs/sessions/review-20260118/code-context.md

# Write tracking metadata
cat > ai-docs/sessions/review-20260118/tracking.md << EOF
| Model | Status | Duration | Issues | Quality |
|-------|--------|----------|--------|---------|
| Claude Sonnet | pending | - | - | - |
| Gemini 3 Pro | pending | - | - | - |
| Grok Code | pending | - | - | - |
EOF

# Cost estimate: ~$0.006 for 3 reviews
echo "Pre-launch complete. Estimated cost: $0.006"

---

## MESSAGE 2: Parallel Execution (Task Only)

# Launch all reviewers in ONE message - they run simultaneously!

Task: reviewer
  Prompt: "Review code at ai-docs/sessions/review-20260118/code-context.md
           Focus: Security, error handling, type safety
           Write review to: ai-docs/sessions/review-20260118/reviews/claude.md"

Task: reviewer
  Model: google/gemini-2.5-pro
  Prompt: "Review code at ai-docs/sessions/review-20260118/code-context.md
           Focus: Architecture, performance, maintainability
           Write review to: ai-docs/sessions/review-20260118/reviews/gemini.md"

Task: reviewer
  Model: openrouter/grok-4
  Prompt: "Review code at ai-docs/sessions/review-20260118/code-context.md
           Focus: Best practices, edge cases, testing gaps
           Write review to: ai-docs/sessions/review-20260118/reviews/grok.md"

# All 3 execute in TRUE parallel! (not sequential)

---

## MESSAGE 3: Consolidation (Task Only)

# Wait for at least 2 reviews to complete, then consolidate

Task: reviewer
  Prompt: "Consolidate 3 code reviews:
           - ai-docs/sessions/review-20260118/reviews/claude.md
           - ai-docs/sessions/review-20260118/reviews/gemini.md
           - ai-docs/sessions/review-20260118/reviews/grok.md
           
           Apply consensus analysis:
           - UNANIMOUS: All 3 agree → MUST FIX
           - STRONG: 2/3 agree → RECOMMENDED
           - DIVERGENT: 1/3 agree → OPTIONAL
           
           Write to: ai-docs/sessions/review-20260118/consolidated-review.md"

---

## MESSAGE 4: Present Results (Any Tool)

Read: ai-docs/sessions/review-20260118/consolidated-review.md

# Present summary to user with action items
```

### Why This Pattern Works

1. **Message 1 (Bash Only)**: OpenCode batches all Bash calls together
2. **Message 2 (Task Only)**: OpenCode launches all Task calls **simultaneously**
3. **Message 3 (Task Only)**: Consolidation happens after parallel work completes
4. **Message 4 (Any)**: Results presentation is sequential anyway

**If you mix Bash and Task in Message 2, OpenCode executes them sequentially, losing all parallelism benefits!**

### Anti-Pattern: What NOT to Do

```markdown
❌ WRONG - Mixed tools breaks parallelism:

# This executes SEQUENTIALLY (no parallelism!)
mkdir -p ai-docs/reviews          # Bash - executes first
Task: reviewer                     # Task - waits for Bash
  Prompt: "Review code..."
git status                         # Bash - waits for Task
Task: reviewer                     # Task - waits for Bash
  Model: google/gemini-2.5-pro
  Prompt: "Review code..."

# Result: Sequential execution, no speedup
```

```markdown
✅ CORRECT - Separated by message:

## Message 1 (Bash Only)
mkdir -p ai-docs/reviews
git status

## Message 2 (Task Only) 
Task: reviewer
  Prompt: "Review code..."
Task: reviewer
  Model: google/gemini-2.5-pro
  Prompt: "Review code..."

# Result: True parallel execution, 2-3x speedup!
```

### Pattern 2: Agent Selection by Task Type

**Task Detection Logic:**

```
IF request mentions "API", "endpoint", "backend", "database", "Convex":
  → API-focused workflow
  → Use: architect, backend, tester
  → Skip: designer, ui-developer

ELSE IF request mentions "UI", "component", "design", "Figma", "Svelte":
  → UI-focused workflow
  → Use: architect, developer, designer, ui-developer, tester
  → Include: Design validation phase

ELSE IF request mentions both API and UI:
  → Mixed workflow
  → Use all relevant agents from both categories
  → Coordinate between backend and frontend agents
```

**Agent Capability Matrix:**

| Task Type | Primary Agent | Secondary Agent | Optional External |
|-----------|---------------|-----------------|-------------------|
| API Implementation | backend | architect | - |
| UI Implementation | developer | designer | ui-developer |
| Testing | tester | - | - |
| Code Review | reviewer | - | External models |
| Architecture Planning | architect | - | plan-reviewer |
| Design Validation | designer | ui-developer | - |

### Pattern 3: Sub-Agent Delegation

**File-Based Instructions (Context Isolation):**

When delegating to sub-agents, use **file-based instructions** to avoid context pollution:

```
✅ CORRECT - File-Based Delegation:

Step 1: Write instructions to file
  Write: ai-docs/architecture-instructions.md
    Content: "Design authentication system with JWT tokens..."

Step 2: Delegate to agent with file reference
  Task: architect
    Prompt: "Read instructions from ai-docs/architecture-instructions.md
             and create architecture plan."

Step 3: Agent reads file, does work, writes output
  Agent reads: ai-docs/architecture-instructions.md
  Agent writes: ai-docs/architecture-plan.md

Step 4: Agent returns brief summary ONLY
  Return: "Architecture plan complete. See ai-docs/architecture-plan.md"

Step 5: Orchestrator reads output file if needed
  Read: ai-docs/architecture-plan.md
  (Only if orchestrator needs to process the output)
```

**Brief Summary Returns:**

Sub-agents should return **2-5 sentence summaries**, not full output:

```
✅ CORRECT - Brief Summary:
  "Architecture plan complete. Designed 3-layer authentication:
   JWT with refresh tokens, OAuth2 integration (Google/GitHub),
   and Redis session management. See ai-docs/architecture-plan.md
   for detailed component breakdown."

❌ WRONG - Full Output:
  "Architecture plan:
   [500 lines of detailed architecture documentation]..."
```

### Pattern 4: Context Window Management

**When to Delegate:**

Delegate to sub-agents when:
- Task is self-contained (clear input → output)
- Output is large (architecture plan, test suite, review report)
- Task requires specialized expertise (designer, tester, reviewer)
- Multiple independent tasks can run in parallel

**When to Execute in Main Context:**

Execute in main orchestrator when:
- Task is small (simple file edit, command execution)
- Output is brief (yes/no decision, status check)
- Task depends on orchestrator state (current phase, iteration count)
- Context pollution risk is low

**Delegation Strategy by Context Size:**

| Task Output Size | Strategy |
|------------------|----------|
| < 1k tokens | Execute in orchestrator |
| 1k - 10k tokens | Delegate with summary return |
| 10k - 30k tokens | Delegate with file-based output |
| > 30k tokens | Multi-agent decomposition |

## Best Practices

**Do:**
- ✅ Use parallel execution for independent tasks (3-5x speedup)
- ✅ Use sequential execution when there are dependencies
- ✅ Use file-based instructions to avoid context pollution
- ✅ Return brief summaries (2-5 sentences) from sub-agents
- ✅ Select agents based on task type (API/UI/Testing/Review)
- ✅ Decompose large tasks into multiple sub-agent calls
- ✅ Estimate context usage before delegating

**Don't:**
- ❌ Mix tool types in parallel execution (breaks parallelism)
- ❌ Inline long instructions in Task prompts (context pollution)
- ❌ Return full output from sub-agents (use files instead)
- ❌ Use parallel execution for dependent tasks (wrong results)
- ❌ Use single agent for >100k token tasks (context overflow)
- ❌ Forget to wait for all parallel tasks before consolidating

## Summary

Multi-agent coordination is about choosing the right execution strategy:

- **Parallel** when tasks are independent (3-5x speedup)
- **Sequential** when tasks have dependencies (correct results)
- **File-based delegation** to avoid context pollution (50-80% savings)
- **Brief summaries** from sub-agents (clean orchestrator context)
- **Task type detection** for intelligent agent selection
- **Context decomposition** for large tasks (avoid overflow)
