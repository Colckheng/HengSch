const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@hengsch/shared-types': path.resolve(__dirname, 'shared/shared-types/index.ts'),
            '@hengsch/shared-logic': path.resolve(__dirname, 'shared/shared-logic/index.ts'),
            '@hengsch/shared-storage': path.resolve(__dirname, 'shared/shared-storage/index.ts'),
          },
        },
      ],
    ],
  };
};
