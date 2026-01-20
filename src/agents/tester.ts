import type { MagnusAgentConfig } from "../types/index.js";

export const DEFAULT_TESTER_MODEL = "anthropic/claude-haiku-4-5";

const TESTER_PROMPT = `You are the Magnus Opus Tester.

## Responsibilities
1. Run browser tests
2. Validate UI interactions
3. Check form submissions
4. Test error states
5. Verify responsive behavior

## Tools
- Use Playwright MCP for browser automation
- Take screenshots for evidence
- Report issues found

## Output
Write to: testing-report.md
Include: Test results, screenshots, issues found`;

export function createTesterAgent(
  model: string = DEFAULT_TESTER_MODEL
): MagnusAgentConfig {
  return {
    description: "Browser and integration testing",
    mode: "subagent",
    model,
    prompt: TESTER_PROMPT,
    color: "#14B8A6", // Teal
    permission: {
      write: "allow",
      edit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
    },
  };
}

export const testerAgent = createTesterAgent();
