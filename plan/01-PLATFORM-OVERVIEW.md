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

### 1.2 Type Definitions

```typescript
// From OpenCode SDK
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

// PluginInput context (6 properties)
interface PluginInput {
  client: OpencodeClient;      // API client for session/message operations
  directory: string;           // Working directory path
  project: string;             // Project name
  worktree: string;            // Git worktree path
  serverUrl: string;           // OpenCode server URL
  $: ShellHelper;              // Shell execution helper
}

// Tool execution context
interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  metadata?(input: { title?: string; metadata?: Record<string, unknown> }): void;
}

// chat.message hook input (equivalent to ChatMessageInput)
interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
  messageID?: string;
  variant?: string;
}

// chat.message hook output (equivalent to ChatMessageOutput)
interface ChatMessageOutput {
  message: UserMessage;
  parts: Part[];
}

// Event hook input
interface EventInput {
  type: string;
  data: unknown;
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

### 1.4 PluginInput Context

The plugin receives a context object with these 6 properties:

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

### 1.5 Type Imports

```typescript
// From OpenCode SDK
import type { Plugin, AgentConfig } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

// Zod for config validation
import { z } from "zod";
```