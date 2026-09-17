'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProspect,classifyService,processInbound,canSendOutbound,firstContact,scheduleFollowUp}=require('./sales-assistant');

test('classifies current GOY XPRESS services',()=>{
  assert.equal(classifyService('Necesito apostillar un documento').id,'apostille');
  assert.equal(classifyService('Quiero hacer la revisión vehicular de mi auto').id,'vehicle');
  assert.equal(classifyService('Soy abogado y debo ingresar un escrito en la judicatura').id,'legal');
});

test('requires consent before proactive outbound',()=>{
  const p=createProspect({name:'Ana',phone:'+593 999 111 222',consent:false});
  assert.equal(canSendOutbound(p),false);
  assert.equal(scheduleFollowUp(p).nextFollowUpAt,null);
});

test('opt out permanently stops commercial follow-up',()=>{
  const p=createProspect({name:'Ana',phone:'0999111222',consent:true});
  const result=processInbound(p,'Por favor no me escriban más');
  assert.equal(result.action,'opt_out');
  assert.equal(result.prospect.optedOut,true);
  assert.equal(canSendOutbound(result.prospect),false);
});

test('meeting intent moves prospect to interested',()=>{
  const p=createProspect({name:'Carlos',phone:'0999111222',consent:true});
  const result=processInbound(p,'Me interesa, podemos tener una videollamada?');
  assert.equal(result.action,'offer_meeting');
  assert.equal(result.prospect.status,'Interesado');
});

test('first contact identifies GOY XPRESS without pretending to be human',()=>{
  const p=createProspect({name:'Luis Octavio',phone:'0999111222',consent:true});
  assert.match(firstContact(p),/asistente virtual de GOY XPRESS/i);
});
