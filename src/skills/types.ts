// Skill system types
export interface SkillDefinition {
  name: string;
  description: string;
  content: string;
  category: 'sveltekit' | 'convex' | 'general' | 'testing' | 'design';
}

export interface SkillContext {
  sessionID: string;
  agent: string;
  project: string;
  directory: string;
}

// Built-in skill definitions
export const BUILTIN_SKILLS: Record<string, SkillDefinition> = {
  SVELTEKIT_BASICS: {
    name: "SvelteKit Fundamentals",
    description: "Core concepts and patterns for SvelteKit development",
    content: `# SvelteKit Fundamentals

## Routing
- File-based routing in \`src/routes/\`
- Dynamic routes with \`[param]\` syntax
- Layout routes with \`+layout.svelte\`

## Server-side vs Client-side
- \`+page.server.ts\` for server functions
- \`+page.ts\` for data loading
- \`+page.svelte\` for components

## Form Handling
- Action functions with \`export const actions\`
- Form validation with \`enhance\`
- Progressive enhancement patterns`,
    category: 'sveltekit'
  },
  
  CONVEX_FUNDAMENTALS: {
    name: "Convex Database Patterns",
    description: "Essential Convex development patterns",
    content: `# Convex Development Patterns

## Schema Definition
- Define schemas in \`schema.ts\`
- Use Zod for validation
- Index optimization strategies

## Query Functions
- \`export const get = query(...)\`
- Database queries with filters
- Real-time subscriptions

## Mutations
- \`export const create = mutation(...)\`
- Transaction patterns
- Error handling strategies`,
    category: 'convex'
  }
};

export type SkillCategory = SkillDefinition['category'];