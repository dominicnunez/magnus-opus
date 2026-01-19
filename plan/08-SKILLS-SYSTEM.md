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

<!-- =============================================================================
WHY: Specific Skill Selection (btca research: opencode, sveltekit, convex)
================================================================================

1. STACK-SPECIFIC KNOWLEDGE
   - SVELTEKIT.md: Svelte 5 runes, routing, load functions
   - CONVEX.md: Schema, queries, mutations, validators
   - TAILWIND.md: v4 features, CSS injection, dark mode
   - SHADCN-SVELTE.md: Component patterns, prop conventions

2. UNIVERSAL PATTERNS
   - DEBUGGING-STRATEGIES: Cross-language error analysis
   - DOCUMENTATION-STANDARDS: 15 best practices from research
   - QUALITY-GATES: Consensus patterns and issue classification

3. EFFECTIVE PROMPT INJECTION
   - Skills provide structured knowledge at right time
   - Reduces hallucination on framework-specific APIs
   - Enables consistent patterns across agents

============================================================================= -->

Skills are markdown files in `content/skills/` that provide domain knowledge to agents.

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