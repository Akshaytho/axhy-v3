// metro.config.js — Expo SDK 54 + pnpm workspace monorepo
// Required so Metro can resolve packages installed at workspace root
// (e.g. react-native-web, react-dom) that are not hoisted into apps/mobile/node_modules
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Tell Metro where the monorepo root is so it can find packages there
config.watchFolders = [workspaceRoot];

// Prioritize local node_modules, then fall back to workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force react-native-web and react-dom to always resolve to the single canonical
// copy so pnpm's multiple store entries don't cause duplicate React instances.
const RNW_PATH = path.resolve(
  workspaceRoot,
  'node_modules/.pnpm/react-native-web@0.21.2_react-dom@19.1.0_react@19.1.0__react@19.1.0/node_modules/react-native-web',
);
const REACT_DOM_PATH = path.resolve(
  workspaceRoot,
  'node_modules/.pnpm/react-dom@19.1.0_react@19.1.0/node_modules/react-dom',
);
const REACT_PATH = path.resolve(
  workspaceRoot,
  'node_modules/.pnpm/react@19.1.0/node_modules/react',
);

const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Pin react-native-web to the react-dom@19 build
  if (moduleName === 'react-native-web' || moduleName.startsWith('react-native-web/')) {
    const sub = moduleName.slice('react-native-web'.length);
    return { type: 'sourceFile', filePath: require.resolve(RNW_PATH + sub) };
  }
  // Ensure react-dom always resolves to the single 19.1.0 copy
  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    const sub = moduleName.slice('react-dom'.length);
    return { type: 'sourceFile', filePath: require.resolve(REACT_DOM_PATH + sub) };
  }
  // Ensure react always resolves to the single 19.1.0 copy
  if (
    moduleName === 'react' ||
    (moduleName.startsWith('react/') && !moduleName.startsWith('react-'))
  ) {
    const sub = moduleName.slice('react'.length);
    return { type: 'sourceFile', filePath: require.resolve(REACT_PATH + sub) };
  }
  // `.js`-suffixed relative imports → `.ts`/`.tsx` fallback. The workspace
  // packages (shared-schema, ui-tokens, api-client, etc.) use NodeNext ESM
  // semantics where TS sources reference each other with `.js` extensions.
  // Node's TypeScript loader maps this automatically; Metro's stock
  // resolver does not. Without this fallback every `export * from
  // './zod/auth.js'` inside `@axhy/shared-schema` fails to bundle.
  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    const candidate = moduleName.slice(0, -3); // strip ".js"
    try {
      return context.resolveRequest(context, candidate, platform);
    } catch {
      // fall through to the normal resolution path below
    }
  }
  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
