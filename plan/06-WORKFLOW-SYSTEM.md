## 6. Workflow System

<!-- =============================================================================
WHY: Phase System and Quality Gates (DECISIONS.md D011)
================================================================================

1. MULTI-PHASE WORKFLOW
   - Clear progression from requirements to delivery
   - Each phase has defined inputs/outputs
   - Enables recovery from interruption

2. QUALITY GATES
   - user_approval: Explicit user confirmation
   - pass_or_fix: Loop until passing
   - all_tests_pass: All tests must pass
   - all_reviewers_approve: Multi-model consensus

3. WORKFLOW TYPE ROUTING
   - UI_FOCUSED: developer agent path
   - API_FOCUSED: backend agent path
   - MIXED: parallel tracks

============================================================================= -->

### 6.1 Workflow Type Detection

```typescript
// src/workflows/detector.ts

export type WorkflowType = "UI_FOCUSED" | "API_FOCUSED" | "MIXED" | "UNCLEAR";

export interface WorkflowDetection {
  type: WorkflowType;
  confidence: number;
  rationale: string;
}

const UI_KEYWORDS = [
  "component", "page", "layout", "design", "figma", "ui", "styling",
  "tailwind", "svelte", "button", "form", "modal", "dialog", "navbar",
  "sidebar", "responsive", "css", "animation", "hover", "click",
];

const API_KEYWORDS = [
  "query", "mutation", "action", "schema", "convex", "database", "api",
  "crud", "endpoint", "backend", "server", "function", "validator",
  "index", "table", "storage", "cron", "scheduled",
];

export function detectWorkflowType(description: string): WorkflowDetection {
  const lower = description.toLowerCase();

  const uiScore = UI_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const apiScore = API_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  const total = uiScore + apiScore;
  if (total === 0) {
    return {
      type: "UNCLEAR",
      confidence: 0,
      rationale: "No clear UI or API keywords detected",
    };
  }

  const uiRatio = uiScore / total;
  const apiRatio = apiScore / total;

  if (uiScore > 0 && apiScore > 0 && Math.abs(uiRatio - apiRatio) < 0.3) {
    return {
      type: "MIXED",
      confidence: 0.7,
      rationale: `Both UI (${uiScore}) and API (${apiScore}) keywords detected`,
    };
  }

  if (uiRatio > apiRatio) {
    return {
      type: "UI_FOCUSED",
      confidence: Math.min(0.9, 0.5 + uiRatio * 0.5),
      rationale: `UI keywords (${uiScore}) dominant over API (${apiScore})`,
    };
  }

  return {
    type: "API_FOCUSED",
    confidence: Math.min(0.9, 0.5 + apiRatio * 0.5),
    rationale: `API keywords (${apiScore}) dominant over UI (${uiScore})`,
  };
}

export function getWorkflowImplications(type: WorkflowType): {
  primaryAgent: string;
  secondaryAgents: string[];
  skipPhases: string[];
} {
  switch (type) {
    case "UI_FOCUSED":
      return {
        primaryAgent: "developer",
        secondaryAgents: ["designer", "ui-developer", "tester"],
        skipPhases: [],
      };
    case "API_FOCUSED":
      return {
        primaryAgent: "backend",
        secondaryAgents: ["tester"],
        skipPhases: ["design-validation", "ui-fixes", "browser-testing"],
      };
    case "MIXED":
      return {
        primaryAgent: "developer",
        secondaryAgents: ["backend", "designer", "ui-developer", "tester"],
        skipPhases: [],
      };
    default:
      return {
        primaryAgent: "developer",
        secondaryAgents: ["backend"],
        skipPhases: [],
      };
  }
}
```

### 6.2 Phase Definitions

