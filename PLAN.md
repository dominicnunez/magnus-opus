# Magnus Opus - Complete Implementation Plan

## Executive Summary

**Magnus Opus** is an OpenCode plugin that ports the MAG Claude Code plugin concepts to OpenCode, targeting **SvelteKit + Convex** as the development stack.

This plan follows the **oh-my-opencode architecture pattern** for OpenCode plugin integration, using the `config` hook to inject agents and MCP servers programmatically.

### Goals
1. Port MAG's multi-agent orchestration workflows to OpenCode's plugin architecture
2. Adapt all patterns for SvelteKit (frontend) and Convex (backend)
3. Maintain MAG's sophisticated phase system, quality gates, and multi-model validation
4. Use local file-based persistence (no external database for the plugin itself)

### Non-Goals
- Not depending on oh-my-opencode code; patterns are referenced/adapted only
- Not maintaining Claude Code compatibility (OpenCode only)
- Not building a new marketplace system

---

## Architecture Overview

### Implementation Decisions

See `DECISIONS.md` for OpenCode vs MAG differences and orchestration policy decisions.

### OpenCode Plugin Integration Pattern

Magnus Opus follows the **oh-my-opencode pattern** for plugin integration.

Rationale and scope decisions live in `DECISIONS.md` (Decisions 004–005).

---

## 1. Platform Overview

<!-- =============================================================================
WHY: Platform Differences (btca research: oh-my-opencode, mag-cp)
================================================================================

1. NO PROXY_MODE
   - MAG used PROXY_MODE for model switching via prompt injection
   - OpenCode provides native `model` parameter in AgentConfig
   - All agents can specify their model directly

2. PERMISSION-ONLY
   - MAG used `tools: { write: false }` format (deprecated)
   - OpenCode uses `permission: { write: "deny" }` format
   - Permissions: "allow" | "ask" | "deny"

3. NATIVE SESSION API
   - OpenCode provides `ctx.client.session.todo()` for reading todo state
   - No need for internal tracking or state management
   - Session methods: create, prompt, get, todo, list, delete, fork, abort

4. CONFIG HOOK MUTATION
   - Agents/MCPs injected via config hook by mutating config object
   - Pattern: `config.agent = { ...builtins, ...existing }`
   - Not via return values like `{ agent: {...} }`

============================================================================= -->

### 1.1 OpenCode vs MAG (Claude Code) Key Differences

| Aspect | MAG (Claude Code) | OpenCode (Magnus Opus) |
|--------|-------------------|------------------------|
| Model Selection | PROXY_MODE prompt hack | Native `model` parameter |
| Tool Restrictions | `tools: { write: false }` | `permission: { write: "deny" }` |
| Todo State | Internal tracking | Native `session.todo()` API |
| Agent Registration | Return `agent:` property | Mutate `config.agent` |
| MCP Registration | Return `mcp:` property | Mutate `config.mcp` |
| Plugin Type | `Plugin<PluginConfig>` | `Plugin` (no generic) |

### 1.2 OpenCode PluginInput Context

The plugin receives a context object with these properties:

```typescript
interface PluginInput {
  client: OpencodeClient;      // API client for session/message operations
  directory: string;           // Working directory path
  project: string;             // Project name
  worktree: string;            // Git worktree path
  serverUrl: string;           // OpenCode server URL
  $: ShellHelper;              // Shell execution helper
}
```

### 1.3 Plugin Entry Point Pattern

```typescript
import type { Plugin } from "@opencode-ai/plugin";

const MagnusOpusPlugin: Plugin = async (ctx) => {
  // Load plugin config
  const pluginConfig = await loadPluginConfig(ctx.directory);
  
  return {
    // Inject agents and MCPs via config mutation
    config: async (config) => {
      config.agent = { ...createBuiltinAgents(pluginConfig), ...config.agent };
      config.mcp = { ...createBuiltinMcps(pluginConfig), ...config.mcp };
    },
    
    // Register custom tools
    tool: builtinTools,
    
    // Handle events
    event: async (input) => { /* ... */ },
    
    // Tool lifecycle hooks
    "tool.execute.before": async (input, output) => { /* ... */ },
    "tool.execute.after": async (input, output) => { /* ... */ },
    
    // Message hooks
    "chat.message": async (input, output) => { /* ... */ },
    
    // Experimental hooks
    "experimental.chat.system.transform": async (input, output) => { /* ... */ },
    "experimental.chat.messages.transform": async (input, output) => { /* ... */ },
  };
};

export default MagnusOpusPlugin;
```

### 1.4 Type Imports

```typescript
// From OpenCode SDK
import type { Plugin, AgentConfig } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

// Zod for config validation
import { z } from "zod";
```

---

## 2. Agent Definitions

<!-- =============================================================================
WHY: Agent Architecture (btca research: oh-my-opencode sisyphus agent)
================================================================================

1. ROLE SEPARATION
   - Orchestrator coordinates but NEVER writes code
   - Specialists (developer, backend) do implementation
   - Validators (designer, reviewer) do read-only review
   - This prevents role confusion and ensures quality gates work

2. MODEL SPECIALIZATION
   - Claude Opus for orchestration (best reasoning)
   - Claude Sonnet for implementation (best coding)
   - Gemini for design validation (strong multimodal)
   - Claude Haiku for fast utility tasks (cost-effective)
   - Grok for exploration (fast, cheap, good at search)

3. PERMISSION MODEL
   - "allow" - Tool available without confirmation
   - "ask" - Prompt user before use
   - "deny" - Tool not available
   - Orchestrator has write/edit denied (read-only coordination)

============================================================================= -->

### 2.1 AgentConfig Interface

```typescript
// src/agents/types.ts
import type { AgentConfig } from "@opencode-ai/plugin";

export type AgentMode = "primary" | "subagent" | "all";
export type PermissionValue = "allow" | "ask" | "deny";

export interface MagnusAgentConfig extends AgentConfig {
  description: string;
  mode: AgentMode;
  model: string;
  prompt: string;
  color?: string;
  permission?: Record<string, PermissionValue>;
  temperature?: number;
  top_p?: number;
  maxTokens?: number;
  thinking?: { type: "enabled" | "disabled"; budgetTokens?: number };
  skills?: string[];
}
```

### 2.2 Agent Definitions

#### 2.2.1 Orchestrator Agent

```typescript
// src/agents/orchestrator.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_ORCHESTRATOR_MODEL = "anthropic/claude-opus-4-5";

const ORCHESTRATOR_PROMPT = `You are the Magnus Opus Orchestrator - a coordinator who NEVER writes code directly.

## Core Responsibilities
1. Detect workflow type (UI_FOCUSED, API_FOCUSED, MIXED)
2. Create and manage sessions
3. Delegate to specialized agents via Task tool
4. Enforce quality gates
5. Report progress to user

## Critical Constraints
- NEVER use Write or Edit tools
- ALWAYS delegate code work to specialists
- Use TodoWrite to track all tasks
- Follow the 4-Message Pattern for parallel execution

## Available Specialists
- architect: Architecture planning
- developer: SvelteKit implementation
- backend: Convex implementation
- designer: Design validation (read-only)
- ui-developer: UI fixes
- reviewer: Code review
- tester: Browser testing
- explorer: Codebase search
- cleaner: Artifact cleanup

## Workflow Detection
- UI_FOCUSED: component, page, layout, design, Figma, UI, styling
- API_FOCUSED: query, mutation, action, schema, Convex, database, API
- MIXED: Both UI and API keywords present`;

export function createOrchestratorAgent(
  model: string = DEFAULT_ORCHESTRATOR_MODEL
): MagnusAgentConfig {
  return {
    description: "Coordinates workflows, never writes code directly",
    mode: "primary",
    model,
    prompt: ORCHESTRATOR_PROMPT,
    color: "#9333EA", // Purple
    permission: {
      write: "deny",
      edit: "deny",
      multiedit: "deny",
      bash: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      task: "allow",
      todowrite: "allow",
      todoread: "allow",
      question: "allow",
    },
    thinking: {
      type: "enabled",
      budgetTokens: 32000,
    },
  };
}

export const orchestratorAgent = createOrchestratorAgent();
```

#### 2.2.2 Architect Agent

```typescript
// src/agents/architect.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_ARCHITECT_MODEL = "anthropic/claude-sonnet-4-5";

const ARCHITECT_PROMPT = `You are the Magnus Opus Architect - a technical planner for SvelteKit + Convex projects.

## Responsibilities
1. Analyze requirements thoroughly
2. Ask clarifying questions (gap analysis)
3. Design data models (Convex schema)
4. Design API contracts (queries, mutations, actions)
5. Plan component structure (SvelteKit routes)
6. Identify risks and dependencies
7. Create implementation phases

## Output Artifacts
Write to the session directory:
- implementation-plan.md - Comprehensive plan
- quick-reference.md - Checklist for developers

## Planning Template
1. **Understanding** - Restate requirements
2. **Gap Analysis** - Questions for clarity
3. **Data Model** - Convex schema design
4. **API Design** - Function signatures
5. **Component Design** - File structure
6. **Implementation Phases** - Ordered steps
7. **Risks** - Potential issues
8. **Time Estimate** - Conservative hours`;

export function createArchitectAgent(
  model: string = DEFAULT_ARCHITECT_MODEL
): MagnusAgentConfig {
  return {
    description: "Creates comprehensive implementation plans",
    mode: "subagent",
    model,
    prompt: ARCHITECT_PROMPT,
    color: "#2563EB", // Blue
    permission: {
      write: "allow",
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
    temperature: 0.3, // Low for consistent planning
    skills: ["quality-gates"],
  };
}

export const architectAgent = createArchitectAgent();
```

#### 2.2.3 Developer Agent (SvelteKit)

```typescript
// src/agents/developer.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_DEVELOPER_MODEL = "anthropic/claude-sonnet-4-5";

const DEVELOPER_PROMPT = `You are the Magnus Opus Developer - a SvelteKit expert.

## Stack
- SvelteKit 2
- Svelte 5 (runes: $state, $derived, $effect, $props)
- TypeScript (strict mode)
- Tailwind CSS v4
- shadcn-svelte components

## Responsibilities
1. Implement frontend components and pages
2. Follow the implementation plan
3. Use Svelte 5 runes exclusively
4. Integrate with Convex via convex-svelte
5. Handle errors gracefully

## Key Patterns
- Use $state() for reactive state
- Use $derived() for computed values
- Use $effect() for side effects
- Use $props() for component props
- Use load functions in +page.server.ts
- Use form actions for mutations`;

export function createDeveloperAgent(
  model: string = DEFAULT_DEVELOPER_MODEL
): MagnusAgentConfig {
  return {
    description: "SvelteKit frontend implementation",
    mode: "subagent",
    model,
    prompt: DEVELOPER_PROMPT,
    color: "#F97316", // Orange
    permission: {
      write: "allow",
      edit: "allow",
      multiedit: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
    skills: ["sveltekit", "shadcn-svelte"],
  };
}

export const developerAgent = createDeveloperAgent();
```

#### 2.2.4 Backend Agent (Convex)

```typescript
// src/agents/backend.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_BACKEND_MODEL = "anthropic/claude-sonnet-4-5";

const BACKEND_PROMPT = `You are the Magnus Opus Backend Agent - a Convex expert.

## Stack
- Convex (backend-as-a-service)
- TypeScript
- Convex validators (v.string(), v.id(), etc.)

## Responsibilities
1. Implement Convex schema
2. Create queries (real-time, read operations)
3. Create mutations (write operations, transactional)
4. Create actions (external API calls, non-deterministic)
5. Create internal functions (server-to-server)
6. Set up cron jobs if needed

## Key Patterns
- Always use indexes for queries
- Validate in handlers, not just schema
- Use internal functions for sensitive operations
- Handle errors explicitly with custom types
- Timestamp everything (createdAt, updatedAt)`;

export function createBackendAgent(
  model: string = DEFAULT_BACKEND_MODEL
): MagnusAgentConfig {
  return {
    description: "Convex backend implementation",
    mode: "subagent",
    model,
    prompt: BACKEND_PROMPT,
    color: "#10B981", // Emerald
    permission: {
      write: "allow",
      edit: "allow",
      multiedit: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
    skills: ["convex"],
  };
}

export const backendAgent = createBackendAgent();
```

#### 2.2.5 Designer Agent

```typescript
// src/agents/designer.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_DESIGNER_MODEL = "google/gemini-2.5-pro";

const DESIGNER_PROMPT = `You are the Magnus Opus Designer - a UI/UX validator.

## Responsibilities
1. Compare implementation against Figma designs
2. Validate visual fidelity
3. Check spacing, colors, typography
4. Verify responsive behavior
5. Report issues for ui-developer to fix

## Critical Constraint
You do NOT write code. You only review and report issues.

## Validation Checklist
- [ ] Layout matches design
- [ ] Colors are correct
- [ ] Typography is correct
- [ ] Spacing is correct
- [ ] Components are complete
- [ ] Responsive breakpoints work
- [ ] Hover/focus states work

## Output Format
Write to: design-validation.md
Include: Screenshot comparisons, issue list with severity`;

export function createDesignerAgent(
  model: string = DEFAULT_DESIGNER_MODEL
): MagnusAgentConfig {
  return {
    description: "Validates UI against Figma designs (read-only)",
    mode: "subagent",
    model,
    prompt: DESIGNER_PROMPT,
    color: "#EC4899", // Pink
    permission: {
      write: "allow", // Only for writing reports
      edit: "deny",
      multiedit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
      webfetch: "allow",
    },
  };
}

export const designerAgent = createDesignerAgent();
```

#### 2.2.6 UI Developer Agent

```typescript
// src/agents/ui-developer.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_UI_DEVELOPER_MODEL = "anthropic/claude-sonnet-4-5";

const UI_DEVELOPER_PROMPT = `You are the Magnus Opus UI Developer - a specialist in fixing UI issues.

## Responsibilities
1. Read design-validation.md for issues
2. Fix spacing, colors, typography issues
3. Correct layout problems
4. Implement missing hover/focus states
5. Fix responsive breakpoints

## Input
Read: ai-docs/sessions/{session}/design-validation.md

