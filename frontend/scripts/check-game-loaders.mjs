import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const manifestPath = path.join(__dirname, '..', 'dist', '.vite', 'manifest.json');
const modulesPath = path.join(__dirname, '..', 'src', 'games', 'modules');

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

  const manifestKeys = manifestEntries.map(([key]) => key);

  const moduleFolders = fs
    .readdirSync(modulesPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const moduleFolder of moduleFolders) {
    const moduleManifestKey = manifestKeys.find(
      (key) => key.includes(`src/games/modules/${moduleFolder}/index.ts`)
    );

    if (!moduleManifestKey) {
      fail(`Game module chunk not found for "${moduleFolder}".`);
    }

    const moduleChunk = manifest[moduleManifestKey];
    if (!moduleChunk.isDynamicEntry) {
      fail(`Game module "${moduleFolder}" is expected to be a dynamic entry.`);
    }

    if (!dynamicGraph.has(moduleManifestKey)) {
      fail(`Game module "${moduleFolder}" is not reachable through dynamic imports from the entry graph.`);
    }
  }

  console.log('[check-game-loaders] OK: game modules are lazily chunked and dynamically reachable.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
