import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {isolatedServer} from '../scripts/test-server.mjs';
import * as catalog from '../dist/catalog.js';
import * as reportModule from '../dist/report.js';
import * as adminModule from '../dist/admin.js';
import * as barcodeModule from '../dist/barcode.js';

test('Staff sign-in UI uses real server sessions and removes unauthorized controls',async()=>{
 const fixture=await isolatedServer();let dom;
 try{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  dom=new JSDOM(html,{url:fixture.origin,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;let cookie='';
  const failures=[];w.addEventListener('error',event=>failures.push(event.error));
  Object.assign(w,{catalog,reportModule,adminModule,barcodeModule});w.crypto.randomUUID=randomUUID;
  w.fetch=async(path,options={})=>{const headers={...options.headers};if(cookie)headers.Cookie=cookie;if(options.method&&options.method!=='GET')headers.Origin=fixture.origin;const response=await fetch(fixture.origin+path,{...options,headers});const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return response;};
  const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
  w.eval('const {TESTS,PARAMETERS,CATALOG_NOTICE,makeDemoOrders}=window.catalog;const {REPORT_TEMPLATES,renderReport}=window.reportModule;const {adminPage,loginScreen,staffForm}=window.adminModule;const {renderBarcode}=window.barcodeModule;\n'+app);
  const $=selector=>w.document.querySelector(selector);
  async function waitFor(predicate,label){for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,15));}throw new Error('UI did not reach '+label);}
  const field=(selector,value)=>{const input=$(selector);assert(input,selector);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>$('#login-form'),'login');
  field('[name="username"]',fixture.admin.body.user.username);field('[name="password"]','wrong password');submit('#login-form');
  await waitFor(()=>$('#login-error')?.textContent,'login rejection');assert($('#login-form'));
  field('[name="password"]',fixture.password);submit('#login-form');await waitFor(()=>$('h1')?.textContent==='Report studio','authenticated workspace');
  assert($('[data-page="Team & access"]'));assert.match($('.user').textContent,/admin/);
  $('[data-page="Team & access"]').click();await waitFor(()=>$('h1')?.textContent==='Team & access','staff administration');
  $('[data-action="new-user"]').click();field('#staff-form [name="displayName"]','Fictional receptionist');field('#staff-form [name="username"]','ui.reception');field('#staff-form [name="role"]','reception');field('#staff-form [name="password"]',fixture.password);submit('#staff-form');
  await waitFor(()=>!$('#staff-form')&&w.document.body.textContent.includes('Fictional receptionist'),'staff created');
  $('[data-action="logout"]').click();await waitFor(()=>$('#login-form'),'signed out');
  field('[name="username"]','ui.reception');field('[name="password"]',fixture.password);submit('#login-form');await waitFor(()=>$('h1')?.textContent==='Report studio','reception session');
  assert(!$('[data-page="Team & access"]'));assert(!$('[data-page="Integrations"]'));assert(!$('[data-page="Audit trail"]'));
  assert([...w.document.querySelectorAll('[data-action="new-report"]')].every(button=>button.hidden),'Reception must not see direct processing shortcuts');
  $('[data-page="Settings"]').click();await waitFor(()=>$('h1')?.textContent==='Settings','readonly settings');assert($('#settings-form [name="labName"]').disabled);
  assert.equal(failures.length,0);assert.equal(w.localStorage.getItem('labflow-v1'),null,'Server clinical records are not written to browser demo storage');
 }finally{try{if(dom){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}}finally{await fixture.close();}}
});
