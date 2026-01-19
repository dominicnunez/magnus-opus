## 14. Memory System

<!-- =============================================================================
WHY: Persistent Memory Across Sessions (MAG Feature Parity)
================================================================================

1. LEARNING FROM USER INTERACTIONS
   - Remember user preferences (e.g., "I prefer TypeScript over JavaScript")
   - Learn project-specific patterns (e.g., "This project uses snake_case for DB fields")
   - Recall previous decisions (e.g., "Last time we chose option A for similar requirement")

2. PROJECT-LEVEL KNOWLEDGE
   - Stored in project directory (git-trackable)
   - Shared across all team members
   - Version controlled with project history

3. SELECTIVE RECALL
   - Search by relevance (semantic matching)
   - Session context prioritizes recent memories
   - Agents can query specific memory types

4. PRIVACY AWARE
   - No personal data stored
   - Only project-relevant preferences and patterns
   - User can review/edit/delete memories

============================================================================= -->

### 14.1 Memory Schema

```typescript
// src/features/memory/types.ts
export interface MemoryEntry {
  id: string;                    // Unique identifier
  type: MemoryType;             // Category of memory
  content: string;               // Memory content
  metadata: MemoryMetadata;      // Structured metadata
  createdAt: string;             // ISO 8601 timestamp
  updatedAt?: string;            // Last update timestamp
  accessCount?: number;           // Usage frequency
  lastAccessed?: string;         // Last access timestamp
}

export type MemoryType = 
  | "preference"               // User preferences (e.g., "use TypeScript")
  | "pattern"                  // Project patterns (e.g., "snake_case fields")
  | "decision"                 // Previous decisions (e.g., "chose option A")
  | "convention"               // Code conventions (e.g., "async suffix for functions")
  | "context"                  // General context (e.g., "project uses GraphQL")
  | "fact"                     // Verified facts (e.g., "API endpoint v2");

export interface MemoryMetadata {
  scope: "project" | "session" | "global";  // Visibility scope
  tags?: string[];                        // Search tags
  confidence?: number;                      // Confidence 0-1
  source?: string;                         // Source agent/user
  expiresAt?: string;                      // Optional expiration
  sessionId?: string;                       // Origin session
}

export interface MemoryQuery {
  type?: MemoryType[];          // Filter by types
  tags?: string[];             // Filter by tags
  scope?: "project" | "session"; // Filter by scope
  sessionId?: string;           // Filter by session
  limit?: number;              // Max results
  relevanceThreshold?: number;   // Minimum relevance score
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;              // Relevance score 0-1
  matched: string[];           // Matched tags/keywords
}
```

### 14.2 Memory Storage

