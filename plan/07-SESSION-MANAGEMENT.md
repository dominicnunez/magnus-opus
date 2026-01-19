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

### 7.4 Session Todo API

```typescript
// src/sessions/todo-api.ts
/**
 * Read todo state from OpenCode's native session API
 * 
 * Following PLAN Section 1.3 guidance:
 * - Use native ctx.client.session.todo() instead of internal tracking
 * - This provides official access to todo state
 */
export async function getSessionTodos(
  client: OpencodeClient,
  sessionId: string
): Promise<Array<{ content?: string; status?: string }>> {
  try {
    const response = await client.session.todo({ path: { id: sessionId } });
    
    // Handle both response formats
    if ('data' in response && Array.isArray(response.data)) {
      return response.data;
    }
    
    // Handle wrapped format
    if ('data' in response && response.data && 'data' in response.data) {
      return response.data.data as any;
    }
    
    return [];
  } catch (error) {
    console.warn(`[magnus-opus] Failed to read session todos:`, error);
    return [];
  }
}

/**
 * Update todo state via todowrite tool
 * 
 * Note: This happens through tool execution, not direct API
 */
export async function updateSessionTodo(
  sessionId: string,
  todoId: string,
  update: { content?: string; status?: string }
): Promise<void> {
  // This would be called by todowrite tool
  // The actual update happens through the tool system
  console.log(`[magnus-opus] TODO ${todoId} updated:`, update);
}
```

### 7.5 Session Index

```typescript
// src/sessions/index.ts
export * from "./manager";
export * from "./directory";
export * from "./metadata";
```