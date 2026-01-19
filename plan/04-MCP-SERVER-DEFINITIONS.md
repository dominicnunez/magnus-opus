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