```typescript
// src/features/memory/store.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export class MemoryStore {
  private memoryPath: string;
  private memories: Map<string, MemoryEntry> = new Map();
  private dirty = false;

  constructor(projectDir: string) {
    this.memoryPath = join(projectDir, ".opencode", "memory.json");
    this.load();
  }

  /**
   * Load memories from disk
   */
  private load(): void {
    if (!existsSync(this.memoryPath)) {
      // Create default memory file
      this.save();
      return;
    }

    try {
      const content = readFileSync(this.memoryPath, "utf-8");
      const data = JSON.parse(content);
      
      // Convert array to map for faster lookup
      this.memories = new Map(
        (data.memories || []).map((m: MemoryEntry) => [m.id, m])
      );
    } catch (error) {
      console.warn(`[magnus-opus] Failed to load memory:`, error);
      this.memories = new Map();
    }
  }

  /**
   * Save memories to disk if dirty
   */
  save(): void {
    if (!this.dirty) return;

    // Ensure directory exists
    const dir = dirname(this.memoryPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      memories: Array.from(this.memories.values()),
    };

    writeFileSync(this.memoryPath, JSON.stringify(data, null, 2), "utf-8");
    this.dirty = false;
  }

  /**
   * Add or update a memory
   */
  upsert(entry: MemoryEntry): void {
    const existing = this.memories.get(entry.id);
    
    if (existing) {
      // Update existing
      entry.updatedAt = new Date().toISOString();
      entry.accessCount = (existing.accessCount || 0) + 1;
      entry.lastAccessed = new Date().toISOString();
    } else {
      // New entry
      entry.createdAt = entry.createdAt || new Date().toISOString();
      entry.accessCount = 1;
      entry.lastAccessed = new Date().toISOString();
    }

    this.memories.set(entry.id, entry);
    this.dirty = true;
  }

  /**
   * Get a specific memory by ID
   */
  get(id: string): MemoryEntry | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      memory.accessCount = (memory.accessCount || 0) + 1;
      memory.lastAccessed = new Date().toISOString();
      this.dirty = true;
    }
    return memory;
  }

  /**
   * Search memories by query
   */
  search(query: MemoryQuery): MemorySearchResult[] {
    const results: MemorySearchResult[] = [];
    const queryText = this.prepareQueryText(query);

    for (const memory of this.memories.values()) {
      // Apply filters
      if (!this.matchesFilters(memory, query)) continue;

      // Calculate relevance score
      const score = this.calculateRelevance(memory, queryText, query);
      if (score < (query.relevanceThreshold || 0.3)) continue;

      results.push({
        entry: memory,
        score,
        matched: this.getMatchedKeywords(memory, queryText),
      });
    }

    // Sort by score (descending) then by access frequency
    return results
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.entry.accessCount || 0) - (a.entry.accessCount || 0);
      })
      .slice(0, query.limit || 10);
  }

  /**
   * Delete a memory
   */
  delete(id: string): boolean {
    const deleted = this.memories.delete(id);
    if (deleted) this.dirty = true;
    return deleted;
  }

  /**
   * Get all memories of a specific type
   */
  getByType(type: MemoryType): MemoryEntry[] {
    return Array.from(this.memories.values())
      .filter(m => m.type === type)
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));
  }

  /**
   * Clean up expired memories
   */
  cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [id, memory] of this.memories.entries()) {
      if (memory.expiresAt && new Date(memory.expiresAt) < now) {
        this.memories.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.dirty = true;
    }
  }

  private prepareQueryText(query: MemoryQuery): string {
    // Extract search terms from tags, types, and content
    const terms: string[] = [];
    
    if (query.tags) terms.push(...query.tags);
    if (query.type) terms.push(...query.type);
    
    return terms.join(" ").toLowerCase();
  }

  private matchesFilters(memory: MemoryEntry, query: MemoryQuery): boolean {
    // Type filter
    if (query.type && !query.type.includes(memory.type)) return false;
    
    // Tags filter
    if (query.tags && query.tags.length > 0) {
      const hasAllTags = query.tags.every(tag => 
        memory.metadata.tags?.includes(tag)
      );
      if (!hasAllTags) return false;
    }
    
    // Scope filter
    if (query.scope && memory.metadata.scope !== query.scope) return false;
    
    // Session filter
    if (query.sessionId && memory.metadata.sessionId !== query.sessionId) return false;
    
    return true;
  }

  private calculateRelevance(
    memory: MemoryEntry,
    queryText: string,
    query: MemoryQuery
  ): number {
    let score = 0;
    const memoryText = `${memory.content} ${(memory.metadata.tags || []).join(" ")}`.toLowerCase();

    // Text matching
    const queryTerms = queryText.split(/\s+/);
    const matchedTerms = queryTerms.filter(term => memoryText.includes(term));
    score += (matchedTerms.length / queryTerms.length) * 0.4;

    // Type preference
    if (query.type && query.type.includes(memory.type)) {
      score += 0.3;
    }

    // Recent access boost
    const daysSinceAccess = memory.lastAccessed 
      ? (Date.now() - new Date(memory.lastAccessed).getTime()) / (1000 * 60 * 60 * 24)
      : 365;
    score += Math.max(0, (1 - daysSinceAccess / 30)) * 0.2;

    // Confidence boost
    if (memory.metadata.confidence) {
      score += memory.metadata.confidence * 0.1;
    }

    return Math.min(score, 1);
  }

  private getMatchedKeywords(memory: MemoryEntry, queryText: string): string[] {
    const keywords = queryText.split(/\s+/);
    const memoryText = `${memory.content} ${(memory.metadata.tags || []).join(" ")}`.toLowerCase();
    
    return keywords.filter(keyword => memoryText.includes(keyword));
  }
}
```

### 14.3 Memory Tools for Agents