## Approach
1. Parse the issue list
2. Fix highest severity issues first
3. Make minimal, focused changes
4. Verify fixes with browser if needed`;

export function createUiDeveloperAgent(
  model: string = DEFAULT_UI_DEVELOPER_MODEL
): MagnusAgentConfig {
  return {
    description: "Fixes UI issues identified by designer",
    mode: "subagent",
    model,
    prompt: UI_DEVELOPER_PROMPT,
    color: "#F472B6", // Light pink
    permission: {
      write: "allow",
      edit: "allow",
      multiedit: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
    skills: ["sveltekit", "shadcn-svelte"],
  };
}

export const uiDeveloperAgent = createUiDeveloperAgent();
```

#### 2.2.7 Reviewer Agent

```typescript
// src/agents/reviewer.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_REVIEWER_MODEL = "anthropic/claude-sonnet-4-5";

const REVIEWER_PROMPT = `You are the Magnus Opus Code Reviewer.

## Responsibilities
1. Review code for quality and patterns
2. Check type safety
3. Verify error handling
4. Assess performance implications
5. Check security concerns
6. Verify best practices

## Issue Severity
- CRITICAL: Must fix before merge (security, data loss)
- MAJOR: Should fix (bugs, poor patterns)
- MINOR: Nice to fix (style, minor improvements)
- NITPICK: Optional (preferences)

## Output Format
Verdict: APPROVED | NEEDS_REVISION | MAJOR_CONCERNS

Issues:
- [CRITICAL] Description
- [MAJOR] Description
- [MINOR] Description`;

export function createReviewerAgent(
  model: string = DEFAULT_REVIEWER_MODEL
): MagnusAgentConfig {
  return {
    description: "Reviews code for quality and patterns",
    mode: "subagent",
    model,
    prompt: REVIEWER_PROMPT,
    color: "#8B5CF6", // Violet
    permission: {
      write: "allow", // For writing review reports
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
  };
}

export const reviewerAgent = createReviewerAgent();
```

#### 2.2.8 Plan Reviewer Agent

```typescript
// src/agents/plan-reviewer.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_PLAN_REVIEWER_MODEL = "anthropic/claude-sonnet-4-5";

const PLAN_REVIEWER_PROMPT = `You are the Magnus Opus Plan Reviewer.

## Responsibilities
1. Review architecture plans
2. Check for missing considerations
3. Suggest alternative approaches
4. Assess risk levels
5. Verify completeness

## Review Criteria
- Does the plan address all requirements?
- Are there missing edge cases?
- Is the data model appropriate?
- Are there scalability concerns?
- Is the implementation order correct?

## Output Format
Verdict: APPROVED | NEEDS_REVISION | MAJOR_CONCERNS

Feedback with specific recommendations.`;

export function createPlanReviewerAgent(
  model: string = DEFAULT_PLAN_REVIEWER_MODEL
): MagnusAgentConfig {
  return {
    description: "Reviews architecture plans",
    mode: "subagent",
    model,
    prompt: PLAN_REVIEWER_PROMPT,
    color: "#6366F1", // Indigo
    permission: {
      write: "allow",
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
    },
    thinking: {
      type: "enabled",
      budgetTokens: 16000,
    },
  };
}

export const planReviewerAgent = createPlanReviewerAgent();
```

#### 2.2.9 Tester Agent

```typescript
// src/agents/tester.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_TESTER_MODEL = "anthropic/claude-haiku-4-5";

const TESTER_PROMPT = `You are the Magnus Opus Tester.

## Responsibilities
1. Run browser tests
2. Validate UI interactions
3. Check form submissions
4. Test error states
5. Verify responsive behavior

## Tools
- Use Playwright MCP for browser automation
- Take screenshots for evidence
- Report issues found

## Output
Write to: testing-report.md
Include: Test results, screenshots, issues found`;

export function createTesterAgent(
  model: string = DEFAULT_TESTER_MODEL
): MagnusAgentConfig {
  return {
    description: "Browser and integration testing",
    mode: "subagent",
    model,
    prompt: TESTER_PROMPT,
    color: "#14B8A6", // Teal
    permission: {
      write: "allow",
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
  };
}

export const testerAgent = createTesterAgent();
```

#### 2.2.10 Explorer Agent

```typescript
// src/agents/explorer.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_EXPLORER_MODEL = "xai/grok-4";

const EXPLORER_PROMPT = `You are the Magnus Opus Explorer - optimized for fast codebase navigation.

## Responsibilities
1. Find files by pattern
2. Search code for keywords
3. Analyze dependencies
4. Map codebase structure

## Constraints
- Read-only operations only
- Return concise summaries
- Be fast and efficient

## Common Tasks
- Find where X is defined
- List files matching pattern
- Search for usages of Y
- Analyze imports`;

export function createExplorerAgent(
  model: string = DEFAULT_EXPLORER_MODEL
): MagnusAgentConfig {
  return {
    description: "Fast codebase exploration (read-only)",
    mode: "subagent",
    model,
    prompt: EXPLORER_PROMPT,
    color: "#06B6D4", // Cyan
    permission: {
      write: "deny",
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
    temperature: 0.1, // Very low for consistent search
  };
}

export const explorerAgent = createExplorerAgent();
```

#### 2.2.11 Cleaner Agent

```typescript
// src/agents/cleaner.ts
import type { MagnusAgentConfig } from "./types";

export const DEFAULT_CLEANER_MODEL = "anthropic/claude-haiku-4-5";

const CLEANER_PROMPT = `You are the Magnus Opus Cleaner.

## Responsibilities
1. Remove temporary files
2. Clean old sessions
3. Remove build artifacts
4. Archive completed sessions

## Safety Rules
- NEVER delete source code
- ONLY delete files in ai-docs/sessions/
- Ask before deleting anything ambiguous
- Keep session metadata for audit`;

export function createCleanerAgent(
  model: string = DEFAULT_CLEANER_MODEL
): MagnusAgentConfig {
  return {
    description: "Cleans up session artifacts",
    mode: "subagent",
    model,
    prompt: CLEANER_PROMPT,
    color: "#78716C", // Stone
    permission: {
      write: "deny",
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow", // For rm commands
    },
  };
}

export const cleanerAgent = createCleanerAgent();
```

### 2.3 Agent Aggregation

```typescript
// src/agents/index.ts
import type { MagnusAgentConfig } from "./types";
import type { MagnusOpusConfig } from "../config/schema";

import { orchestratorAgent, createOrchestratorAgent } from "./orchestrator";
import { architectAgent, createArchitectAgent } from "./architect";
import { developerAgent, createDeveloperAgent } from "./developer";
import { backendAgent, createBackendAgent } from "./backend";
import { designerAgent, createDesignerAgent } from "./designer";
import { uiDeveloperAgent, createUiDeveloperAgent } from "./ui-developer";
import { reviewerAgent, createReviewerAgent } from "./reviewer";
import { planReviewerAgent, createPlanReviewerAgent } from "./plan-reviewer";
import { testerAgent, createTesterAgent } from "./tester";
import { explorerAgent, createExplorerAgent } from "./explorer";
import { cleanerAgent, createCleanerAgent } from "./cleaner";

export const builtinAgents: Record<string, MagnusAgentConfig> = {
  orchestrator: orchestratorAgent,
  architect: architectAgent,
  developer: developerAgent,
  backend: backendAgent,
  designer: designerAgent,
  "ui-developer": uiDeveloperAgent,
  reviewer: reviewerAgent,
  "plan-reviewer": planReviewerAgent,
  tester: testerAgent,
  explorer: explorerAgent,
  cleaner: cleanerAgent,
};

export function createBuiltinAgents(
  disabledAgents?: string[],
  agentOverrides?: MagnusOpusConfig["agents"]
): Record<string, MagnusAgentConfig> {
  const disabled = new Set(disabledAgents ?? []);
  const agents: Record<string, MagnusAgentConfig> = {};

  for (const [name, agent] of Object.entries(builtinAgents)) {
    if (disabled.has(name)) continue;

    const override = agentOverrides?.[name];
    if (override) {
      // Apply model override
      const model = override.model ?? agent.model;
      const creator = getAgentCreator(name);
      agents[name] = creator ? creator(model) : { ...agent, model };
      
      // Apply other overrides
      if (override.temperature !== undefined) {
        agents[name].temperature = override.temperature;
      }
      if (override.skills !== undefined) {
        agents[name].skills = override.skills;
      }
    } else {
      agents[name] = agent;
    }
  }

  return agents;
}

function getAgentCreator(name: string): ((model: string) => MagnusAgentConfig) | null {
  const creators: Record<string, (model: string) => MagnusAgentConfig> = {
    orchestrator: createOrchestratorAgent,
    architect: createArchitectAgent,
    developer: createDeveloperAgent,
    backend: createBackendAgent,
    designer: createDesignerAgent,
    "ui-developer": createUiDeveloperAgent,
    reviewer: createReviewerAgent,
    "plan-reviewer": createPlanReviewerAgent,
    tester: createTesterAgent,
    explorer: createExplorerAgent,
    cleaner: createCleanerAgent,
  };
  return creators[name] ?? null;
}

// Re-export individual agents
export * from "./orchestrator";
export * from "./architect";
export * from "./developer";
export * from "./backend";
export * from "./designer";
export * from "./ui-developer";
export * from "./reviewer";
export * from "./plan-reviewer";
export * from "./tester";
export * from "./explorer";
export * from "./cleaner";
```

---

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

```typescript
import { tool } from "@opencode-ai/plugin";

export const myTool = tool({
  description: "Tool description for AI to understand when to use it",
  args: {
    requiredArg: tool.schema.string().describe("Description"),
    optionalArg: tool.schema.number().optional().describe("Optional description"),
  },
  async execute(args, ctx) {
    // ctx.sessionID, ctx.messageID, ctx.agent available
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

This command will:
1. Detect workflow type (UI_FOCUSED, API_FOCUSED, MIXED)
2. Create a session for artifacts
3. Plan architecture with the architect agent
4. Request user approval
5. Implement with appropriate agents
6. Run validation (design for UI, TDD for API)
7. Multi-model code review
8. Testing
9. User acceptance`,

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

Skips UI phases, focuses on:
1. Schema design
2. Query/mutation implementation
3. Test-driven development
4. Code review`,

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

**Phases:**
1. Architecture planning (backend agent)
2. Implementation with TDD loop
3. Code review
4. User acceptance

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

```typescript
// src/tools/review.ts
import { tool } from "@opencode-ai/plugin";

