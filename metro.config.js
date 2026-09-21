const {getDefaultConfig} = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.transformer.assetPlugins = [
  ...(config.transformer.assetPlugins || []),
  require.resolve('./scripts/prefix-numeric-assets.js'),
];

module.exports = config;
