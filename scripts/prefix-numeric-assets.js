module.exports = function prefixNumericAssets(asset) {
  if (!/^\d/.test(String(asset?.name || ''))) return asset;
  return {...asset, name:`goy_${asset.name}`};
};