export const review = tool({
  description: `Multi-model code review with consensus analysis.

Usage: /review <file or directory path>

Runs parallel reviews with multiple AI models and consolidates findings.`,

  args: {
    path: tool.schema.string().describe("File or directory to review"),
    models: tool.schema.array(tool.schema.string()).optional()
      .describe("Models to use (default: configured review models)"),
  },

  async execute(args, ctx) {
    const defaultModels = ["anthropic/claude-sonnet-4-5", "opencode/grok-code", "google/gemini-2.5-flash"];
    const models = args.models ?? defaultModels;

    ctx.metadata?.({
      title: `/review: ${args.path}`,
      metadata: { path: args.path, models },
    });

    return `Starting multi-model code review

**Path:** ${args.path}
**Models:** ${models.join(", ")}

<system-instruction>
Launch parallel Task calls to the reviewer agent, one for each model.
Use the 4-Message Pattern:

Message 1 (current): Preparation complete
Message 2: Launch ${models.length} parallel Task calls with different models
Message 3: Consolidate results with consensus analysis
Message 4: Present findings to user

For each model, use this prompt:
"Review the code at: ${args.path}

Provide a structured review with:
- Verdict: APPROVED | NEEDS_REVISION | MAJOR_CONCERNS
- Issues by severity (CRITICAL, MAJOR, MINOR, NITPICK)
- Specific file:line references
- Suggested fixes"
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
```

### 3.7 /help Command

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

| Type | Description | Key Agents |
|------|-------------|------------|
| UI_FOCUSED | Components, pages, styling | developer, designer, ui-developer |
| API_FOCUSED | Convex functions, schema | backend, TDD loop |
| MIXED | Both UI and API | Parallel tracks |`);
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
    "codeReview": ["xai/grok-4", "google/gemini-2.5-flash"],
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

### 3.8 Tool Aggregation

```typescript
// src/tools/index.ts
import { implement } from "./implement";
import { implementApi } from "./implement-api";
import { validateUi } from "./validate-ui";
import { review } from "./review";
import { cleanup } from "./cleanup";
import { help } from "./help";

export const builtinTools = {
  implement,
  "implement-api": implementApi,
  "validate-ui": validateUi,
  review,
  cleanup,
  help,
};

export * from "./implement";
export * from "./implement-api";
export * from "./validate-ui";
export * from "./review";
export * from "./cleanup";
export * from "./help";
```

---

## 4. MCP Server Definitions

<!-- =============================================================================
WHY: MCP Server Selection (DECISIONS.md D008)
================================================================================

1. WORKFLOW-DRIVEN SELECTION
   - websearch: Research during planning
   - context7: Documentation lookup for stack-specific questions
   - figma: UI validation against designs
   - chrome-devtools: Browser testing automation
   - grep_app: Code search across GitHub

2. OPTIONAL BY DEFAULT
   - MCPs require API keys or external services
   - Users can disable via config
   - Graceful degradation if unavailable

3. CONFIG HOOK INJECTION
   - MCPs injected via config.mcp mutation
   - Supports both local (command) and remote (http) formats

============================================================================= -->

### 4.1 MCP Config Types

```typescript
// src/mcp/types.ts

export interface LocalMcpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface RemoteMcpConfig {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export type McpConfig = LocalMcpConfig | RemoteMcpConfig;
```

### 4.2 Built-in MCP Definitions

```typescript
// src/mcp/index.ts
import type { McpConfig } from "./types";

export const builtinMcpDefinitions: Record<string, McpConfig> = {
  // Web search via Exa AI
  websearch: {
    type: "http",
    url: "https://mcp.exa.ai/mcp?tools=web_search_exa",
    headers: process.env.EXA_API_KEY
      ? { "x-api-key": process.env.EXA_API_KEY }
      : undefined,
  },

  // Documentation lookup
  context7: {
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-context7"],
  },

  // Figma integration
  figma: {
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-figma"],
    env: process.env.FIGMA_ACCESS_TOKEN
      ? { FIGMA_ACCESS_TOKEN: process.env.FIGMA_ACCESS_TOKEN }
      : undefined,
  },

  // Chrome DevTools for browser testing
  "chrome-devtools": {
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-chrome-devtools"],
  },

  // GitHub code search
  grep_app: {
    type: "http",
    url: "https://mcp.grep.app/mcp",
  },
};

export function createBuiltinMcps(
  disabledMcps?: string[]
): Record<string, McpConfig> {
  const disabled = new Set(disabledMcps ?? []);
  const mcps: Record<string, McpConfig> = {};

  for (const [name, config] of Object.entries(builtinMcpDefinitions)) {
    if (disabled.has(name)) continue;
    
    // Skip if required env vars are missing
    if (name === "websearch" && !process.env.EXA_API_KEY) continue;
    if (name === "figma" && !process.env.FIGMA_ACCESS_TOKEN) continue;
    
    mcps[name] = config;
  }

  return mcps;
}
```

### 4.3 MCP Config Loader

```typescript
// src/mcp/loader.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { McpConfig } from "./types";

const MCP_CONFIG_PATHS = [
  "~/.config/opencode/.mcp.json",
  ".mcp.json",
  ".opencode/.mcp.json",
];

interface McpJsonFile {
  mcpServers?: Record<string, McpConfig>;
}

function expandEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

function expandConfig(config: McpConfig): McpConfig {
  if ("command" in config) {
    return {
      ...config,
      args: config.args?.map(expandEnvVars),
      env: config.env
        ? Object.fromEntries(
            Object.entries(config.env).map(([k, v]) => [k, expandEnvVars(v)])
          )
        : undefined,
    };
  }
  return {
    ...config,
    url: expandEnvVars(config.url),
    headers: config.headers
      ? Object.fromEntries(
          Object.entries(config.headers).map(([k, v]) => [k, expandEnvVars(v)])
        )
      : undefined,
  };
}

export function loadMcpConfigs(projectDir: string): Record<string, McpConfig> {
  const merged: Record<string, McpConfig> = {};

  for (const configPath of MCP_CONFIG_PATHS) {
    const fullPath = configPath.startsWith("~")
      ? join(process.env.HOME ?? "", configPath.slice(1))
      : join(projectDir, configPath);

    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf-8");
      const parsed: McpJsonFile = JSON.parse(content);

      if (parsed.mcpServers) {
        for (const [name, config] of Object.entries(parsed.mcpServers)) {
          if (config.disabled) continue;
          merged[name] = expandConfig(config);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return merged;
}
```

---

## 5. Configuration Schema

<!-- =============================================================================
WHY: Zod for Config Validation (DECISIONS.md D009)
================================================================================

1. ZOD BENEFITS
   - Schema and types co-located
   - Clear error messages on validation failure
   - Default values built-in
   - Easy to extend

2. MERGE STRATEGY
   - User config (~/.config/opencode/magnus-opus.json)
   - Project config (.opencode/magnus-opus.json)
   - Project overrides user

============================================================================= -->

### 5.1 Schema Definition

```typescript
// src/config/schema.ts
import { z } from "zod";

// Permission value for agent tool access
const PermissionValueSchema = z.enum(["allow", "ask", "deny"]);

// Agent permission schema
const AgentPermissionSchema = z.record(z.string(), PermissionValueSchema);

// Agent override schema
export const AgentOverrideSchema = z.object({
  model: z.string().optional(),
  variant: z.string().optional(),
  category: z.string().optional(),
  skills: z.array(z.string()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  maxTokens: z.number().optional(),
  prompt: z.string().optional(),
  prompt_append: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  permission: AgentPermissionSchema.optional(),
  disable: z.boolean().optional(),
});

// Category configuration for model groups
export const CategoryConfigSchema = z.object({
  model: z.string(),
  variant: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  prompt_append: z.string().optional(),
});

// Review models configuration
export const ReviewModelsSchema = z.object({
  planReview: z.array(z.string()).optional(),
  codeReview: z.array(z.string()).optional(),
  autoUse: z.boolean().optional(),
});

// Session settings
export const SessionSettingsSchema = z.object({
  includeDescriptor: z.boolean().optional(),
  autoCleanup: z.boolean().optional(),
  retentionDays: z.number().optional(),
});

// Main config schema
export const MagnusOpusConfigSchema = z.object({
  // Agent overrides by name
  agents: z.record(z.string(), AgentOverrideSchema).optional(),
  
  // Disabled features
  disabled_agents: z.array(z.string()).optional(),
  disabled_mcps: z.array(z.string()).optional(),
  disabled_skills: z.array(z.string()).optional(),
  disabled_hooks: z.array(z.string()).optional(),
  
  // Model categories
  categories: z.record(z.string(), CategoryConfigSchema).optional(),
  
  // Review configuration
  reviewModels: ReviewModelsSchema.optional(),
  
  // Session configuration
  sessionSettings: SessionSettingsSchema.optional(),
});

export type MagnusOpusConfig = z.infer<typeof MagnusOpusConfigSchema>;
export type AgentOverride = z.infer<typeof AgentOverrideSchema>;
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: MagnusOpusConfig = {
  agents: {},
  disabled_agents: [],
  disabled_mcps: [],
  disabled_skills: [],
  disabled_hooks: [],
  reviewModels: {
    planReview: ["xai/grok-4", "openai/gpt-4o"],
    codeReview: ["xai/grok-4", "google/gemini-2.5-flash"],
    autoUse: false,
  },
  sessionSettings: {
    includeDescriptor: true,
    autoCleanup: false,
    retentionDays: 30,
  },
};
```

### 5.2 Config Loader

```typescript
// src/plugin-config.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { MagnusOpusConfigSchema, DEFAULT_CONFIG, type MagnusOpusConfig } from "./config/schema";

const USER_CONFIG_PATH = "~/.config/opencode/magnus-opus.json";
const PROJECT_CONFIG_PATH = ".opencode/magnus-opus.json";

function loadJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function resolvePath(path: string): string {
  if (path.startsWith("~")) {
    return join(process.env.HOME ?? "", path.slice(1));
  }
  return path;
}

export async function loadPluginConfig(projectDir: string): Promise<MagnusOpusConfig> {
  // Load user config
  const userPath = resolvePath(USER_CONFIG_PATH);
  const userConfig = loadJsonFile(userPath);

  // Load project config
  const projectPath = join(projectDir, PROJECT_CONFIG_PATH);
  const projectConfig = loadJsonFile(projectPath);

  // Merge: defaults < user < project
  const merged = {
    ...DEFAULT_CONFIG,
    ...(userConfig ?? {}),
    ...(projectConfig ?? {}),
  };

  // Validate
  const result = MagnusOpusConfigSchema.safeParse(merged);
  if (!result.success) {
    console.warn("[magnus-opus] Config validation errors:", result.error.format());
    return DEFAULT_CONFIG;
  }

  return result.data;
}
```

### 5.3 Model Context Limits (Cache)

```typescript
// src/config/model-limits.ts

// Known context window limits by provider/model
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "anthropic/claude-opus-4-5": 200_000,
  "anthropic/claude-sonnet-4-5": 200_000,
  "anthropic/claude-haiku-4-5": 200_000,
  "google/gemini-2.5-pro": 1_000_000,
  "google/gemini-2.5-flash": 1_000_000,
  "xai/grok-4": 128_000,
  "openai/gpt-4o": 128_000,
};

export function getModelContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? 128_000; // Default to 128k
}
```

---

## 6. Workflow System

<!-- =============================================================================
WHY: Phase System and Quality Gates (DECISIONS.md D011)
================================================================================

1. MULTI-PHASE WORKFLOW
   - Clear progression from requirements to delivery
   - Each phase has defined inputs/outputs
   - Enables recovery from interruption

2. QUALITY GATES
   - user_approval: Explicit user confirmation
   - pass_or_fix: Loop until passing
   - all_tests_pass: All tests must pass
   - all_reviewers_approve: Multi-model consensus

3. WORKFLOW TYPE ROUTING
   - UI_FOCUSED: developer agent path
   - API_FOCUSED: backend agent path
   - MIXED: parallel tracks

============================================================================= -->

### 6.1 Workflow Type Detection

```typescript
// src/workflows/detector.ts

export type WorkflowType = "UI_FOCUSED" | "API_FOCUSED" | "MIXED" | "UNCLEAR";

export interface WorkflowDetection {
  type: WorkflowType;
  confidence: number;
  rationale: string;
}

const UI_KEYWORDS = [
  "component", "page", "layout", "design", "figma", "ui", "styling",
  "tailwind", "svelte", "button", "form", "modal", "dialog", "navbar",
  "sidebar", "responsive", "css", "animation", "hover", "click",
];

const API_KEYWORDS = [
  "query", "mutation", "action", "schema", "convex", "database", "api",
  "crud", "endpoint", "backend", "server", "function", "validator",
  "index", "table", "storage", "cron", "scheduled",
];

export function detectWorkflowType(description: string): WorkflowDetection {
  const lower = description.toLowerCase();

  const uiScore = UI_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const apiScore = API_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  const total = uiScore + apiScore;
  if (total === 0) {
    return {
      type: "UNCLEAR",
      confidence: 0,
      rationale: "No clear UI or API keywords detected",
    };
  }

  const uiRatio = uiScore / total;
  const apiRatio = apiScore / total;

  if (uiScore > 0 && apiScore > 0 && Math.abs(uiRatio - apiRatio) < 0.3) {
    return {
      type: "MIXED",
      confidence: 0.7,
      rationale: `Both UI (${uiScore}) and API (${apiScore}) keywords detected`,
    };
  }

  if (uiRatio > apiRatio) {
    return {
      type: "UI_FOCUSED",
      confidence: Math.min(0.9, 0.5 + uiRatio * 0.5),
      rationale: `UI keywords (${uiScore}) dominant over API (${apiScore})`,
    };
  }

  return {
    type: "API_FOCUSED",
    confidence: Math.min(0.9, 0.5 + apiRatio * 0.5),
    rationale: `API keywords (${apiScore}) dominant over UI (${uiScore})`,
  };
}

export function getWorkflowImplications(type: WorkflowType): {
  primaryAgent: string;
  secondaryAgents: string[];
  skipPhases: string[];
} {
  switch (type) {
    case "UI_FOCUSED":
      return {
        primaryAgent: "developer",
        secondaryAgents: ["designer", "ui-developer", "tester"],
        skipPhases: [],
      };
    case "API_FOCUSED":
      return {
        primaryAgent: "backend",
        secondaryAgents: ["tester"],
        skipPhases: ["design-validation", "ui-fixes", "browser-testing"],
      };
    case "MIXED":
      return {
        primaryAgent: "developer",
        secondaryAgents: ["backend", "designer", "ui-developer", "tester"],
        skipPhases: [],
      };
    default:
      return {
        primaryAgent: "developer",
        secondaryAgents: ["backend"],
        skipPhases: [],
      };
  }
}
```

### 6.2 Phase Definitions

```typescript
// src/workflows/phases.ts

export type GateType = 
  | "user_approval"
  | "pass_or_fix"
  | "all_tests_pass"
  | "all_reviewers_approve"
  | null;

export interface PhaseDefinition {
  name: string;
  description: string;
  agent: string;
  outputs: string[];
  qualityGate: GateType;
  skipCondition?: (workflowType: string) => boolean;
}

export const IMPLEMENT_PHASES: Record<string, PhaseDefinition> = {
  requirements: {
    name: "Requirements Gathering",
    description: "Analyze request and ask clarifying questions",
    agent: "orchestrator",
    outputs: [],
    qualityGate: null,
  },

  architecture: {
    name: "Architecture Planning",
    description: "Create comprehensive implementation plan",
    agent: "architect",
    outputs: ["implementation-plan.md", "quick-reference.md"],
    qualityGate: "user_approval",
  },

  "plan-review": {
    name: "Plan Review",
    description: "Multi-model review of architecture plan",
    agent: "plan-reviewer",
    outputs: ["reviews/plan-review/"],
    qualityGate: "all_reviewers_approve",
    skipCondition: () => false, // Can be skipped via flag
  },

  implementation: {
    name: "Implementation",
    description: "Build the feature according to plan",
    agent: "developer", // or "backend" based on workflow
    outputs: ["src/"],
    qualityGate: null,
  },

  "design-validation": {
    name: "Design Validation",
    description: "Compare implementation against Figma",
    agent: "designer",
    outputs: ["design-validation.md"],
    qualityGate: "pass_or_fix",
    skipCondition: (wt) => wt === "API_FOCUSED",
  },

  "ui-fixes": {
    name: "UI Fixes",
    description: "Fix issues identified by designer",
    agent: "ui-developer",
    outputs: [],
    qualityGate: null,
    skipCondition: (wt) => wt === "API_FOCUSED",
  },

  "code-review": {
    name: "Code Review",
    description: "Multi-model code review with consensus",
    agent: "reviewer",
    outputs: ["reviews/code-review/"],
    qualityGate: "all_reviewers_approve",
  },

  "review-fixes": {
    name: "Review Fixes",
    description: "Address issues from code review",
    agent: "developer",
    outputs: [],
    qualityGate: "pass_or_fix",
  },

  testing: {
    name: "Testing",
    description: "Browser and integration testing",
    agent: "tester",
    outputs: ["testing-report.md"],
    qualityGate: "all_tests_pass",
    skipCondition: (wt) => wt === "API_FOCUSED", // API uses TDD loop
  },

  acceptance: {
    name: "User Acceptance",
    description: "Present final implementation for approval",
    agent: "orchestrator",
    outputs: ["final-summary.md"],
    qualityGate: "user_approval",
  },

  cleanup: {
    name: "Cleanup",
    description: "Remove temporary artifacts",
    agent: "cleaner",
    outputs: [],
    qualityGate: null,
  },
};

export function getPhasesForWorkflow(workflowType: string): PhaseDefinition[] {
  return Object.values(IMPLEMENT_PHASES).filter(
    (phase) => !phase.skipCondition?.(workflowType)
  );
}
```

### 6.3 Quality Gate Implementations

```typescript
// src/workflows/gates.ts
import type { MagnusOpusConfig } from "../config/schema";

export interface GateResult {
  passed: boolean;
  reason?: string;
  data?: unknown;
}

export async function checkUserApproval(
  sessionId: string,
  question: string
): Promise<GateResult> {
  // This is handled by the agent via AskUserQuestion tool
  // Returns true if user approved, false otherwise
  return { passed: true, reason: "User approval pending via AskUserQuestion" };
}

export async function checkAllReviewersApprove(
  reviews: Array<{ model: string; verdict: string; issues: unknown[] }>
): Promise<GateResult> {
  const verdicts = reviews.map((r) => r.verdict);
  const criticalIssues = reviews.flatMap((r) =>
    (r.issues as Array<{ severity: string }>).filter((i) => i.severity === "CRITICAL")
  );

  if (criticalIssues.length > 0) {
    return {
      passed: false,
      reason: `${criticalIssues.length} critical issues found`,
      data: criticalIssues,
    };
  }

  const majorConcerns = verdicts.filter((v) => v === "MAJOR_CONCERNS").length;
  if (majorConcerns >= reviews.length / 2) {
    return {
      passed: false,
      reason: `${majorConcerns}/${reviews.length} reviewers have major concerns`,
    };
  }

  return { passed: true };
}

export async function checkAllTestsPass(
  testResults: Array<{ name: string; passed: boolean; error?: string }>
): Promise<GateResult> {
  const failed = testResults.filter((t) => !t.passed);
  
  if (failed.length > 0) {
    return {
      passed: false,
      reason: `${failed.length} tests failed`,
      data: failed,
    };
  }

  return { passed: true };
}
```

### 6.4 Agent Routing

```typescript
// src/workflows/routing.ts
import type { WorkflowType } from "./detector";

export interface AgentRouting {
  implementation: string[];
  validation: string[];
  review: string[];
}

export function getAgentsForWorkflow(workflowType: WorkflowType): AgentRouting {
  switch (workflowType) {
    case "UI_FOCUSED":
      return {
        implementation: ["developer"],
        validation: ["designer", "tester"],
        review: ["reviewer"],
      };

    case "API_FOCUSED":
      return {
        implementation: ["backend"],
        validation: [], // TDD loop instead
        review: ["reviewer"],
      };

    case "MIXED":
      return {
        implementation: ["developer", "backend"],
        validation: ["designer", "tester"],
        review: ["reviewer"],
      };

    default:
      return {
        implementation: ["developer"],
        validation: [],
        review: ["reviewer"],
      };
  }
}
```

---

## 7. Session Management

<!-- =============================================================================
WHY: File-Based Session Storage (DECISIONS.md D012)
================================================================================

1. NO EXTERNAL DATABASE
   - Sessions stored in project directory
   - Easy to inspect and debug
   - Git-friendly (can be ignored or committed)
   - Survives plugin restarts

2. SESSION ID FORMAT
   - Prefix: command type (impl, api, etc.)
   - Timestamp: YYYYMMDD-HHMMSS
   - Random: 6 chars for uniqueness
   - Optional: descriptor from user

3. ARTIFACT ISOLATION
   - Each session gets its own directory
   - Plans, reviews, reports all colocated
   - Easy cleanup by deleting directory

============================================================================= -->

### 7.1 Session ID Generation

```typescript
// src/sessions/manager.ts
import { randomBytes } from "crypto";

export interface SessionIdOptions {
  command: string;
  descriptor?: string;
}

function sanitizeForFilesystem(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function randomSuffix(): string {
  return randomBytes(3).toString("hex");
}

export function generateSessionId(
  command: string,
  descriptor?: string
): string {
  const parts = [command, formatTimestamp(), randomSuffix()];

  if (descriptor) {
    parts.push(sanitizeForFilesystem(descriptor));
  }

  return parts.join("-");
}

// Example output: impl-20260118-143052-a1b2c3-user-profile
```

### 7.2 Session Directory Management

```typescript
// src/sessions/directory.ts
import { existsSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join } from "path";

const SESSION_BASE_DIR = "ai-docs/sessions";

export function getSessionDir(sessionId: string, projectDir?: string): string {
  const base = projectDir ?? process.cwd();
  return join(base, SESSION_BASE_DIR, sessionId);
}

export async function createSessionDirectory(
  sessionId: string,
  projectDir?: string
): Promise<string> {
  const sessionDir = getSessionDir(sessionId, projectDir);

  // Create main session directory
  mkdirSync(sessionDir, { recursive: true });

  // Create subdirectories
  mkdirSync(join(sessionDir, "reviews", "plan-review"), { recursive: true });
  mkdirSync(join(sessionDir, "reviews", "code-review"), { recursive: true });

  return sessionDir;
}

export function sessionExists(sessionId: string, projectDir?: string): boolean {
  return existsSync(getSessionDir(sessionId, projectDir));
}

export async function deleteSession(
  sessionId: string,
  projectDir?: string
): Promise<boolean> {
  const sessionDir = getSessionDir(sessionId, projectDir);

  if (!existsSync(sessionDir)) {
    return false;
  }

  rmSync(sessionDir, { recursive: true, force: true });
  return true;
}

export interface SessionSummary {
  id: string;
  status: string;
  description: string;
  createdAt: Date;
}

export async function listSessions(projectDir?: string): Promise<SessionSummary[]> {
  const base = projectDir ?? process.cwd();
  const sessionsDir = join(base, SESSION_BASE_DIR);

  if (!existsSync(sessionsDir)) {
    return [];
  }

  const entries = readdirSync(sessionsDir, { withFileTypes: true });
  const sessions: SessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metadataPath = join(sessionsDir, entry.name, "session-meta.json");
    let metadata: Partial<SessionSummary> = {};

    if (existsSync(metadataPath)) {
      try {
        const { readFileSync } = await import("fs");
        metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {
        // Ignore parse errors
      }
    }

    sessions.push({
      id: entry.name,
      status: metadata.status ?? "unknown",
      description: metadata.description ?? entry.name,
      createdAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
    });
  }

  // Sort by creation date, newest first
  return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
```

### 7.3 Session Metadata

```typescript
// src/sessions/metadata.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getSessionDir } from "./directory";

export interface SessionMetadata {
  id: string;
  command: string;
  description: string;
  workflowType: string;
  status: "active" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  currentPhase?: string;
  completedPhases: string[];
  artifacts: string[];
  figmaUrl?: string;
}

const METADATA_FILE = "session-meta.json";

export function createSessionMetadata(options: {
  id: string;
  command: string;
  description: string;
  workflowType: string;
  figmaUrl?: string;
}): SessionMetadata {
  const now = new Date().toISOString();

  return {
    id: options.id,
    command: options.command,
    description: options.description,
    workflowType: options.workflowType,
    status: "active",
    createdAt: now,
    updatedAt: now,
    completedPhases: [],
    artifacts: [],
    figmaUrl: options.figmaUrl,
  };
}

export async function saveSessionMetadata(
  sessionId: string,
  metadata: SessionMetadata,
  projectDir?: string
): Promise<void> {
  const sessionDir = getSessionDir(sessionId, projectDir);
  const metadataPath = join(sessionDir, METADATA_FILE);

  metadata.updatedAt = new Date().toISOString();

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

export async function loadSessionMetadata(
  sessionId: string,
  projectDir?: string
): Promise<SessionMetadata | null> {
  const sessionDir = getSessionDir(sessionId, projectDir);
  const metadataPath = join(sessionDir, METADATA_FILE);

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataPath, "utf-8"));
  } catch {
    return null;
  }
}

export async function updateSessionPhase(
  sessionId: string,
  phase: string,
  projectDir?: string
): Promise<void> {
  const metadata = await loadSessionMetadata(sessionId, projectDir);
  if (!metadata) return;

  if (metadata.currentPhase && !metadata.completedPhases.includes(metadata.currentPhase)) {
    metadata.completedPhases.push(metadata.currentPhase);
  }

  metadata.currentPhase = phase;
  await saveSessionMetadata(sessionId, metadata, projectDir);
}

export async function addSessionArtifact(
  sessionId: string,
  artifact: string,
  projectDir?: string
): Promise<void> {
  const metadata = await loadSessionMetadata(sessionId, projectDir);
  if (!metadata) return;

  if (!metadata.artifacts.includes(artifact)) {
    metadata.artifacts.push(artifact);
    await saveSessionMetadata(sessionId, metadata, projectDir);
  }
}
```

### 7.4 Session Index

```typescript
// src/sessions/index.ts
export * from "./manager";
export * from "./directory";
export * from "./metadata";
```

---

## 8. Skills System

<!-- =============================================================================
WHY: Skills vs Direct Prompts (DECISIONS.md D013)
================================================================================

1. REUSABLE KNOWLEDGE
   - Skills are markdown files with specialized knowledge
   - Can be updated independently of code
   - Shared across agents via injection

2. LOADING SOURCES
   - Built-in: content/skills/*.md (bundled with plugin)
   - User: ~/.config/opencode/skills/ (global)
   - Project: .opencode/skills/ (project-specific)

3. INJECTION MECHANISM
   - Agent-level: Built into agent system prompt
   - Dynamic: Via experimental.chat.system.transform hook
   - Wrapped in <skill> tags for clear delineation

============================================================================= -->

### 8.1 Skill Types

```typescript
// src/skills/types.ts

export interface BuiltinSkill {
  name: string;
  description: string;
  template: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  allowedTools?: string[];
  agent?: string;
  model?: string;
}

export interface LoadedSkill {
  name: string;
  path?: string;
  definition: BuiltinSkill;
  scope: "builtin" | "user" | "project";
}

export interface SkillMcpConfig {
  [serverName: string]: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
}
```

### 8.2 Built-in Skill Definitions

```typescript
// src/skills/builtin/index.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { BuiltinSkill } from "../types";

// Resolve content directory relative to this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../../content/skills");

function loadSkillContent(filename: string): string {
  try {
    return readFileSync(join(SKILLS_DIR, filename), "utf-8");
  } catch {
    return `<!-- Skill file not found: ${filename} -->`;
  }
}

export const sveltekitSkill: BuiltinSkill = {
  name: "sveltekit",
  description: "SvelteKit 2 + Svelte 5 patterns and best practices",
  template: loadSkillContent("SVELTEKIT.md"),
  allowedTools: ["write", "edit", "read", "glob", "grep", "bash"],
};

export const convexSkill: BuiltinSkill = {
  name: "convex",
  description: "Convex backend patterns (schema, queries, mutations, actions)",
  template: loadSkillContent("CONVEX.md"),
  allowedTools: ["write", "edit", "read", "glob", "grep", "bash"],
};

export const shadcnSvelteSkill: BuiltinSkill = {
  name: "shadcn-svelte",
  description: "shadcn-svelte component library patterns",
  template: loadSkillContent("SHADCN-SVELTE.md"),
  allowedTools: ["write", "edit", "read", "glob", "grep", "bash"],
};

export const qualityGatesSkill: BuiltinSkill = {
  name: "quality-gates",
  description: "Quality gate patterns for multi-phase workflows",
  template: loadSkillContent("QUALITY-GATES.md"),
};

export const todowriteSkill: BuiltinSkill = {
  name: "todowrite-orchestration",
  description: "TodoWrite patterns for task orchestration",
  template: loadSkillContent("TODOWRITE-ORCHESTRATION.md"),
};

export const multiAgentSkill: BuiltinSkill = {
  name: "multi-agent-coordination",
  description: "4-Message Pattern and parallel agent execution",
  template: loadSkillContent("MULTI-AGENT-COORDINATION.md"),
};

export const errorRecoverySkill: BuiltinSkill = {
  name: "error-recovery",
  description: "Error recovery and resilience patterns",
  template: loadSkillContent("ERROR-RECOVERY.md"),
};

export const builtinSkills: Record<string, BuiltinSkill> = {
  sveltekit: sveltekitSkill,
  convex: convexSkill,
  "shadcn-svelte": shadcnSvelteSkill,
  "quality-gates": qualityGatesSkill,
  "todowrite-orchestration": todowriteSkill,
  "multi-agent-coordination": multiAgentSkill,
  "error-recovery": errorRecoverySkill,
};
```

### 8.3 Skill Loader

```typescript
// src/skills/loader.ts
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { LoadedSkill, BuiltinSkill } from "./types";
import { builtinSkills } from "./builtin";

const USER_SKILLS_DIR = "~/.config/opencode/skills";
const PROJECT_SKILLS_DIR = ".opencode/skills";

function resolvePath(path: string): string {
  if (path.startsWith("~")) {
    return join(process.env.HOME ?? "", path.slice(1));
  }
  return path;
}

interface ParsedSkillFile {
  frontmatter: Record<string, unknown>;
  content: string;
}

function parseSkillFile(content: string): ParsedSkillFile {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { frontmatter: {}, content };
  }

  const frontmatterStr = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Simple YAML-like parsing (name: value)
  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterStr.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      frontmatter[match[1]] = match[2].trim();
    }
  }

  return { frontmatter, content: body };
}

function loadSkillsFromDirectory(
  dir: string,
  scope: "user" | "project"
): LoadedSkill[] {
  const resolved = resolvePath(dir);
  if (!existsSync(resolved)) return [];

  const skills: LoadedSkill[] = [];
  const entries = readdirSync(resolved, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;

    const path = join(resolved, entry.name);
    const content = readFileSync(path, "utf-8");
    const { frontmatter, content: template } = parseSkillFile(content);

    const name = (frontmatter.name as string) ?? entry.name.replace(".md", "").toLowerCase();

    skills.push({
      name,
      path,
      definition: {
        name,
        description: (frontmatter.description as string) ?? `Skill from ${entry.name}`,
        template,
        allowedTools: (frontmatter["allowed-tools"] as string)?.split(/\s+/),
        agent: frontmatter.agent as string,
        model: frontmatter.model as string,
      },
      scope,
    });
  }

  return skills;
}

export async function discoverSkills(projectDir?: string): Promise<LoadedSkill[]> {
  const skills: LoadedSkill[] = [];

  // 1. Built-in skills (lowest priority)
  for (const [name, definition] of Object.entries(builtinSkills)) {
    skills.push({
      name,
      definition,
      scope: "builtin",
    });
  }

  // 2. User skills
  skills.push(...loadSkillsFromDirectory(USER_SKILLS_DIR, "user"));

  // 3. Project skills (highest priority, can override)
  if (projectDir) {
    skills.push(
      ...loadSkillsFromDirectory(join(projectDir, PROJECT_SKILLS_DIR), "project")
    );
  }

  return skills;
}

export function getSkill(
  skills: LoadedSkill[],
  name: string
): LoadedSkill | undefined {
  // Return last match (project > user > builtin)
  return [...skills].reverse().find((s) => s.name === name);
}
```

### 8.4 Skill Injection

```typescript
// src/skills/injector.ts
import type { LoadedSkill } from "./types";

// Agent to default skills mapping
const AGENT_SKILLS: Record<string, string[]> = {
  orchestrator: ["multi-agent-coordination", "todowrite-orchestration", "quality-gates"],
  architect: ["quality-gates"],
  developer: ["sveltekit", "shadcn-svelte"],
  backend: ["convex"],
  "ui-developer": ["sveltekit", "shadcn-svelte"],
  reviewer: [],
  "plan-reviewer": [],
  tester: [],
  designer: [],
  explorer: [],
  cleaner: [],
};

export function getSkillsForAgent(
  agent: string,
  allSkills: LoadedSkill[]
): LoadedSkill[] {
  const skillNames = AGENT_SKILLS[agent] ?? [];
  return skillNames
    .map((name) => allSkills.find((s) => s.name === name))
    .filter((s): s is LoadedSkill => s !== undefined);
}

export function injectSkillsToPrompt(
  basePrompt: string,
  skills: LoadedSkill[]
): string {
  if (skills.length === 0) return basePrompt;

  const skillBlocks = skills
    .map(
      (skill) =>
        `<skill name="${skill.name}">\n${skill.definition.template}\n</skill>`
    )
    .join("\n\n");

  return `${basePrompt}\n\n## Injected Skills\n\n${skillBlocks}`;
}

export function wrapSkillContent(name: string, content: string): string {
  return `<skill name="${name}">\n${content}\n</skill>`;
}
```

### 8.5 Skills Index

```typescript
// src/skills/index.ts
export * from "./types";
export * from "./builtin";
export * from "./loader";
export * from "./injector";
```

---

### 9.0 ContextCollector

<!-- =============================================================================
WHY: ContextCollector Pattern (DECISIONS.md D014, btca research: oh-my-opencode)
================================================================================

1. PRIORITY-BASED ORDERING
   - AI models give more weight to earlier context
   - Critical information (ultrawork, safety) must appear first
   - Priority order: critical > high > normal > low
   - Same priority sorted by timestamp (earlier first)

2. DEDUPLICATION VIA COMPOSITE KEY
   - Key format: `${source}:${id}`
   - Same ID from different sources = allowed (different entries)
   - Same ID from same source = overwrites previous entry
   - Prevents conflicting duplicate context

3. SESSION ISOLATION
   - Each session has independent context collection
   - Prevents cross-contamination between conversations
   - State cleared on session deletion

4. CONSUME-AND-CLEAR PATTERN
   - Context consumed once via `consume()` method
   - Cleared after injection to prevent duplicates
   - Efficient token usage - no redundant context

============================================================================= -->

The ContextCollector enables dynamic context injection into conversations. This is the same pattern used by oh-my-opencode for keyword detection, rules injection, and hook-based context.

```typescript
// src/features/context-injector/types.ts

export type ContextPriority = "critical" | "high" | "normal" | "low";

export interface ContextEntry {
  id: string;
  source: string;              // e.g., "keyword-detector", "rules-injector", "hook-context"
  content: string;
  priority: ContextPriority;
  timestamp: number;
}

export interface PendingContext {
  entries: ContextEntry[];
  merged: string;
}

export interface RegisterContextOptions {
  id: string;
  source: string;
  content: string;
  priority?: ContextPriority;
}
```

```typescript
// src/features/context-injector/collector.ts

const CONTEXT_SEPARATOR = "\n\n---\n\n";
const PRIORITY_ORDER: ContextPriority[] = ["critical", "high", "normal", "low"];

export class ContextCollector {
  private sessions = new Map<string, Map<string, ContextEntry>>();

  /**
   * Register context to be injected into a session
   * Deduplicates by source:id key
   */
  register(sessionID: string, options: RegisterContextOptions): void {
    let sessionMap = this.sessions.get(sessionID);
    if (!sessionMap) {
      sessionMap = new Map();
      this.sessions.set(sessionID, sessionMap);
    }

    const key = `${options.source}:${options.id}`;
    const entry: ContextEntry = {
      id: options.id,
      source: options.source,
      content: options.content,
      priority: options.priority ?? "normal",
      timestamp: Date.now(),
    };

    sessionMap.set(key, entry);
  }

  /**
   * Check if session has pending context
   */
  hasPending(sessionID: string): boolean {
    const sessionMap = this.sessions.get(sessionID);
    return sessionMap !== undefined && sessionMap.size > 0;
  }

  /**
   * Get pending context without consuming
   */
  getPending(sessionID: string): PendingContext | null {
    const sessionMap = this.sessions.get(sessionID);
    if (!sessionMap || sessionMap.size === 0) return null;

    const entries = Array.from(sessionMap.values());
    return {
      entries,
      merged: this.mergeEntries(entries),
    };
  }

  /**
   * Consume pending context (clears after returning)
   */
  consume(sessionID: string): PendingContext {
    const pending = this.getPending(sessionID);
    if (!pending) {
      return { entries: [], merged: "" };
    }

    // Clear after consuming
    this.sessions.delete(sessionID);
    return pending;
  }

  /**
   * Clear all context for a session
   */
  clear(sessionID: string): void {
    this.sessions.delete(sessionID);
  }

  /**
   * Merge entries by priority, then by timestamp
   */
  private mergeEntries(entries: ContextEntry[]): string {
    // Sort by priority (critical first), then by timestamp (earlier first)
    const sorted = entries.sort((a, b) => {
      const priorityDiff =
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });

    return sorted.map((e) => e.content).join(CONTEXT_SEPARATOR);
  }
}

// Singleton instance for plugin-wide use
let globalCollector: ContextCollector | null = null;

export function getContextCollector(): ContextCollector {
  if (!globalCollector) {
    globalCollector = new ContextCollector();
  }
  return globalCollector;
}
```

### 9.0.1 Usage Examples

```typescript
// In keyword detection hook
const collector = getContextCollector();
collector.register(sessionID, {
  id: "ultrawork-mode",
  source: "keyword-detector",
  content: ULTRAWORK_CONTEXT,
  priority: "high",
});

// In rules injection hook
collector.register(sessionID, {
  id: `rule-${rulePath}`,
  source: "rules-injector",
  content: ruleContent,
  priority: "normal",
});

// In background task notification
collector.register(parentSessionID, {
  id: `bg-complete-${taskId}`,
  source: "background-notification",
  content: `Background task ${taskId} completed: ${summary}`,
  priority: "critical",
});
```

---

## 10. Background Agent System (oh-my-opencode Pattern)

<!-- =============================================================================
WHY: Hybrid Background Completion Detection (DECISIONS.md D015-016, btca research: oh-my-opencode)
================================================================================

1. NO SINGLE DETECTION METHOD IS RELIABLE
   - Idle events may fire prematurely, late, or not at all
   - Different AI models have varying completion patterns
   - Network issues cause false signals
   - Race conditions between detection methods

2. THREE-LAYERED DETECTION APPROACH
   - Idle events (primary): Fastest signal when OpenCode determines session idle
   - Status polling (fallback): Regular interval checks catch missed events
   - Stability detection (safety net): 3 consecutive unchanged polls required
   - Each layer compensates for failures in others

3. CRITICAL EDGE GUARDS
   - MIN_IDLE_TIME_MS (5s): Prevents early completion on immediate idle
   - Output validation: Ensures actual assistant output exists
   - Todo continuation check: Waits for incomplete todos
   - STALE_TIMEOUT_MS (3 min): Marks stuck tasks as error

4. CONCURRENCY MANAGEMENT
   - ConcurrencyManager with queue-based slot control
   - Guaranteed slot release on completion/error/cancellation
   - Prevents resource leaks from abandoned tasks

5. OPTIONAL SUMMARIZATION (D016)
   - Large outputs can be summarized to reduce context pressure
   - Not default - adds latency and cost
   - Available when needed for heavy outputs

============================================================================= -->

### 10.1 BackgroundManager

Rationale and tradeoffs are recorded in `DECISIONS.md` (Decisions 015–016).

The BackgroundManager enables true parallel agent execution by spawning agents in separate sessions. It mirrors oh-my-opencode's hybrid completion detection, concurrency slots, and task notification batching for reliability.

```typescript
// src/features/background-agent/manager.ts
import { randomUUID } from "crypto";

export interface BackgroundTask {
  id: string;                    // bg_<uuid>
  sessionID: string;             // Created background session
  parentSessionID: string;       // Calling session
  parentMessageID: string;       // Message that started it
  description: string;
  prompt: string;
  agent: string;
  status: "running" | "completed" | "error" | "cancelled";
  startedAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
  concurrencyKey?: string;
  // Stability detection fields (for polling-based completion detection)
  lastMsgCount?: number;         // Message count from last poll
  stablePolls?: number;          // Consecutive polls with no change
  lastActivityAt?: number;       // Timestamp of last activity
}


const POLLING_INTERVAL_MS = 2000;         // Check every 2 seconds
const MIN_STABILITY_TIME_MS = 10_000;     // 10s before stability detection kicks in
const STABILITY_THRESHOLD = 3;            // Consecutive unchanged polls to declare complete
const STALE_TIMEOUT_MS = 180_000;         // 3 min inactivity = stale task
const MIN_RUNTIME_BEFORE_STALE_MS = 30_000; // 30s minimum before stale checks apply
const MIN_IDLE_TIME_MS = 5_000;           // 5s minimum before accepting session.idle

export interface LaunchInput {
  description: string;
  prompt: string;
  agent: string;
  parentSessionID: string;
  parentMessageID: string;
  skillContent?: string;
  model?: { providerID: string; modelID: string };
}

export class BackgroundManager {
  private tasks = new Map<string, BackgroundTask>();
  private notifications = new Map<string, BackgroundTask[]>();
  private pendingByParent = new Map<string, Set<string>>();
  private client: OpencodeClient;
  private directory: string;
  private pollingInterval?: ReturnType<typeof setInterval>;
  private concurrencyManager: ConcurrencyManager;

  constructor(ctx: { client: OpencodeClient; directory: string; concurrency: ConcurrencyManager }) {
    this.client = ctx.client;
    this.directory = ctx.directory;
    this.concurrencyManager = ctx.concurrency;
    this.registerProcessCleanup();
  }

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    const taskId = `bg_${randomUUID().slice(0, 8)}`;

    await this.concurrencyManager.acquire(input.agent);

    // Create background session with parentID
    const session = await this.client.session.create({
      body: {
        title: input.description,
        parentID: input.parentSessionID,
      },
      query: { directory: this.directory },
    });

    const task: BackgroundTask = {
      id: taskId,
      sessionID: session.id,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      status: "running",
      startedAt: new Date(),
      concurrencyKey: input.agent,
    };

    this.tasks.set(taskId, task);

    const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set<string>();
    pending.add(taskId);
    this.pendingByParent.set(input.parentSessionID, pending);

    // Fire-and-forget prompt (don't await)
    this.client.session.prompt({
      path: { id: session.id },
      body: {
        agent: input.agent,
        ...(input.model ? { model: input.model } : {}),
        ...(input.skillContent ? { system: input.skillContent } : {}),
        parts: [{ type: "text", text: input.prompt }],
      },
      query: { directory: this.directory },
    }).catch((err) => {
      task.status = "error";
      task.error = err.message;
      this.concurrencyManager.release(input.agent);
    });

    // Start polling for completion
    this.startPolling();

    return task;
  }

  async resume(input: LaunchInput & { sessionID: string }): Promise<BackgroundTask> {
    await this.concurrencyManager.acquire(input.agent);

    const task: BackgroundTask = {
      id: `bg_${randomUUID().slice(0, 8)}`,
      sessionID: input.sessionID,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      status: "running",
      startedAt: new Date(),
      concurrencyKey: input.agent,
    };

    this.tasks.set(task.id, task);

    const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set<string>();
    pending.add(task.id);
    this.pendingByParent.set(input.parentSessionID, pending);

    this.client.session.prompt({
      path: { id: input.sessionID },
      body: {
        agent: input.agent,
        ...(input.model ? { model: input.model } : {}),
        ...(input.skillContent ? { system: input.skillContent } : {}),
        parts: [{ type: "text", text: input.prompt }],
      },
      query: { directory: this.directory },
    }).catch((err) => {
      task.status = "error";
      task.error = err.message;
      this.concurrencyManager.release(input.agent);
    });

    this.startPolling();

    return task;
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  getTasksByParentSession(sessionID: string): BackgroundTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.parentSessionID === sessionID);
  }

  findBySession(sessionID: string): BackgroundTask | undefined {
    return Array.from(this.tasks.values())
      .find(t => t.sessionID === sessionID);
  }

  private startPolling(): void {
    if (this.pollingInterval) return;
    
    this.pollingInterval = setInterval(async () => {
      this.pruneStaleTasks();

      for (const task of this.tasks.values()) {
        if (task.status !== "running") continue;
        
        try {
          // Use session.status() for efficient status check
          const statusResponse = await this.client.session.status({
            query: { directory: this.directory },
          });
          const sessionStatus = statusResponse[task.sessionID];
          
          const runtimeMs = Date.now() - task.startedAt.getTime();
          
          // === Stale Task Detection ===
          if (runtimeMs > MIN_RUNTIME_BEFORE_STALE_MS) {
            const lastActivity = task.lastActivityAt ?? task.startedAt.getTime();
            if (Date.now() - lastActivity > STALE_TIMEOUT_MS) {
              task.status = "error";
              task.error = "Task stale - no activity for 3 minutes";
              if (task.concurrencyKey) {
                this.concurrencyManager.release(task.concurrencyKey);
              }
              continue;
            }
          }
          
          // === Idle Status Detection ===
          if (sessionStatus?.type === "idle") {
            // Validate session has actual output before completing
            const hasOutput = await this.validateSessionHasOutput(task.sessionID);
            if (hasOutput) {
              await this.completeTask(task, "polling (idle status)");
              continue;
            }
          }
          
          // === Stability Detection ===
          if (runtimeMs > MIN_STABILITY_TIME_MS) {
            const messages = await this.client.session.messages({
              path: { id: task.sessionID },
            });
            const currentMsgCount = messages.length;
            
            if (task.lastMsgCount === currentMsgCount) {
              task.stablePolls = (task.stablePolls ?? 0) + 1;
              if (task.stablePolls >= STABILITY_THRESHOLD) {
                const hasOutput = await this.validateSessionHasOutput(task.sessionID);
                if (hasOutput) {
                  await this.completeTask(task, "stability detection");
                }
              }
            } else {
              // Activity detected - reset stability counter
              task.lastMsgCount = currentMsgCount;
              task.stablePolls = 0;
              task.lastActivityAt = Date.now();
            }
          }
        } catch {
          // Session may have been deleted
          task.status = "error";
          task.error = "Session unavailable";
          if (task.concurrencyKey) {
            this.concurrencyManager.release(task.concurrencyKey);
          }
        }
      }
    }, POLLING_INTERVAL_MS);
  }

  private async validateSessionHasOutput(sessionID: string): Promise<boolean> {
    try {
      const messages = await this.client.session.messages({
        path: { id: sessionID },
      });
      // Must have at least one assistant or tool message with content
      return messages.some(m => 
        m.info.role === "assistant" && 
        m.parts?.some(p => p.type === "text" || p.type === "tool")
      );
    } catch {
      return false;
    }
  }

  handleEvent(event: { type: string; properties?: Record<string, unknown> }): void {
    if (event.type !== "session.idle") return;
    const sessionID = (event.properties as { sessionID?: string })?.sessionID;
    if (!sessionID) return;
    const task = this.findBySession(sessionID);
    if (!task || task.status !== "running") return;

    const runtimeMs = Date.now() - task.startedAt.getTime();
    if (runtimeMs < MIN_IDLE_TIME_MS) return;

    this.validateSessionHasOutput(sessionID).then((hasOutput) => {
      if (!hasOutput) return;
      void this.completeTask(task, "event (session.idle)");
    });
  }

  trackTask(task: BackgroundTask): void {
    this.tasks.set(task.id, task);
    const pending = this.pendingByParent.get(task.parentSessionID) ?? new Set<string>();
    pending.add(task.id);
    this.pendingByParent.set(task.parentSessionID, pending);
    this.startPolling();
  }

  private async completeTask(task: BackgroundTask, reason: string): Promise<void> {
    if (task.status !== "running") return; // Prevent double-completion

    // Ensure session todos are complete before marking done
    const todosResponse = await this.client.session.todo({ path: { id: task.sessionID } });
    const todos = (todosResponse.data ?? todosResponse) as Array<{ status?: string }>;
    if (todos?.some((t) => t.status && t.status !== "completed" && t.status !== "cancelled")) {
      return;
    }
    
    task.status = "completed";
    task.completedAt = new Date();

    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey);
    }
    
    
    // Queue notification for parent (batch by parent session)
    const notifications = this.notifications.get(task.parentSessionID) ?? [];
    notifications.push(task);
    this.notifications.set(task.parentSessionID, notifications);

    const pending = this.pendingByParent.get(task.parentSessionID) ?? new Set<string>();
    pending.delete(task.id);
    this.pendingByParent.set(task.parentSessionID, pending);

    if (pending.size === 0) {
      await this.notifyParent(task.parentSessionID, notifications);
      this.notifications.delete(task.parentSessionID);
    }
  }

  private async notifyParent(parentSessionID: string, tasks: BackgroundTask[]): Promise<void> {
    const summaries = tasks.map((task) => `- ${task.description}: ${task.status}`).join("\n");
    const content = `Background tasks complete (${tasks.length}).\n${summaries}`;

    await this.client.session.prompt({
      path: { id: parentSessionID },
      body: { parts: [{ type: "text", text: content }] },
      query: { directory: this.directory },
    });
  }

  private registerProcessCleanup(): void {
    process.on("SIGINT", () => this.cleanup());
    process.on("SIGTERM", () => this.cleanup());
  }

  private cleanup(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.tasks.clear();
    this.notifications.clear();
    this.pendingByParent.clear();
  }

  private pruneStaleTasks(): void {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (task.status === "running") continue;
      const completedAt = task.completedAt?.getTime() ?? now;
      if (now - completedAt > 300_000) {
        this.tasks.delete(task.id);
      }
    }
  }
}
```

### 10.2 delegate_task Tool

Adds strict validation, resume support, and model selection priority (category model → parent model → defaults).

```typescript
// src/tools/delegate-task/index.ts
import { tool } from "../helpers";
import type { BackgroundManager } from "../../features/background-agent/manager";

