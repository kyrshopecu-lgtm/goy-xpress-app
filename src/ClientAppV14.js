import React from 'react';
import {View} from 'react-native';
import ClientAppV13 from './ClientAppV13';
import ClientServiceCatalog from './ClientServiceCatalog';

// V14 conserva autenticación, solicitudes y evidencias fotográficas de V13,
// y añade el catálogo visual de los 8 servicios oficiales de GOY XPRESS.
export default function ClientAppV14(){
  return <View style={{flex:1}}><ClientAppV13/><ClientServiceCatalog/></View>;
}
