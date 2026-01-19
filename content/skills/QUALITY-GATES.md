# Quality Gates

**Version:** 1.0.0
**Purpose:** Patterns for implementing quality gates and user approval checkpoints
**Status:** Production Ready

## Overview

Quality gates are checkpoints in a workflow where:
1. Work is validated against criteria
2. User approval may be required
3. Iteration loops may be triggered
4. The workflow may be blocked or proceed

## Core Patterns

### Pattern 1: User Approval Gates

**When to Use:**
- After architecture planning (before implementation)
- After implementation (before delivery)
- After significant changes that need user sign-off

**Implementation:**

```
User Approval Gate:
  1. Present summary of completed work
  2. Show key artifacts (file paths, not full content)
  3. Ask user for approval with clear options:
     - "Yes, proceed to next phase"
     - "No, I have feedback"
     - "Get AI review first" (optional)
  
  4. Handle response:
     - If YES: Mark phase complete, proceed
     - If NO: Collect feedback, iterate
     - If AI REVIEW: Trigger multi-model review phase
```

**Example: Architecture Approval Gate**

```
✅ PHASE 1 Complete: Architecture Plan Created

Summary from architect:
- Designed 3-component system
- Estimated 2-3 hours implementation
- Risk: Complex state management

📄 Detailed Plan: ai-docs/sessions/impl-xxx/implementation-plan.md
📄 Quick Reference: ai-docs/sessions/impl-xxx/quick-reference.md

Please review the implementation plan before proceeding.

Options:
- "Yes, proceed to implementation"
- "Get AI review first (recommended)"
- "No, I have feedback"
```

### Pattern 2: Validation Gates

**When to Use:**
- After implementation (tests must pass)
- After UI implementation (design must match)
- After code review (all issues must be addressed)

**Pass/Fail Criteria:**

```
Validation Gate:
  1. Run validation (tests, design check, lint)
  2. Evaluate result:
     - PASS: All criteria met → Proceed
     - FAIL: Criteria not met → Iterate
  
  3. If FAIL:
     - Identify specific failures
     - Delegate fixes to appropriate agent
     - Re-run validation
     - Loop until PASS or max iterations
```

**Example: Design Validation Gate**

```
Design Validation Result:
  ✅ Color scheme matches: 100%
  ⚠️ Spacing issues: 3 elements
  ❌ Missing component: Profile avatar
  
Verdict: NEEDS_FIXES

Delegating to ui-developer for fixes...
[ui-developer makes fixes]

Re-running validation...

Design Validation Result:
  ✅ Color scheme matches: 100%
  ✅ Spacing: All correct
  ✅ All components present
  
Verdict: PASS

Proceeding to code review...
```

### Pattern 3: Iteration Loops

**When to Use:**
- Code review finds issues → fix → re-review
- Tests fail → fix → re-test
- Design doesn't match → fix → re-validate

**Iteration Control:**

```
Iteration Loop:
  MAX_ITERATIONS = 3 (configurable)
  iteration_count = 0
  
  WHILE validation != PASS AND iteration_count < MAX_ITERATIONS:
    iteration_count++
    
    1. Identify issues from validation
    2. Delegate fixes to appropriate agent
    3. Agent makes fixes, returns summary
    4. Re-run validation
    
  IF iteration_count >= MAX_ITERATIONS AND validation != PASS:
    1. Log warning: "Max iterations reached without passing"
    2. Present status to user
    3. Ask: "Continue iterating?" or "Accept current state?"
```

**Example: Test-Driven Development Loop**

```
Iteration 1:
  - Run tests: 5/8 passing
  - Failures: AuthService.login, AuthService.logout, TokenService.refresh
  - Delegate to backend agent with failure details
  - Backend agent fixes issues
  
Iteration 2:
  - Run tests: 7/8 passing
  - Failures: TokenService.refresh (edge case)
  - Delegate to backend agent
  - Backend agent fixes edge case
  
Iteration 3:
  - Run tests: 8/8 passing ✅
  - All tests pass, exiting loop
  
Proceeding to code review...
```

### Pattern 4: Severity Classification

**Issue Severity Levels:**

