import { BUILTIN_SKILLS } from "../types.js";

// Built-in skill registry
export function getBuiltinSkill(name: string) {
  return BUILTIN_SKILLS[name];
}

export function getAllBuiltinSkills() {
  return BUILTIN_SKILLS;
}

export function getSkillsByCategory(category: string) {
  return Object.values(BUILTIN_SKILLS).filter(skill => skill.category === category);
}