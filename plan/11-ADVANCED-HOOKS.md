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


### 11.1 Experimental Hooks (OpenCode Advanced Integration)

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

### 11.2 Chat Message Handler (CRITICAL - was missing from original plan)

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

// Create gate instance (singleton per plugin)
const firstMessageVariantGate = createFirstMessageVariantGate();

// Export for use in event handler
export { firstMessageVariantGate };

export function createChatMessageHandler(deps: ChatMessageHandlerDeps) {
  const { ctx, pluginConfig } = deps;

  return async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
    const { sessionID, agent } = input;

    // Apply agent variant on first message only
    if (firstMessageVariantGate.shouldOverride(sessionID)) {
      const variant = resolveAgentVariant(pluginConfig, agent);
      if (variant !== undefined) {
        (output as { message: { variant?: string } }).message.variant = variant;
      }
      firstMessageVariantGate.markApplied(sessionID);
    }
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
 * Clear session state (called on session.deleted event)
 */
export function clearChatMessageState(sessionID: string): void {
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