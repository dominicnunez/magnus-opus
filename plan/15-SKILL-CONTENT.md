## 15. Skill Content Definitions

<!-- =============================================================================
WHY: Skill Content Specifications (btca research: svelte, convex, mag patterns)
================================================================================

1. SVELTEKIT & SVELTE 5
   - Enforce Runes ($state, $derived, $effect) over legacy stores
   - Use Form Actions for mutations
   - Use Load Functions for data fetching
   - Strict TypeScript usage

2. CONVEX
   - Pattern-matching for Queries (read) vs Mutations (write)
   - Schema definition patterns
   - Index usage for performance
   - Validator patterns (v.string(), v.id())

3. QUALITY GATES
   - Consensus logic definitions
   - Issue severity classification
   - Pass-or-fix loop rules

============================================================================= -->

### 15.1 SVELTEKIT.md

```markdown
# SvelteKit + Svelte 5 Patterns

## Core Principles
1. **Runes First**: Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) exclusively. Avoid legacy `export let` or `store` patterns.
2. **Server-Side Data**: Use `+page.server.ts` `load` functions for initial data.
3. **Form Actions**: Use `actions` in `+page.server.ts` for data mutations.
4. **Type Safety**: Use `App.PageData` and `App.ActionData` for strict typing.

## Runes Reference
- **State**: `let count = $state(0);`
- **Props**: `let { data, form } = $props();`
- **Derived**: `let double = $derived(count * 2);`
- **Effect**: `$effect(() => { console.log(count); });`

## Directory Structure
- `src/routes/` - File-based routing
- `src/lib/components/` - Shared components
- `src/lib/server/` - Server-only logic (secrets)
- `src/app.html` - Root template

## Common Pitfalls to AVOID
- ❌ DO NOT use `export let` for props. Use `let { prop } = $props();`
- ❌ DO NOT use `writable()` stores for local state. Use `$state()` class or primitive.
- ❌ DO NOT fetch data in `onMount`. Use `load` functions.
```

### 15.2 CONVEX.md

```markdown
# Convex Backend Patterns

## Core Principles
1. **Functions**: 
   - `query`: Read-only, reactive, fast.
   - `mutation`: Write operations, transactional.
   - `action`: External APIs, non-deterministic.
2. **Schema**: Define strict schemas in `convex/schema.ts`.
3. **Type Safety**: Use `DataModel` from `_generated/dataModel`.

## Schema Pattern
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  }).index("by_email", ["email"]),
});
```

## Query Pattern
```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
```

## Mutation Pattern
```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    // Validation logic here
    return await ctx.db.insert("users", args);
  },
});
```
```

### 15.3 QUALITY-GATES.md

```markdown
# Quality Gate Patterns

## 1. Multi-Model Consensus
When reviewing code, use these consensus levels:
- **UNANIMOUS** (100% agreement): Blocking issue. MUST fix.
- **STRONG** (≥66% agreement): Recommended fix.
- **DIVERGENT** (<50% agreement): Optional/Nitpick.

## 2. Issue Severity
- **CRITICAL**: Security vulnerability, data loss, crash, build failure.
- **MAJOR**: Functional bug, performance regression, bad pattern.
- **MINOR**: Styling issue, confusing name, minor optimization.
- **NITPICK**: Formatting, preference, comment typo.

## 3. TDD Loop Rules
1. **Write Test First**: Create failing test case.
2. **Run Test**: Confirm failure (red).
3. **Implement**: Write minimal code to pass.
4. **Run Test**: Confirm success (green).
5. **Refactor**: Clean up code while keeping test green.

## 4. User Approval
- Ask for approval after Architecture phase.
- Ask for approval before large refactors.
- Respect "NO" - revise plan and ask again.
```

### 15.4 TODOWRITE-ORCHESTRATION.md

```markdown
# TodoWrite Orchestration Patterns

## Core Rules
1. **Single Source of Truth**: The Orchestrator's todo list drives the entire workflow.
2. **Granularity**: Break tasks down to atomic operations (15-30 min work).
3. **States**:
   - `pending`: Not started
   - `in_progress`: Active (MAX 1 at a time)
   - `completed`: Done and verified
   - `cancelled`: Skipped with reason

## Workflow Pattern
1. **Plan**: Create all `pending` tasks upfront.
2. **Execute**:
   - Mark task `in_progress`.
   - Delegate to subagent.
   - Verify result.
   - Mark task `completed`.
3. **Adapt**: If new requirements arise, add new `pending` tasks.

## Example
1. [completed] Analyze requirements
2. [in_progress] Create architecture plan
3. [pending] Implement schema
4. [pending] Implement API
5. [pending] Implement UI
```

### 15.5 MULTI-AGENT-COORDINATION.md

```markdown
# Multi-Agent Coordination

## The 4-Message Pattern
For parallel execution, strictly follow this sequence:

### Message 1: Preparation (Bash Only)
Prepare the environment. Create directories, check files.
```bash
mkdir -p .opencode/reviews
```

