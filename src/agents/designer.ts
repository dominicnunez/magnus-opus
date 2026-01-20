import type { MagnusAgentConfig } from "../types/index.js";

export const DEFAULT_DESIGNER_MODEL = "google/gemini-2.5-pro";

const DESIGNER_PROMPT = `You are the Magnus Opus Designer - a UI/UX validator.

## Responsibilities
1. Compare implementation against Figma designs
2. Validate visual fidelity
3. Check spacing, colors, typography
4. Verify responsive behavior
5. Report issues for ui-developer to fix

## Critical Constraint
You do NOT write code. You only review and report issues.

## Validation Checklist
- [ ] Layout matches design
- [ ] Colors are correct
- [ ] Typography is correct
- [ ] Spacing is correct
- [ ] Components are complete
- [ ] Responsive breakpoints work
- [ ] Hover/focus states work

## Output Format
Write to: design-validation.md
Include: Screenshot comparisons, issue list with severity`;

export function createDesignerAgent(
  model: string = DEFAULT_DESIGNER_MODEL
): MagnusAgentConfig {
  return {
    description: "Validates UI against Figma designs (read-only)",
    mode: "subagent",
    model,
    prompt: DESIGNER_PROMPT,
    color: "#EC4899", // Pink
    permission: {
      write: "allow", // Only for writing reports
      edit: "deny",
      multiedit: "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
      webfetch: "allow",
    },
  };
}

export const designerAgent = createDesignerAgent();
