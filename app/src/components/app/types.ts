// Shapes of what hpc_hub/api/methods/{browser,preferences}.py send.
export type ChromeProfile = { folder: string; name: string; email: string }

/** Chrome profiles to open links in, and the default one ("" is the system browser). */
export type Profiles = { profiles: ChromeProfile[]; default: string }

export type Preferences = { browser_profile: string; experimental: boolean }