### Message 2: Parallel Execution (Task/Background Only)
Launch ALL subagents simultaneously.
```typescript
// Launch Reviewer 1 (Sonnet)
// Launch Reviewer 2 (Gemini)
// Launch Reviewer 3 (Grok)
```

### Message 3: Consolidation (Task Only)
Wait for completion, then aggregate results.
```typescript
// Launch Consolidator Agent
```

### Message 4: Presentation
Report findings to the user.
```

### 15.6 ERROR-RECOVERY.md

```markdown
# Error Recovery Strategies

## Strategy 1: The "Fix-it" Loop
1. Read error message.
2. Locate file/line.
3. Analyze recent changes.
4. Apply fix.
5. Verify fix.
6. If fail > 3 times, ESCALATE to user.

## Strategy 2: Clean Slate
If build state is corrupted:
1. `rm -rf .svelte-kit node_modules`
2. `npm install`
3. `npm run build`

## Strategy 3: Dependency Conflict
1. Check `package.json` for version mismatches.
2. Use `npm list` to find duplicates.
3. Pin exact versions if needed.

## Strategy 4: Hallucination Check
If agent gets stuck or confused:
1. Clear session context (summarize).
2. Re-read critical files.
3. Restart current task from scratch.
```
### 15.7 SHADCN-SVELTE.md

```markdown
# shadcn-svelte Patterns

## Core Principles
1. **Component Usage**: Import from `$lib/components/ui/`.
2. **Props**: Use `Builders` for complex interactions.
3. **Styling**: Tailwind CSS classes via `class` prop.
4. **Events**: Forward events using `onOpenChange`, etc.

## Button Example
```svelte
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
</script>

<Button variant="outline" size="sm" onclick={handleClick}>
  Click me
</Button>
```

## Form Example
```svelte
<script lang="ts">
  import * as Form from "$lib/components/ui/form";
</script>

<Form.Root form={form} let:config>
  <Form.Field {config} name="email">
    <Form.Item>
      <Form.Label>Email</Form.Label>
      <Form.Input />
      <Form.Validation />
    </Form.Item>
  </Form.Field>
</Form.Root>
```

## Icons
- Use `lucide-svelte` for icons.
- `<IconName class="h-4 w-4" />`
```

### 15.8 DEBUGGING-STRATEGIES.md

```markdown
# Debugging Strategies

## Universal Analysis Loop
1. **Observe**: Capture exact error message, stack trace, and behavior.
2. **Hypothesize**: List 3 possible causes (e.g., Network, Logic, State).
3. **Experiment**: Isolate variables. Add logs. Test hypothesis.
4. **Fix**: Apply minimal change. Verify.
5. **Prevent**: Add test case or type safety to prevent recurrence.

## Frontend (SvelteKit)
- **Hydration Errors**: Check for mismatched HTML between server/client.
- **State Issues**: Use `$inspect(state)` to trace rune changes.
- **Network**: Check Network tab for 4xx/5xx responses.

## Backend (Convex)
- **Schema**: Check `convex/schema.ts` definitions.
- **Permissions**: Verify auth checks in mutations.
- **Logs**: Check Convex dashboard logs for server-side errors.
```

### 15.9 DOCUMENTATION-STANDARDS.md

```markdown
# Documentation Standards

## 15 Best Practices
1. **Active Voice**: "Click the button" (not "The button should be clicked").
2. **Present Tense**: "The function returns..." (not "will return").
3. **Quick Start**: First section must yield success in <5 minutes.
4. **Progressive Disclosure**: Overview -> Details -> Reference.
5. **Code Examples**: Real-world, copy-pasteable, verified.
6. **Expected Output**: Show what happens after the command.
7. **Prerequisites**: State dependencies clearly upfront.
8. **Consistent Terminology**: Use the same term for the same concept.
9. **Visual Aids**: Diagrams/Screenshots for complex flows.
10. **Error Solutions**: "If you see X, do Y."
11. **Version Compatibility**: State supported versions.
12. **Searchable Headings**: Use keywords in H2/H3.
13. **Cross-References**: Link to related concepts.
14. **Changelog**: Document breaking changes.
15. **Attribution**: Credit sources if external.

## Structure Template
```markdown
# Title

One-sentence summary.

## Quick Start
```bash
npm install package
```

## Usage
...

## API Reference
...
```
```

### 15.10 UNIVERSAL-PATTERNS.md

```markdown
# Universal Patterns

## ReAct Pattern
**Re**asoning + **Act**ing.
- **Thought**: Analyze the situation.
- **Action**: Execute a tool.
- **Observation**: Read the output.
- **Repeat**.

## The "Yield" Protocol
When a tool requires user input (e.g., `ask_user`), **STOP GENERATING**.
- Do not simulate the user.
- Do not hallucinate the response.
- Wait for the system to return the actual user input.

## Defensive Coding
- Validate inputs at boundaries.
- Handle null/undefined explicitly.
- Use strict types.
- Fail fast with clear error messages.
```
