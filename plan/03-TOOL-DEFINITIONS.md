## 3. Tool Definitions

<!-- =============================================================================
WHY: Tool/Command Segmentation (DECISIONS.md D007)
================================================================================

1. SEPARATE COMMANDS
   - /implement for full workflow
   - /implement-api for API-only
   - /validate-ui for design validation
   - /review for code review
   - Separation allows skipping/repeating phases independently

2. TOOL HELPER PATTERN
   - Use `tool()` from @opencode-ai/plugin
   - Define args with tool.schema (Zod-like)
   - Execute function receives args and context
   - Return string result

3. CONTEXT OBJECT
   - sessionID: Current session
   - messageID: Current message
   - agent: Current agent name
   - metadata(): Set title and metadata

============================================================================= -->

### 3.1 Tool Helper Pattern

<!-- =============================================================================
WHY: Tool Helper Pattern (btca research: opencode)
================================================================================

1. TYPE SAFETY
   - tool() provides compile-time type checking
   - Zod schema validation at runtime
   - Automatic argument parsing and error handling

2. STANDARDIZED INTERFACE
   - Consistent tool definition across the plugin
   - tool.schema is alias to Zod (full Zod API available)
   - Context object with standardized properties

3. DISCOVERABILITY
   - tool.description is used by AI to understand when to use tool
   - Schema descriptions appear in AI UI
   - Automatic validation and error messages

============================================================================= -->

```typescript
import { tool } from "@opencode-ai/plugin";

// tool() function signature
// tool({
//   description: string,  // Required: Human-readable description
//   args: Record<string, ZodSchema>,  // Required: Zod schemas for validation
//   async execute(args: ArgsType, ctx: ToolContext): Promise<any>  // Required: Implementation
// })

export const myTool = tool({
  description: "Tool description for AI to understand when to use it",
  args: {
    requiredArg: tool.schema.string().describe("Description"),
    optionalArg: tool.schema.number().optional().describe("Optional description"),
    // All Zod schema types available:
    // - tool.schema.string(), number(), boolean(), date()
    // - tool.schema.array(innerSchema), object(shape), record(valueSchema)
    // - tool.schema.union([s1, s2]), enum([...])
    // - tool.schema.literal(value), optional(innerSchema)
    // Chain methods: .min(), .max(), .describe(), .default()
  },
  async execute(args, ctx) {
    // ctx properties (from OpenCode SDK):
    // - sessionID: string
    // - messageID: string  
    // - agent: string
    // - metadata(input): void - Set title/metadata for UI
    ctx.metadata?.({ title: "My Tool", metadata: { key: "value" } });
    return "Result string";
  },
});
```

### 3.2 /implement Command

```typescript
// src/tools/implement.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";
import { detectWorkflowType } from "../workflows/detector";

export const implement = tool({
  description: `Full-cycle feature implementation with architecture planning, implementation, review, and testing.

Usage: /implement <feature description>

This command automatically detects workflow type and routes to appropriate workflow:

**For UI_FOCUSED or MIXED tasks → /frontend:implement (8 phases):**
- Phase 1: Architecture Planning (user approval)
- Phase 2: Implementation
- Phase 2.5: Design Fidelity Validation (optional, Figma)
- Phase 3: Triple Review (3.1 senior, 3.2 AI/Codex, 3.3 UI testing)
- Phase 4: Test Generation (vitest-test-architect)
- Phase 5: User Final Approval
- Phase 6: Project Cleanup
- Phase 7: Final Delivery

**For API_FOCUSED tasks → /dev:implement (6 phases):**
- Phase 0: Initialize (stack-detector)
- Phase 1: Skill Confirmation
- Phase 2: Implementation Planning
- Phase 3: Implementation
- Phase 4: Validation (TDD loop)
- Phase 5: Finalization`,

  args: {
    description: tool.schema.string().describe("Feature to implement"),
    figma_url: tool.schema.string().optional().describe("Figma URL for UI validation"),
    skip_plan_review: tool.schema.boolean().optional().describe("Skip external plan review"),
    workflow_type: tool.schema.enum(["UI_FOCUSED", "API_FOCUSED", "MIXED"]).optional()
      .describe("Force workflow type instead of auto-detection"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("impl", args.description);
    const sessionDir = await createSessionDirectory(sessionId);

    // Detect or use forced workflow type
    const workflowType = args.workflow_type ?? detectWorkflowType(args.description);

    ctx.metadata?.({
      title: `/implement: ${args.description.slice(0, 30)}...`,
      metadata: {
        sessionId,
        workflowType,
        figmaUrl: args.figma_url,
      },
    });

    return `Session created: ${sessionId}

**Workflow Type:** ${workflowType.type} (${Math.round(workflowType.confidence * 100)}% confidence)
**Rationale:** ${workflowType.rationale}

**Session Directory:** ${sessionDir}

**Next Steps:**
1. Architect will analyze requirements and create implementation plan
2. You'll review and approve the plan
3. Implementation will proceed based on workflow type

Starting architecture planning...

<system-instruction>
Use the Task tool to delegate to the architect agent with this prompt:

"Create an implementation plan for: ${args.description}

Session: ${sessionId}
Workflow Type: ${workflowType.type}
${args.figma_url ? `Figma URL: ${args.figma_url}` : ""}

Write output to:
- ${sessionDir}/implementation-plan.md
- ${sessionDir}/quick-reference.md"
</system-instruction>`;
  },
});
```

### 3.3 /implement-api Command

```typescript
// src/tools/implement-api.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const implementApi = tool({
  description: `API-focused implementation for Convex backend work only.

Usage: /implement-api <api description>

Forces /dev:implement workflow (6 phases) optimized for backend:
- Phase 0: Initialize (stack-detector detects Convex)
- Phase 1: Skill Confirmation (loads Convex skill)
- Phase 2: Implementation Planning (schema, queries, mutations)
- Phase 3: Implementation (backend agent)
- Phase 4: Validation (TDD loop with vitest-test-architect)
- Phase 5: Finalization

