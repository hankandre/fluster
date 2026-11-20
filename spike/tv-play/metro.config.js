// Bundles the repo's TypeScript core (../../src/lib, ../../src/domain) unchanged.
// Its bare imports (axios, @jellyfin/sdk) resolve from this app's node_modules only.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const appRoot = __dirname;
const repoSrc = path.resolve(appRoot, "../../src");
const config = getDefaultConfig(appRoot);

config.watchFolders = [repoSrc];
config.resolver.nodeModulesPaths = [path.join(appRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
