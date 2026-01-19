# Error Recovery

**Version:** 1.0.0
**Purpose:** Patterns for handling errors and recovering from failures
**Status:** Production Ready

## Overview

Robust error handling is critical for multi-agent workflows. This skill covers:
- Common failure modes
- Recovery strategies
- Graceful degradation
- User communication

## Common Failure Modes

### 1. Agent Timeout

**Symptoms:**
- Agent takes too long to respond
- No output after extended wait

**Recovery:**
```
1. Check if agent is stuck in a loop
2. Cancel current execution
3. Retry with simplified instructions
4. If still failing, ask user for guidance
```

### 2. External Model Failure

**Symptoms:**
- Model provider returns error
- Provider credentials invalid or expired
- Model unavailable

**Recovery:**
```
1. Log error details
2. If credential issue: inform user to check OpenCode provider settings
3. If model unavailable: try fallback model
4. If all configured models fail: use default Claude model
5. Continue workflow with available reviewers
```

### 3. Tool Execution Failure

**Symptoms:**
- Write/Edit tool fails
- File not found
- Permission denied

**Recovery:**
```
1. Check error message for cause
2. If file issue: verify path exists
3. If permission issue: inform user
4. Retry once with corrected approach
5. If still failing: escalate to user
```

### 4. Validation Failure Loop

**Symptoms:**
- Same issues persist after multiple fixes
- Iteration count exceeds threshold
- No progress being made

**Recovery:**
```
1. Stop iteration loop
2. Present current state to user
3. Ask: "Continue iterating?" or "Accept current state?"
4. Document unresolved issues in final summary
```

### 5. Partial Agent Failure

**Symptoms:**
- Agent completes some tasks, fails on others
- Output is incomplete
- Files partially written

**Recovery:**
```
1. Assess what was completed successfully
2. Mark completed work in session metadata
3. Retry only failed portions
4. If pattern continues: escalate to user
```

## Recovery Strategies

### Strategy 1: Retry with Backoff

```
MAX_RETRIES = 3
retry_count = 0
backoff_ms = 1000

WHILE operation fails AND retry_count < MAX_RETRIES:
  retry_count++
  wait(backoff_ms * retry_count)
  retry operation

IF retry_count >= MAX_RETRIES:
  escalate to user
```

### Strategy 2: Fallback Models

For external model failures:

```
PRIMARY_MODELS = ["openrouter/grok-4", "openai/gpt-5"]
FALLBACK_MODELS = ["google/gemini-2.0-flash", "anthropic/claude-haiku"]

FOR each primary model:
  TRY:
    execute review
  CATCH:
    log error, continue to next

IF all primary fail:
  FOR each fallback model:
    TRY:
      execute review
      BREAK on success
    CATCH:
      continue

IF all models fail:
  use default Claude model
  inform user: "Configured review models unavailable, using default"
```

### Strategy 3: Graceful Degradation

When optional features fail:

```
Feature: Multi-model code review

FULL MODE (all models available):
  - 3 parallel reviewers
  - Consensus analysis
  - High confidence results

DEGRADED MODE (some models unavailable):
  - Available reviewers only
  - Reduced consensus (note in report)
  - Medium confidence results

MINIMAL MODE (only embedded):
  - Single Claude reviewer
  - No consensus (single perspective)
  - Inform user of limitation
```

### Strategy 4: Checkpoint Recovery

Use session metadata for recovery:

```
ON session start:
  CHECK session-meta.json exists
  
IF session has checkpoint:
  lastPhase = checkpoint.lastCompletedPhase
  nextPhase = checkpoint.nextPhase
  
  ASK user: "Found incomplete session. Resume from ${nextPhase}?"
  
  IF yes:
    skip completed phases
    resume from nextPhase
  ELSE:
    start fresh
```

## Error Communication

### To User

Always provide:
- What went wrong (clear explanation)
- What was attempted (recovery steps)
- What options are available (next steps)
- What data is preserved (checkpoints)

```
Example:

## Error: External Model Review Failed

**What happened:**
The Grok code review failed due to an API connection issue.

**Recovery attempted:**
- Retried 3 times with backoff
- Tried fallback model (Gemini)
- Gemini also failed

**Current status:**
- Code review completed with embedded Claude only
- 1 of 3 planned reviewers completed
- Results may be less comprehensive

**Your options:**
1. Accept single-reviewer results
2. Retry after checking OpenCode provider settings
3. Configure additional providers and retry
```

### In Session Metadata

Log errors for debugging:

```json
{
  "phases": {
    "TRIPLE_REVIEW": {
      "status": "completed",
      "notes": "Degraded mode - external models unavailable",
      "errors": [
        {
          "timestamp": "2026-01-18T14:30:00Z",
          "type": "EXTERNAL_MODEL_FAILURE",
          "model": "openrouter/grok-4",
          "message": "Connection refused",
          "recovery": "Used embedded Claude only"
        }
      ]
    }
  }
}
```

## Best Practices

**Do:**
- ✅ Always have a recovery path
- ✅ Log errors with context
- ✅ Inform user of degraded operation
- ✅ Preserve work done before failure
- ✅ Offer user choices when stuck
- ✅ Use checkpoints for long workflows

**Don't:**
- ❌ Silently swallow errors
- ❌ Retry infinitely
- ❌ Lose user's work on failure
- ❌ Leave sessions in broken state
- ❌ Assume all external services are available
- ❌ Skip informing user of limitations

## Stack-Specific Recovery Patterns

### SvelteKit Error Recovery

#### SSR Hydration Mismatches

