# TodoWrite Orchestration

**Version:** 1.0.0
**Purpose:** Patterns for using TodoWrite to track multi-phase workflows
**Status:** Production Ready

## Overview

TodoWrite is the backbone of workflow tracking in magnus-opus. It provides:
- Visual progress tracking for users
- Phase management for orchestrators
- Iteration tracking for feedback loops
- Recovery points for interrupted sessions

## Core Patterns

### Pattern 1: Initial Workflow Setup

At the start of any `/implement` workflow, create a comprehensive todo list:

```
TodoWrite with the following items:
- content: "PHASE 1: Launch architect for architecture planning"
  status: "in_progress"
- content: "PHASE 1: User approval gate"
  status: "pending"
- content: "PHASE 1.5: Multi-model plan review (optional)"
  status: "pending"
- content: "PHASE 2: Launch implementation agent(s)"
  status: "pending"
- content: "PHASE 2.5: Design validation / TDD loop"
  status: "pending"
- content: "PHASE 3: Triple code review"
  status: "pending"
- content: "PHASE 4: Testing"
  status: "pending"
- content: "PHASE 5: User acceptance"
  status: "pending"
- content: "PHASE 6: Cleanup"
  status: "pending"
- content: "PHASE 7: Delivery"
  status: "pending"
```

### Pattern 2: Real-Time Updates

Update todo status immediately as work progresses:

```
WHEN starting a phase:
  - Mark current phase as "in_progress"
  - Previous phase should already be "completed"

WHEN completing a phase:
  - Mark current phase as "completed" IMMEDIATELY
  - Do NOT batch completions
  - Mark next phase as "in_progress" if starting it

WHEN skipping a phase:
  - Mark as "completed" with note "(Skipped - reason)"
```

### Pattern 3: Iteration Tracking

When iterations are needed, add new todos dynamically:

```
After first code review finds issues:
  - Mark "PHASE 3: Triple code review" as completed
  - Add: "PHASE 3 - Iteration 2: Fix issues from review"
    status: "in_progress"
  - Add: "PHASE 3 - Iteration 2: Re-run reviewers"
    status: "pending"

After fixes applied:
  - Mark fix todo as "completed"
  - Mark re-run todo as "in_progress"

After re-review passes:
  - Mark re-run todo as "completed"
  - Proceed to PHASE 4
```

### Pattern 4: Conditional Phases

Some phases are optional based on workflow type or user choice:

```
For API_FOCUSED workflow:
  - Add note to design validation: "(Skipped - API workflow)"
  - Mark as "completed"

For UI_FOCUSED workflow:
  - Add note to TDD loop: "(Skipped - UI workflow)"
  - Mark as "completed"

When user skips plan review:
  - Mark "PHASE 1.5: Multi-model plan review" as "completed"
  - Add note: "(Skipped - user chose direct implementation)"
```

### Pattern 5: Error Recovery

When errors occur, track recovery attempts:

```
If agent fails:
  1. Mark current todo with error note
  2. Add recovery todo: "PHASE X - Recovery: Retry with adjustments"
  3. Attempt recovery
  4. Update based on result

If max retries exceeded:
  1. Mark phase as "failed"
  2. Add: "BLOCKED: Unable to complete PHASE X - need user guidance"
  3. Ask user for direction
```

## Best Practices

**Do:**
- ✅ Create comprehensive todo list at workflow start
- ✅ Update status IMMEDIATELY after each step
- ✅ Add iteration todos dynamically as needed
- ✅ Include notes for skipped or modified phases
- ✅ Use consistent naming (PHASE X: Description)
- ✅ Track iteration count in todo names

**Don't:**
- ❌ Batch multiple completions at once
- ❌ Forget to mark skipped phases
- ❌ Leave todos in wrong state
- ❌ Create todos without following through
- ❌ Skip updating during long-running operations

## Integration with Session Metadata

TodoWrite status should align with session-meta.json:

```
session-meta.json phases:
{
  "phases": {
    "ARCHITECTURE": { "status": "completed" },
    "PLAN_REVIEW": { "status": "skipped", "notes": "User chose direct implementation" },
    "IMPLEMENTATION": { "status": "in_progress" }
  }
}

TodoWrite should reflect same state:
- PHASE 1: Architecture planning [completed]
- PHASE 1.5: Plan review [completed] (Skipped - user chose direct implementation)
- PHASE 2: Implementation [in_progress]
```

## Summary

TodoWrite orchestration ensures:
1. **User visibility** - Clear progress indication
2. **Workflow tracking** - Know what's done and what's next
3. **Iteration management** - Track retry attempts
4. **Recovery support** - Resume interrupted workflows
5. **Audit trail** - Record of all workflow phases