```typescript
// src/workflows/phases.ts

export type GateType = 
  | "user_approval"
  | "pass_or_fix"
  | "all_tests_pass"
  | "all_reviewers_approve"
  | null;

export interface PhaseDefinition {
  name: string;
  description: string;
  agent: string;
  outputs: string[];
  qualityGate: GateType;
  skipCondition?: (workflowType: string) => boolean;
}

export const IMPLEMENT_PHASES: Record<string, PhaseDefinition> = {
  requirements: {
    name: "Requirements Gathering",
    description: "Analyze request and ask clarifying questions",
    agent: "orchestrator",
    outputs: [],
    qualityGate: null,
  },

  architecture: {
    name: "Architecture Planning",
    description: "Create comprehensive implementation plan",
    agent: "architect",
    outputs: ["implementation-plan.md", "quick-reference.md"],
    qualityGate: "user_approval",
  },

  "plan-review": {
    name: "Plan Review",
    description: "Multi-model review of architecture plan",
    agent: "plan-reviewer",
    outputs: ["reviews/plan-review/"],
    qualityGate: "all_reviewers_approve",
    skipCondition: () => false, // Can be skipped via flag
  },

  implementation: {
    name: "Implementation",
    description: "Build the feature according to plan",
    agent: "developer", // or "backend" based on workflow
    outputs: ["src/"],
    qualityGate: null,
  },

  "design-validation": {
    name: "Design Validation",
    description: "Compare implementation against Figma",
    agent: "designer",
    outputs: ["design-validation.md"],
    qualityGate: "pass_or_fix",
    skipCondition: (wt) => wt === "API_FOCUSED",
  },

  "ui-fixes": {
    name: "UI Fixes",
    description: "Fix issues identified by designer",
    agent: "ui-developer",
    outputs: [],
    qualityGate: null,
    skipCondition: (wt) => wt === "API_FOCUSED",
  },

  "code-review": {
    name: "Code Review",
    description: "Multi-model code review with consensus",
    agent: "reviewer",
    outputs: ["reviews/code-review/"],
    qualityGate: "all_reviewers_approve",
  },

  "review-fixes": {
    name: "Review Fixes",
    description: "Address issues from code review",
    agent: "developer",
    outputs: [],
    qualityGate: "pass_or_fix",
  },

  testing: {
    name: "Testing",
    description: "Browser and integration testing",
    agent: "tester",
    outputs: ["testing-report.md"],
    qualityGate: "all_tests_pass",
    skipCondition: (wt) => wt === "API_FOCUSED", // API uses TDD loop
  },

  acceptance: {
    name: "User Acceptance",
    description: "Present final implementation for approval",
    agent: "orchestrator",
    outputs: ["final-summary.md"],
    qualityGate: "user_approval",
  },

  cleanup: {
    name: "Cleanup",
    description: "Remove temporary artifacts",
    agent: "cleaner",
    outputs: [],
    qualityGate: null,
  },
};

export function getPhasesForWorkflow(workflowType: string): PhaseDefinition[] {
  return Object.values(IMPLEMENT_PHASES).filter(
    (phase) => !phase.skipCondition?.(workflowType)
  );
}
```

### 6.3 Quality Gate Implementations

<!-- =============================================================================
WHY: Consolidated Review Parsing (DECISIONS.md D021)
================================================================================

Following the MAG pattern, consensus analysis is performed by the consolidation
agent (via prompt), not by runtime code. The quality gate parses the agent's
consolidated output to check for blocking issues.

The gate checks for:
1. UNANIMOUS issues - these are blocking (MUST FIX)
2. Overall verdict from the consolidation

This keeps the code simple while leveraging AI for semantic issue matching.

============================================================================= -->