const DELEGATE_TASK_DESCRIPTION = `Delegate a task to a specialized agent.

REQUIRED PARAMETERS:
- run_in_background: MUST be explicitly set to true or false
- skills: Array of skill names to inject, or null for no skills

Categories:
- visual: UI/design tasks (uses designer agent)
- business-logic: API/backend tasks (uses backend agent)
- Or use subagent_type to target a specific agent directly`;

export function createDelegateTask(options: {
  manager: BackgroundManager;
  client: OpencodeClient;
  directory: string;
  userCategories?: Record<string, CategoryConfig>;
}) {
  const { manager, client, directory, userCategories } = options;

  return tool({
    description: DELEGATE_TASK_DESCRIPTION,
    
    args: {
      description: tool.schema.string().describe("Short task description (5-10 words)"),
      prompt: tool.schema.string().describe("Full detailed prompt for the agent"),
      category: tool.schema.string().optional().describe("Category name: visual, business-logic"),
      subagent_type: tool.schema.string().optional().describe("Direct agent name"),
      run_in_background: tool.schema.boolean().describe("REQUIRED: true for async, false for sync"),
      skills: tool.schema.array(tool.schema.string()).nullable().describe("Skills to inject"),
      resume: tool.schema.string().optional().describe("Resume an existing background session"),
    },
    
    async execute(args, ctx) {
      // Validation
      if (args.run_in_background === undefined) {
        return "❌ Error: run_in_background parameter is REQUIRED (true or false)";
      }
      if (args.skills === undefined) {
        return "❌ Error: skills parameter is REQUIRED (array or null)";
      }
      if (args.category && args.subagent_type) {
        return "❌ Error: Provide either category or subagent_type, not both";
      }

      // Resolve agent from category or direct specification
      const resolvedAgent = args.subagent_type ?? 
        resolveAgentFromCategory(args.category, userCategories);
      
      if (!resolvedAgent) {
        return "❌ Error: Could not resolve agent. Provide category or subagent_type";
      }

      const isPrimaryAgent = isPrimaryAgentName(resolvedAgent);
      if (isPrimaryAgent) {
        return `❌ Error: ${resolvedAgent} is reserved as a primary agent`;
      }

      // Resolve model selection priority
      const modelOverride = resolveCategoryModel(args.category, userCategories) ??
        resolveParentModel(ctx.sessionID, ctx.agent);

      // Resolve skill content
      let skillContent: string | undefined;
      if (args.skills && args.skills.length > 0) {
        skillContent = await resolveSkillContent(args.skills);
      }

      // Background execution
      if (args.run_in_background) {
        const task = args.resume
          ? await manager.resume({
              sessionID: args.resume,
              description: args.description,
              prompt: args.prompt,
              agent: resolvedAgent,
              parentSessionID: ctx.sessionID,
              parentMessageID: ctx.messageID,
              skillContent,
              model: modelOverride,
            })
          : await manager.launch({
              description: args.description,
              prompt: args.prompt,
              agent: resolvedAgent,
              parentSessionID: ctx.sessionID,
              parentMessageID: ctx.messageID,
              skillContent,
              model: modelOverride,
            });

        return `✅ Background task launched

Task ID: ${task.id}
Session ID: ${task.sessionID}
Agent: ${task.agent}
Status: ${task.status}

Use \`background_output\` to check results when ready.`;
      }

      // Sync execution (same session)
      await client.session.prompt({
        path: { id: ctx.sessionID },
        body: {
          agent: resolvedAgent,
          ...(modelOverride ? { model: modelOverride } : {}),
          ...(skillContent ? { system: skillContent } : {}),
          parts: [{ type: "text", text: args.prompt }],
        },
        query: { directory },
      });

      return `✅ Task delegated to ${resolvedAgent}`;
    },
  });
}
```

---

## 11. Advanced Hooks (oh-my-opencode Pattern)

<!-- =============================================================================
WHY: Hook System Architecture (DECISIONS.md D017-019, btca research: oh-my-opencode)
================================================================================

1. LAYERED EXECUTION ORDER
   - Production hooks run early: keyword detection, rules loading, directory context
   - Consumption hooks run late: context injection, output truncation
   - Order prevents coupling - collectors aggregate before injectors consume

2. HOOK CATEGORIES
   - Event hooks: Session lifecycle (created, deleted) for state init/cleanup
   - Tool hooks: Before/after execution for args transform and output processing
   - Message hooks: Chat interception for variants and keyword detection
   - Transform hooks: System prompt and message modification (experimental)

3. PROACTIVE SESSION STATUS (D018)
   - Check session.status() before countdown-based reminders
   - Prevents noisy reminders when sessions are still active
   - Cleaner UX during long-running tasks

4. COMPLETE TOKEN ACCOUNTING (D019)
   - Include input, output, reasoning, and cached tokens
   - Reasoning tokens (extended thinking) count toward limits
   - Cache tokens still consume context window
   - More accurate truncation decisions

5. COMPOSABILITY
   - Each hook operates independently
   - ContextCollector aggregates across all production hooks
   - Hooks can be disabled individually via disabled_hooks config

============================================================================= -->

Rationale for the hook architecture is recorded in `DECISIONS.md` (Decision 017).

### 11.0 Hook Inventory (Used in Magnus Opus)

Hooks are documented in each implementation section; no separate list is maintained here to avoid drift.


### 11.0 Experimental Hooks (OpenCode Advanced Integration)

OpenCode provides experimental hooks for advanced integration. Magnus Opus uses these for skill injection and context management.

#### System Transform Hook

Modify system prompts dynamically based on session state:

```typescript
// src/hooks/system-transform.ts
import type { PluginContext } from "../types";
import { getSkillsForAgent } from "../skills";