| Severity | Description | Action |
|----------|-------------|--------|
| CRITICAL | Blocking issue, must fix | Block workflow, fix immediately |
| MEDIUM | Should fix before delivery | Fix if possible, can defer |
| LOW | Nice to have | Note for future, don't block |

**Handling by Severity:**

```
After Review/Validation:
  
  IF has CRITICAL issues:
    - BLOCK workflow
    - Delegate fixes to appropriate agent
    - Re-run validation
    - Loop until no CRITICAL issues
  
  ELSE IF has MEDIUM issues:
    - Present to user
    - Ask: "Fix now?" or "Proceed anyway?"
    - If fix: delegate and re-validate
    - If proceed: note in final summary
  
  ELSE IF only LOW issues:
    - Note in final summary
    - Proceed with workflow
```

### Pattern 5: Consensus-Based Gates (Multi-Model)

**When to Use:**
- Multiple AI models review same artifact
- Need high confidence in quality
- Want diverse perspectives

**Consensus Rules:**

```
Given: N model reviews

HIGH_CONFIDENCE issue:
  - Flagged by >= 2 models
  - Likely a real problem
  - Prioritize fixing

MEDIUM_CONFIDENCE issue:
  - Flagged by 1 model only
  - May be false positive
  - Review before fixing

UNANIMOUS approval:
  - All N models approve
  - Very high confidence
  - Safe to proceed

SPLIT decision:
  - Some approve, some don't
  - Needs human judgment
  - Present to user for decision
```

**Example: Multi-Model Code Review Consensus**

```
Review Results:
  - Claude Sonnet: APPROVED (2 LOW issues)
  - Grok: NEEDS_REVISION (1 MEDIUM issue)
  - Gemini: APPROVED (1 LOW issue)

Consensus Analysis:
  - 2/3 models approve
  - 1 MEDIUM issue flagged by Grok only (security concern)
  - 3 LOW issues (2 unique)

Recommendation: PROCEED with caution
  - The security concern should be reviewed by user
  - LOW issues can be addressed in future PR

Presenting to user for decision...
```

## Integration with Workflow Phases

### Phase 1: Architecture (User Approval Gate)

```
After architect completes:
  1. Present plan summary
  2. User approval gate:
     - Approve → Phase 2
     - Request review → Phase 1.5 (multi-model)
     - Feedback → Iterate with architect
```

### Phase 2.5: Design Validation (Validation Gate)

```
After UI implementation:
  1. Run design validation with designer
  2. Validation gate:
     - PASS → Phase 3
     - FAIL → Iterate with ui-developer
  3. Max 3 iterations, then ask user
```

### Phase 3: Code Review (Severity-Based Gate)

```
After all reviewers complete:
  1. Consolidate reviews
  2. Classify issues by severity
  3. Severity-based gate:
     - CRITICAL → Fix, re-review
     - MEDIUM → Ask user
     - LOW only → Proceed
```

### Phase 4: Testing (Validation Gate)

```
After tests written:
  1. Run test suite
  2. Validation gate:
     - All pass → Phase 5
     - Failures → Fix, re-test
  3. Max 3 iterations
```

### Phase 5: User Acceptance (Final Gate)

```
After all validation passes:
  1. Present final summary
  2. User approval gate:
     - Accept → Phase 6 (cleanup)
     - Request changes → Iterate
     - Manual testing → Pause
```

## Best Practices

**Do:**
- ✅ Always require user approval after architecture planning
- ✅ Always require user approval before final delivery
- ✅ Set reasonable max iterations (3 is typical)
- ✅ Present clear options at each gate
- ✅ Track iteration count and warn if high
- ✅ Classify issues by severity for smart handling
- ✅ Use consensus for multi-model reviews

**Don't:**
- ❌ Skip user approval gates
- ❌ Allow infinite iteration loops
- ❌ Block on LOW severity issues
- ❌ Proceed with CRITICAL issues unresolved
- ❌ Ignore consensus from multiple models
- ❌ Hide issues from user

## Summary

Quality gates ensure:
1. **User stays in control** - Approval at key checkpoints
2. **Quality standards met** - Validation before proceeding
3. **Issues are addressed** - Iteration loops until pass
4. **Smart prioritization** - Severity-based handling
5. **High confidence** - Consensus from multiple reviewers
