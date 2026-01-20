import { z } from "zod";

// Default configuration values
export const DEFAULT_CONFIG = {
  agents: {
    interviewer: {
      enabled: true,
      model: "anthropic/claude-3.5-sonnet",
      maxInterviews: 3,
      breakLengthMinutes: 15
    },
    uiDeveloper: {
      enabled: true,
      model: "anthropic/claude-3.5-sonnet"
    },
    uiTester: {
      enabled: true,
      model: "anthropic/claude-haiku-4-5"
    },
    backendDeveloper: {
      enabled: true,
      model: "anthropic/claude-3.5-sonnet"
    }
  },
  workflows: {
    enabled: ["feature-development", "bug-fix", "testing"] as string[],
    autoStart: false
  },
  mcpServers: {
    playwright: { enabled: true },
    figma: { enabled: true },
    filesystem: { enabled: true }
  },
  backgroundAgents: {
    enabled: true,
    maxConcurrent: 2
  }
};

// Main configuration schema
export const MagnusOpusConfigSchema = z.object({
  agents: z.object({
    interviewer: z.object({
      enabled: z.boolean().default(true),
      model: z.string().default("anthropic/claude-3.5-sonnet"),
      maxInterviews: z.number().default(3),
      breakLengthMinutes: z.number().default(15)
    }).optional(),
    uiDeveloper: z.object({
      enabled: z.boolean().default(true),
      model: z.string().default("anthropic/claude-3.5-sonnet")
    }).optional(),
    uiTester: z.object({
      enabled: z.boolean().default(true),
      model: z.string().default("anthropic/claude-haiku-4-5")
    }).optional(),
    backendDeveloper: z.object({
      enabled: z.boolean().default(true),
      model: z.string().default("anthropic/claude-3.5-sonnet")
    }).optional()
  }).optional(),
  
  workflows: z.object({
    enabled: z.array(z.string()).default(["feature-development", "bug-fix", "testing"]),
    autoStart: z.boolean().default(false)
  }).optional(),
  
  mcpServers: z.object({
    playwright: z.object({ enabled: z.boolean() }).optional(),
    figma: z.object({ enabled: z.boolean() }).optional(),
    filesystem: z.object({ enabled: z.boolean() }).optional()
  }).optional(),
  
  backgroundAgents: z.object({
    enabled: z.boolean().default(true),
    maxConcurrent: z.number().default(2)
  }).optional()
});

export type MagnusOpusConfig = z.infer<typeof MagnusOpusConfigSchema>;