export function createSystemTransformHook(deps: { ctx: PluginContext; pluginConfig: MagnusOpusConfig }) {
  return async (
    input: { sessionID: string },
    output: { system: string[] }
  ): Promise<void> => {
    // Get current agent for session
    const agent = getSessionAgent(input.sessionID);
    if (!agent) return;

    // Inject agent-specific skills into system prompt
    const skills = getSkillsForAgent(agent);
    for (const skill of skills) {
      output.system.push(`<skill name="${skill.name}">\n${skill.template}\n</skill>`);
    }
  };
}
```

#### Messages Transform Hook

Inject synthetic context into messages (used by ContextCollector):

```typescript
// src/hooks/messages-transform.ts
import type { ContextCollector } from "../features/context-injector";

export function createMessagesTransformHook(deps: {
  ctx: PluginContext;
  pluginConfig: MagnusOpusConfig;
  contextCollector?: ContextCollector;
}) {
  const { contextCollector } = deps;

  return async (
    input: {},
    output: {
      messages: Array<{
        info: { id: string; sessionID: string; role: string };
        parts: Array<{ type: string; text?: string; synthetic?: boolean }>;
      }>;
    }
  ): Promise<void> => {
    if (!contextCollector) return;

    // Find last user message
    const lastUserIndex = output.messages.findLastIndex(
      (m) => m.info.role === "user"
    );
    if (lastUserIndex === -1) return;

    const lastUserMessage = output.messages[lastUserIndex];
    const sessionID = lastUserMessage.info.sessionID;

    // Check for pending context
    if (!contextCollector.hasPending(sessionID)) return;

    // Consume and inject
    const pending = contextCollector.consume(sessionID);
    const syntheticPart = {
      id: `synthetic_${Date.now()}`,
      type: "text",
      text: pending.merged,
      synthetic: true, // Hidden from UI
    };

    // Insert before first text part
    const textPartIndex = lastUserMessage.parts.findIndex((p) => p.type === "text");
    if (textPartIndex !== -1) {
      lastUserMessage.parts.splice(textPartIndex, 0, syntheticPart);
    }
  };
}
```

### 11.1 Chat Message Handler (CRITICAL - was missing from original plan)

The `chat.message` hook is essential for agent variant selection and keyword detection. This pattern is used heavily in oh-my-opencode.

#### 11.1.1 First Message Variant Gate

The variant gate ensures agent variants (like extended thinking mode) are only applied on the first message of a main session, not on every message or child sessions.

```typescript
// src/shared/first-message-variant.ts

