import {registerRootComponent} from 'expo';
import ClientOnlyApp from './src/ClientOnlyApp';
import CourierOnlyApp from './src/CourierOnlyApp';

const variant = String(process.env.EXPO_PUBLIC_GOY_APP_VARIANT || 'client').toLowerCase();
registerRootComponent(variant === 'courier' ? CourierOnlyApp : ClientOnlyApp);
