# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- `artifacts/ai-chat` — Expo mobile app (AI Chat). User enters their own OpenRouter API key on first launch (stored in AsyncStorage), then chats. Multiple free models selectable. No backend, no database — direct calls to https://openrouter.ai/api/v1/chat/completions from the device.
  - Tools (function-calling, defined in `lib/tools.ts`, executed by `lib/openrouter.ts` tool loop, `MAX_TOOL_HOPS = 50`):
    - Utility: `get_current_time`, `calculate`.
    - NexRay REST API (`lib/nexray.ts`, base `https://api.nexray.web.id`, no API key, called via `fetch`): `web_search` (Brave), `wikipedia_search`, `weather` (BMKG `/information/cuaca`), `earthquake_latest` (BMKG `/information/gempa`), `prayer_times` (`/information/jadwalsholat`), `tv_schedule` (`/information/jadwaltv`), `song_lyrics` (`/search/lyrics`), `recipe_search` (`/search/resep`), `news_indonesia` (`/berita/<source>`).
    - Creative: `generate_image` — fetches from `https://api.nexray.eu.cc/ai/magicstudio?prompt=...` via `FileSystem.downloadAsync`, saves to `${documentDirectory}sandbox/images/<slug>-<ts>.jpg`, returns the `file://` URI. Model is instructed to embed result as `![alt](uri)` markdown.
    - Sandbox file system (`lib/agentFs.ts`, all paths jailed under `${documentDirectory}sandbox/`): `fs_write_file`, `fs_read_file`, `fs_list_folder`, `fs_create_folder`, `fs_delete`. Path validation rejects `..`, absolute paths, and forbidden chars; `fs_delete` refuses to delete the sandbox root.
    - **Snippet library** (`lib/snippetsStore.ts`, files under `${documentDirectory}snippets/<slug>.md`): `list_snippets({lang?, tag?})` returns metadata only (name, title, desc, lang, tags) to save tokens; `get_snippet({name})` returns full code. The system prompt instructs the AI to call `list_snippets` BEFORE writing common UI components (buttons, cards, forms, layouts) so library snippets are preferred. Snippet file format = simple frontmatter (`title`, `desc`, `lang`, `tags`) + raw code body. **Default snippets** (`lib/defaultSnippets.json` + `lib/defaultSnippets.ts`, 86 entries) are bundled with the app — Tailwind HTML examples scraped from `jokoui.web.id/components/application/*` covering navbars, sidebars, breadcrumbs, avatars, forms, buttons, cards, loaders, badges, alerts, progress, skeleton, table. Tagged `joko-ui` + category. `listSnippets()` merges defaults + user files (user override wins by name). `getSnippet()` checks user fs first, falls back to defaults. `userSnippetExists()` distinguishes from `snippetExists()` (which now also returns true for defaults). UI: defaults can't be deleted (alerts show explanation); editing a default and saving creates a user override at the same name.
  - `ChatBubble.tsx` renders full markdown via `react-native-markdown-display` (bold, italic, code, lists, headings, quotes, links, tables) with theme-aware styles. Image rule is overridden to use `expo-image` for `![alt](uri)` (e.g. `generate_image` results). The typing animation rebuilds the markdown tree as text streams in; an inline cursor sits below the rendered content while animating.
  - **File manager** (`app/files/...`, helpers in `lib/projectFs.ts`):
    - `/files` lists "projects" (top-level folders under `${documentDirectory}sandbox/`), with create / rename / delete.
    - `/files/[project]` browses files inside a project (recursive nav via `?path=`), create file/folder, rename, delete (long-press for action sheet).
    - `/files/[project]/edit?path=` opens a monospace editor (`TextInput` multiline) with dirty-state detection; auto-template seeded for `.html .css .js .json .md`.
    - `/files/[project]/preview?path=` renders HTML in `react-native-webview` (`react-native-webview` ~13.15). `buildBundledHtml` inlines local `<link rel=stylesheet>`, `<script src=...>`, and `<img src=...>` references (resolved against the entry path) so a multi-file static site renders without filesystem URLs. Default entry is `index.html`/`index.htm`/`main.html`. Refresh button rebuilds the bundle.
    - Reachable from the chat header (folder icon next to settings).
  - The AI's sandbox tools (`fs_write_file`, etc.) and the file manager UI share the same `${documentDirectory}sandbox/` root, so files the AI creates appear in the manager and vice versa.
  - Tool loading status text comes from each tool's `label` field; `app/chat.tsx` looks it up via `findTool(name)`.
  - Skipped NexRay endpoints due to upstream issues: `/tools/translate` (returns 500 from upstream), `/information/hari-libur` (TLS cert mismatch).
  - `expo-file-system` (`~19.0.22`, used via `expo-file-system/legacy` import) and `expo-sharing` (`~14.0.8`) are required for the file system & image tools. They work on Expo Go / native builds; on the web preview the FS tools error out with a friendly message.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
