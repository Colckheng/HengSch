const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const monorepoRoot = path.resolve(__dirname, '..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