type SessionInfo = {
  id?: string
  parentID?: string
}

export function createFirstMessageVariantGate() {
  const pending = new Set<string>()

  return {
    // Called on session.created event - only tracks main sessions (no parent)
    markSessionCreated(info?: SessionInfo) {
      if (info?.id && !info.parentID) {
        pending.add(info.id)
      }
    },
    
    // Check if variant should be overridden for this session
    shouldOverride(sessionID?: string) {
      if (!sessionID) return false
      return pending.has(sessionID)
    },
    
    // Called after variant is applied - removes from pending
    markApplied(sessionID?: string) {
      if (!sessionID) return
      pending.delete(sessionID)
    },
    
    // Cleanup on session delete
    clear(sessionID?: string) {
      if (!sessionID) return
      pending.delete(sessionID)
    },
  }
}
```

#### 11.1.2 Chat Message Handler Implementation

```typescript
// src/hooks/chat-message-handler.ts
import type { ChatMessageInput, ChatMessageOutput, PluginContext } from "../types";
import type { MagnusOpusConfig } from "../config/schema";
import { createFirstMessageVariantGate } from "../shared/first-message-variant";

export interface ChatMessageHandlerDeps {
  ctx: PluginContext;
  pluginConfig: MagnusOpusConfig;
}

// Keywords that trigger special behavior
const ULTRAWORK_KEYWORDS = ["ultrawork", "ulw"];

