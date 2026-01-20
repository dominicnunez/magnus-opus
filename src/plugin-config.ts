import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { MagnusOpusConfigSchema, DEFAULT_CONFIG, type MagnusOpusConfig } from "./config/schema.js";

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
    ...(userConfig as object ?? {}),
    ...(projectConfig as object ?? {}),
  };

  // Validate
  const result = MagnusOpusConfigSchema.safeParse(merged);
  if (!result.success) {
    console.warn("[magnus-opus] Config validation errors:", result.error.format());
    return DEFAULT_CONFIG;
  }

  return result.data;
}
