# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- `artifacts/ai-chat` — Expo mobile app (AI Chat). User enters their own OpenRouter API key on first launch (stored in AsyncStorage), then chats. Multiple free models selectable. No backend, no database — direct calls to https://openrouter.ai/api/v1/chat/completions from the device.
  - Tools (function-calling, defined in `lib/tools.ts`, executed by `lib/openrouter.ts` tool loop, max 5 hops):
    - Local: `get_current_time`, `calculate`
    - NexRay REST API (`lib/nexray.ts`, base `https://api.nexray.web.id`, no API key, called via `fetch`): `web_search` (Brave), `wikipedia_search`, `weather` (BMKG `/information/cuaca`), `earthquake_latest` (BMKG `/information/gempa`), `prayer_times` (`/information/jadwalsholat`), `tv_schedule` (`/information/jadwaltv`), `song_lyrics` (`/search/lyrics`), `recipe_search` (`/search/resep`), `news_indonesia` (`/berita/<source>`).
  - Tool loading status text comes from each tool's `label` field; `app/chat.tsx` looks it up via `findTool(name)`.
  - Skipped NexRay endpoints due to upstream issues: `/tools/translate` (returns 500 from upstream), `/information/hari-libur` (TLS cert mismatch).

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
