const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const os=require('os');
const dataFile=path.join(os.tmpdir(),`goy-xpress-v4-${process.pid}.json`);
process.env.ADMIN_EMAIL='admin@test.local';process.env.ADMIN_PASSWORD='clave-segura-test';process.env.TOKEN_SECRET='token-secret-test-32-caracteres-minimo';process.env.DATA_FILE=dataFile;process.env.DATABASE_URL='';
const handler=require('./server-v4');
async function call(method,url,{body,headers={}}={}){const req={method,url,headers:{host:'localhost',...headers},...(body!==undefined?{body}:{})};let status=0,raw='';const res={writeHead(code){status=code},end(v=''){raw+=v}};await handler(req,res);return{status,body:raw?JSON.parse(raw):{}}}
async function adminToken(){const r=await call('POST','/api/admin/login',{body:{email:'admin@test.local',password:'clave-segura-test'}});assert.equal(r.status,200);return r.body.token}

test('v4 separa cliente, mensajero y administrador con permisos',async()=>{
  try{fs.unlinkSync(dataFile)}catch{}
  const health=await call('GET','/api/health');assert.equal(health.body.version,'4.0.0');
  const admin=await adminToken();
  const invite=await call('POST','/api/admin/invites',{headers:{authorization:`Bearer ${admin}`},body:{label:'Cliente Prueba',email:'cliente@test.local',whatsapp:'0999999999'}});assert.equal(invite.status,201);
  const register=await call('POST',`/api/invite/${invite.body.token}`,{body:{name:'Cliente Prueba',whatsapp:'0999999999',address:'Quito',contactPhone:'0999999999',documentId:'1712345678',email:'cliente@test.local'}});assert.equal(register.status,201);assert.ok(register.body.token);
  const login=await call('POST','/api/client/login',{body:{whatsapp:'0999999999',documentId:'1712345678',email:'cliente@test.local'}});assert.equal(login.status,200);
  const clientHeaders={authorization:`Bearer ${login.body.token}`,'x-client-id':login.body.client.id};
  const request=await call('POST','/api/client/requests',{headers:clientHeaders,body:{code:'SHP-V4-001',kind:'shipment',baseServiceCost:3,serviceCost:3,totalToCollect:20,destinationAddress:'Mariana de Jesús'}});assert.equal(request.status,201);assert.equal(request.body.request.clientId,login.body.client.id);assert.equal(request.body.request.gps,undefined);
  const courier=await call('POST','/api/admin/couriers',{headers:{authorization:`Bearer ${admin}`},body:{name:'Mensajero Uno',phone:'0988888888',username:'mensajero1',password:'ClaveSegura1'}});assert.equal(courier.status,201);assert.ok(courier.body.id);assert.equal(courier.body.passwordHash,undefined);
  const assign=await call('PATCH','/api/admin/requests/SHP-V4-001',{headers:{authorization:`Bearer ${admin}`},body:{courierId:courier.body.id}});assert.equal(assign.status,200);assert.equal(assign.body.status,'Asignado');assert.equal(assign.body.courier,'Mensajero Uno');
  const cLogin=await call('POST','/api/courier/login',{body:{username:'mensajero1',password:'ClaveSegura1'}});assert.equal(cLogin.status,200);assert.ok(cLogin.body.token);
  const jobs=await call('GET','/api/courier/jobs',{headers:{authorization:`Bearer ${cLogin.body.token}`}});assert.equal(jobs.status,200);assert.equal(jobs.body.jobs.length,1);assert.equal(jobs.body.jobs[0].code,'SHP-V4-001');
  const pickup=await call('POST','/api/courier/jobs/SHP-V4-001/pickup',{headers:{authorization:`Bearer ${cLogin.body.token}`},body:{photo:'data:image/jpeg;base64,AAA'}});assert.equal(pickup.status,200);assert.equal(pickup.body.job.status,'Recogido');
  const location=await call('POST','/api/courier/jobs/SHP-V4-001/location',{headers:{authorization:`Bearer ${cLogin.body.token}`},body:{latitude:-0.18,longitude:-78.47,accuracy:7}});assert.equal(location.status,200);assert.equal(location.body.job.status,'En camino');
  const wait11=await call('POST','/api/courier/jobs/SHP-V4-001/wait',{headers:{authorization:`Bearer ${cLogin.body.token}`},body:{elapsedMinutes:11}});assert.equal(wait11.body.job.wait.extraCost,0.1);assert.equal(wait11.body.job.serviceCost,3.1);
  const delivery=await call('POST','/api/courier/jobs/SHP-V4-001/delivery',{headers:{authorization:`Bearer ${cLogin.body.token}`},body:{photo:'data:image/jpeg;base64,BBB'}});assert.equal(delivery.status,200);assert.equal(delivery.body.job.status,'Entrega finalizada');
  const deposit=await call('POST','/api/courier/jobs/SHP-V4-001/deposit-evidence',{headers:{authorization:`Bearer ${cLogin.body.token}`},body:{photo:'data:image/jpeg;base64,CCC',amount:20}});assert.equal(deposit.status,200);
  const release=await call('POST','/api/admin/requests/SHP-V4-001/release-wallet',{headers:{authorization:`Bearer ${admin}`}});assert.equal(release.status,200);assert.equal(release.body.wallet.released,true);
  const clientList=await call('GET','/api/client/requests',{headers:clientHeaders});assert.equal(clientList.status,200);assert.equal(clientList.body.requests[0].gps,undefined);assert.equal(clientList.body.requests[0].status,'Entrega finalizada');
  const otherCourier=await call('POST','/api/admin/couriers',{headers:{authorization:`Bearer ${admin}`},body:{name:'Mensajero Dos',phone:'0977777777',username:'mensajero2',password:'ClaveSegura2'}});assert.equal(otherCourier.status,201);
  const otherLogin=await call('POST','/api/courier/login',{body:{username:'mensajero2',password:'ClaveSegura2'}});const forbidden=await call('GET','/api/courier/jobs/SHP-V4-001',{headers:{authorization:`Bearer ${otherLogin.body.token}`}});assert.equal(forbidden.status,404);
  try{fs.unlinkSync(dataFile)}catch{}
});
