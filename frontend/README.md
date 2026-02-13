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

## Group Rooms

- Room list: `/user/:userId/rooms`
- Room chat: `/user/:userId/rooms/:roomId`
- APIs used: `/api/rooms/*` (`getRooms`, `createRoom`, `getRoomHistory`, `streamRoomChat`)
- Room chat renders a multi-VRM avatar stage (`RoomAvatarStage`) with:
  - active renderer caps (desktop 4 / mobile 2)
  - focused/streaming/recent-event prioritization
  - overflow fallback cards + WebGL/load-failure fallback UI

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
├── hooks/        # useChat, useVoiceChat, useGame, useSession, useRoomChat, useLogout
├── routes/       # TanStack Router pages
├── services/     # Voice service + VAD
├── store/        # Zustand stores (app, chat, room, render, game, stats)
├── types/        # TypeScript types (+ soulWindow payload types)
└── utils/        # API client, helpers, schemas (+ soulWindowApi)
```