```typescript
// src/tools/memory.ts
import { tool } from "@opencode-ai/plugin";
import type { MemoryStore } from "../features/memory/store";

export function createMemoryTools(memoryStore: MemoryStore) {
  const remember = tool({
    description: `Store a memory for future reference.
    
    Use when:
    - User expresses a preference ("I always use...")
    - You learn a project pattern ("This project uses...")
    - A decision is made that should be remembered
    - Important context is discovered
    
    Types: preference, pattern, decision, convention, context, fact`,
    
    args: {
      type: tool.schema.enum(["preference", "pattern", "decision", "convention", "context", "fact"])
        .describe("Type of memory"),
      content: tool.schema.string()
        .describe("Memory content (be specific and concise)"),
      tags: tool.schema.array(tool.schema.string()).optional()
        .describe("Tags for searching"),
      confidence: tool.schema.number().optional()
        .describe("Confidence 0-1 (default: 0.8)"),
      scope: tool.schema.enum(["project", "session"]).optional()
        .describe("Scope (default: project)"),
    },
    
    async execute(args, ctx) {
      const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      const memory = {
        id: memoryId,
        type: args.type,
        content: args.content,
        metadata: {
          scope: args.scope || "project",
          tags: args.tags,
          confidence: args.confidence || 0.8,
          source: ctx.agent,
          sessionId: ctx.sessionID,
        },
        createdAt: new Date().toISOString(),
      };
      
      memoryStore.upsert(memory);
      memoryStore.save();
      
      return `✅ Memory stored: ${args.type} - ${args.content.slice(0, 50)}${args.content.length > 50 ? "..." : ""}`;
    },
  });

  const recall = tool({
    description: `Search memories for relevant information.
    
    Use when:
    - You need context about user preferences
    - Looking for project patterns or conventions
    - Checking previous decisions
    - Recalling general project context`,
    
    args: {
      query: tool.schema.string()
        .describe("Search query (keywords or phrases)"),
      types: tool.schema.array(tool.schema.enum(["preference", "pattern", "decision", "convention", "context", "fact"])).optional()
        .describe("Filter by memory types"),
      limit: tool.schema.number().optional()
        .describe("Maximum results (default: 5)"),
    },
    
    async execute(args) {
      const searchResults = memoryStore.search({
        query: args.query,
        type: args.types,
        limit: args.limit || 5,
        relevanceThreshold: 0.3,
      });
      
      if (searchResults.length === 0) {
        return "No relevant memories found.";
      }
      
      const formatted = searchResults.map(r => 
        `**${r.entry.type}** (score: ${r.score.toFixed(2)}): ${r.entry.content}`
      ).join("\n\n");
      
      return `Found ${searchResults.length} memories:\n\n${formatted}`;
    },
  });

  const forget = tool({
    description: `Delete a specific memory by ID or query.
    
    Use only when:
    - Memory is incorrect or outdated
    - User explicitly requests forgetting
    - Privacy concerns require removal`,
    
    args: {
      id: tool.schema.string().optional()
        .describe("Memory ID to delete"),
      query: tool.schema.string().optional()
        .describe("Delete memories matching this query"),
    },
    
    async execute(args) {
      if (!args.id && !args.query) {
        return "❌ Either id or query must be provided.";
      }
      
      if (args.id) {
        const deleted = memoryStore.delete(args.id);
        return deleted 
          ? `✅ Deleted memory: ${args.id}`
          : `❌ Memory not found: ${args.id}`;
      }
      
      if (args.query) {
        const results = memoryStore.search({
          query: args.query,
          limit: 50,
          relevanceThreshold: 0.1,
        });
        
        let deleted = 0;
        for (const result of results) {
          if (memoryStore.delete(result.entry.id)) {
            deleted++;
          }
        }
        
        return `✅ Deleted ${deleted} memories matching: ${args.query}`;
      }
      
      memoryStore.save();
    },
  });

  return { remember, recall, forget };
}
```

### 14.4 Memory Integration with Context System

```typescript
// src/features/memory/context-injector.ts
import type { ContextCollector } from "../features/context-injector";
import type { MemoryStore } from "./store";

export function createMemoryContextInjector(
  memoryStore: MemoryStore,
  contextCollector: ContextCollector
) {
  return {
    "chat.message": async (
      input: { sessionID: string; agent?: string },
      output: { message: { parts: Array<{ text?: string }> } }
    ) => {
      // Extract message text
      const messageText = output.message.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join(" ") || "";
      
      // Search for relevant memories
      const relevantMemories = memoryStore.search({
        query: messageText,
        limit: 3,
        relevanceThreshold: 0.4,
      });
      
      if (relevantMemories.length > 0) {
        // Format memories as context
        const memoryContext = relevantMemories
          .map(r => `**${r.entry.type}**: ${r.entry.content}`)
          .join("\n");
        
        // Register with context collector
        contextCollector.register(input.sessionID, {
          id: "relevant-memories",
          source: "memory-system",
          content: `## Relevant Memories\n\n${memoryContext}`,
          priority: "high",
        });
      }
    },
  };
}
```

### 14.5 Configuration Integration

```typescript
// Add to magnus-opus.schema.json
{
  "memory": {
    "type": "object",
    "description": "Memory system configuration",
    "properties": {
      "enabled": {
        "type": "boolean",
        "description": "Enable persistent memory system",
        "default": true
      },
      "maxEntries": {
        "type": "number",
        "description": "Maximum memories to store",
        "default": 1000
      },
      "cleanupDays": {
        "type": "number",
        "description": "Days before cleaning expired memories",
        "default": 90
      },
      "autoInject": {
        "type": "boolean",
        "description": "Auto-inject relevant memories as context",
        "default": true
      }
    }
  }
}
```

### 14.6 Usage Examples

```typescript
// Agent learns user preference
await remember({
  type: "preference",
  content: "User prefers TypeScript over JavaScript for all new code",
  tags: ["typescript", "preference", "language"],
  confidence: 0.9,
});

// Later, agent recalls preference
const memories = await recall({
  query: "javascript typescript language preference",
  types: ["preference"],
});

// Result:
// "Found 1 memories:
// 
// **preference** (score: 0.95): User prefers TypeScript over JavaScript for all new code"
```

This memory system provides:
- **Persistent learning** across sessions
- **Relevance-based recall** with scoring
- **Project-level knowledge** sharing
- **Privacy controls** and user oversight
- **Integration with ContextCollector** for automatic injection