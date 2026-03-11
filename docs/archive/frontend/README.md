# Emilia Webapp — Frontend

React + TypeScript + Vite frontend for the Emilia VRM avatar chat app (1:1 sessions + group rooms).

## Stack

- React 19 + TypeScript
- Vite (HTTPS dev server on `:3443`)
- TanStack Router
- Zustand for client state
- React Query for server state
- Three.js + @pixiv/three-vrm for VRM rendering
- Tailwind CSS v4 + Radix UI

## Soul Window UI

- `Header` includes a live mood indicator sourced from SSE `emotion.snapshot`.
- `BondModal` fetches user-agent relationship state from `/api/soul-window/bond`.
- `AboutModal` fetches parsed `SOUL.md` sections from `/api/soul-window/about`.
- Timeline/event operations use `/api/soul-window/events`.
- API wrappers live in `src/utils/soulWindowApi.ts` and payload types in `src/types/soulWindow.ts`.

## Development

```bash
npm install
npm run dev -- --host
```

Optional allowlist override for local frontend:

```bash
VITE_GAMES_V2_AGENT_ALLOWLIST=emilia,rem npm run dev -- --host
```

## Unified Chat Architecture

- Single `useChat(mode?: 'dm' | 'room')` hook handles both DM and multi-agent room chat.
- Single `chatStore` (Zustand) — no separate roomStore. Per-agent state maps: `streamingByAgent`, `statusByAgent`, `emotionByAgent`, `avatarCommandByAgent`.
- Canonical `ChatMessage` type in `types/chat.ts` mirrors API `RoomMessage` format.
- Room chat renders a multi-VRM avatar stage (`RoomAvatarStage`) with:
  - active renderer caps (desktop 4 / mobile 2)
  - focused/streaming/recent-event prioritization
  - overflow fallback cards + WebGL/load-failure fallback UI
  - `AvatarRendererRegistry` for per-agent lip-sync routing
- Group TTS: sequential per-agent queue with per-agent `voice_id` override.
- Error retry: failed agent messages show a "Retry" button targeting only the failed agent.

## Build

```bash
npm run build
```

## Tests

```bash
npx vitest run
```

## Preferences Notes

- `tts_enabled` is sourced from backend `users.preferences` (no frontend localStorage mirror).
- `hands_free_enabled` remains locally persisted for client UX.

## Structure

```
src/
├── avatar/       # VRM rendering, animation, lip-sync, behaviors
├── components/   # UI components + debug panels (incl. rooms/)
├── games/        # Game modules + registry
├── hooks/        # useChat (unified DM+room), useVoiceChat, useGame, useSession, useLogout
├── routes/       # TanStack Router pages
├── services/     # Voice service + VAD
├── store/        # Zustand stores (app, chat [unified], render, game, stats)
├── types/        # TypeScript types (+ soulWindow payload types)
└── utils/        # API client, helpers, schemas (+ soulWindowApi)
```
