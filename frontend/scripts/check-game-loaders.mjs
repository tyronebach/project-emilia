import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const manifestPath = path.join(__dirname, '..', 'dist', '.vite', 'manifest.json');

function fail(message) {
  throw new Error(`[check-game-loaders] ${message}`);
}

function collectStaticGraph(manifest, startKey, visited = new Set()) {
  if (visited.has(startKey)) return visited;
  visited.add(startKey);

  const chunk = manifest[startKey];
  if (!chunk) return visited;

  for (const imported of chunk.imports ?? []) {
    collectStaticGraph(manifest, imported, visited);
  }

  return visited;
}

function collectDynamicImports(manifest, startKey, visited = new Set(), dynamic = new Set()) {
  if (visited.has(startKey)) return dynamic;
  visited.add(startKey);

  const chunk = manifest[startKey];
  if (!chunk) return dynamic;

  for (const dynamicImport of chunk.dynamicImports ?? []) {
    dynamic.add(dynamicImport);
  }

  for (const imported of chunk.imports ?? []) {
    collectDynamicImports(manifest, imported, visited, dynamic);
  }

  return dynamic;
}

try {
  if (!fs.existsSync(manifestPath)) {
    fail(`Vite manifest missing at ${manifestPath}. Run "npm run build" first.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestEntries = Object.entries(manifest);
  const entryKeys = manifestEntries
    .filter(([, chunk]) => chunk?.isEntry)
    .map(([key]) => key);

  if (!entryKeys.length) {
    fail('No entry chunks found in build manifest.');
  }

  const staticGraph = new Set();
  const dynamicGraph = new Set();

  for (const entryKey of entryKeys) {
    for (const key of collectStaticGraph(manifest, entryKey)) {
      staticGraph.add(key);
    }
    for (const key of collectDynamicImports(manifest, entryKey)) {
      dynamicGraph.add(key);
    }
  }

  const staticallyBundledGameModules = Array.from(staticGraph).filter((key) => key.includes('src/games/modules/'));
  if (staticallyBundledGameModules.length > 0) {
    fail(
      `Game modules leaked into initial static graph: ${staticallyBundledGameModules.join(', ')}`
    );
  }

  const ticTacToeManifestKey = manifestEntries
    .map(([key]) => key)
    .find((key) => key.includes('src/games/modules/tic-tac-toe/index.ts'));

  if (!ticTacToeManifestKey) {
    fail('Tic-tac-toe module chunk not found in manifest.');
  }

  const ticTacToeChunk = manifest[ticTacToeManifestKey];
  if (!ticTacToeChunk.isDynamicEntry) {
    fail('Tic-tac-toe chunk is expected to be a dynamic entry.');
  }

  if (!dynamicGraph.has(ticTacToeManifestKey)) {
    fail('Tic-tac-toe chunk is not reachable through dynamic imports from the entry graph.');
  }

  console.log('[check-game-loaders] OK: game modules are lazily chunked and tic-tac-toe is dynamic.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
