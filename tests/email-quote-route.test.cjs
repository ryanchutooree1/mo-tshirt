const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup({allowed=['/admin/inbox','/admin/quotation-approval'],subject='Order enquiry',race=false}={}) {
 const records=new Map(); let reads=0;
 const emailExports={};vm.runInNewContext(transpile('src/lib/email-quote.ts'),{exports:emailExports,Date});
 const message={id:'abc',threadId:'thread',from:'Client <client@example.com>',to:'motshirtmauritius@gmail.com',subject,date:'today',snippet:'',text:'Please quote 20 polos.'};
 const snap=ref=>({exists:()=>records.has(ref)});
 const modules={
 'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
 'firebase/firestore':{doc:(_db,c,id)=>c+'/'+id,getDoc:async ref=>{reads++;return snap(ref);},serverTimestamp:()=>123,runTransaction:async(_db,fn)=>{if(race) records.set('quotes/gmail-thread',{name:'Already saved'});return fn({get:async ref=>snap(ref),set:(ref,value)=>records.set(ref,value)});}},
 '@/lib/firebase':{db:{}},
 '@/lib/admin-request':{getAdminRequestSession:async()=>({userId:'owner',allowedPages:allowed,isOwner:false})},
 '@/lib/admin-access':{hasAdminPageAccess:(pages,path)=>pages.includes(path)},
 '@/lib/gmail-inbox':{readInboxMessage:async()=>message,InboxError:class extends Error{}},
 '@/lib/email-quote':emailExports,
 '@/lib/request-safety':{isRequestOriginAllowed:request=>request.headers.get('origin')==='https://site.test',isContentLengthWithinLimit:()=>true},
 };
 const exports={};vm.runInNewContext(transpile('app/api/admin/inbox/quote/route.ts'),{exports,require:name=>{if(!modules[name])throw new Error(name);return modules[name];},Buffer});
 const send=(action,draft,origin='https://site.test')=>exports.POST(new Request('https://site.test/api/admin/inbox/quote',{method:'POST',headers:{origin},body:JSON.stringify({id:'abc',action,draft})}));
 return {records,send,get reads(){return reads;}};
}
test('both inbox and quote permissions are required before reading any email',async()=>{
 for(const allowed of [[],['/admin/inbox'],['/admin/quotation-approval']]) {const s=setup({allowed});assert.equal((await s.send('preview')).status,403);assert.equal(s.reads,0);}
});
test('cross-origin writes and website copies are rejected',async()=>{
 assert.equal((await setup().send('preview',null,'https://other.test')).status,403);
 const s=setup({subject:'New Website Quotation from Client'});assert.equal((await s.send('preview')).status,409);assert.equal(s.records.size,0);
});
test('preview is read-only; creation writes a review draft once',async()=>{
 const s=setup(); const preview=await (await s.send('preview')).json();assert.equal(s.records.size,0);
 const created=await (await s.send('create',preview.draft)).json();assert.equal(created.quoteId,'gmail-thread');assert.equal(s.records.size,1);
 const record=s.records.get('quotes/gmail-thread');assert.equal(record.status,'review');assert.equal(record.createdAt,123);assert.equal(record.quote.lines[0].unitPrice,'');
 const second=await (await s.send('create',preview.draft)).json();assert.equal(second.existing,true);assert.equal(s.records.size,1);
});
test('transaction does not overwrite a draft created between preview and save',async()=>{
 const s=setup({race:true});const preview=await (await s.send('preview')).json();const result=await (await s.send('create',preview.draft)).json();assert.equal(result.existing,true);assert.equal(s.records.get('quotes/gmail-thread').name,'Already saved');
});
test('missing client details do not create a quote',async()=>{
 const s=setup();assert.equal((await s.send('create',{name:'',email:'invalid',lines:[]})).status,400);assert.equal(s.records.size,0);
});