```typescript
// src/workflows/gates.ts
import type { MagnusOpusConfig } from "../config/schema";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface GateResult {
  passed: boolean;
  reason?: string;
  data?: unknown;
}

export type ConsensusLevel = "UNANIMOUS" | "STRONG" | "DIVERGENT";

export interface ConsolidatedReviewResult {
  unanimousCount: number;
  strongCount: number;
  divergentCount: number;
  totalIssues: number;
  hasBlockingIssues: boolean;
  hasQuorum?: boolean;         // Whether minimum reviewers completed
  completedReviews?: number;     // Number of reviews actually completed
  minReviews?: number;          // Minimum needed for decision
}

export async function checkUserApproval(
  sessionId: string,
  question: string,
  options?: string[]
): Promise<GateResult> {
  // This is handled by the ask_user tool
  // ask_user blocks until user responds
  // Returns true if user approved, false otherwise
  
  // Format the approval request for the ask_user tool
  const approvalPrompt = options && options.length > 0
    ? `${question}\n\nOptions: ${options.join(", ")}`
    : question;
  
  return { 
    passed: false, // Will be set by tool response
    reason: `User approval requested: ${approvalPrompt}`,
    data: { 
      type: "user_approval",
      question: approvalPrompt,
      options,
    }
  };
}

/**
 * Parse the consolidated review output to check for blocking issues.
 * 
 * Following the MAG pattern, consensus analysis is done by the consolidation
 * agent. This gate simply parses the output to determine pass/fail.
 * 
 * Blocking conditions:
 * - Any UNANIMOUS issues exist (all reviewers agree it must be fixed)
 * - Parsing fails (conservative approach)
 */
export async function checkAllReviewersApprove(
  sessionDir: string,
  totalReviewers: number = 3
): Promise<GateResult> {
  const consolidatedPath = join(sessionDir, "consolidated-review.md");
  
  try {
    const content = await readFile(consolidatedPath, "utf-8");
    const result = parseConsolidatedReview(content, totalReviewers);
    
    // If no quorum yet, return in-progress status
    if (!result.hasQuorum) {
      return {
        passed: false,
        reason: `Waiting for more reviews: ${result.completedReviews}/${result.minReviews} completed`,
        data: { status: "waiting_for_quorum", ...result },
      };
    }
    
    if (result.hasBlockingIssues) {
      return {
        passed: false,
        reason: `${result.unanimousCount} UNANIMOUS issues require fixes before proceeding`,
        data: result,
      };
    }
    
    // STRONG and DIVERGENT issues don't block, but are reported
    return { 
      passed: true,
      reason: result.strongCount > 0 
        ? `Passed with ${result.strongCount} STRONG consensus recommendations`
        : "All reviewers approve",
      data: result,
    };
  } catch (error) {
    // If we can't read the consolidated review, fail conservatively
    return {
      passed: false,
      reason: `Could not read consolidated review: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Parse the consolidated review markdown to extract consensus counts.
 * 
 * Supports dynamic thresholds:
 * - UNANIMOUS: 100% agreement (blocking)
 * - STRONG: ≥66% agreement (recommended)
 * - DIVERGENT: <50% agreement (optional)
 */
function parseConsolidatedReview(content: string, totalReviewers: number = 3): ConsolidatedReviewResult {
  // Extract counts from consensus summary section
  const unanimousMatch = content.match(/UNANIMOUS issues:\s*(\d+)/i);
  const strongMatch = content.match(/STRONG consensus issues:\s*(\d+)/i);
  const divergentMatch = content.match(/DIVERGENT issues:\s*(\d+)/i);
  const totalMatch = content.match(/Total unique issues:\s*(\d+)/i);
  const completedMatch = content.match(/Reviews completed:\s*(\d+)/i);
  
  const unanimousCount = unanimousMatch ? parseInt(unanimousMatch[1], 10) : 0;
  const strongCount = strongMatch ? parseInt(strongMatch[1], 10) : 0;
  const divergentCount = divergentMatch ? parseInt(divergentMatch[1], 10) : 0;
  const totalIssues = totalMatch ? parseInt(totalMatch[1], 10) : 
    unanimousCount + strongCount + divergentCount;
  
  const completedReviews = completedMatch ? parseInt(completedMatch[1], 10) : totalReviewers;
  
  // Dynamic threshold: block only if unanimous issues exist
  // Strong/DIVERGENT are non-blocking regardless of reviewer count
  const hasBlockingIssues = unanimousCount > 0;
  
  // Additional check: if fewer than minimum reviewers completed, treat as in-progress
  const minReviews = Math.max(2, Math.ceil(totalReviewers * 0.6));
  const hasQuorum = completedReviews >= minReviews;
  
  return {
    unanimousCount,
    strongCount,
    divergentCount,
    totalIssues,
    hasBlockingIssues: hasBlockingIssues && hasQuorum,
    hasQuorum,
    completedReviews,
    minReviews,
  };
}

