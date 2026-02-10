# Emilia Webapp — Frontend

React + TypeScript + Vite frontend for the Emilia VRM avatar chat app.

## Stack

- React 19 + TypeScript
- Vite (HTTPS dev server on `:3443`)
- TanStack Router
- Zustand for client state
- React Query for server state
- Three.js + @pixiv/three-vrm for VRM rendering
- Tailwind CSS v4 + Radix UI

## Development

```bash
npm install
npm run dev -- --host
```

Optional flag override for local frontend:

```bash
VITE_GAMES_V2_ENABLED=1 npm run dev -- --host
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

## Structure

```
src/
├── avatar/       # VRM rendering, animation, lip-sync, behaviors
├── components/   # UI components + debug panels
├── games/        # Game modules + registry
├── hooks/        # useChat, useVoiceChat, useGame, useSession
├── routes/       # TanStack Router pages
├── services/     # Voice service + VAD
├── store/        # Zustand stores (app, chat, render, game, stats)
├── types/        # TypeScript types
└── utils/        # API client, helpers, schemas
```
