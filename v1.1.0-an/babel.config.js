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
            '@hengsch/shared-types': path.resolve(__dirname, 'shared/shared-types'),
            '@hengsch/shared-logic': path.resolve(__dirname, 'shared/shared-logic'),
            '@hengsch/shared-storage': path.resolve(__dirname, 'shared/shared-storage'),
          },
        },
      ],
    ],
  };
};