export async function checkAllTestsPass(
  testResults: Array<{ name: string; passed: boolean; error?: string }>
): Promise<GateResult> {
  const failed = testResults.filter((t) => !t.passed);
  
  if (failed.length > 0) {
    return {
      passed: false,
      reason: `${failed.length} tests failed`,
      data: failed,
    };
  }

  return { passed: true };
}

/**
 * Pass-or-fix quality gate with configurable iteration limits.
 * 
 * Uses workflowLimits.maxIterations from config (default: 5).
 * Escalates to user when limit reached.
 */
export interface PassOrFixState {
  currentIteration: number;
  maxIterations: number;
  history: Array<{
    iteration: number;
    passed: boolean;
    reason?: string;
    timestamp: number;
  }>;
}

export async function checkPassOrFix(
  sessionDir: string,
  config: MagnusOpusConfig,
  checkFn: () => Promise<GateResult>
): Promise<GateResult & { state: PassOrFixState }> {
  const maxIterations = config.workflowLimits?.maxIterations ?? 5;
  
  // Load existing state or create new
  const statePath = join(sessionDir, ".pass-or-fix-state.json");
  let state: PassOrFixState;
  
  try {
    const stateJson = await readFile(statePath, "utf-8");
    state = JSON.parse(stateJson);
  } catch {
    state = {
      currentIteration: 0,
      maxIterations,
      history: [],
    };
  }
  
  // Increment iteration
  state.currentIteration++;
  
  // Run the actual check
  const result = await checkFn();
  
  // Record in history
  state.history.push({
    iteration: state.currentIteration,
    passed: result.passed,
    reason: result.reason,
    timestamp: Date.now(),
  });
  
  // Save state
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  
  // Check if passed
  if (result.passed) {
    return { ...result, state };
  }
  
  // Check if max iterations reached
  if (state.currentIteration >= maxIterations) {
    return {
      passed: false,
      reason: `Max iterations (${maxIterations}) reached. ${result.reason}`,
      data: {
        ...result.data,
        escalation: "USER_DECISION_REQUIRED",
        options: [
          "Continue for N more iterations",
          "Proceed anyway (with known issues)",
          "Cancel and review",
        ],
      },
      state,
    };
  }
  
  // Not passed, but more iterations available
  return {
    passed: false,
    reason: `Iteration ${state.currentIteration}/${maxIterations}: ${result.reason}`,
    data: result.data,
    state,
  };
}

/**
 * Review rounds gate with configurable limits.
 * 
 * Uses workflowLimits.maxReviewRounds from config (default: 3).
 */
export async function checkReviewRounds(
  sessionDir: string,
  config: MagnusOpusConfig,
  currentRound: number
): Promise<{ canContinue: boolean; reason: string }> {
  const maxRounds = config.workflowLimits?.maxReviewRounds ?? 3;
  
  if (currentRound >= maxRounds) {
    return {
      canContinue: false,
      reason: `Max review rounds (${maxRounds}) reached. Escalating to user.`,
    };
  }
  
  return {
    canContinue: true,
    reason: `Review round ${currentRound + 1}/${maxRounds}`,
  };
}
```

### 6.4 Agent Routing

```typescript
// src/workflows/routing.ts
import type { WorkflowType } from "./detector";

export interface AgentRouting {
  implementation: string[];
  validation: string[];
  review: string[];
}

