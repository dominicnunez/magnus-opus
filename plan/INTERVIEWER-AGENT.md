# Interviewer Sub-Agent Integration Plan

## Overview

The interviewer sub-agent is a specialized agent for Magnus Opus that gathers and clarifies requirements through structured user interviews before implementation begins. This addresses the common issue where brief prompts like "/implement create a twitch clone app" lack sufficient detail for quality implementation.

## Core Concept

**Purpose**: Use AskUserQuestion tool to interactively gather comprehensive requirements from users before kicking off implementation workflows.

**Trigger**: User prompts like "/implement create a twitch clone app"

**Process**: Interviewer asks clarifying questions → collects all necessary info → creates detailed specification → hands off to next phase

## Current Architecture Analysis

### 1. Agent Structure

Agents are defined in `/src/agents/` with this pattern:
- Each agent exports a `createAgentConfig` function
- Config follows `MagnusAgentConfig` interface
- Standard properties: description, mode, model, prompt, color, permission
- **Key insight**: There's already an `architect` agent that does some requirement gathering

### 2. Tool System

From the plan files, tools use OpenCode's `tool()` helper:
```typescript
import { tool } from "@opencode-ai/plugin";

export const myTool = tool({
  description: "Tool description",
  args: {
    question: tool.schema.string().describe("Question to ask"),
  },
  async execute(args, ctx) {
    // Implementation
  },
});
```

### 3. Session Management

- Session IDs: `{command}-{timestamp}-{random}-{descriptor}`
- Stored in `ai-docs/sessions/`
- Metadata tracking: status, currentPhase, completedPhases
- **Important**: Sessions support workflow state injection for resuming

### 4. Question-Asking in OpenCode

Based on the code search, OpenCode provides:
- **`ask_user` tool**: Built-in blocking tool for user interaction
- **`AskUserQuestion`** tool from the Agent SDK (more advanced)
  - Supports multiple questions (1-4)
  - Provides options with descriptions
  - Multi-select capability
  - Custom input always available via "Other" option

### 5. Current Gap Analysis

The `architect` agent already handles requirement gathering, but there's no dedicated interviewer agent for:
- Initial high-level requirement gathering
- Complex multi-stage questioning workflows
- Pre-implementation clarification

## Recommended Interviewer Agent Implementation

### 1. Agent Definition

Create `/src/agents/interviewer.ts`:

```typescript
import type { MagnusAgentConfig } from "./types";
import type { MagnusOpusConfig } from "../config/schema";

export const DEFAULT_INTERVIEWER_MODEL = "anthropic/claude-opus-4-5";

const INTERVIEWER_PROMPT = `You are the Magnus Opus Interviewer - a requirements gathering specialist.

## Core Responsibilities
1. Understand user intent from brief prompts like "/implement create a twitch clone app"
2. Ask clarifying questions to gather complete requirements
3. Use AskUserQuestion for structured questioning
4. Collect all necessary information before implementation
5. Create detailed requirement specification

## Critical Constraint
- NEVER implement code
- ONLY gather information and ask questions
- Use AskUserQuestion tool for all user interactions

## Questioning Strategy
1. Start with high-level scope clarification
2. Ask about specific features needed
3. Clarify technical preferences
4. Identify constraints and requirements
5. Confirm understanding

## Output Format
Write to: requirements-specification.md
Include: All gathered requirements, constraints, and technical preferences`;

export function createInterviewerAgent(
  model: string = DEFAULT_INTERVIEWER_MODEL
): MagnusAgentConfig {
  return {
    description: "Gathers and clarifies requirements before implementation",
    mode: "subagent",
    model,
    prompt: INTERVIEWER_PROMPT,
    color: "#F59E0B", // Amber
    permission: {
      write: "allow", // For writing requirement specs
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
      askUserQuestion: "allow", // Critical permission
    },
    temperature: 0.7, // Higher for conversational flexibility
  };
}

export const interviewerAgent = createInterviewerAgent();
```

### 2. Tool Integration

The interviewer would integrate with OpenCode's built-in question-asking:

