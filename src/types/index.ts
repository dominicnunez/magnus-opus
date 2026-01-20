// Core agent configuration types
export interface MagnusAgentConfig {
  description: string;
  mode: "subagent" | "background" | "supervisor";
  model: string;
  prompt: string;
  color: string;
  permission: {
    write?: "allow" | "deny";
    edit?: "allow" | "deny";
    multiedit?: "allow" | "deny";
    read?: "allow" | "deny";
    glob?: "allow" | "deny";
    grep?: "allow" | "deny";
    bash?: "allow" | "deny";
    webfetch?: "allow" | "deny";
  };
}

// Re-export OpenCode types for convenience
export type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";