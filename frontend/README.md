# Emilia Webapp — Frontend

React + TypeScript + Vite frontend for the Emilia voice assistant.

## Stack

- **React 19** with TypeScript
- **Vite** build tooling
- **Three.js** + **@pixiv/three-vrm** for VRM avatar rendering
- **Zustand** for state management
- **TailwindCSS** for styling

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npx vitest run
```

## Structure

```
src/
├── avatar/       # VRM rendering, animation, lip-sync, behaviors
├── components/   # React UI components
├── hooks/        # Custom React hooks (useChat, useVoiceChat, etc.)
├── services/     # Voice service, audio utilities
├── store/        # Zustand stores (app, chat, render)
├── types/        # TypeScript type definitions
└── utils/        # API client, helpers
```