Skips UI-specific phases (design validation, browser testing).`,

  args: {
    description: tool.schema.string().describe("API feature to implement"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("api", args.description);
    const sessionDir = await createSessionDirectory(sessionId);

    ctx.metadata?.({
      title: `/implement-api: ${args.description.slice(0, 30)}...`,
      metadata: { sessionId, workflowType: "API_FOCUSED" },
    });

    return `API Session created: ${sessionId}

**Workflow Type:** API_FOCUSED (forced)

**Session Directory:** ${sessionDir}

**Phases (API_FOCUSED subset):**
- STEP 0/0.1/0.2: Initialize
- PHASE 1: Architecture planning
- PHASE 2: Implementation (backend agent)
- PHASE 2.5-B: TDD loop
- PHASE 3: Code review (2 reviewers)
- PHASE 5: User review & cleanup
- PHASE 6: Final summary

Starting backend architecture planning...

<system-instruction>
Use the Task tool to delegate to the architect agent with this prompt:

"Create a Convex API implementation plan for: ${args.description}

Session: ${sessionId}
Focus: Convex schema, queries, mutations, actions

Write output to:
- ${sessionDir}/implementation-plan.md
- ${sessionDir}/quick-reference.md"
</system-instruction>`;
  },
});
```

### 3.4 /validate-ui Command

```typescript
// src/tools/validate-ui.ts
import { tool } from "@opencode-ai/plugin";

export const validateUi = tool({
  description: `Validate UI implementation against Figma designs.

Usage: /validate-ui <component/page path> [--figma_url=<url>]

Uses the designer agent to compare screenshots with Figma designs.`,

  args: {
    path: tool.schema.string().describe("Path to component or page to validate"),
    figma_url: tool.schema.string().optional().describe("Figma URL for comparison"),
  },

  async execute(args, ctx) {
    ctx.metadata?.({
      title: `/validate-ui: ${args.path}`,
      metadata: { path: args.path, figmaUrl: args.figma_url },
    });

    return `Starting UI validation for: ${args.path}

${args.figma_url ? `**Figma URL:** ${args.figma_url}` : "**Note:** No Figma URL provided - will do general UI review"}

<system-instruction>
Use the Task tool to delegate to the designer agent with this prompt:

"Validate the UI implementation at: ${args.path}
${args.figma_url ? `Compare against Figma: ${args.figma_url}` : ""}

1. Take a screenshot of the current implementation
2. Compare against the design (or review for general quality)
3. List any discrepancies with severity
4. Write findings to design-validation.md"
</system-instruction>`;
  },
});
```

### 3.5 /review Command

<!-- =============================================================================
WHY: Agent-Driven Consensus Analysis (DECISIONS.md D021)
================================================================================

1. MAG PATTERN: CONSOLIDATION VIA PROMPT
   - MAG calculates consensus via the consolidation agent, not runtime code
   - The consolidation agent reads all review files and applies consensus rules
   - Quality gate parses the consolidated output for blocking issues

2. CONSENSUS LEVELS (per-issue basis)
   - UNANIMOUS: All N models flag the same issue → MUST FIX
   - STRONG: 2/3+ models agree → RECOMMENDED
   - DIVERGENT: Only 1 model flags → OPTIONAL (may be false positive)

3. WHY NOT CODE-BASED
   - AI models are better at semantic matching of similar issues across reviews
   - Avoids complex issue-deduplication logic in code
   - More flexible to different review formats

============================================================================= -->

```typescript
// src/tools/review.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const review = tool({
  description: `Multi-model code review with consensus analysis.

Usage: /review <file or directory path>

Runs parallel reviews with multiple AI models and consolidates findings
using MAG-style consensus analysis (UNANIMOUS/STRONG/DIVERGENT).`,

  args: {
    path: tool.schema.string().describe("File or directory to review"),
    models: tool.schema.array(tool.schema.string()).optional()
      .describe("Models to use (default: configured review models)"),
  },

  async execute(args, ctx) {
    const defaultModels = ["anthropic/claude-sonnet-4-5", "opencode/grok-code", "google/gemini-2.5-flash"];
    const models = args.models ?? defaultModels;
    const sessionId = generateSessionId("review", args.path);
    const sessionDir = await createSessionDirectory(sessionId);

    ctx.metadata?.({
      title: `/review: ${args.path}`,
      metadata: { path: args.path, models, sessionId },
    });

    return `Starting multi-model code review

**Path:** ${args.path}
**Models:** ${models.join(", ")}
**Session:** ${sessionId}

<system-instruction>
Use the 4-Message Pattern for parallel multi-model review:

## MESSAGE 1: Preparation (Bash Only)

Create review workspace and gather context:
\`\`\`bash
mkdir -p ${sessionDir}/reviews
\`\`\`

## MESSAGE 2: Parallel Execution (Background Tasks Only)

Launch ALL reviewers in a SINGLE message using background_task - they run simultaneously!
${models.map((model, i) => `
/background_task
  agent: reviewer
  model: ${model}
  prompt: "Review the code at: ${args.path}

Provide a structured review with:
- Verdict: APPROVED | NEEDS_REVISION | MAJOR_CONCERNS
- Issues by severity (CRITICAL, MAJOR, MINOR, NITPICK)
- Specific file:line references
- Suggested fixes

