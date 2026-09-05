const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/tracking-insights.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, filename);
const {summarizeJourney,trafficSources,isLocalTrackingHost,isConvertedOrder}=loaded.exports;
const now=Date.parse('2026-09-05T18:00:00Z');
const event=(name,id,minutes,params={})=>({name,sessionId:'session',createdAt:new Date(now-minutes*60000),params:{attempt_id:id,flow:'design',...params}});
test('counts attempts once and separates completed, inactive and active designs',()=>{
 const summary=summarizeJourney([
 event('design_start','a',60),event('design_start','a',59),event('design_progress','a',40,{step:'Artwork'}),
 event('design_start','b',60),event('generate_lead','b',45),event('generate_lead','b',44),
 event('design_start','c',5), event('whatsapp_click','a',1,{flow:undefined}),
 ],'design',now);
 assert.deepEqual(summary,{started:3,completed:1,abandoned:1,active:1,steps:[{label:'Artwork',count:1}]});
});
test('a delayed completion replaces abandonment and missing-start legacy events do not inflate rates',()=>{
 const summary=summarizeJourney([event('design_start','a',60),event('generate_lead','a',1),event('generate_lead','legacy',1)],'design',now);
 assert.equal(summary.completed,1);assert.equal(summary.abandoned,0);assert.equal(summary.started,1);
});
test('quote and design attempts are separate and WhatsApp is never a completion',()=>{
 const summary=summarizeJourney([event('quote_start','q',60,{flow:'quote'}),event('whatsapp_click','q',50,{flow:'quote'}),event('generate_lead','d',40)],'quote',now);
 assert.equal(summary.started,1);assert.equal(summary.completed,0);
});
test('traffic counts unique sessions using earliest attribution, keeping legacy unknown',()=>{
 const rows=trafficSources([event('page_view','a',2,{traffic_source:'instagram'}),event('page_view','a',5,{traffic_source:'google'}),{...event('page_view','b',5),sessionId:'other'}]);
 assert.deepEqual(rows,[{label:'google',count:1},{label:'Unknown (older event)',count:1}]);
});
test('excludes local development hostnames without matching production domains',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]','test.localhost'])assert.equal(isLocalTrackingHost(host),true);
 assert.equal(isLocalTrackingHost('www.mo-tshirt.mu'),false);
});
test('cancelled, rejected and draft orders do not count as sales',()=>{
 for(const status of ['Cancelled','canceled','Rejected','Draft'])assert.equal(isConvertedOrder({status}),false);
 assert.equal(isConvertedOrder({status:'In Process'}),true);
});

test('browser tracking suppresses localhost and keeps the original campaign source across page changes', async()=>{
 const sent=[];const storage=new Map();
 const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const location={hostname:'localhost',pathname:'/',search:'?utm_source=instagram&utm_campaign=uniforms',origin:'http://localhost:3001'};
 const old={window:global.window,document:global.document,sessionStorage:global.sessionStorage,location:global.location,fetch:global.fetch};
 global.window={location,sessionStorage:store,gtag:()=>{}};global.document={referrer:'https://www.google.com/'};global.sessionStorage=store;global.location=location;
 global.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true};};
 try {
  const analyticsFile=path.resolve(__dirname,'../src/lib/analytics.ts');const analytics=new Module(analyticsFile,module);
  analytics.require=(id)=>id==='@/lib/tracking-insights'?loaded.exports:require(id);
  analytics._compile(ts.transpileModule(fs.readFileSync(analyticsFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,analyticsFile);
  analytics.exports.trackEvent('quote_start');assert.equal(sent.length,0);
  location.hostname='www.mo-tshirt.mu';location.origin='https://www.mo-tshirt.mu';
  analytics.exports.trackWhatsAppClick({location:'home_hero'});
  location.search='?utm_source=google';analytics.exports.trackProductInterest('polo','Polo');analytics.exports.trackProductInterest('polo','Polo');
  assert.equal(sent.length,2);assert.equal(sent[0].name,'whatsapp_click');assert.equal(sent[0].params.traffic_source,'instagram');assert.equal(sent[1].params.traffic_source,'instagram');assert.equal(sent[1].name,'product_interest');
  location.pathname='/admin/design-studio';analytics.exports.trackEvent('design_start');assert.equal(sent.length,2);
 } finally {Object.assign(global,old);}
});