**Symptoms:**
- Console warning: "Hydration mismatch"
- Content flickers on page load
- Server and client render differently

**Diagnosis:**
```
1. Check for browser-only APIs (window, document) in component code
2. Look for conditional rendering based on non-deterministic values
3. Verify load functions return consistent data
4. Check for timezone/locale differences
```

**Recovery:**
```svelte
<!-- Wrap browser-only code in onMount -->
<script>
  import { onMount } from 'svelte';
  let browserOnly = false;
  
  onMount(() => {
    browserOnly = true;
  });
</script>

{#if browserOnly}
  <BrowserOnlyComponent />
{/if}
```

#### Load Function Failures

**Symptoms:**
- 500 errors on page navigation
- Data not available in page component
- `$page.error` is set

**Recovery:**
```typescript
// +page.server.ts
export async function load({ fetch, params }) {
  try {
    const data = await fetchData(params.id);
    return { data };
  } catch (error) {
    // Return fallback data or throw redirect
    if (error instanceof NotFoundError) {
      throw redirect(303, '/not-found');
    }
    // Log and return empty state
    console.error('Load failed:', error);
    return { data: null, error: 'Failed to load data' };
  }
}
```

### Convex Error Recovery

#### Optimistic Update Rollback

**Symptoms:**
- UI shows data that server rejected
- Inconsistent state after mutation
- "Optimistic update failed" in logs

**Recovery:**
```typescript
// Proper optimistic update with rollback
const mutation = useMutation(api.todos.toggle);

async function toggle(id: Id<"todos">) {
  // Store previous state for rollback
  const previousState = todos.find(t => t._id === id);
  
  // Optimistic update
  setTodos(todos.map(t => 
    t._id === id ? { ...t, completed: !t.completed } : t
  ));
  
  try {
    await mutation({ id });
  } catch (error) {
    // Rollback on failure
    setTodos(todos.map(t => 
      t._id === id ? previousState : t
    ));
    // Inform user
    toast.error('Failed to update. Please try again.');
  }
}
```

#### Mutation Validation Errors

**Symptoms:**
- `ConvexError` thrown from mutation
- Validation failed on server
- Input rejected

**Recovery:**
```typescript
// convex/todos.ts
export const create = mutation({
  args: {
    title: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate before writing
    if (args.title.trim().length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Title cannot be empty",
        field: "title",
      });
    }
    
    // Proceed with creation
    return await ctx.db.insert("todos", {
      title: args.title.trim(),
      completed: false,
      createdAt: Date.now(),
    });
  },
});

// Client-side handling
try {
  await createTodo({ title });
} catch (error) {
  if (error instanceof ConvexError) {
    const data = error.data as { field?: string; message: string };
    setFieldError(data.field, data.message);
  }
}
```

#### Query Index Issues

**Symptoms:**
- Slow queries
- Full table scans in logs
- Timeouts on large tables

**Recovery:**
```typescript
// Add missing index in schema
export default defineSchema({
  todos: defineTable({
    userId: v.id("users"),
    completed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "completed"]),
});

// Use index in query
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
```

#### Action Timeout Recovery

**Symptoms:**
- Action takes too long
- External API call hangs
- 10-minute timeout exceeded

**Recovery:**
```typescript
// Add timeout and retry logic
export const fetchExternal = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(args.url, {
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new ConvexError({
          code: "TIMEOUT",
          message: "External API request timed out",
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
});
```

## Debugging Strategies

### Stack Trace Interpretation

When analyzing errors, follow this process:

```
1. IDENTIFY ERROR TYPE
   - Runtime error (TypeError, ReferenceError)
   - Validation error (ConvexError, ZodError)
   - Network error (fetch failed, timeout)
   - Business logic error (custom errors)

2. TRACE TO SOURCE
   - Start from the first non-library frame
   - Follow the call stack to your code
   - Identify the exact line and context

3. GATHER CONTEXT
   - What inputs led to this error?
   - What state was the application in?
   - Is this reproducible?

4. CLASSIFY ROOT CAUSE
   - Input validation issue
   - State management bug
   - Race condition
   - External dependency failure
   - Logic error
```

### Data Flow Tracing

For complex bugs, trace data through the system:

```
REQUEST → LOAD → STORE → COMPONENT → RENDER

At each stage, verify:
- Data arrives as expected
- Data transforms correctly
- No null/undefined leaks
- Types match expectations
```

### Reproduction Strategies

```
1. MINIMAL REPRODUCTION
   - Strip away unrelated code
   - Isolate the failing component/function
   - Create a test case

2. BOUNDARY CONDITIONS
   - Test with empty inputs
   - Test with large inputs
   - Test with special characters
   - Test with null/undefined

3. TIMING ISSUES
   - Add delays to expose race conditions
   - Test under slow network
   - Test with throttled CPU
```

## Summary

Error recovery ensures:
1. **Resilience** - Workflows complete despite failures
2. **Transparency** - User knows what's happening
3. **Preservation** - Work is not lost
4. **Recovery** - Sessions can be resumed
5. **Degradation** - Partial functionality beats total failure

### Stack-Specific Summary

| Stack | Common Issues | Recovery Pattern |
|-------|--------------|------------------|
| SvelteKit | Hydration mismatch | onMount guard |
| SvelteKit | Load function failure | Try-catch with fallback |
| Convex | Optimistic rollback | Store previous state |
| Convex | Validation error | Structured ConvexError |
| Convex | Query performance | Add indexes |
| Convex | Action timeout | AbortController + timeout |
