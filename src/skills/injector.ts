import type { SkillDefinition, SkillContext } from "./types.js";
import { getBuiltinSkill } from "./builtin/index.js";

export interface SkillInjectionOptions {
  prefix?: string;
  suffix?: string;
  includeMetadata?: boolean;
}

export class SkillInjector {
  private options: SkillInjectionOptions;

  constructor(options: SkillInjectionOptions = {}) {
    this.options = {
      prefix: "## Available Skills\n",
      suffix: "\n---\n",
      includeMetadata: true,
      ...options
    };
  }

  injectSkills(
    prompt: string, 
    skills: string[], 
    context?: SkillContext
  ): string {
    const skillContents = skills
      .map(skillName => this.getSkillContent(skillName, context))
      .filter(Boolean)
      .join("\n\n");

    if (!skillContents) {
      return prompt;
    }

    const injection = [
      this.options.prefix,
      skillContents,
      this.options.suffix
    ].join("");

    return `${injection}\n\n${prompt}`;
  }

  injectSkillCategories(
    prompt: string,
    categories: string[],
    context?: SkillContext
  ): string {
    const skills = this.getSkillsByCategories(categories);
    return this.injectSkills(prompt, skills, context);
  }

  private getSkillContent(skillName: string, context?: SkillContext): string | null {
    // Try to get built-in skill first
    const skill = getBuiltinSkill(skillName);
    if (!skill) {
      return null;
    }

    let content = skill.content;
    
    if (this.options.includeMetadata && context) {
      const metadata = this.generateContextMetadata(skill, context);
      content = `${metadata}\n\n${content}`;
    }

    return content;
  }

  private generateContextMetadata(skill: SkillDefinition, context: SkillContext): string {
    return `> **Skill:** ${skill.name}\n> **Category:** ${skill.category}\n> **Context:** ${context.sessionID} (${context.agent})`;
  }

  private getSkillsByCategories(categories: string[]): string[] {
    // This would normally look up skills by category
    // For now, return some basic skill names based on category
    const skills: string[] = [];
    
    if (categories.includes('sveltekit')) {
      skills.push('SVELTEKIT_BASICS');
    }
    if (categories.includes('convex')) {
      skills.push('CONVEX_FUNDAMENTALS');
    }
    
    return skills;
  }
}