**Option 1: Using `ask_user` (simpler)**
- Already available as a built-in tool
- Single question at a time
- Basic blocking interaction

**Option 2: Using `AskUserQuestion` (recommended)**
- More sophisticated questioning
- Multiple questions in one prompt
- Structured options with descriptions
- Better user experience

### 3. Workflow Integration

Modify the workflow system in `/src/workflows/phases.ts`:

Add a new phase before `requirements`:
```typescript
interview: {
  name: "Requirements Interview",
  description: "Structured requirement gathering via interviewer agent",
  agent: "interviewer",
  outputs: ["requirements-specification.md"],
  qualityGate: "user_approval",
  skipCondition: (wt) => false, // Never skip - always interview
},
```

### 4. Command Integration

Create `/src/tools/interview.ts`:

```typescript
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const interview = tool({
  description: `Structured requirement gathering before implementation.

Usage: /interview <brief description>

This command:
1. Launches the interviewer agent
2. Asks clarifying questions to understand requirements
3. Creates detailed specification
4. Awaits user approval before proceeding
5. Optionally starts implementation workflow`,

  args: {
    description: tool.schema.string().describe("Brief description of what to build"),
    start_implementation: tool.schema.boolean().optional()
      .describe("Start /implement after interview completes (default: true)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("interview", args.description);
    const sessionDir = await createSessionDirectory(sessionId);

    ctx.metadata?.({
      title: `/interview: ${args.description.slice(0, 30)}...`,
      metadata: { sessionId },
    });

    return `Interview session created: ${sessionId}

**Brief Description:** ${args.description}
**Session Directory:** ${sessionDir}

Starting requirements interview...

<system-instruction>
Use the Task tool to delegate to the interviewer agent with this prompt:

"Conduct a structured requirements interview for: ${args.description}

Session: ${sessionId}

Use AskUserQuestion to gather:
1. Scope and boundaries of the feature
2. Key features and functionality required
3. User interface preferences
4. Technical constraints or requirements
5. Integration needs
6. Success criteria

Write comprehensive specification to: ${sessionDir}/requirements-specification.md"

After interview completes, present the specification for approval.
If user approves and start_implementation is true, proceed with /implement using the specification.
</system-instruction>`;
  },
});
```

### 5. Integration Points

**In the orchestrator prompt** (from plan/02-AGENT-DEFINITIONS.md):
Add to available specialists:
```typescript
## Available Specialists
- interviewer: Requirements gathering and clarification
- architect: Architecture planning
// ... rest of agents
```

**In the main plugin** (`/src/index.ts`):
Add the tool to the plugin export:
```typescript
return {
  tool: {
    smoke: smokeTool,
    interview: interview, // New tool
    // ... other tools
  },
};
```

### 6. User Experience Flow

1. User runs: `/interview create a twitch clone app`
2. Interviewer agent starts, asks structured questions:
   - "What core features do you need?" (options: streaming, chat, etc.)
   - "What's the scope?" (options: MVP, full-featured, etc.)
   - "Any specific UI preferences?" (options: minimalist, feature-rich, etc.)
3. Agent writes `requirements-specification.md`
4. User reviews and approves
5. Implementation automatically starts with complete requirements

### 7. Key Advantages

1. **Better Requirements**: Structured questioning vs. assuming from brief prompt
2. **Reduced Revisions**: Clearer specs lead to fewer implementation changes
3. **User Control**: Users see and approve requirements before any code
4. **Efficiency**: Catches misunderstandings early vs. during development
5. **Flexibility**: Can be used standalone or as pre-step to /implement

## Magnus Opus Workflow Architecture Integration

### Current Workflow Structure

**Phase Definitions (plan/06-WORKFLOW-SYSTEM.md):**
- The system uses a **phase-based workflow** with 10 defined phases:
  1. **requirements** - Initial analysis (orchestrator)
  2. **architecture** - Implementation planning (architect) 
  3. **plan-review** - Multi-model review (plan-reviewer)
  4. **implementation** - Code building (developer/backend)
  5. **design-validation** - UI comparison (designer)
  6. **ui-fixes** - UI corrections (ui-developer)
  7. **code-review** - Multi-model review (reviewer)
  8. **review-fixes** - Address review issues (developer)
  9. **testing** - Browser/integration tests (tester)
  10. **acceptance** - Final user approval (orchestrator)
  11. **cleanup** - Remove artifacts (cleaner)

