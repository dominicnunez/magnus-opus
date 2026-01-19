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
  // Progressive notification fields
  notifyOnCompletion?: boolean;  // Notify immediately when complete (vs batch)
  notificationThreshold?: number;  // Notify when N tasks complete (default: all)
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
  notifyOnCompletion?: boolean;    // Immediate notification on completion
  notificationThreshold?: number;    // Notify when this count of tasks complete
}

import { logger } from "../features/observability";

export class BackgroundManager {
  private tasks = new Map<string, BackgroundTask>();
  // ... properties ...

  constructor(ctx: { client: OpencodeClient; directory: string; concurrency: ConcurrencyManager }) {
    this.client = ctx.client;
    this.directory = ctx.directory;
    this.concurrencyManager = ctx.concurrency;
    this.registerProcessCleanup();
  }

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    const taskId = `bg_${randomUUID().slice(0, 8)}`;

    logger.info("Background task launched", { 
      taskId, 
      agent: input.agent, 
      parentSession: input.parentSessionID 
    });

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
      notifyOnCompletion: input.notifyOnCompletion ?? false,
      notificationThreshold: input.notificationThreshold,
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
      this.concurrencyManager.release(input.concurrencyKey);
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

    const durationMs = task.completedAt.getTime() - task.startedAt.getTime();
    logger.info("Background task completed", { 
      taskId: task.id, 
      duration: durationMs,
      reason 
    });

    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey);
    }
    
    // Progressive notification logic
    const shouldNotifyImmediately = task.notifyOnCompletion;
    const pending = this.pendingByParent.get(task.parentSessionID) ?? new Set<string>();
    pending.delete(task.id);
    this.pendingByParent.set(task.parentSessionID, pending);

    // Check threshold for notification
    const threshold = task.notificationThreshold ?? pending.size + 1; // Default: notify when all done
    const remaining = threshold - (pending.size + 1);
    
    if (shouldNotifyImmediately || remaining <= 0) {
      // Immediate notification
      await this.notifyParent(task.parentSessionID, [task], "immediate");
    } else if (task.notificationThreshold && task.notificationThreshold > 1) {
      // Threshold notification (e.g., "2 of 3 reviews complete")
      await this.notifyParent(task.parentSessionID, [task], "progress", {
        completed: threshold - remaining,
        total: threshold,
      });
    } else {
      // Queue for batch notification
      const notifications = this.notifications.get(task.parentSessionID) ?? [];
      notifications.push(task);
      this.notifications.set(task.parentSessionID, notifications);

      if (pending.size === 0) {
        await this.notifyParent(task.parentSessionID, notifications, "batch");
        this.notifications.delete(task.parentSessionID);
      }
    }
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

  private async notifyParent(
    parentSessionID: string, 
    tasks: BackgroundTask[], 
    type: "immediate" | "progress" | "batch",
    progress?: { completed: number; total: number }
  ): Promise<void> {
    const summaries = tasks.map((task) => `- ${task.description}: ${task.status}`).join("\n");
    
    let content: string;
    
    switch (type) {
      case "immediate":
        content = `Background task complete:\n${summaries}`;
        break;
      case "progress":
        content = `Background tasks progress (${progress?.completed}/${progress?.total}):\n${summaries}`;
        break;
      case "batch":
      default:
        content = `Background tasks complete (${tasks.length}):\n${summaries}`;
        break;
    }

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
