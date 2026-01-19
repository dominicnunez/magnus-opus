# Workflows Guide

Magnus Opus automatically detects the type of work needed and routes to the appropriate workflow.

## Workflow Types

### UI_FOCUSED

For component, page, and styling work.

**Triggers:**
- Keywords: component, page, layout, design, Figma, UI, styling, Svelte, Tailwind

**Agents Used:**
- architect → developer → designer → ui-developer → reviewer → tester

**Phases:**
1. Architecture planning
2. User approval
3. Implementation (developer)
4. Design validation (designer)
5. UI fixes if needed (ui-developer)
6. Code review
7. Browser testing
8. User acceptance

**Example:**
```
/implement Create a user profile card component with avatar, name, bio, and edit button
```

### API_FOCUSED

For Convex backend work.

**Triggers:**
- Keywords: query, mutation, action, schema, Convex, database, API, CRUD

**Agents Used:**
- architect → backend → reviewer → tester

**Phases:**
1. Architecture planning
2. User approval
3. Implementation (backend)
4. Test-driven development loop
5. Code review (skip browser testing)
6. User acceptance

**Example:**
```
/implement-api Create user management functions with create, update, delete, and list operations
```

### MIXED

For full-stack features requiring both UI and backend.

**Triggers:**
- Both UI and API keywords present

**Agents Used:**
- All agents

**Phases:**
1. Architecture planning
2. User approval
3. Parallel implementation:
   - Track A: UI (developer)
   - Track B: API (backend)
4. Design validation (UI track only)
5. Code review
6. Full testing
7. User acceptance

**Example:**
```
/implement Create a real-time chat feature with message list component and Convex backend
```

## Phase Details

### Phase 1: Architecture Planning

The architect agent:
1. Analyzes your request
2. Asks clarifying questions (gap analysis)
3. Creates comprehensive plan
4. Writes `implementation-plan.md` and `quick-reference.md`

### Phase 1.5: Plan Review (Optional)

If you choose "Get AI review first":
1. Select external models
2. Models review plan in parallel
3. Consensus analysis
4. Option to revise plan

### Phase 2: Implementation

Based on workflow type:
- **UI**: developer agent creates SvelteKit components
- **API**: backend agent creates Convex functions
- **Mixed**: Both run (potentially in parallel)

### Phase 2.5: Validation

- **UI workflows**: Designer validates against Figma
- **API workflows**: Test-driven development loop
- **Mixed**: Design validation for UI parts only

### Phase 3: Code Review

Three reviewers in parallel:
1. Claude Sonnet (embedded)
2. External model 1 (e.g., Grok)
3. External model 2 (e.g., Gemini)

Consensus analysis prioritizes issues flagged by multiple models.

### Phase 4: Testing

- **UI workflows**: Browser testing
- **API workflows**: Skipped (done in Phase 2.5)

### Phase 5: User Acceptance

Present final implementation for approval:
- Summary of changes
- Files created/modified
- Test results
- Review findings

### Phase 6-7: Cleanup and Delivery

- Remove temporary artifacts
- Generate final summary
- Handoff to user

## Quality Gates

Each phase has quality gates:

| Gate | Condition | Action if Fail |
|------|-----------|----------------|
| Plan Approval | User approves | Revise or iterate |
| Design Validation | Design matches | Fix with ui-developer |
| Code Review | No critical issues | Fix and re-review |
| Tests Pass | All tests pass | Fix and re-test |
| User Acceptance | User approves | Address feedback |

## Workflow Customization

### Skip Plan Review

```
/implement Create X --skip_plan_review
```

### Force Workflow Type

```
/implement Create X --workflow_type=UI_FOCUSED
```

### With Figma URL

```
/implement Create X --figma_url=https://figma.com/file/xxx
```

## Session Management

Each workflow creates a session:

```
ai-docs/sessions/impl-20260118-143052-abc123/
├── session-meta.json       # Progress tracking
├── implementation-plan.md  # Architecture plan
├── quick-reference.md      # Checklist
├── design-validation.md    # Designer report
├── testing-report.md       # Test results
├── final-summary.md        # Delivery summary
└── reviews/
    ├── plan-review/        # Plan review files
    └── code-review/        # Code review files
```

Sessions enable:
- Progress tracking
- Recovery from interruption
- Artifact organization
- Audit trail

## Tips

1. **Be specific** - Clear requests get better plans
2. **Provide context** - Mention existing patterns to follow
3. **Include Figma** - For UI work, Figma URLs improve validation
4. **Review plans** - Take time to review architecture before implementation
5. **Use multi-model review** - More perspectives catch more issues
