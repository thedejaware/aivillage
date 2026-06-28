import type { Twin, Reward, SkillName, ProjectType } from "@aivillage/shared";

const SKILL_BY_TYPE: Record<ProjectType, SkillName> = {
  fountain: "building", mural: "art", noodle_stand: "building", arcade_game: "coding",
  garden: "art", observatory: "building", stage: "social", workshop: "coding"
};

export function rewardFor(type: ProjectType): Reward {
  return { skill: SKILL_BY_TYPE[type], xp: 10, reputation: 2 };
}

export function applyReward(twin: Twin, reward: Reward): Twin {
  const skills = { ...twin.skills, [reward.skill]: twin.skills[reward.skill] + reward.xp };
  return { ...twin, skills, reputation: twin.reputation + reward.reputation };
}