Write your review to: ${sessionDir}/reviews/${model.replace(/\//g, "-")}.md""
  description: "Code review: ${model} on ${args.path}"
  run_in_background: true
`).join("\n---\n")}

## MESSAGE 3: Progressive Consolidation (Auto-Trigger)

Set up a consolidation watcher that starts when N≥2 reviews complete:

Task: reviewer
  Prompt: "Watch for ${models.length} code reviews in ${sessionDir}/reviews/

When reviews complete:
1. Check consensus every 30 seconds
2. Start consolidation when >=${Math.max(2, Math.ceil(models.length * 0.6))} reviews complete
3. Apply consensus analysis for EACH issue found:
   - **UNANIMOUS**: All completed models flag this issue → MUST FIX (blocking)
   - **STRONG**: ${Math.ceil(models.length * 0.7)}+ models agree → RECOMMENDED
   - **DIVERGENT**: Only 1 model flags → OPTIONAL (review before fixing)

Output format for ${sessionDir}/consolidated-review.md:

## Consensus Summary
- Total unique issues: N
- UNANIMOUS issues: N (must fix before proceeding)
- STRONG consensus issues: N
- DIVERGENT issues: N

## UNANIMOUS Issues (MUST FIX)
[List issues flagged by ALL reviewers]

## STRONG Consensus Issues (RECOMMENDED)
[List issues flagged by 2/3+ reviewers]

## DIVERGENT Issues (OPTIONAL)
[List issues flagged by only 1 reviewer - may be false positives]

Continue watching and update consolidated review as more reviewers finish."

Apply consensus analysis for EACH issue found:
- **UNANIMOUS**: All ${models.length} models flag this issue → MUST FIX (blocking)
- **STRONG**: ${Math.ceil(models.length * 2/3)}+ models agree → RECOMMENDED
- **DIVERGENT**: Only 1 model flags → OPTIONAL (review before fixing)

Output format for ${sessionDir}/consolidated-review.md:

## Consensus Summary
- Total unique issues: N
- UNANIMOUS issues: N (must fix before proceeding)
- STRONG consensus issues: N
- DIVERGENT issues: N

## UNANIMOUS Issues (MUST FIX)
[List issues flagged by ALL reviewers]

## STRONG Consensus Issues (RECOMMENDED)
[List issues flagged by 2/3+ reviewers]

## DIVERGENT Issues (OPTIONAL)
[List issues flagged by only 1 reviewer - may be false positives]

## Individual Review Summaries
[Brief summary of each model's verdict]"

## MESSAGE 4: Present Results

Read ${sessionDir}/consolidated-review.md and present to user.
If UNANIMOUS issues exist, the code review gate FAILS - fixes required.
</system-instruction>`;
  },
});
```

### 3.6 /cleanup Command

```typescript
// src/tools/cleanup.ts
import { tool } from "@opencode-ai/plugin";
import { listSessions, deleteSession } from "../sessions";

export const cleanup = tool({
  description: `Clean up session artifacts.

Usage: /cleanup [session_id]

Without session_id: Lists all sessions
With session_id: Deletes that session`,

  args: {
    session_id: tool.schema.string().optional().describe("Session ID to delete"),
  },

  async execute(args, ctx) {
    if (!args.session_id) {
      const sessions = await listSessions();
      if (sessions.length === 0) {
        return "No sessions found.";
      }

      const list = sessions
        .map((s) => `- ${s.id} (${s.status}) - ${s.description}`)
        .join("\n");

      return `Sessions (${sessions.length}):\n\n${list}\n\nUse /cleanup <session_id> to delete a session.`;
    }

    const deleted = await deleteSession(args.session_id);
    if (deleted) {
      return `Deleted session: ${args.session_id}`;
    } else {
      return `Session not found: ${args.session_id}`;
    }
  },
});

### 3.11 /ask_user Command

```typescript
// src/tools/ask-user.ts
import { tool } from "@opencode-ai/plugin";
import type { MagnusOpusConfig } from "../config/schema";

export const askUser = tool({
  description: `Ask the user a question and wait for their response.

This is a blocking tool that pauses workflow execution until the user responds.
Use for user approval gates, clarifications, or critical decisions.

Usage: /ask_user <question> [--options=<option1,option2>]

The tool will:
1. Present the question clearly
2. Wait for user input
3. Return the user's response to continue workflow`,
  
  args: {
    question: tool.schema.string().describe("Question to ask the user"),
    options: tool.schema.array(tool.schema.string()).optional()
      .describe("List of valid options (creates choice prompt)"),
    timeout: tool.schema.number().optional()
      .describe("Timeout in seconds (default: 60)"),
  },

  async execute(args, ctx) {
    // This is implemented by the plugin's orchestration logic
    // The tool call triggers a blocking user prompt in the UI
    // The response is returned to the agent to continue workflow
    
    return `🤔 User Question: ${args.question}
${args.options ? `\nOptions: ${args.options.join(", ")}` : ""}

Waiting for user response...`;
  },
});
```
```

### 3.7 /debug Command

<!-- =============================================================================
WHY: Standalone Debug Command (DECISIONS.md D027)
================================================================================

