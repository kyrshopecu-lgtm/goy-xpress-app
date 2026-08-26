const variant = String(process.env.GOY_APP_VARIANT || process.env.EXPO_PUBLIC_GOY_APP_VARIANT || 'client').toLowerCase();
const courier = variant === 'courier';
module.exports = {
  expo: {
    name: courier ? 'GOY XPRESS Mensajero' : 'GOY XPRESS Cliente',
    slug: courier ? 'goy-xpress-mensajero' : 'goy-xpress-cliente',
    version: '4.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {image:'./assets/splash-icon.png',resizeMode:'contain',backgroundColor:'#0B2F40'},
    assetBundlePatterns:['**/*'],
    android: {
      package: courier ? 'com.goyxpress.mensajero' : 'com.goyxpress.cliente',
      versionCode: 1,
      adaptiveIcon:{foregroundImage:'./assets/adaptive-icon.png',backgroundColor:'#0B2F40'},
      permissions: courier ? ['CAMERA','ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION'] : [],
    },
    ios:{bundleIdentifier:courier?'com.goyxpress.mensajero':'com.goyxpress.cliente',supportsTablet:true},
    extra:{appVariant:variant,apiBaseUrl:process.env.EXPO_PUBLIC_GOY_API_URL || 'https://goy-xpress-admin.vercel.app/api'},
  },
};
