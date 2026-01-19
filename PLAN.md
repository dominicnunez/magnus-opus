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


### 9.0 ContextCollector

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

## 12. Implementation Order (Updated)

### Phase 1: Foundation (Week 1)
1. Create project scaffold with all directories
2. Set up TypeScript + build configuration
3. Create Zod config schema
4. Implement plugin entry point with config hook pattern
5. Implement config loader

### Phase 2: Core Agents (Week 2)
1. Implement all agent definitions as TypeScript objects
2. Implement agent aggregation with override support
3. Test agent injection via config hook

### Phase 3: Tools (Week 2-3)
1. Implement /help tool
2. Implement /cleanup tool
3. Implement /review tool
4. Implement /validate-ui tool
5. Implement /implement-api tool
6. Implement /implement tool (full workflow)
7. **NEW: Implement delegate_task tool**
8. **NEW: Implement background_task tool**

### Phase 4: Workflows (Week 3)
1. Implement workflow type detection
2. Implement phase system
3. Implement quality gates
4. Implement session management
5. Test workflow routing

### Phase 5: MCP & Skills (Week 4)
1. Implement built-in MCP definitions
2. Implement .mcp.json loader
3. Implement skill definitions
4. Implement skill loader

### Phase 6: Basic Hooks (Week 4)
1. Implement event handler
2. Implement tool.execute.before hook
3. Implement tool.execute.after hook
4. Implement context injection

### Phase 7: Background Agent System (Week 5) **NEW**
1. Implement BackgroundManager class
2. Implement ConcurrencyManager
3. Implement background_output and background_cancel tools
4. Implement background notification hook
5. Test parallel agent execution

### Phase 8: Advanced Hooks (Week 5-6) **NEW**
1. Implement todo-continuation-enforcer hook
2. Implement comment-checker hooks
3. Implement directory-agents-injector hook
4. Implement directory-readme-injector hook
5. Implement context-window-monitor hook
6. Implement rules-injector hook (optional)

### Phase 9: Polish (Week 6)
1. Write documentation
2. Add comprehensive error handling
3. Add logging
4. Test edge cases

---

## 13. Success Criteria

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
| Model providers | Used `openrouter/grok-4` | Use `xai/grok-4` (direct provider) |
| Haiku model ID | Used `anthropic/claude-haiku` | Use `anthropic/claude-3-haiku-20240307` |

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
