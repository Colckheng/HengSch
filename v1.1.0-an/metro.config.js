const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@hengsch/shared-types': path.resolve(projectRoot, 'shared/shared-types'),
  '@hengsch/shared-logic': path.resolve(projectRoot, 'shared/shared-logic'),
  '@hengsch/shared-storage': path.resolve(projectRoot, 'shared/shared-storage'),
};

module.exports = config;
