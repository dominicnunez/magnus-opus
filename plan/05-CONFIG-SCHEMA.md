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

// Workflow iteration limits (DECISIONS.md D024)
export const WorkflowLimitsSchema = z.object({
  // Max iterations for pass_or_fix quality gate loops
  maxIterations: z.number().min(1).default(5),
  // Max rounds of code review before proceeding
  maxReviewRounds: z.number().min(1).default(3),
  // Max iterations for TDD red-green-refactor cycles
  maxTddIterations: z.number().min(1).default(10),
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
  
  // Workflow iteration limits (DECISIONS.md D024)
  workflowLimits: WorkflowLimitsSchema.optional(),
});

export type MagnusOpusConfig = z.infer<typeof MagnusOpusConfigSchema>;
export type AgentOverride = z.infer<typeof AgentOverrideSchema>;
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>;
export type WorkflowLimits = z.infer<typeof WorkflowLimitsSchema>;

// Default configuration
export const DEFAULT_CONFIG: MagnusOpusConfig = {
  agents: {},
  disabled_agents: [],
  disabled_mcps: [],
  disabled_skills: [],
  disabled_hooks: [],
  reviewModels: {
    planReview: ["xai/grok-code", "openai/gpt-4o"],
    codeReview: ["xai/grok-code", "google/gemini-2.5-flash"],
    autoUse: false,
  },
  sessionSettings: {
    includeDescriptor: true,
    autoCleanup: false,
    retentionDays: 30,
  },
  workflowLimits: {
    maxIterations: 5,
    maxReviewRounds: 3,
    maxTddIterations: 10,
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
  "xai/grok-code": 128_000,
  "openai/gpt-4o": 128_000,
};

export function getModelContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? 128_000; // Default to 128k
}
```