// Track sessions where keywords were detected
const keywordDetectedSessions = new Set<string>();

// Create gate instance (singleton per plugin)
const firstMessageVariantGate = createFirstMessageVariantGate();

// Export for use in event handler
export { firstMessageVariantGate };

export function createChatMessageHandler(deps: ChatMessageHandlerDeps) {
  const { ctx, pluginConfig } = deps;

  return async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
    const { sessionID, agent } = input;

    // 1. Apply agent variant on first message only
    if (firstMessageVariantGate.shouldOverride(sessionID)) {
      const variant = resolveAgentVariant(pluginConfig, agent);
      if (variant !== undefined) {
        (output as { message: { variant?: string } }).message.variant = variant;
      }
      firstMessageVariantGate.markApplied(sessionID);
    }

    // 2. Detect keywords in user message
    const messageText = extractMessageText(output);
    detectKeywords(sessionID, messageText, output);
  };
}

/**
 * Resolve variant based on agent configuration
 */
function resolveAgentVariant(
  pluginConfig: MagnusOpusConfig,
  agent: string | undefined
): string | undefined {
  if (!agent) return undefined;

  // Check for agent-specific overrides
  const agentOverride = pluginConfig.agents?.[agent as keyof typeof pluginConfig.agents];
  if (agentOverride?.variant) {
    return agentOverride.variant;
  }

  // Default variants for known agents
  const defaultVariants: Record<string, string> = {
    orchestrator: "high",      // Extended thinking for orchestration
    architect: "medium",       // Medium thinking for planning
    "plan-reviewer": "medium", // Medium thinking for review
  };

  return defaultVariants[agent];
}

/**
 * Extract text content from message parts
 */
function extractMessageText(output: ChatMessageOutput): string {
  if (!output.parts) return "";
  
  return output.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/**
 * Detect special keywords in message and inject context
 */
function detectKeywords(
  sessionID: string,
  messageText: string,
  output: ChatMessageOutput
): void {
  const lowerText = messageText.toLowerCase();

  // Check for ultrawork keywords
  const hasUltrawork = ULTRAWORK_KEYWORDS.some((kw) => lowerText.includes(kw));
  
  if (hasUltrawork && !keywordDetectedSessions.has(sessionID)) {
    keywordDetectedSessions.add(sessionID);
    
    // Inject ultrawork context into the message
    injectUltraworkContext(output);
  }
}

/**
 * Inject ultrawork orchestration context
 */
function injectUltraworkContext(output: ChatMessageOutput): void {
  const ultraworkContext = `
<system-reminder>
## ULTRAWORK Mode Active

You are now operating in ULTRAWORK mode. This means:

1. **Aggressive Parallelism**: Use the 4-Message Pattern for all multi-agent work
   - Message 1: Preparation (Bash only)
   - Message 2: Parallel execution (Task only - all agents launch simultaneously)
   - Message 3: Consolidation
   - Message 4: Present results


2. **Background Agents**: Delegate exploration and research to background agents
   - Use \`run_in_background: true\` for independent tasks
   - Don't wait for results unless dependencies exist

3. **TodoWrite Discipline**: 
   - Create comprehensive todo list upfront
   - Update status IMMEDIATELY after each step
   - Never leave tasks half-done

4. **Context Efficiency**:
   - Use file-based delegation for large outputs
   - Return brief summaries (2-5 sentences) from sub-agents
   - Read output files only when needed

5. **Quality Gates**:
   - User approval after architecture planning
   - Validation gates with iteration loops
   - Multi-model review when appropriate

Work relentlessly until ALL tasks are complete.
</system-reminder>
`;

  // Append context to message parts
  if (output.parts) {
    output.parts.push({
      type: "text",
      text: ultraworkContext,
    });
  }
}

/**
 * Clear session state (called on session.deleted event)
 */
export function clearChatMessageState(sessionID: string): void {
  keywordDetectedSessions.delete(sessionID);
  firstMessageVariantGate.clear(sessionID);
}
```

#### 11.1.3 Event Handler Integration

The variant gate must be integrated with session lifecycle events:

```typescript
// In plugin event handler
event: async (input) => {
  const { event } = input;
  const props = event.properties as Record<string, unknown> | undefined;

  if (event.type === "session.created") {
    const sessionInfo = props?.info as { id?: string; parentID?: string } | undefined;
    // Mark main sessions (no parent) as pending variant application
    firstMessageVariantGate.markSessionCreated(sessionInfo);
  }

  if (event.type === "session.deleted") {
    const sessionInfo = props?.info as { id?: string } | undefined;
    if (sessionInfo?.id) {
      clearChatMessageState(sessionInfo.id);
    }
  }
}
```

### 11.2 Todo Continuation Enforcer

Rationale for proactive session status checks is recorded in `DECISIONS.md` (Decision 018).

Forces agents to complete all TodoWrite items before stopping.

**Note:** OpenCode provides a native `session.todo()` API for reading todo state. See [AGENTS.md](./AGENTS.md#3-session-todo-api) for details.

```typescript
// src/hooks/todo-continuation-enforcer.ts
import type { PluginInput } from "@opencode-ai/plugin";

const COUNTDOWN_SECONDS = 2;
const DEFAULT_SKIP_AGENTS = ["Prometheus (Planner)"];

// Todo.Info structure from OpenCode API
interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>;
  countdownInterval?: ReturnType<typeof setInterval>;
  isRecovering?: boolean;
  abortDetectedAt?: number;
}

export function createTodoContinuationEnforcer(
  ctx: PluginInput,
  options: { backgroundManager?: BackgroundManager; skipAgents?: string[] } = {}
) {
  const { backgroundManager, skipAgents = DEFAULT_SKIP_AGENTS } = options;
  const sessions = new Map<string, SessionState>();

  const handler = async ({ event }: EventInput): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined;

    // Abort detection (user pressed Ctrl+C)
    if (event.type === "session.error") {
      const error = props?.error as { name?: string } | undefined;
      if (error?.name === "MessageAbortedError" || error?.name === "AbortError") {
        const sessionID = props?.sessionID as string;
        const state = getState(sessionID);
        state.abortDetectedAt = Date.now();
        cancelCountdown(sessionID);
      }
      return;
    }

    // Session idle detection
    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string;
      if (!sessionID) return;

      const state = getState(sessionID);

      // Skip if recovering
      if (state.isRecovering) return;

      // Skip if abort was recent (user explicitly stopped)
      if (state.abortDetectedAt) {
        const timeSinceAbort = Date.now() - state.abortDetectedAt;
        if (timeSinceAbort < 3000) return;
        state.abortDetectedAt = undefined;
      }

      // Skip if background tasks are running
      if (backgroundManager) {
        const hasRunningTasks = backgroundManager
          .getTasksByParentSession(sessionID)
          .some(t => t.status === "running");
        if (hasRunningTasks) return;
      }

      const statusResponse = await ctx.client.session.status({
        query: { directory: ctx.directory },
      });
      const sessionStatus = statusResponse[sessionID];
      if (sessionStatus?.type !== "idle") return; // Session resumed, skip countdown

      // Fetch todos using native OpenCode API
      const response = await ctx.client.session.todo({ path: { id: sessionID } });
      const todos = (response.data ?? response) as Todo[];
      
      if (!todos || todos.length === 0) return;
      
      const incompleteCount = todos.filter(t => t.status !== "completed").length;
      const totalCount = todos.length;

      if (incompleteCount === 0) return; // All done!

      // Start countdown
      startCountdown(sessionID, incompleteCount, totalCount);
    }

    // Cancel countdown on user activity
    if (event.type === "message.updated") {
      const role = props?.info?.role as string | undefined;
      if (role === "user" || role === "assistant") {
        const sessionID = props?.info?.sessionID as string;
        cancelCountdown(sessionID);
      }
    }
  };

  function getState(sessionID: string): SessionState {
    let state = sessions.get(sessionID);
    if (!state) {
      state = {};
      sessions.set(sessionID, state);
    }
    return state;
  }

  function startCountdown(sessionID: string, incomplete: number, total: number): void {
    const state = getState(sessionID);
    cancelCountdown(sessionID);

    let remaining = COUNTDOWN_SECONDS;
    
    // Show countdown toast
    ctx.client.toast?.({
      body: { message: `⏳ ${remaining}s - ${incomplete} todos remaining...` },
    });

    state.countdownInterval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        ctx.client.toast?.({
          body: { message: `⏳ ${remaining}s - ${incomplete} todos remaining...` },
        });
      }
    }, 1000);

    state.countdownTimer = setTimeout(async () => {
      cancelCountdown(sessionID);
      await injectContinuation(sessionID, incomplete, total);
    }, COUNTDOWN_SECONDS * 1000);
  }

  function cancelCountdown(sessionID: string): void {
    const state = sessions.get(sessionID);
    if (!state) return;
    if (state.countdownTimer) clearTimeout(state.countdownTimer);
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    state.countdownTimer = undefined;
    state.countdownInterval = undefined;
  }

  async function injectContinuation(
    sessionID: string,
    incomplete: number,
    total: number
  ): Promise<void> {
    const prompt = `<system-reminder>
Incomplete tasks remain in your todo list. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done

[Status: ${total - incomplete}/${total} completed, ${incomplete} remaining]
</system-reminder>`;

    await ctx.client.session.prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: prompt }] },
      query: { directory: ctx.directory },
    });
  }

  return {
    handler,
    markRecovering: (sessionID: string) => {
      getState(sessionID).isRecovering = true;
      cancelCountdown(sessionID);
    },
    markRecoveryComplete: (sessionID: string) => {
      const state = sessions.get(sessionID);
      if (state) state.isRecovering = false;
    },
  };
}
```

### 11.3 Tool Output Truncator Hook

Rationale for complete token accounting is recorded in `DECISIONS.md` (Decision 019).

Prevents large tool outputs from exhausting context window. Dynamically truncates based on current context usage.

```typescript
// src/hooks/tool-output-truncator.ts
import type { PluginInput } from "@opencode-ai/plugin";
import { createDynamicTruncator } from "../shared/dynamic-truncator";

const DEFAULT_MAX_TOKENS = 50_000;  // ~200k chars
const WEBFETCH_MAX_TOKENS = 10_000; // ~40k chars - web needs aggressive truncation

const TRUNCATABLE_TOOLS = [
  "grep", "Grep",
  "glob", "Glob",
  "webfetch", "WebFetch",
  "skill_mcp",
];

const TOOL_SPECIFIC_MAX_TOKENS: Record<string, number> = {
  webfetch: WEBFETCH_MAX_TOKENS,
  WebFetch: WEBFETCH_MAX_TOKENS,
};

interface ToolOutputTruncatorOptions {
  truncateAllToolOutputs?: boolean;
}

export function createToolOutputTruncatorHook(
  ctx: PluginInput,
  options?: ToolOutputTruncatorOptions
) {
  const truncator = createDynamicTruncator(ctx);
  const truncateAll = options?.truncateAllToolOutputs ?? false;

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ): Promise<void> => {
      if (!truncateAll && !TRUNCATABLE_TOOLS.includes(input.tool)) return;

      try {
        const targetMaxTokens = TOOL_SPECIFIC_MAX_TOKENS[input.tool] ?? DEFAULT_MAX_TOKENS;
        const { result, truncated } = await truncator.truncate(
          input.sessionID,
          output.output,
          { targetMaxTokens }
        );
        if (truncated) {
          output.output = result;
        }
      } catch {
        // Graceful degradation - don't break tool execution
      }
    },
  };
}
```

#### Dynamic Truncator Implementation

```typescript
// src/shared/dynamic-truncator.ts
import type { PluginInput } from "@opencode-ai/plugin";

const CHARS_PER_TOKEN_ESTIMATE = 4;
const DEFAULT_TARGET_MAX_TOKENS = 50_000;

export interface TruncationResult {
  result: string;
  truncated: boolean;
  removedCount?: number;
}

