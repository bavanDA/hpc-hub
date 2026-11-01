# Agent logos

One-color 24x24 marks for the coding agents HPC Hub starts, shown next to their names in the desktop and phone
agent menus (`app/src/components/agents/AgentIcon.tsx`).

| File | Agent | Source | Its license |
| --- | --- | --- | --- |
| `claude.svg` | Claude (Anthropic) | [Simple Icons](https://simpleicons.org) 16.36.0, `claude` | CC0 1.0 |
| `cursor.svg` | Cursor (Anysphere) | Simple Icons 16.36.0, `cursor` | CC0 1.0 |
| `openai.svg` | ChatGPT / Codex (OpenAI) | [Lobe Icons](https://github.com/lobehub/lobe-icons) 1.101.0, `openai` (not in Simple Icons) | MIT |
| `antigravity.svg` | Antigravity (Google) | Lobe Icons 1.101.0, `antigravity` | MIT |

Each file was rewritten to plain paths with `fill="currentColor"`, nothing else changed.

## Trademarks

These marks belong to their owners: Claude and Anthropic to Anthropic PBC, ChatGPT, Codex and OpenAI to OpenAI,
Antigravity and Google to Google LLC, Cursor to Anysphere Inc. The icon sets' licenses cover the drawings, not the
trademarks. HPC Hub uses them only to say which agent a button starts, which is nominative use; it isn't made by or
endorsed by any of these companies. Check each owner's brand rules before using a mark another way.

## Building without them

Set `HPC_HUB_PLAIN_ICONS=1` when building (`HPC_HUB_PLAIN_ICONS=1 npm run build` in `app/` or `mobile/`) and every
agent gets the plain robot icon instead. The SVGs are still in the source tree; delete this folder's imports in
`AgentIcon.tsx` too if a build must not contain them at all.
