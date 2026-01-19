## 9. Context Collection and Injection

### 9.1 ContextCollector

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

### 9.2 Usage Examples

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