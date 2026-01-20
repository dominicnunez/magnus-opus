import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { SkillDefinition } from "./types.js";

export interface SkillLoaderOptions {
  contentDir?: string;
  skillsDir?: string;
}

export class SkillLoader {
  private options: SkillLoaderOptions;
  
  constructor(options: SkillLoaderOptions = {}) {
    this.options = {
      contentDir: "content",
      skillsDir: "skills", 
      ...options
    };
  }

  async loadSkill(name: string): Promise<SkillDefinition | null> {
    // Try to load from content/skills directory first
    const contentPath = join(process.cwd(), this.options.contentDir!, "skills", `${name}.md`);
    
    if (existsSync(contentPath)) {
      const content = readFileSync(contentPath, "utf-8");
      return {
        name,
        description: this.extractDescription(content),
        content,
        category: this.inferCategory(name)
      };
    }
    
    return null;
  }

  async loadAllSkills(): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];
    
    // For now, return empty array
    // In a full implementation, this would scan the content/skills directory
    return skills;
  }

  private extractDescription(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1] : "";
  }

  private inferCategory(name: string): SkillDefinition['category'] {
    if (name.toLowerCase().includes('svelte') || name.toLowerCase().includes('kit')) {
      return 'sveltekit';
    }
    if (name.toLowerCase().includes('convex')) {
      return 'convex';
    }
    if (name.toLowerCase().includes('test')) {
      return 'testing';
    }
    if (name.toLowerCase().includes('design') || name.toLowerCase().includes('ui')) {
      return 'design';
    }
    return 'general';
  }
}