**Workflow Types:**
- **UI_FOCUSED**: Frontend components, styling, Figma integration
- **API_FOCUSED**: Convex backend, TDD loop instead of design phases
- **MIXED**: Both UI and API (parallel tracks)

### Orchestrator Management

The **orchestrator agent** coordinates workflows but has strict constraints:
- **NEVER writes code directly** (write/edit denied)
- **Delegates to specialists** via Task tool
- **Enforces quality gates** between phases
- **Uses 4-Message Pattern** for parallel execution
- **Tracks todos** with TodoWrite/TodoRead

### Agent Registry and Selection

**Agent Categories:**
- Primary agents: orchestrator, architect, developer, backend, designer, etc.
- Model specialization based on role:
  - Orchestrator: Claude Opus (best reasoning)
  - Implementation: Claude Sonnet (best coding)
  - Design: Gemini (multimodal)
  - Fast tasks: Claude Haiku (cost-effective)

### Session State Tracking

**File-based sessions** in `ai-docs/sessions/`:
- Each session has metadata with: currentPhase, completedPhases, status
- Phase directories with timestamps for artifact isolation
- Workflow state injection for resumable sessions
- Git checkpoints for recovery points

### Quality Gates

Four gate types:
- **user_approval**: Explicit confirmation (blocks until user responds)
- **pass_or_fix**: Loop with iteration limits (default: 5)
- **all_tests_pass**: Test suite must pass
- **all_reviewers_approve**: Consensus analysis (UNANIMOUS blocks)

## Complete Interviewer Integration Plan

### 1. Workflow Integration

The interviewer would be added as **Phase 0** in the workflow system:

```typescript
// Updated IMPLEMENT_PHASES in plan/06-WORKFLOW-SYSTEM.md
export const IMPLEMENT_PHASES: Record<string, PhaseDefinition> = {
  interview: {
    name: "Requirements Interview",
    description: "Gather detailed requirements through interactive interview",
    agent: "interviewer",
    outputs: ["interview-notes.md", "clarified-requirements.md"],
    qualityGate: "user_approval",
    skipCondition: (wt) => {
      // Skip for simple CRUD operations or when explicitly requested
      return wt === "API_FOCUSED" && isSimpleCRUD(description);
    }
  },
  
  requirements: {
    // Now processes interview output instead of raw user input
    name: "Requirements Analysis",
    description: "Analyze interview output and identify gaps",
    agent: "orchestrator",
    outputs: [],
    qualityGate: null,
  },
  
  // ... rest of phases unchanged
}
```

### 2. Agent Definition

Create `/src/agents/interviewer.ts`:

```typescript
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_INTERVIEWER_MODEL = "anthropic/claude-sonnet-4-5";

const INTERVIEWER_PROMPT = `You are Magnus Opus Interviewer - a requirements gathering specialist.

## Core Responsibilities
1. Review initial user request for ambiguities
2. Ask structured clarifying questions using AskUserQuestion tool
3. Probe for edge cases, constraints, and success criteria
4. Validate assumptions with user
5. Document comprehensive requirements for architect

## Critical Constraints
- NEVER implement or architect - ONLY gather requirements
- Use AskUserQuestion tool for ALL user interactions
- Focus exclusively on requirements clarification
- Do not access or modify code files

## Interview Process
1. **Initial Assessment**: Identify gaps and ambiguities in request
2. **Structured Questions**: Cover all aspects (features, UI, data, constraints)
3. **Edge Case Discovery**: Ask "what if" scenarios
4. **Validation**: Confirm understanding with user
5. **Documentation**: Produce clarified requirements

## Questioning Strategy
Use AskUserQuestion with:
- 2-4 options per question (with clear descriptions)
- Multi-select for feature lists
- "(Recommended)" suffix for preferred options
- "Other" automatically available for custom input