export interface TruncationOptions {
  targetMaxTokens?: number;
  preserveHeaderLines?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function truncateToTokenLimit(
  output: string,
  maxTokens: number,
  preserveHeaderLines = 3
): TruncationResult {
  const currentTokens = estimateTokens(output);

  if (currentTokens <= maxTokens) {
    return { result: output, truncated: false };
  }

  const lines = output.split("\n");

  if (lines.length <= preserveHeaderLines) {
    const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE;
    return {
      result: output.slice(0, maxChars) +
        "\n\n[Output truncated due to context window limit]",
      truncated: true,
    };
  }

  const headerLines = lines.slice(0, preserveHeaderLines);
  const contentLines = lines.slice(preserveHeaderLines);

  const headerText = headerLines.join("\n");
  const headerTokens = estimateTokens(headerText);
  const truncationMessageTokens = 50;
  const availableTokens = maxTokens - headerTokens - truncationMessageTokens;

  if (availableTokens <= 0) {
    return {
      result: headerText + "\n\n[Content truncated due to context window limit]",
      truncated: true,
      removedCount: contentLines.length,
    };
  }

  const resultLines: string[] = [];
  let currentTokenCount = 0;

  for (const line of contentLines) {
    const lineTokens = estimateTokens(line + "\n");
    if (currentTokenCount + lineTokens > availableTokens) {
      break;
    }
    resultLines.push(line);
    currentTokenCount += lineTokens;
  }

  const truncatedContent = [...headerLines, ...resultLines].join("\n");
  const removedCount = contentLines.length - resultLines.length;

  return {
    result: truncatedContent +
      `\n\n[${removedCount} more lines truncated due to context window limit]`,
    truncated: true,
    removedCount,
  };
}


interface TokenInfo {
  input: number;
  output: number;
  reasoning?: number;
  cache?: {
    read: number;
    write: number;
  };
}

export async function getContextWindowUsage(
  ctx: PluginInput,
  sessionID: string
): Promise<{ usedTokens: number; remainingTokens: number } | null> {
  try {
    const response = await ctx.client.session.messages({
      path: { id: sessionID },
    });

    const messages = (response.data ?? response) as Array<{
      info: { role: string; tokens?: TokenInfo };
    }>;

    const assistantMessages = messages.filter((m) => m.info.role === "assistant");
    if (assistantMessages.length === 0) return null;

    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    const tokens = lastAssistant.info.tokens;
    
    // Include ALL token types that contribute to context window
    const usedTokens = 
      (tokens?.input ?? 0) + 
      (tokens?.output ?? 0) + 
      (tokens?.reasoning ?? 0) +      // Extended thinking tokens
      (tokens?.cache?.read ?? 0);     // Cached tokens still count toward context
    
    // Get limit from model cache state (see Section 5.3)
    const contextLimit = 200_000; // Default, override with cached value
    const remainingTokens = contextLimit - usedTokens;

    return { usedTokens, remainingTokens };
  } catch {
    return null;
  }
}

export async function dynamicTruncate(
  ctx: PluginInput,
  sessionID: string,
  output: string,
  options: TruncationOptions = {}
): Promise<TruncationResult> {
  const { targetMaxTokens = DEFAULT_TARGET_MAX_TOKENS, preserveHeaderLines = 3 } = options;

  const usage = await getContextWindowUsage(ctx, sessionID);

  if (!usage) {
    // Fallback: apply conservative truncation when context usage unavailable
    return truncateToTokenLimit(output, targetMaxTokens, preserveHeaderLines);
  }

  const maxOutputTokens = Math.min(usage.remainingTokens * 0.5, targetMaxTokens);

  if (maxOutputTokens <= 0) {
    return {
      result: "[Output suppressed - context window exhausted]",
      truncated: true,
    };
  }

  return truncateToTokenLimit(output, maxOutputTokens, preserveHeaderLines);
}

export function createDynamicTruncator(ctx: PluginInput) {
  return {
    truncate: (sessionID: string, output: string, options?: TruncationOptions) =>
      dynamicTruncate(ctx, sessionID, output, options),
    getUsage: (sessionID: string) => getContextWindowUsage(ctx, sessionID),
    truncateSync: (output: string, maxTokens: number, preserveHeaderLines?: number) =>
      truncateToTokenLimit(output, maxTokens, preserveHeaderLines),
  };
}
```

---

### 11.4 Comment Checker Hooks

```typescript
// src/hooks/comment-checker/index.ts

interface PendingCall {
  filePath: string;
  content?: string;
  oldString?: string;
  newString?: string;
  tool: "write" | "edit" | "multiedit";
  sessionID: string;
  timestamp: number;
}

const pendingCalls = new Map<string, PendingCall>();
const PENDING_TTL = 60000; // 60 seconds

export function createCommentCheckerHooks(config?: { custom_prompt?: string }) {
  // Cleanup old pending calls periodically
  setInterval(() => {
    const now = Date.now();
    for (const [id, call] of pendingCalls) {
      if (now - call.timestamp > PENDING_TTL) {
        pendingCalls.delete(id);
      }
    }
  }, 10000);

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      const toolLower = input.tool.toLowerCase();
      if (!["write", "edit", "multiedit"].includes(toolLower)) return;

      const filePath = (output.args.filePath ?? output.args.file_path ?? output.args.path) as string;
      if (!filePath) return;

      // Register pending call
      pendingCalls.set(input.callID, {
        filePath,
        content: output.args.content as string | undefined,
        oldString: (output.args.oldString ?? output.args.old_string) as string | undefined,
        newString: (output.args.newString ?? output.args.new_string) as string | undefined,
        tool: toolLower as "write" | "edit" | "multiedit",
        sessionID: input.sessionID,
        timestamp: Date.now(),
      });
    },

    "tool.execute.after": async (
      input: { tool: string; callID: string },
      output: { output: string }
    ): Promise<void> => {
      const pending = pendingCalls.get(input.callID);
      if (!pending) return;
      pendingCalls.delete(input.callID);

      // Skip if tool failed
      const outputLower = output.output.toLowerCase();
      if (outputLower.includes("error:") || outputLower.includes("failed to")) {
        return;
      }

      // Analyze for excessive comments
      const commentIssues = await analyzeComments(pending, config?.custom_prompt);
      
      if (commentIssues) {
        output.output += `\n\n⚠️ Comment Check: ${commentIssues}`;
      }
    },
  };
}

async function analyzeComments(
  pending: PendingCall,
  customPrompt?: string
): Promise<string | null> {
  // Simple heuristic: check comment ratio
  const content = pending.content ?? pending.newString ?? "";
  const lines = content.split("\n");
  const commentLines = lines.filter(l => 
    l.trim().startsWith("//") || 
    l.trim().startsWith("/*") || 
    l.trim().startsWith("*") ||
    l.trim().startsWith("#")
  );
  
  const ratio = commentLines.length / lines.length;
  
  if (ratio > 0.3) {
    return `High comment ratio (${Math.round(ratio * 100)}%). Consider removing obvious comments.`;
  }
  
  return null;
}
```

### 11.5 Directory Agents Injector

```typescript
// src/hooks/directory-agents-injector.ts
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";

export function createDirectoryAgentsInjectorHook(ctx: PluginContext) {
  const injectedPaths = new Map<string, Set<string>>(); // sessionID -> injected paths

  return {
    event: async (input: EventInput) => {
      // Clean up on session delete
      if (input.event.type === "session.deleted") {
        const sessionID = input.event.properties?.info?.id as string;
        if (sessionID) injectedPaths.delete(sessionID);
      }
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string },
      output: { output: string; args?: Record<string, unknown> }
    ): Promise<void> => {
      // Only process Read tool
      if (input.tool.toLowerCase() !== "read") return;

      const filePath = output.args?.filePath as string;
      if (!filePath) return;

      // Get or create injection set for session
      let injected = injectedPaths.get(input.sessionID);
      if (!injected) {
        injected = new Set();
        injectedPaths.set(input.sessionID, injected);
      }

      // Walk from file directory to project root
      const agentsContent: string[] = [];
      let currentDir = dirname(filePath);
      const projectRoot = ctx.directory;

      while (currentDir.startsWith(projectRoot)) {
        const agentsPath = join(currentDir, "AGENTS.md");
        
        if (!injected.has(agentsPath) && existsSync(agentsPath)) {
          try {
            const content = readFileSync(agentsPath, "utf-8");
            agentsContent.unshift(content); // Add at beginning (root first)
            injected.add(agentsPath);
          } catch {
            // Ignore read errors
          }
        }

        // Move up one directory
        const parent = dirname(currentDir);
        if (parent === currentDir) break; // Reached filesystem root
        currentDir = parent;
      }

      // Inject collected AGENTS.md content
      if (agentsContent.length > 0) {
        output.output += `\n\n<directory-context>\n${agentsContent.join("\n\n---\n\n")}\n</directory-context>`;
      }
    },
  };
}
```

---


## 12. Success Criteria

The plugin is complete when:

- [ ] Plugin loads successfully in OpenCode
- [ ] All agents are injected via config hook
- [ ] All MCP servers are injected via config hook
- [ ] /implement runs full 8+ phase workflow
- [ ] /implement-api runs API-focused workflow
- [ ] Multi-model review works with OpenCode's native multi-model support
- [ ] Sessions provide artifact isolation
- [ ] Quality gates enforce user approvals
- [ ] Configuration allows model/agent customization
- [ ] Documentation is complete
- [ ] **NEW: delegate_task enables parallel agent execution**
- [ ] **NEW: background_task enables simple direct background launches**
- [ ] **NEW: BackgroundManager tracks async agent tasks**
- [ ] **NEW: todo-continuation-enforcer prevents premature task abandonment**
- [ ] **NEW: comment-checker prevents excessive comments in generated code**
- [ ] **NEW: directory-agents-injector auto-injects AGENTS.md context**
- [ ] **NEW: 4-Message Pattern documented and supported**

---

## Appendix A: Key Differences from Original Plan

| Aspect | Original Plan | Revised Plan |
|--------|---------------|--------------|
| Agent Registration | Return `agent:` property | Use `config` hook mutation |
| MCP Registration | Return `mcp:` property | Use `config` hook mutation |
| Plugin Type | `Plugin<PluginConfig>` | `Plugin` (no generic) |
| Config Hook | Returned modified config | Mutates config in place |
| Agent Files | Functions returning AgentConfig | Objects exported directly |
| Skill System | Code-based loaders | Markdown files + BuiltinSkill objects |

---

## Appendix B: Review Corrections Applied (2026-01-18)

This plan was reviewed against three goals:
1. OpenCode as the target platform (not Claude Code)
2. oh-my-opencode plugin patterns (local types, config hook mutation, chat.message hook)
3. MAG Claude Code concepts (multi-agent orchestration, quality gates, workflows)

### Corrections Applied

| Issue | Original | Corrected |
|-------|----------|-----------|
| Type imports | Local `src/types/plugin.ts` claiming `@opencode-ai/plugin` doesn't exist | Import from `@opencode-ai/plugin` and `@opencode-ai/sdk`; only extend locally |
| AgentConfig tools | Used deprecated `tools: { write: false }` | Use `permission: { write: "deny" }` (permission-only) |
| PluginInput docs | Only documented `ctx.directory` | Documented all: `client`, `directory`, `project`, `worktree`, `serverUrl`, `$` |
| Session API | Initially assumed `session.todo()` didn't exist | Confirmed API exists; use native `ctx.client.session.todo()` (see Appendix E) |
| Model providers | Used `openrouter/grok-4` | Use `opencode/grok-code` (available in OpenCode) |
| Haiku model ID | Used `anthropic/claude-haiku` | Use `anthropic/claude-haiku-4-5` (4.5 series) |

### Verified Patterns (Correct in Original)

- Config hook mutation pattern for agent/MCP injection
- `chat.message` hook for agent variants and keyword detection
- Experimental hooks (`chat.system.transform`, `chat.messages.transform`)
- ContextCollector pattern for dynamic context injection
- Session state tracking (main session, per-session agent)
- All MAG concepts: workflow detection, phase system, quality gates, multi-model review

### Package Dependencies Added

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.1.25",
    "@opencode-ai/sdk": "^1.1.25",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "bun-types": "^1.3.6"
  }
}
```

Versions verified via npm registry on 2026-01-18.

---

## Appendix C: Development Guidelines

---

## Appendix D: Smoke Test Findings (Derived From Actual Testing)

The following findings were validated by running OpenCode locally (Nix dev shell + `opencode run`) against the smoke plugin in `src/index.ts`:

- `smoke` tool executes successfully and returns session/message IDs.
- `background_task` can create child sessions and post prompts when using the session ID returned from `session.create`.
- `background_output` successfully retrieves the last assistant output when given the background session ID (example output: `Background task output: Ran.`).
- `chat.message` variant override test (`variant-test`) triggered an interactive OpenCode question during `opencode run`; the hook fired, but the run timed out waiting for input. This should be re-validated in an interactive session.

These results come from actual runtime testing (not btca), so they reflect current OpenCode behavior as of 2026-01-19.


For AI agent development guidelines, btca resource references, and OpenCode vs Claude Code differences, see **AGENTS.md**.

---

## Appendix E: Review Corrections Applied (2026-01-18 Update 2)

Additional patterns added from oh-my-opencode analysis:

| Pattern | Section | Description |
|---------|---------|-------------|
| First Message Variant Gate | 11.1.1 | Robust gate pattern replacing simple Set |
| Tool Output Truncator | 11.3 | Context-aware output truncation |
| Dynamic Truncator | 11.3 | Session-aware truncation with token estimation |
| Model Context Caching | 5.3 | Cache provider model limits |
| Consensus Analysis | 6.3 | Multi-model review prioritization |
| OpenCode vs MAG differences | Section 1.4 | PROXY_MODE not needed, native model support |
| Legacy tools clarification | Section 1.4 | Use `permission` only, no migration needed |
| Session API note | AGENTS.md | `session.todo()` API exists for reading todos |
| btca resource reference | AGENTS.md | Correct resource names for queries |

---

## Appendix F: Available Models (2026-01-18)

Models available in OpenCode for use in agent configurations. Models without dates are aliases pointing to the latest version; dated models are pinned snapshots for reproducibility.

### OpenCode Free/Community Models

| Model ID | Description |
|----------|-------------|
| `opencode/big-pickle` | Community model |
| `opencode/glm-4.7-free` | Free GLM model |
| `opencode/gpt-5-nano` | Lightweight GPT variant |
| `opencode/grok-code` | Code-focused Grok |
| `opencode/minimax-m2.1-free` | Free MiniMax model |

### Anthropic Claude 4.5 Models

| Model ID | Type | Notes |
|----------|------|-------|
| `anthropic/claude-haiku-4-5` | Alias | Points to latest Haiku 4.5 |
| `anthropic/claude-sonnet-4-5` | Alias | Points to latest Sonnet 4.5 |
| `anthropic/claude-opus-4-5` | Alias | Points to latest Opus 4.5 |

### OpenAI Models

| Model ID | Description |
|----------|-------------|
| `openai/gpt-5.2` | Latest GPT-5.2 |
| `openai/gpt-5.2-codex` | Code-optimized GPT-5.2 |

### Google Models (Requires Auth Setup)

Google models require `google-antigravity` authentication in OpenCode. Once configured:

| Model ID | Description |
|----------|-------------|
| `google/gemini-2.5-pro` | Multi-modal, strong for design validation |
| `google/gemini-2.5-flash` | Fast, cost-effective |

### Model Selection Guidelines

| Use Case | Recommended Model |
|----------|-------------------|
| Orchestration | `anthropic/claude-opus-4-5` |
| Architecture/Planning | `anthropic/claude-sonnet-4-5` |
| Implementation | `anthropic/claude-sonnet-4-5` |
| Fast exploration | `anthropic/claude-haiku-4-5` or `opencode/grok-code` |
| Code review | `anthropic/claude-sonnet-4-5` |
| Design validation | `google/gemini-2.5-pro` (when available) |
| Cost-sensitive tasks | `opencode/*` free models or `anthropic/claude-haiku-4-5` |