1. MAG PATTERN: 6-PHASE DEBUGGING WORKFLOW
   - Systematic debugging separate from implementation
   - Debugger agent is READ-ONLY (analyzes but doesn't fix)
   - Developer agent applies fixes after root cause confirmed
   - Clear separation of concerns

2. PHASES
   0. Initialize - Setup session, capture error context
   1. Analyze - Parse error, list potential causes
   2. Investigate - Trace root cause, get user confirmation
   3. Fix - Developer agent applies minimal fix
   4. Validate - Run reproduction, tests
   5. Report - Document session

============================================================================= -->

```typescript
// src/tools/debug.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const debug = tool({
  description: `Systematic debugging with root cause analysis.

Usage: /debug <error description or stack trace>

This command follows a 6-phase workflow:
1. Initialize - Capture error context, detect stack
2. Analyze - Parse error, list potential root causes
3. Investigate - Trace root cause with evidence
4. Fix - Apply minimal fix (via developer agent)
5. Validate - Verify fix resolves issue
6. Report - Document debugging session

IMPORTANT: The debugger agent ANALYZES but does NOT fix code.
The developer agent applies fixes after root cause is confirmed.`,

  args: {
    error: tool.schema.string().describe("Error message, stack trace, or issue description"),
    file_path: tool.schema.string().optional().describe("Specific file where error occurs"),
    max_iterations: tool.schema.number().optional().describe("Max fix-validate cycles (default: 2)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("debug", args.error.slice(0, 30));
    const sessionDir = await createSessionDirectory(sessionId);
    const maxIterations = args.max_iterations ?? 2;

    ctx.metadata?.({
      title: `/debug: ${args.error.slice(0, 40)}...`,
      metadata: { sessionId, filePath: args.file_path, maxIterations },
    });

    return `Debug session created: ${sessionId}

**Error:** ${args.error.slice(0, 100)}${args.error.length > 100 ? "..." : ""}
${args.file_path ? `**File:** ${args.file_path}` : ""}
**Max Fix Iterations:** ${maxIterations}

**Session Directory:** ${sessionDir}

<system-instruction>
Execute the 6-phase debugging workflow:

## PHASE 0: Initialize
Create debug context file:
\`\`\`bash
mkdir -p ${sessionDir}
\`\`\`

## PHASE 1: Analyze (Task → debugger agent)
Task: debugger
  Prompt: "Analyze this error and list potential root causes:

Error: ${args.error}
${args.file_path ? `File: ${args.file_path}` : ""}

Follow the 5-phase analysis workflow:
1. Parse error message and stack trace
2. Categorize error type
3. List potential root causes ranked by likelihood
4. Identify relevant files to investigate
5. Suggest investigation paths

Write analysis to: ${sessionDir}/error-analysis.md

CRITICAL: You are a DEBUGGER, not an IMPLEMENTER.
- ✓ Analyze errors, read code, recommend fixes
- ✗ Do NOT write or edit any code"

## PHASE 2: Investigate (Read analysis, then Task → debugger agent)
After analysis, investigate top causes:

Task: debugger
  Prompt: "Investigate the root cause based on ${sessionDir}/error-analysis.md

For each potential cause (in likelihood order):
1. Read relevant source files
2. Use Grep to find related patterns
3. Trace data/control flow
4. Verify or eliminate each hypothesis

Confirm the actual root cause with evidence.
Write findings to: ${sessionDir}/root-cause.md"

## USER CONFIRMATION GATE
Ask user: "Root cause identified. Proceed with fix?"

## PHASE 3: Fix (Task → developer agent, NOT debugger)
Task: developer (or backend for Convex issues)
  Prompt: "Apply a minimal fix for the root cause in ${sessionDir}/root-cause.md

Requirements:
- Minimal changes only
- Add regression test if applicable
- Document the fix inline"

## PHASE 4: Validate
Run reproduction steps and tests. If issue persists:
- Iteration ${maxIterations > 1 ? "1-" + maxIterations : "1"}: Return to Phase 3
- After ${maxIterations} iterations: Escalate to user

## PHASE 5: Report
Write debug report to: ${sessionDir}/debug-report.md
Include: Issue summary, root cause, fix applied, files modified, prevention recommendations
</system-instruction>`;
  },
});
```

### 3.8 /architect Command

```typescript
// src/tools/architect.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const architect = tool({
  description: `Standalone architecture planning without implementation.

Usage: /architect <feature or system description>

Creates a comprehensive architecture plan including:
1. Requirements analysis
2. Data model design
3. API contracts
4. Component structure
5. Implementation phases

Use this when you want planning only, without triggering implementation.`,

  args: {
    description: tool.schema.string().describe("Feature or system to architect"),
    scope: tool.schema.enum(["feature", "system", "refactor"]).optional()
      .describe("Scope of architecture (default: feature)"),
  },

  async execute(args, ctx) {
    const scope = args.scope ?? "feature";
    const sessionId = generateSessionId("arch", args.description.slice(0, 20));
    const sessionDir = await createSessionDirectory(sessionId);

    ctx.metadata?.({
      title: `/architect: ${args.description.slice(0, 30)}...`,
      metadata: { sessionId, scope },
    });

    return `Architecture session created: ${sessionId}

**Scope:** ${scope}
**Description:** ${args.description}

**Session Directory:** ${sessionDir}

<system-instruction>
Execute standalone architecture planning:

## PHASE 1: Requirements Gathering
Task: architect
  Prompt: "Analyze requirements for: ${args.description}

Scope: ${scope}

1. Restate the requirements in your own words
2. Identify explicit requirements
3. Infer implicit requirements
4. List assumptions that need validation
5. Identify potential risks and dependencies

Ask clarifying questions if critical information is missing.

Write to: ${sessionDir}/requirements.md"

## USER CHECKPOINT
Present requirements summary. Ask: "Are these requirements accurate? Any additions?"

## PHASE 2: Design
Task: architect
  Prompt: "Create architecture design based on ${sessionDir}/requirements.md

Include:
- Data Model: Convex schema with tables, indexes, relationships
- API Contracts: Query/mutation signatures with input/output types
- Component Structure: SvelteKit routes and components
- State Management: $state, $derived, stores
- Error Handling: Error types and recovery strategies

Write to: ${sessionDir}/architecture.md"

## PHASE 3: Review
Task: plan-reviewer
  Prompt: "Review the architecture in ${sessionDir}/architecture.md

Check for:
- Missing edge cases
- Scalability concerns
- Security issues
- Consistency with SvelteKit + Convex patterns
- Implementation order correctness

Write feedback to: ${sessionDir}/architecture-review.md"

## PHASE 4: Document
Create final deliverables:
- ${sessionDir}/implementation-plan.md - Comprehensive plan
- ${sessionDir}/quick-reference.md - Checklist for developers

Present summary to user with next steps.
</system-instruction>`;
  },
});
```

### 3.9 /doc Command

```typescript
// src/tools/doc.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const doc = tool({
  description: `Generate documentation following 15 research-backed best practices.

Usage: /doc <topic or path>

Supports: README, API docs, tutorials, ADRs, changelogs, error docs, troubleshooting.

The doc-writer agent will:
1. Analyze the target code/topic
2. Select appropriate documentation template
3. Generate documentation with examples
4. Verify against quality criteria`,

  args: {
    topic: tool.schema.string().describe("Topic, file path, or function to document"),
    type: tool.schema.enum(["readme", "api", "tutorial", "adr", "changelog", "error", "troubleshooting"])
      .optional().describe("Documentation type (auto-detected if not specified)"),
    output_path: tool.schema.string().optional().describe("Output file path (auto-generated if not specified)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("doc", args.topic.slice(0, 20));
    const sessionDir = await createSessionDirectory(sessionId);
    const docType = args.type ?? "auto";

    ctx.metadata?.({
      title: `/doc: ${args.topic.slice(0, 30)}...`,
      metadata: { sessionId, docType, outputPath: args.output_path },
    });

    return `Documentation session created: ${sessionId}

**Topic:** ${args.topic}
**Type:** ${docType === "auto" ? "Auto-detect" : docType}
${args.output_path ? `**Output:** ${args.output_path}` : ""}

**Session Directory:** ${sessionDir}

<system-instruction>
Execute documentation generation workflow:

## PHASE 1: Context (Task → doc-writer)
Task: doc-writer
  Prompt: "Analyze the documentation target: ${args.topic}

1. Read the source code or understand the topic
2. Identify the appropriate documentation type${docType !== "auto" ? ` (requested: ${docType})` : ""}
3. Gather all necessary context:
   - Function signatures
   - Usage patterns
   - Related files
   - Existing documentation

Write context notes to: ${sessionDir}/doc-context.md"

## PHASE 2: Template Selection
Based on context, select template:
- README: Project overview, quick start, installation
- API: TSDoc/JSDoc for functions, classes, modules
- Tutorial: Step-by-step guide with code examples
- ADR: Architecture Decision Record with context, decision, consequences
- Changelog: Version history with breaking changes
- Error: Error codes with causes and solutions
- Troubleshooting: Common issues with diagnostic steps

## PHASE 3: Generate (Task → doc-writer)
Task: doc-writer
  Prompt: "Generate documentation based on ${sessionDir}/doc-context.md

Apply ALL 15 best practices:
1. Active voice, present tense
2. 5-minute quick start where applicable
3. Progressive disclosure (overview → details → reference)
4. Language-specific tools (TSDoc for TypeScript)
5. Code examples with expected output
6. Error documentation with solutions
7. Version compatibility notes
8. Prerequisites clearly stated
9. Copy-pasteable commands
10. Visual aids where helpful
11. Consistent terminology
12. Searchable headings
13. Cross-references to related docs
14. Changelog for breaking changes
15. Troubleshooting section

Write draft to: ${sessionDir}/doc-draft.md"

## PHASE 4: Verify
Self-check against critical criteria:
- All code examples tested/valid
- No hallucinated features
- Prerequisites complete
- Links valid

## PHASE 5: Write
Write final documentation to: ${args.output_path ?? "appropriate location based on type"}

Present summary with documentation location.
</system-instruction>`;
  },
});
```

### 3.10 /interview Command

<!-- =============================================================================
WHY: Structured Requirements Interview (MAG Parity Gap - /dev:interview)
================================================================================

1. MAG PATTERN: 5-WHYS ELICITATION
   - MAG has /dev:interview for spec elicitation
   - Uses structured questioning to gather requirements
   - Prevents implementation rework from ambiguous prompts

2. ASKUSERQUESTION INTEGRATION
   - Uses OpenCode's AskUserQuestion tool for structured questioning
   - Multi-select options with descriptions
   - Custom input always available

3. OPTIONAL PRE-IMPLEMENTATION PHASE
   - Can run standalone: /interview <description>
   - Integrates with /implement: auto-triggers for ambiguous prompts
   - Skip with --skip-interview flag

============================================================================= -->

```typescript
// src/tools/interview.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const interview = tool({
  description: `Structured requirements interview for gathering detailed specifications.

Usage: /interview <brief description>

This command:
1. Creates an interview session
2. Asks clarifying questions using AskUserQuestion tool
3. Generates detailed requirements document
4. Provides specification for /implement command

Example: /interview create a twitch clone app

The interviewer agent will ask about:
- Scope and MVP boundaries
- Core features and functionality
- UI/UX preferences
- Technical constraints
- Data model complexity
- Authentication needs
- Integration requirements
- Success criteria`,

  args: {
    description: tool.schema.string().describe("Brief description of what to build"),
    depth: tool.schema.enum(["basic", "detailed", "comprehensive"]).optional()
      .describe("Interview depth (default: detailed)"),
    start_implementation: tool.schema.boolean().optional()
      .describe("Auto-start /implement after interview (default: false)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("interview", args.description);
    const sessionDir = await createSessionDirectory(sessionId);
    const depth = args.depth ?? "detailed";

    ctx.metadata?.({
      title: `/interview: ${args.description.slice(0, 30)}...`,
      metadata: { sessionId, depth },
    });

    return `Interview session created: ${sessionId}

**Description:** ${args.description}
**Depth:** ${depth}
**Session Directory:** ${sessionDir}

Starting requirements interview...

<system-instruction>
Use the Task tool to delegate to the interviewer agent with this prompt:

"Conduct a structured requirements interview for: ${args.description}

Session: ${sessionId}
Depth: ${depth}

Use AskUserQuestion to systematically gather:
1. Project scope and MVP boundaries
2. Core features and functionality (use multi-select)
3. User interface preferences and complexity
4. Technical stack preferences or constraints
5. Data model complexity and relationships
6. Authentication and authorization needs
7. Performance and scalability requirements
8. Integration with existing systems
9. Success criteria and measurable outcomes

Write comprehensive specification to:
- ${sessionDir}/interview-notes.md (raw interview data)
- ${sessionDir}/clarified-requirements.md (structured specification)

After interview completes, present findings for user approval.
${args.start_implementation ? `If approved, continue with /implement using clarified requirements.` : `Provide ready-to-use /implement command with all gathered context.`}"
</system-instruction>`;
  },
});
```

### 3.10.1 /import-figma Command

<!-- =============================================================================
WHY: Dedicated Figma Import (MAG Parity Gap - /import-figma)
================================================================================

1. MAG PATTERN: FIGMA IMPORT WORKFLOW
   - MAG has dedicated /import-figma command
   - Uses Figma MCP for design extraction
   - Generates component stubs from Figma designs

2. DISTINCT FROM /validate-ui
   - /validate-ui: Compares implementation against design
   - /import-figma: Extracts designs and generates component shells
   - One creates, one validates

3. COMPONENT GENERATION
   - Extracts design tokens (colors, spacing, typography)
   - Generates SvelteKit component shells
   - Creates Tailwind CSS class mappings

============================================================================= -->

```typescript
// src/tools/import-figma.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const importFigma = tool({
  description: `Import designs from Figma and generate component shells.

Usage: /import-figma <figma_url>

This command:
1. Fetches design data from Figma via MCP
2. Extracts design tokens (colors, spacing, typography)
3. Identifies component structure
4. Generates SvelteKit component shells with Tailwind classes
5. Creates design-system.md documentation

Unlike /validate-ui which compares implementation against design,
/import-figma creates initial component code from designs.`,

  args: {
    figma_url: tool.schema.string().describe("Figma URL (file, frame, or component)"),
    output_dir: tool.schema.string().optional()
      .describe("Output directory for generated components (default: src/lib/components)"),
    include_tokens: tool.schema.boolean().optional()
      .describe("Generate design tokens file (default: true)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("figma", "import");
    const sessionDir = await createSessionDirectory(sessionId);
    const outputDir = args.output_dir ?? "src/lib/components";
    const includeTokens = args.include_tokens ?? true;

    ctx.metadata?.({
      title: `/import-figma`,
      metadata: { sessionId, figmaUrl: args.figma_url, outputDir },
    });

    return `Figma import session created: ${sessionId}

**Figma URL:** ${args.figma_url}
**Output Directory:** ${outputDir}
**Include Design Tokens:** ${includeTokens}

**Session Directory:** ${sessionDir}

Starting Figma design import...

<system-instruction>
Use the Task tool to delegate to the designer agent with this prompt:

"Import and extract design components from Figma.

Session: ${sessionId}
Figma URL: ${args.figma_url}

## Phase 1: Extraction
Use the Figma MCP to:
1. Fetch design file metadata
2. Extract component hierarchy
3. Identify design tokens:
   - Color palette (with semantic names)
   - Typography scale
   - Spacing values
   - Border radius values
   - Shadow definitions

## Phase 2: Analysis
For each component identified:
1. Analyze layout structure (flex, grid, etc.)
2. Map Figma styles to Tailwind classes
3. Identify variants and states
4. Note responsive breakpoints

## Phase 3: Generation
${includeTokens ? `Create design tokens file: ${outputDir}/design-tokens.ts` : ""}

For each component, generate:
- SvelteKit component shell: ${outputDir}/{ComponentName}.svelte
- Props interface with variants
- Base Tailwind classes
- Placeholder for implementation logic

## Phase 4: Documentation
Write to: ${sessionDir}/design-import.md
Include:
- Component inventory
- Design token reference
- Implementation notes
- Figma to code mapping

Present summary to user with generated files list."
</system-instruction>`;
  },
});
```

### 3.10.2 /analyze Command

<!-- =============================================================================
WHY: Deep Codebase Investigation (MAG Parity Gap - /analyze)
================================================================================

1. MAG PATTERN: CODEBASE DETECTIVE
   - MAG's Code Analysis plugin has /analyze command
   - Deep investigation beyond simple grep/glob
   - Multi-pass analysis with hypothesis tracking

2. EXPLORATION + SYNTHESIS
   - explorer agent: Fast file finding
   - analyze: Deep investigation with context
   - Traces data flow, identifies patterns, maps dependencies

3. USE CASES
   - "Where is user authentication handled?"
   - "How does the cart system work?"
   - "What's the data flow for checkout?"

============================================================================= -->

```typescript
// src/tools/analyze.ts
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const analyze = tool({
  description: `Deep codebase investigation and analysis.

Usage: /analyze <question or topic>

This command performs multi-pass codebase investigation:
1. Initial exploration to identify relevant files
2. Deep analysis of discovered code
3. Dependency and data flow tracing
4. Pattern identification
5. Comprehensive findings report

More thorough than /explore - use for complex questions about
how systems work, where things are handled, or architectural understanding.

Examples:
- /analyze How does user authentication work?
- /analyze What's the data flow for the checkout process?
- /analyze Where are API errors handled?`,

  args: {
    question: tool.schema.string().describe("Question or topic to investigate"),
    scope: tool.schema.enum(["focused", "broad", "exhaustive"]).optional()
      .describe("Investigation scope (default: broad)"),
    include_tests: tool.schema.boolean().optional()
      .describe("Include test files in analysis (default: false)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("analyze", args.question.slice(0, 20));
    const sessionDir = await createSessionDirectory(sessionId);
    const scope = args.scope ?? "broad";
    const includeTests = args.include_tests ?? false;

    ctx.metadata?.({
      title: `/analyze: ${args.question.slice(0, 30)}...`,
      metadata: { sessionId, scope, includeTests },
    });

    return `Analysis session created: ${sessionId}

**Question:** ${args.question}
**Scope:** ${scope}
**Include Tests:** ${includeTests}

**Session Directory:** ${sessionDir}

Starting deep codebase analysis...

<system-instruction>
Use the Task tool to delegate to the explorer agent with this prompt:

"Conduct deep codebase investigation for: ${args.question}

Session: ${sessionId}
Scope: ${scope}
Include Tests: ${includeTests}

## Phase 1: Initial Exploration (Hypothesis Formation)
1. Identify key terms and concepts from the question
2. Use Glob to find potentially relevant files
3. Use Grep to search for key patterns
4. Form hypotheses about where the answer lies
5. Track: files found, patterns discovered, initial hypotheses

## Phase 2: Deep Analysis
For each hypothesis (ranked by likelihood):
1. Read identified files thoroughly
2. Trace imports and exports
3. Follow function call chains
4. Identify related files discovered during reading
5. Note: confirmed findings, new questions, eliminated hypotheses

## Phase 3: Dependency Tracing
1. Map which files depend on which
2. Identify entry points and consumers
3. Trace data flow through the system
4. Document the call graph for relevant functions

## Phase 4: Pattern Recognition
1. Identify recurring patterns in the codebase
2. Note conventions being followed
3. Find similar implementations elsewhere
4. Document the architectural pattern in use

## Phase 5: Synthesis
Write comprehensive analysis to: ${sessionDir}/analysis-report.md

Include:
- Executive Summary (direct answer to question)
- Detailed Findings with file:line references
- Data Flow Diagram (text-based)
- Related Code Locations
- Patterns and Conventions Found
- Open Questions (things that need clarification)

Present findings to user with key insights highlighted."
</system-instruction>`;
  },
});
```

### 3.15 /help Command

```typescript
// src/tools/help.ts
import { tool } from "@opencode-ai/plugin";
import { builtinAgents } from "../agents";

export const help = tool({
  description: "Display Magnus Opus plugin documentation",

  args: {
    topic: tool.schema.enum(["commands", "agents", "workflows", "config", "all"]).optional()
      .describe("Specific topic to show"),
  },

  async execute(args) {
    const topic = args.topic ?? "all";

    const sections: string[] = [];

    if (topic === "all" || topic === "commands") {
      sections.push(`## Commands

| Command | Purpose |
|---------|---------|
| /implement | Full-cycle feature implementation |
| /implement-api | Convex backend only |
| /validate-ui | Design validation |
| /review | Multi-model code review |
| /cleanup | Session artifact cleanup |
| /debug | Systematic debugging with root cause analysis |
| /architect | Standalone architecture planning |
| /doc | Documentation generation |
| /resume | Resume interrupted workflow |
| /ask_user | Ask user question (blocks workflow) |
| /help | This documentation |`);
    }

    if (topic === "all" || topic === "agents") {
      const agentList = Object.entries(builtinAgents)
        .map(([name, agent]) => `| ${name} | ${agent.description} | ${agent.model} |`)
        .join("\n");

      sections.push(`## Agents

| Name | Role | Model |
|------|------|-------|
${agentList}`);
    }

    if (topic === "all" || topic === "workflows") {
      sections.push(`## Workflow Types

| Type | Description | Workflow | Key Agents |
|------|-------------|----------|------------|
| UI_FOCUSED | Components, pages, styling | /frontend:implement (8 phases) | developer, designer, ui-developer, reviewer, codex-reviewer, ui-tester |
| API_FOCUSED | Convex functions, schema | /dev:implement (6 phases) | backend, stack-detector, vitest-test-architect |
| MIXED | Both UI and API | /frontend:implement | developer, backend, all reviewers |

### /dev:implement Phases (General Development)
0. Initialize (stack-detector) → 1. Skill Confirmation → 2. Planning → 3. Implementation → 4. Validation → 5. Finalization

### /frontend:implement Phases (Frontend with Design Validation)
1. Architecture → 2. Implementation → 2.5. Design Validation → 3. Triple Review → 4. Test Generation → 5-7. Approval/Cleanup/Delivery`);
    }

    if (topic === "all" || topic === "config") {
      sections.push(`## Configuration

Config file: ~/.config/opencode/magnus-opus.json

\`\`\`json
{
  "agents": { "orchestrator": { "model": "anthropic/claude-opus-4-5" } },
  "disabled_agents": [],
  "disabled_mcps": [],
  "reviewModels": {
    "codeReview": ["xai/grok-code", "google/gemini-2.5-flash"],
    "autoUse": false
  }
}
\`\`\``);
    }

    return `# Magnus Opus Help

${sections.join("\n\n")}`;
  },
});
```

### 3.11 Tool Aggregation

```typescript
// src/tools/index.ts
import { implement } from "./implement";
import { implementApi } from "./implement-api";
import { validateUi } from "./validate-ui";
import { review } from "./review";
import { cleanup } from "./cleanup";
import { debug } from "./debug";
import { architect } from "./architect";
import { doc } from "./doc";
import { help } from "./help";
import { backgroundTask } from "./background-task";
import { backgroundOutput } from "./background-output";
import { createDelegateTask } from "./delegate-task";
import { interview } from "./interview";
import { importFigma } from "./import-figma";
import { analyze } from "./analyze";

export const builtinTools = {
  implement,
  "implement-api": implementApi,
  "validate-ui": validateUi,
  review,
  cleanup,
  debug,
  architect,
  doc,
  help,
  "background_task": backgroundTask,
  "background_output": backgroundOutput,
  "ask_user": askUser,
  resume,
  interview,
  "import-figma": importFigma,
  analyze,
  // delegate_task is created dynamically with BackgroundManager dependency
};

export * from "./implement";
export * from "./implement-api";
export * from "./validate-ui";
export * from "./review";
export * from "./cleanup";
export * from "./debug";
export * from "./architect";
export * from "./doc";
export * from "./help";
export * from "./background-task";
export * from "./background-output";
export * from "./ask-user";
export * from "./resume";
export * from "./interview";
export * from "./import-figma";
export * from "./analyze";
export { createDelegateTask } from "./delegate-task";
```

### 3.12 /background_task Command

```typescript
// src/tools/background-task.ts
import { tool } from "@opencode-ai/plugin";
import { createSessionDirectory, generateSessionId } from "../sessions";

export const backgroundTask = tool({
  description: `Launch a background agent task.
  
Usage: /background_task <description>

Creates a new session and runs an agent in the background.
Use background_output to check results.`,
  
  args: {
    description: tool.schema.string().describe("Task description"),
    prompt: tool.schema.string().default("Return a short confirmation that you ran.")
      .describe("Prompt to send to agent"),
    agent: tool.schema.string().default("orchestrator")
      .describe("Agent to run (default: orchestrator)"),
  },
  
  async execute(args, ctx) {
    const sessionId = generateSessionId("bg", args.description);
    const sessionDir = await createSessionDirectory(sessionId);
    
    ctx.metadata?.({
      title: `/background_task: ${args.description.slice(0, 30)}...`,
      metadata: { sessionId, agent: args.agent },
    });
    
    // Save session ID for background_output tool
    // This is handled by plugin-level state in src/index.ts
    
    return `Background task launched.
Session: ${sessionId}
Agent: ${args.agent}
Directory: ${sessionDir}

Use /background_output ${sessionId} to check results.`;
  },
});
```

### 3.12.1 Helper Functions for delegate_task

```typescript
// src/utils/agent-resolvers.ts
import type { MagnusOpusConfig } from "../config/schema";
import { builtinAgents } from "../agents";

const PRIMARY_AGENTS = new Set(["orchestrator", "architect", "developer", "backend", "designer", "ui-developer", "reviewer", "tester", "explorer", "cleaner", "debugger", "devops", "researcher", "doc-writer"]);

/**
 * Resolve agent name from user-defined category
 */
export function resolveAgentFromCategory(
  category: string,
  userCategories: Record<string, string>
): string | null {
  // Check user-defined categories first
  if (userCategories[category]) {
    return userCategories[category];
  }
  
  // Default category mappings
  const defaultMappings: Record<string, string> = {
    architecture: "architect",
    planning: "architect",
    frontend: "developer",
    ui: "developer",
    backend: "backend",
    api: "backend",
    design: "designer",
    validation: "designer",
    review: "reviewer",
    testing: "tester",
    exploration: "explorer",
    cleanup: "cleaner",
    debugging: "debugger",
    ops: "devops",
    research: "researcher",
    docs: "doc-writer",
  };
  
  return defaultMappings[category] ?? null;
}

/**
 * Check if agent name is a primary agent
 */
export function isPrimaryAgentName(agentName: string): boolean {
  return PRIMARY_AGENTS.has(agentName);
}

/**
 * Resolve model for category from user config
 */
export function resolveCategoryModel(
  category: string,
  userCategories: Record<string, { model?: string }>
): string | undefined {
  const categoryConfig = userCategories[category];
  return categoryConfig?.model;
}

/**
 * Resolve parent session's model
 */
export async function resolveParentModel(
  sessionId: string,
  agentName: string
): Promise<string | undefined> {
  // This would need to query parent session info
  // For now, return undefined to use agent's default model
  return undefined;
}

/**
 * Resolve skill content from skill names
 */
export async function resolveSkillContent(
  skillNames: string[] | undefined
): Promise<string | undefined> {
  if (!skillNames || skillNames.length === 0) {
    return undefined;
  }
  
  const skillContents: string[] = [];
  
  for (const skillName of skillNames) {
    // Load skill from content/skills/
    const skillPath = `content/skills/${skillName.toUpperCase()}.md`;
    try {
      const content = await Bun.file(skillPath).text();
      skillContents.push(`\n--- Skill: ${skillName} ---\n${content}`);
    } catch {
      console.warn(`[magnus-opus] Skill not found: ${skillName}`);
    }
  }
  
  return skillContents.length > 0 ? skillContents.join("\n\n") : undefined;
}
```

### 3.13 /background_output Command

```typescript
// src/tools/background-output.ts
import { tool } from "@opencode-ai/plugin";

export const backgroundOutput = tool({
  description: `Fetch output from a background task.
  
Usage: /background_output [session_id]

If session_id is omitted, returns the most recent background task.`,
  
  args: {
    session_id: tool.schema.string().optional()
      .describe("Background session ID (optional)"),
  },
  
  async execute(args, ctx) {
    ctx.metadata?.({
      title: `/background_output`,
      metadata: { sessionId: args.session_id },
    });
    
    // This tool reads from plugin-level state
    // Actual implementation in src/index.ts manages background session tracking
    
    return `Fetching background output for session: ${args.session_id || "(most recent)"}`;
  },
});
```

### 3.14 /resume Command

```typescript
// src/tools/resume.ts
import { tool } from "@opencode-ai/plugin";
import { getSessionDir, loadSessionMetadata } from "../sessions";

export const resume = tool({
  description: `Resume a previously interrupted workflow session.

Usage: /resume <session_id>

Restores workflow state and continues from the last completed phase.
This allows recovery from crashes, restarts, or taking breaks during long workflows.`,
  
  args: {
    session_id: tool.schema.string()
      .describe("Session ID to resume"),
  },
  
  async execute(args, ctx) {
    ctx.metadata?.({
      title: `/resume: ${args.session_id}`,
      metadata: { sessionId: args.session_id },
    });
    
    // Load session metadata
    const metadata = await loadSessionMetadata(args.session_id);
    
    if (!metadata) {
      return `❌ Session not found: ${args.session_id}`;
    }
    
    if (metadata.status === "completed") {
      return `ℹ️ Session already completed: ${args.session_id}`;
    }
    
    const sessionDir = getSessionDir(args.session_id);
    
    // Inject workflow state as persistent context
    const workflowState = `
## Workflow Resume: ${args.session_id}

**Current Status:** ${metadata.status}
**Current Phase:** ${metadata.currentPhase || "Unknown"}
**Completed Phases:** ${metadata.completedPhases.join(", ") || "None"}
**Last Updated:** ${metadata.updatedAt}

**Instructions:**
1. Continue from current phase
2. Do not repeat completed phases
3. Use existing artifacts in ${sessionDir}
4. Update phase status immediately after completion
`;
    
    return `✅ Resuming session: ${args.session_id}

**Status:** ${metadata.status}
**Current Phase:** ${metadata.currentPhase || "Unknown"}
**Progress:** ${metadata.completedPhases.length}/12 phases

Session directory: ${sessionDir}

<system-instruction>
Continue the workflow from the current phase.
Use existing artifacts and do not repeat completed work.
</system-instruction>`;
  },
});
```