## Output Format
Write to: interview-notes.md
Include: All questions asked, user responses, identified requirements, constraints, and success criteria`;

export function createInterviewerAgent(
  model: string = DEFAULT_INTERVIEWER_MODEL
): MagnusAgentConfig {
  return {
    description: "Gathers and clarifies requirements through structured interview",
    mode: "subagent",
    model,
    prompt: INTERVIEWER_PROMPT,
    color: "#F59E0B", // Amber
    permission: {
      write: "allow", // For interview-notes.md
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      askUserQuestion: "allow", // Critical permission
    },
    temperature: 0.7, // Higher for conversational flexibility
  };
}

export const interviewerAgent = createInterviewerAgent();
```

### 3. Orchestrator Updates

Update orchestrator's available specialists list (line 78-91 in plan/02-AGENT-DEFINITIONS.md):

```typescript
## Available Specialists
- interviewer: Requirements gathering and clarification
- architect: Architecture planning
- developer: SvelteKit implementation
- backend: Convex implementation
// ... rest unchanged
```

### 4. Modified /implement Command

Update `/src/tools/implement.ts` to support optional interview:

```typescript
export const implement = tool({
  description: `Full-cycle feature implementation with optional requirements interview.

Usage: /implement <feature description>

Options:
  --skip-interview: Skip requirements gathering phase
  --interview-depth: basic|detailed|comprehensive (default: detailed)

This command will:
1. Optionally conduct requirements interview (default: yes)
2. Detect workflow type (UI_FOCUSED, API_FOCUSED, MIXED)
3. Create a session for artifacts
4. Execute full implementation workflow`,

  args: {
    description: tool.schema.string().describe("Feature to implement"),
    skip_interview: tool.schema.boolean().optional()
      .describe("Skip requirements interview"),
    interview_depth: tool.schema.enum(["basic", "detailed", "comprehensive"]).optional()
      .describe("Interview depth level"),
  },

  async execute(args, ctx) {
    // ... existing session creation logic ...
    
    // Interview phase decision
    const shouldInterview = !args.skip_interview && 
                           !isSimpleOperation(args.description) &&
                           workflowType.type !== "API_FOCUSED";
    
    if (shouldInterview) {
      ctx.metadata?.({ 
        title: `/implement: ${args.description.slice(0, 30)}... (Interview Phase)`,
        metadata: { phase: "interview", sessionId }
      });
      
      return `Session created: ${sessionId}
      
**Workflow Type:** ${workflowType.type}
**Interview Depth:** ${args.interview_depth ?? "detailed"}

Starting requirements interview...

<system-instruction>
Use Task tool to delegate to interviewer agent with this prompt:

"Conduct a requirements interview for: ${args.description}

Depth: ${args.interview_depth ?? "detailed"}
Workflow Type: ${workflowType.type}
Session: ${sessionId}

Use AskUserQuestion to gather:
1. Scope and MVP definition
2. Core features required
3. UI/UX preferences
4. Technical constraints
5. Integration needs
6. Success criteria

Document findings to: ${sessionDir}/interview-notes.md

After interview completes, present findings for user approval. If approved, continue with architecture phase using clarified requirements."
</system-instruction>`;
    }
    
    // ... rest of existing implementation logic ...
  },
});
```

### 5. New /interview Command

Create `/src/tools/interview.ts` for standalone interviews:

```typescript
import { tool } from "@opencode-ai/plugin";
import { generateSessionId, createSessionDirectory } from "../sessions";

export const interview = tool({
  description: `Conduct standalone requirements interview without implementation.

Usage: /interview <description>

This command:
1. Creates an interview session
2. Asks structured clarifying questions
3. Generates detailed requirements document
4. Provides specification for /implement command

