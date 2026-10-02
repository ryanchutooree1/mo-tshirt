// Synthetic saved-enquiry UI only. The fetch double denies every mailbox route.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://synthetic.example.test/admin/quotation-approval'});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Element','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])global[key]=dom.window[key];
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
const {render,screen,fireEvent,act,cleanup,waitFor}=require('@testing-library/react');
const model={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/email-intake-model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:model});
let requests=[],nextResponse=null,gate=null;
const base={id:'gmail-synthetic',threadId:'synthetic',version:'a'.repeat(24),updatedAtIso:'2026-10-02T00:00:00Z',lastReplyAt:'2026-10-02T00:00:00Z',classification:'enquiry',confidence:1,language:'en',summary:'Synthetic polos',status:'needs_details',email:'client@synthetic.example.test',subject:'Synthetic polos',originalText:'Synthetic request',attachmentNames:[],missing:[],warnings:[],lastMessage:{id:'message'},draft:{name:'Synthetic Client',email:'client@synthetic.example.test',phone:'55555555',company:'',address:'',brn:'',vat:'',deadline:'2026-12-01',printMethod:'DTF',delivery:'Collection',notes:'Test instructions',lines:[]},items:[{product:'Polo',quantity:20,colour:'Navy',sizes:'',printMethod:'DTF',placement:'Front 10cm',artwork:'Client logo'}]};
const fetch=async(url,options)=>{
 assert.equal(url,'/api/admin/print-jobs/intakes/gmail-synthetic');assert.equal(options.method,'PATCH');const body=JSON.parse(options.body);requests.push(body);if(gate)await gate;
 if(nextResponse){const result=nextResponse;nextResponse=null;return result;}
 if(body.action==='promote')return Response.json({ok:true,quoteId:'gmail-synthetic'});
 return Response.json({ok:true,intake:{...base,draft:body.draft,items:body.items,version:base.version,updatedAtIso:'2026-10-02T01:00:00Z'}});
};
const production={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/email-enquiry-production.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:production});
const moduleObj={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/admin/print-jobs/WorkspaceEnquiryEditor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports:moduleObj.exports,module:moduleObj,require:name=>name==='@/lib/email-intake-model'?model:name==='@/lib/email-enquiry-production'?production:require(name),fetch,console});
const Editor=moduleObj.exports.default;
const click=async node=>act(async()=>fireEvent.click(node));
const change=async(node,value)=>act(async()=>fireEvent.change(node,{target:{value}}));
let passed=0;
async function test(name,fn){requests=[];nextResponse=null;gate=null;try{await fn();passed++;console.log('PASS '+name);}finally{cleanup();}}
(async()=>{
 await test('missing production detail blocks quote; saved correction enables promotion with same enquiry ID',async()=>{
  const opened=[],dirty=[];let updates=0;
  render(React.createElement(Editor,{intake:base,onUpdated:async()=>{updates++;},onDirtyChange:v=>dirty.push(v),onOpenQuote:id=>opened.push(id)}));
  assert.equal(screen.getByRole('button',{name:'Create quotation'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Save enquiry details'}).disabled,true);
  await change(screen.getByLabelText('Size (one size per row)'),'L × 20');assert.equal(dirty.at(-1),true);assert.equal(screen.getByRole('button',{name:'Create quotation'}).disabled,false);
  await click(screen.getByRole('button',{name:'Create quotation'}));assert.equal(requests.length,1);assert.equal(requests[0].action,'promote');assert.equal(requests[0].items[0].sizes,'L × 20');assert.deepEqual(opened,['gmail-synthetic']);assert.equal(updates,1);
 });
 await test('incomplete corrections save without promotion and display no-send result',async()=>{
  const dirty=[];render(React.createElement(Editor,{intake:base,onUpdated:async()=>{},onDirtyChange:value=>dirty.push(value)}));
  await change(screen.getByLabelText('Client name'),'Corrected Client');await act(async()=>fireEvent.submit(screen.getByRole('form',{name:'Correct saved enquiry'})));
  assert.equal(requests[0].action,'save');assert.equal(requests[0].draft.name,'Corrected Client');assert.equal(requests[0].items[0].sizes,'');assert.ok(screen.getByText('Enquiry details saved. No message was sent.'));assert.equal(screen.getByLabelText('Client name').value,'Corrected Client');assert.equal(screen.getByRole('button',{name:'Create quotation'}).disabled,true);
 });
 await test('conflict retains edits; failed save never opens a quotation',async()=>{
  const opened=[];render(React.createElement(Editor,{intake:base,onUpdated:async()=>{},onOpenQuote:id=>opened.push(id)}));
  await change(screen.getByLabelText('Size (one size per row)'),'XL × 20');nextResponse=Response.json({error:'This enquiry changed. Reload it.'},{status:409});
  await click(screen.getByRole('button',{name:'Create quotation'}));assert.match(screen.getByRole('alert').textContent,/enquiry changed/);assert.equal(screen.getByLabelText('Size (one size per row)').value,'XL × 20');assert.equal(opened.length,0);
 });
 await test('in-flight save blocks duplicate submit and changing production fields',async()=>{
  let resolve;gate=new Promise(done=>resolve=done);render(React.createElement(Editor,{intake:base,onUpdated:async()=>{}}));await change(screen.getByLabelText('Client name'),'Corrected');
  await act(async()=>{fireEvent.submit(screen.getByRole('form',{name:'Correct saved enquiry'}));fireEvent.submit(screen.getByRole('form',{name:'Correct saved enquiry'}));});
  assert.equal(requests.length,1);assert.equal(screen.getByRole('button',{name:'Create quotation'}).disabled,true);assert.equal(screen.getByLabelText('Client name').closest('fieldset').disabled,true);
  await act(async()=>resolve());await waitFor(()=>assert.ok(screen.getByText('Enquiry details saved. No message was sent.')));
 });
 console.log(`${passed} SAVED ENQUIRY UI TESTS PASSED`);dom.window.close();
})().catch(error=>{console.error(error);cleanup();dom.window.close();process.exitCode=1;});