export function getAgentsForWorkflow(workflowType: WorkflowType): AgentRouting {
  switch (workflowType) {
    case "UI_FOCUSED":
      return {
        implementation: ["developer"],
        validation: ["designer", "tester"],
        review: ["reviewer"],
      };

    case "API_FOCUSED":
      return {
        implementation: ["backend"],
        validation: [], // TDD loop instead
        review: ["reviewer"],
      };

    case "MIXED":
      return {
        implementation: ["developer", "backend"],
        validation: ["designer", "tester"],
        review: ["reviewer"],
      };

    default:
      return {
        implementation: ["developer"],
        validation: [],
        review: ["reviewer"],
      };
  }
}
```

### 6.6 Git Integration and Workflow State Management

<!-- =============================================================================
WHY: Git Safety & Workflow State (Production Experience)
================================================================================

1. WORKFLOW RECOVERY
   - Users take breaks, OpenCode restarts, or crashes happen
   - Losing hours of progress is extremely frustrating
   - Need formal mechanism to resume from exact phase

2. GIT SAFETY
   - Long workflows modify many files
   - Working on main branch risks breaking the entire project
   - Checkpoints provide recovery points

3. STATE INJECTION
   - Agent needs explicit state context to resume correctly
   - Prevents "hallucination" about current phase
   - Ensures no phase repetition

============================================================================= -->

```typescript
// src/workflows/git-integration.ts
import { execSync } from "child_process";

export interface GitCheckpoint {
  branch: string;
  commitHash: string;
  message: string;
  timestamp: string;
}

/**
 * Create a feature branch for workflow safety
 */
