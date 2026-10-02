const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const cache=new Map();
function domain(name){
 if(cache.has(name))return cache.get(name);
 const exports={};cache.set(name,exports);
 vm.runInNewContext(compile(`src/lib/${name}.ts`),{exports,require:n=>n.startsWith('node:')?require(n):domain(n.replace(/^\.\//,'').replace(/\.ts$/,'')),Date,Intl,URL});return exports;
}
const access=domain('admin-access');
const role=domain('production-manager-auth');
const allowed=role.PRODUCTION_MANAGER_ALLOWED_PAGES;
const sample={id:'gmail-thread',threadId:'thread',version:'a'.repeat(24),updatedAtIso:'2026-10-01T00:00:00Z',lastReplyAt:'2026-10-01T00:00:00Z',classification:'enquiry',confidence:1,language:'en',summary:'Synthetic shirts',status:'needs_details',email:'client@example.test',subject:'Shirts',originalText:'Synthetic client request',attachmentNames:['logo.png'],missing:[],warnings:[],lastMessage:{id:'message',threadId:'thread',subject:'Shirts',from:'client@example.test',to:'shop@example.test',date:'2026-10-01',text:'Synthetic client request',snippet:'',unread:false},draft:{name:'Client',email:'client@example.test',phone:'55555555',company:'',address:'',brn:'',vat:'',deadline:'2026-12-01',printMethod:'DTF',delivery:'Collection',notes:'Client instructions',lines:[]},items:[{product:'Polo',quantity:20,colour:'Navy',sizes:'L × 20',printMethod:'DTF',placement:'Front 10cm',artwork:'logo.png'}]};
function setup({session={userId:'production-manager',displayName:'Tanvi',email:'',allowedPages:allowed,isOwner:false},records:initial={'emailIntake/gmail-thread':structuredClone(sample)}}={}){
 const records=new Map(Object.entries(initial)),reads=[],writes=[];
 const snap=ref=>({exists:()=>records.has(ref),data:()=>records.get(ref)});
 const set=(ref,value,opts)=>{writes.push({ref,value});records.set(ref,opts?.merge?{...records.get(ref),...value}:value);};
 let forbidden=0;
 const fail=()=>{forbidden++;throw new Error('Mailbox access is forbidden in these tests');};
 const modules={
  'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts)}},
  'firebase/firestore':{doc:(_db,c,id)=>`${c}/${id}`,serverTimestamp:()=>123,runTransaction:async(_db,fn)=>fn({get:async ref=>{reads.push(ref);return snap(ref);},set,update:(ref,value)=>set(ref,value,{merge:true})})},
  '@/lib/firebase':{db:{}},
  '@/lib/admin-request':{getAdminRequestSession:async()=>session,isAdminRequest:async path=>Boolean(session&&access.hasAdminApiAccess(session.allowedPages,path,session))},
  '@/lib/admin-access':access,
  '@/lib/email-quote':domain('email-quote'),
  '@/lib/email-intake-model':domain('email-intake-model'),
  '@/lib/email-enquiry-production':domain('email-enquiry-production'),
  '@/lib/print-job-workspace-access':domain('print-job-workspace-access'),
  '@/lib/request-safety':{isRequestOriginAllowed:r=>!r.headers.get('origin')||r.headers.get('origin')===new URL(r.url).origin,isContentLengthWithinLimit:(h,max)=>!h.get('content-length')||Number(h.get('content-length'))<=max},
  '@/lib/email-intake':{listEmailIntake:fail,syncEmailIntake:fail,sendIntakeQuestions:fail},
  '@/lib/gmail-connection-store':{readSavedGmailConnection:fail,getSavedGmailToken:fail},
  '@/lib/gmail-inbox':{listInbox:fail,readInboxMessage:fail,InboxError:Error},
 };
 const load=file=>{const exports={};vm.runInNewContext(compile(file),{exports,require:n=>{if(!modules[n])throw new Error(n);return modules[n];},Date,TextDecoder,console,Buffer});return exports;};
 const route=load('app/api/admin/print-jobs/intakes/[id]/route.ts');
 const send=({id='gmail-thread',body={},origin='https://site.test',headers={},raw}={})=>route.PATCH(new Request(`https://site.test/api/admin/print-jobs/intakes/${id}`,{method:'PATCH',headers:{origin,'content-type':'application/json',...headers},body:raw===undefined?JSON.stringify({action:'save',version:sample.version,updatedAtIso:sample.updatedAtIso,draft:sample.draft,items:sample.items,...body}):raw}),{params:Promise.resolve({id})});
 return {records,reads,writes,send,load,get forbidden(){return forbidden;}};
}
test('built-in Tanvi lands on the new workspace without broad inbox, finance or order grants',()=>{
 assert.equal(role.PRODUCTION_MANAGER_PATH,'/admin/quotation-approval');assert.equal(access.getAdminLandingPath(allowed),'/admin/quotation-approval');assert.equal(access.canUseProductionWorkspace(allowed),true);
 for(const path of ['/admin/inbox','/admin/orders','/admin/accounting','/admin/finance','/admin/settings'])assert.equal(access.hasAdminPageAccess(allowed,path),false,path);
 for(const path of ['/api/admin/inbox','/api/admin/inbox/intake','/api/admin/inbox/quote','/api/admin/inbox/oauth','/api/admin/orders/o','/api/admin/settings'])assert.equal(access.hasAdminApiAccess(allowed,path),false,path);
 assert.equal(access.canUseProductionWorkspace(['/admin/quotation-approval']),false);
 const login=fs.readFileSync('app/login/page.tsx','utf8');assert.match(login,/candidate\.path === "\/admin\/quotation-approval"/);
 const chrome=fs.readFileSync('src/components/AdminChrome.tsx','utf8');assert.match(chrome,/path === "\/admin\/tanvi" \? "\/admin\/quotation-approval"/);
});
test('actual broad inbox read, sync, ask and arbitrary Gmail import handlers reject Tanvi before I/O',async()=>{
 const s=setup();const request=new Request('https://site.test/api/admin/inbox',{method:'GET'});request.nextUrl=new URL(request.url);
 assert.equal((await s.load('app/api/admin/inbox/route.ts').GET(request)).status,401);
 const intake=s.load('app/api/admin/inbox/intake/route.ts');assert.equal((await intake.GET()).status,403);
 for(const action of ['sync','ask'])assert.equal((await intake.POST(new Request('https://site.test/api/admin/inbox/intake',{method:'POST',body:JSON.stringify({action,id:'gmail-thread',version:sample.version})}))).status,403);
 assert.equal((await s.load('app/api/admin/inbox/quote/route.ts').POST(new Request('https://site.test/api/admin/inbox/quote',{method:'POST',body:JSON.stringify({id:'arbitrary-message',action:'create',draft:sample.draft})}))).status,403);
 assert.equal(s.forbidden,0);assert.equal(s.reads.length,0);assert.equal(s.writes.length,0);
});
test('saved enquiry route requires the scoped role and signed-in session',async()=>{
 for(const session of [null,{userId:'quote-only',allowedPages:['/admin/quotation-approval'],isOwner:false},{userId:'inbox-only',allowedPages:['/admin/inbox'],isOwner:false}]){
  const s=setup({session});assert.equal((await s.send()).status,session?403:401);assert.equal(s.reads.length,0);
 }
});
test('Tanvi saves incomplete operational details without creating a quote or changing send state',async()=>{
 const initial={...structuredClone(sample),sendState:'sent',sentVersion:sample.version,outboundMessageId:'keep-sent-id'};
 const s=setup({records:{'emailIntake/gmail-thread':initial}});const response=await s.send({body:{draft:{...sample.draft,phone:''},items:[{...sample.items[0],sizes:''}]}});assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.intake.status,'needs_details');assert.equal(result.intake.missing.length,2);assert.equal(result.intake.outboundMessageId,undefined);
 assert.equal(s.records.has('quotes/gmail-thread'),false);assert.equal(s.records.get('emailIntake/gmail-thread').sendState,'sent');assert.equal(s.records.get('emailIntake/gmail-thread').outboundMessageId,'keep-sent-id');
 assert.deepEqual(Object.keys(s.writes[0].value).sort(),['classification','draft','items','missing','status','updatedAtIso']);assert.equal(s.forbidden,0);
});
test('incomplete promotion is rejected and corrections promote one canonical quote with blank prices',async()=>{
 const s=setup();assert.equal((await s.send({body:{action:'promote',items:[{...sample.items[0],sizes:''}]}})).status,400);assert.equal(s.writes.length,0);
 const response=await s.send({body:{action:'promote',items:[{...sample.items[0],quantity:25,sizes:'L × 25'}]}});assert.equal(response.status,200);assert.equal((await response.json()).quoteId,'gmail-thread');
 const quote=s.records.get('quotes/gmail-thread');assert.equal(quote.quote.lines[0].quantity,25);assert.match(quote.quote.lines[0].description,/L × 25/);assert.equal(quote.quote.lines[0].unitPrice,'');assert.equal(quote.quote.total,0);assert.equal(quote.status,'review');assert.equal(quote.emailImport.originalText,sample.originalText);assert.equal(s.records.get('emailIntake/gmail-thread').status,'ready');
 const before=s.writes.length;const retry=await(await s.send({body:{action:'promote'}})).json();assert.equal(retry.existing,true);assert.equal(s.writes.length,before);assert.equal(s.forbidden,0);
});
test('enquiry corrections reject stale versions, unknown financial fields and mailbox actions',async()=>{
 const attempts=[{body:{version:'stale'}},{body:{updatedAtIso:'old'}},{body:{amountReceived:100}},{body:{action:'ask'}},{body:{action:'sync'}},{body:{draft:{...sample.draft,paymentStatus:'Paid'}}},{body:{draft:{...sample.draft,lines:[{description:'Polo',quantity:20,unitPrice:999}]}}},{body:{items:[{...sample.items[0],cost:20}]}},{id:'../secret'},{origin:'https://evil.test'},{headers:{'content-length':'102401'}},{headers:{'content-type':'text/plain'}},{raw:'{'},{raw:JSON.stringify({notes:'x'.repeat(103000)})}];
 for(const args of attempts){const s=setup();assert.ok([400,403,409,413,415].includes((await s.send(args)).status),JSON.stringify(args).slice(0,200));assert.equal(s.writes.length,0);}
 const s=setup();const saved=await(await s.send()).json();assert.notEqual(saved.intake.updatedAtIso,sample.updatedAtIso);assert.equal((await s.send()).status,409);
});
test('saved intake capability cannot target arbitrary mailbox messages or ignored non-enquiries',async()=>{
 for(const records of [{},{'emailIntake/gmail-thread':{...sample,classification:'other'}},{'emailIntake/gmail-thread':{...sample,status:'ignored'}},{'emailIntake/gmail-thread':{...sample,threadId:'other'}}]){const s=setup({records});assert.ok([404,409].includes((await s.send()).status));assert.equal(s.writes.length,0);}
});


test('promoted enquiry carries exact reviewed garment rows into the production packet',async()=>{
 const s=setup();const items=[{...sample.items[0],quantity:2,sizes:'M × 2'},{...sample.items[0],quantity:3,sizes:'L',colour:'White'}];
 assert.equal((await s.send({body:{action:'promote',items}})).status,200);
 const packet=domain('production-packet').buildProductionPacket('gmail-thread',s.records.get('quotes/gmail-thread'));
 assert.deepEqual(JSON.parse(JSON.stringify(packet.products)),[{product:'Polo',color:'Navy',size:'M',quantity:2},{product:'Polo',color:'White',size:'L',quantity:3}]);
 assert.equal(packet.quantity,5);assert.equal(domain('production-packet').productionPacketReadiness(packet).blockers.some(b=>b.includes('each product')),false);
});

test('mixed or conflicting size counts stay incomplete instead of inventing production quantities',async()=>{
 for(const sizes of ['M × 2, L × 18','M/L','Mixed','M × 2','M and L']){
  const s=setup();assert.equal((await s.send({body:{action:'promote',items:[{...sample.items[0],quantity:20,sizes}]}})).status,400,sizes);assert.equal(s.writes.length,0);
  assert.equal((await s.send({body:{action:'save',items:[{...sample.items[0],quantity:20,sizes}]}})).status,200,sizes);assert.equal(s.records.has('quotes/gmail-thread'),false);
 }
});
