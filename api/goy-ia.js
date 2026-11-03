'use strict';
const {createHandler,createPersistentStore,envConfig,verifyToken,bearerToken}=require('../server/server-v5');
const {createSalesApi}=require('../server/sales-assistant-api');
const config=envConfig();
const store=createPersistentStore(config);
const handler=createSalesApi({store,authorize:req=>{const p=verifyToken(bearerToken(req),config.tokenSecret);return Boolean(p&&p.role==='admin');}});
module.exports=handler;