export async function createWorkflowBranch(
  sessionId: string,
  workflowType: string
): Promise<GitCheckpoint> {
  const branchName = `magnus-opus/${workflowType}/${sessionId}-${Date.now()
    .toString(36)
    .slice(0, 8)}`;
  
  try {
    // Create and checkout feature branch
    execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
    
    // Initial commit with workflow metadata
    const commitMessage = `Start Magnus Opus workflow: ${sessionId}
Type: ${workflowType}
Session: ${sessionId}`;
    
    execSync('git add .', { stdio: 'pipe' });
    const commitHash = execSync(`git commit -m "${commitMessage}"`, { 
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    
    return {
      branch: branchName,
      commitHash,
      message: commitMessage,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to create workflow branch: ${error}`);
  }
}

/**
 * Create checkpoint after major milestones
 */
export async function createCheckpoint(
  phase: string,
  description: string
): Promise<void> {
  try {
    // Stage all changes
    execSync('git add .', { stdio: 'pipe' });
    
    // Create checkpoint commit
    const commitMessage = `Magnus Opus checkpoint: ${phase}

${description}`;
    
    execSync(`git commit -m "${commitMessage}"`, { 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    console.log(`✅ Git checkpoint created: ${phase}`);
  } catch (error) {
    console.warn(`⚠️ Failed to create checkpoint: ${error}`);
  }
}

/**
 * Merge completed workflow back to main
 */
export async function mergeWorkflowBranch(
  sessionId: string
): Promise<void> {
  try {
    // Switch to main
    execSync('git checkout main', { stdio: 'pipe' });
    
    // Merge workflow branch
    execSync(`git merge magnus-opus/*/${sessionId} -m "Merge Magnus Opus workflow: ${sessionId}"`, {
      stdio: 'pipe'
    });
    
    // Delete workflow branch
    execSync(`git branch -D magnus-opus/*/${sessionId}`, { stdio: 'pipe' });
    
    console.log(`✅ Workflow merged to main: ${sessionId}`);
  } catch (error) {
    throw new Error(`Failed to merge workflow branch: ${error}`);
  }
}
```

### 6.7 Workflow State Injection

```typescript
// src/workflows/state-injection.ts
import type { ContextCollector } from "../features/context-injector";
import { loadSessionMetadata } from "../sessions";

/**
 * Inject workflow state context for resumable workflows
 */
export function injectWorkflowState(
  sessionId: string,
  contextCollector: ContextCollector
): void {
  // Load session metadata
  const metadata = loadSessionMetadata(sessionId);
  if (!metadata) return;
  
  // Create persistent workflow state
  const stateContext = `
## Workflow State Injection

**Session ID:** ${sessionId}
**Status:** ${metadata.status}
**Current Phase:** ${metadata.currentPhase || "None"}
**Completed Phases:** ${metadata.completedPhases.join(", ") || "None"}
**Total Progress:** ${metadata.completedPhases.length}/10

**Next Action:**
${metadata.currentPhase ? `Continue phase: ${metadata.currentPhase}` : "Start with requirements gathering"}

**Critical Instructions:**
1. DO NOT repeat completed phases
2. Use existing artifacts in session directory
3. Update phase status immediately after completion
4. If resuming from crash, validate current state before proceeding
`;
  
  // Register as persistent context (re-injected every turn)
  contextCollector.register(sessionId, {
    id: "workflow-state",
    source: "state-injector",
    content: stateContext,
    priority: "critical",
    persistent: true, // Re-inject every turn
  });
}
```

### 6.8 Phase Definition Updates

```typescript
// Add to IMPLEMENT_PHASES
"requirements": {
  // ... existing fields ...
  gitCheckpoint?: boolean,  // Whether to create git checkpoint
  stateInjection?: boolean,  // Whether to inject workflow state
},

"architecture": {
  // ... existing fields ...
  gitCheckpoint?: boolean,
  stateInjection?: boolean,
  prePhaseHook?: () => Promise<void>,  // Executed before phase starts
},

"implementation": {
  // ... existing fields ...
  gitCheckpoint?: boolean,
  postPhaseHook?: () => Promise<void>,   // Executed after phase completes
},

// Add to phase execution logic
export async function executePhase(
  phaseName: string,
  sessionDir: string,
  contextCollector: ContextCollector,
  config: MagnusOpusConfig
): Promise<void> {
  const phase = IMPLEMENT_PHASES[phaseName];
  if (!phase) return;
  
  // Pre-phase: git checkpoint if enabled
  if (phase.gitCheckpoint) {
    await createCheckpoint(`before-${phaseName}`, `Starting phase: ${phaseName}`);
  }
  
  // Pre-phase: state injection if enabled
  if (phase.stateInjection) {
    injectWorkflowState(extractSessionId(sessionDir), contextCollector);
  }
  
  // Execute pre-phase hook
  if (phase.prePhaseHook) {
    await phase.prePhaseHook();
  }
  
  // Execute actual phase...
  
  // Post-phase: git checkpoint if enabled
  if (phase.gitCheckpoint) {
    await createCheckpoint(`after-${phaseName}`, `Completed phase: ${phaseName}`);
  }
  
  // Execute post-phase hook
  if (phase.postPhaseHook) {
    await phase.postPhaseHook();
  }
}
```

### 6.5 TDD Loop for API_FOCUSED Workflows

<!-- =============================================================================
WHY: TDD Loop Formalization (DECISIONS.md D025)
================================================================================

1. MAG PATTERN: 5-STEP TDD LOOP
   - Write tests → Run → Check → Analyze → Fix → Repeat
   - Tests written in black-box mode (no implementation access)
   - Clear classification of TEST_ISSUE vs IMPLEMENTATION_ISSUE
   - Max iterations configurable via workflowLimits.maxTddIterations

2. BLACK-BOX TEST DESIGN
   - test-architect writes tests from requirements + API contracts ONLY
   - No access to implementation details
   - Ensures tests validate behavior, not implementation

3. ISSUE CLASSIFICATION
   - TEST_ISSUE: Test is wrong, fix the test
   - IMPLEMENTATION_ISSUE: Code is wrong, fix the code
   - Default to IMPLEMENTATION_ISSUE when ambiguous (tests are authoritative)

4. ITERATION LIMITS
   - Prevents infinite loops
   - Configurable via workflowLimits.maxTddIterations (default: 10)
   - Escalate to user when limit reached

============================================================================= -->

```typescript
// src/workflows/tdd-loop.ts
import type { MagnusOpusConfig } from "../config/schema";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export type IssueClassification = "TEST_ISSUE" | "IMPLEMENTATION_ISSUE";

export interface TddIterationResult {
  iteration: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  failureAnalysis?: FailureAnalysis[];
  classification?: IssueClassification;
  fixApplied?: string;
}

export interface FailureAnalysis {
  testName: string;
  error: string;
  classification: IssueClassification;
  rationale: string;
  recommendedFix: string;
}

export interface TddLoopResult {
  passed: boolean;
  iterations: TddIterationResult[];
  totalIterations: number;
  finalStatus: "ALL_TESTS_PASS" | "MAX_ITERATIONS_REACHED" | "USER_CANCELLED";
}

/**
 * Classification criteria for TEST_ISSUE vs IMPLEMENTATION_ISSUE
 * 
 * TEST_ISSUE indicators:
 * - Test expects behavior not mentioned in requirements
 * - Test checks implementation details (function calls, internal state)
 * - Test is flaky (sometimes passes, sometimes fails)
 * - Test setup is incomplete or has bad assertions
 * - Requirements explicitly state different behavior than test expects
 * 
 * IMPLEMENTATION_ISSUE indicators:
 * - Code doesn't match requirements
 * - Code violates API contract from architecture
 * - Code has bugs or missing functionality
 * - Error conditions not handled
 * - Edge cases not covered as specified
 * 
 * DEFAULT: If ambiguous, classify as IMPLEMENTATION_ISSUE (tests are authoritative)
 */
export function classifyFailure(
  testName: string,
  error: string,
  requirements: string,
  apiContract: string
): IssueClassification {
  // This is primarily done by the test-architect agent via prompt
  // This function provides a fallback heuristic
  
  const errorLower = error.toLowerCase();
  
  // Likely TEST_ISSUE patterns
  const testIssuePatterns = [
    /mock.*not.*configured/i,
    /timeout.*exceeded/i,
    /setup.*failed/i,
    /beforeeach.*error/i,
    /aftereach.*error/i,
    /flaky/i,
    /intermittent/i,
  ];
  
  for (const pattern of testIssuePatterns) {
    if (pattern.test(error)) {
      return "TEST_ISSUE";
    }
  }
  
  // Default to IMPLEMENTATION_ISSUE (tests are authoritative)
  return "IMPLEMENTATION_ISSUE";
}

/**
 * Execute TDD loop for API_FOCUSED workflows
 * 
 * Steps:
 * 1. Write tests (test-architect, black-box, no implementation access)
 * 2. Run tests
 * 3. Check results (pass → done, fail → continue)
 * 4. Analyze failures → classify as TEST_ISSUE or IMPLEMENTATION_ISSUE
 * 5. Fix appropriate code/test, repeat
 */
export async function executeTddLoop(
  sessionDir: string,
  config: MagnusOpusConfig,
  options: {
    testCommand: string;
    requirementsPath: string;
    apiContractPath: string;
  }
): Promise<TddLoopResult> {
  const maxIterations = config.workflowLimits?.maxTddIterations ?? 10;
  const iterations: TddIterationResult[] = [];
  
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    // Record iteration start
    const iterationResult: TddIterationResult = {
      iteration,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
    };
    
    // Step 2: Run tests
    // (Actual test execution delegated to agent via Bash)
    
    // Step 3: Check if all pass
    if (iterationResult.testsFailed === 0 && iterationResult.testsRun > 0) {
      iterations.push(iterationResult);
      
      return {
        passed: true,
        iterations,
        totalIterations: iteration,
        finalStatus: "ALL_TESTS_PASS",
      };
    }
    
    // Step 4 & 5: Analyze and fix (handled by agents)
    iterations.push(iterationResult);
    
    // Write iteration history
    await writeIterationHistory(sessionDir, iterations);
  }
  
  // Max iterations reached
  return {
    passed: false,
    iterations,
    totalIterations: iteration,
    finalStatus: "MAX_ITERATIONS_REACHED",
  };
}

async function writeIterationHistory(
  sessionDir: string,
  iterations: TddIterationResult[]
): Promise<void> {
  const historyPath = join(sessionDir, "tests", "iteration-history.md");
  
  const content = `# TDD Iteration History

${iterations.map((it) => `
## Iteration ${it.iteration}/${iterations.length}

- Tests run: ${it.testsRun}
- Passed: ${it.testsPassed}
- Failed: ${it.testsFailed}
${it.classification ? `- Classification: ${it.classification}` : ""}
${it.fixApplied ? `- Fix applied: ${it.fixApplied}` : ""}
`).join("\n")}
`;
  
  await writeFile(historyPath, content, "utf-8");
}

/**
 * TDD Loop orchestration prompt for API_FOCUSED workflows
 * 
 * This is injected into the backend agent's workflow when
 * the workflow type is API_FOCUSED.
 */
export const TDD_LOOP_ORCHESTRATION_PROMPT = `
## TDD Loop for API_FOCUSED Workflow

Follow the 5-step TDD loop until all tests pass or max iterations reached:

### Step 1: Write Tests (Task → test-architect or tester)
Task: tester
  Prompt: "Write comprehensive tests for the API based on:
  - Requirements: \${sessionDir}/requirements.md
  - API Contract: \${sessionDir}/architecture.md

  CRITICAL CONSTRAINTS:
  - You have NO access to implementation code
  - Write tests based ONLY on requirements and API contracts
  - This ensures true black-box testing

  Write tests to: \${sessionDir}/tests/api.test.ts"

### Step 2: Run Tests
\`\`\`bash
cd \${projectDir} && npm test -- --reporter=json > \${sessionDir}/tests/test-results.json 2>&1
\`\`\`

### Step 3: Check Results
Read \${sessionDir}/tests/test-results.json

If all tests pass:
  → TDD loop complete, proceed to code review

If tests fail:
  → Continue to Step 4

### Step 4: Analyze Failures (Task → test-architect or tester)
Task: tester
  Prompt: "Analyze the test failures in \${sessionDir}/tests/test-results.json

  For EACH failure, determine if it's:

  **TEST_ISSUE** (fix the test) - indicators:
  - Test expects behavior not in requirements
  - Test checks implementation details
  - Test is flaky or has setup issues
  - Requirements say different than test expects

  **IMPLEMENTATION_ISSUE** (fix the code) - indicators:
  - Code doesn't match requirements
  - Code violates API contract
  - Missing functionality or bug

  DEFAULT: If unclear, classify as IMPLEMENTATION_ISSUE

  For TEST_ISSUE classifications, you MUST provide:
  1. Which requirement the test misinterprets
  2. How the test should be changed
  3. Why the implementation is actually correct

  Write analysis to: \${sessionDir}/tests/failure-analysis.md"

### Step 5: Apply Fix

**If TEST_ISSUE:**
Task: tester
  Prompt: "Fix the test based on \${sessionDir}/tests/failure-analysis.md
  Provide justification for each change."

**If IMPLEMENTATION_ISSUE:**
Task: backend
  Prompt: "Fix the implementation based on \${sessionDir}/tests/failure-analysis.md
  Apply minimal changes to make tests pass."

### Repeat
Return to Step 2. Track iteration count.

### Max Iterations
If \${maxIterations} iterations reached without all tests passing:
- Escalate to user with options:
  1. Continue for N more iterations
  2. Proceed anyway (with known failures)
  3. Cancel and review
`;
```