Example: /interview create a twitch clone app`,

  args: {
    description: tool.schema.string().describe("Brief description of what to build"),
    depth: tool.schema.enum(["basic", "detailed", "comprehensive"]).optional()
      .describe("Interview depth (default: detailed)"),
    export_format: tool.schema.enum(["markdown", "json"]).optional()
      .describe("Export format (default: markdown)"),
  },

  async execute(args, ctx) {
    const sessionId = generateSessionId("interview", args.description);
    const sessionDir = await createSessionDirectory(sessionId);

    ctx.metadata?.({ 
      title: `/interview: ${args.description.slice(0, 30)}...`,
      metadata: { sessionId } 
    });

    return `Interview session created: ${sessionId}

**Description:** ${args.description}
**Depth:** ${args.depth ?? "detailed"}
**Session Directory:** ${sessionDir}

Starting requirements interview...

<system-instruction>
Use Task tool to delegate to interviewer agent with this prompt:

"Conduct comprehensive requirements interview for: ${args.description}

Depth: ${args.depth ?? "detailed"}
Session: ${sessionId}

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

Write comprehensive specification to: ${sessionDir}/clarified-requirements.md

Format: ${args.export_format ?? "markdown"}

After interview completes, provide user with:
1. Summary of gathered requirements
2. Ready-to-use /implement command with all flags
3. Option to save specification for future use"
</system-instruction>`;
  },
});
```

### 6. Session State Updates

Update session metadata schema in `/src/sessions/types.ts`:

```typescript
export interface SessionMetadata {
  // ... existing fields ...
  interviewCompleted?: boolean;
  interviewDepth?: "basic" | "detailed" | "comprehensive";
  interviewSkippedReason?: string;
}
```

### 7. Quality Gate Integration

The interviewer phase uses `user_approval` gate:

```typescript
// After interviewer completes, system asks user:
"Does this interview capture all your requirements?
Options: [Approve & Continue] [Request Changes] [Skip Interview]"

// If approved → Continue to architecture phase
// If changes → Return to interviewer with feedback
// If skip → Direct to architecture with original description
```

## User Experience Flows

### Flow 1: Standard Implementation with Interview
```
User: /implement create a twitch clone app
System: Creates session, starts interview
Interviewer: What core features do you need? (Streaming, Chat, User Profiles...)
User: [selects options]
Interviewer: What's the scope? (MVP, Full-featured, Enterprise...)
User: [selects MVP]
Interviewer: [completes interview] Is this correct?
User: Approve
System: Continues to architecture with clarified requirements
```

### Flow 2: Standalone Interview
```
User: /interview create a twitch clone app
System: Conducts full interview
Interviewer: [completes interview]
System: Here's your specification. Ready to implement:
        /implement create a twitch clone app --skip-interview
```

### Flow 3: Skip Interview
```
User: /implement add user profile picture field --skip-interview
System: Skips interview, proceeds directly to architecture
```

## Implementation Priority

### Phase 1: Core Integration
- Create interviewer agent
- Add to IMPLEMENT_PHASES as first phase
- Update orchestrator prompt
- Basic /implement integration

### Phase 2: Enhanced Features
- Add /interview standalone command
- Interview depth levels
- Export formats (JSON for CI/CD)
- Interview templates for common patterns

### Phase 3: Advanced Integration
- Smart interview detection (ambiguous requests auto-interview)
- Resume interrupted interviews
- Integration with requirements documentation
- Analytics on interview effectiveness

## Key Benefits

1. **Reduced Rework**: Clear requirements prevent misunderstandings
2. **User Control**: Users see and approve before any code
3. **Faster Implementation**: Architects work with clarified requirements
4. **Better Documentation**: Interview output serves as requirements spec
5. **Flexibility**: Optional, configurable, and can be skipped

## Implementation Phases

### Phase 1: Basic Integration
- Create interviewer agent
- Add `/interview` command
- Basic question flow using `ask_user`

### Phase 2: Enhanced Experience
- Integrate `AskUserQuestion` for better UX
- Add interview templates for common patterns
- Save and reuse interview patterns

### Phase 3: Workflow Integration
- Add to standard `/implement` workflow as optional first step
- Configure via `magnus-opus.json` whether to auto-interview
- Add smart detection when requirements seem unclear

This integration maintains the existing workflow architecture while adding a valuable requirements clarification phase that significantly improves implementation quality and user satisfaction.