// Shapes of what hpc_hub/api/methods/skills.py sends.
export type Skill = {
  path: string  // its folder on the cluster ("" for HPC Hub's own)
  folder: string
  name: string
  description: string
  target: string  // the agent it belongs to (installed ones)
  managed: boolean  // synced or built in: the agent manages it
}

export type Target = { id: string; label: string; folder: string }

export type CatalogSkill = Skill & { on: string[] }  // agents that have it

export type SkillList = {
  name: string
  targets: Target[]
  installed: Skill[]
  catalog: CatalogSkill[]
  default_repo: string
}
