const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const domain={};const inbox={};const visuals={};const access={};const emailQuote={};const workspaceAccess={};
vm.runInNewContext(compile('src/lib/admin-access.ts'),{exports:access});
vm.runInNewContext(compile('src/lib/email-quote.ts'),{exports:emailQuote,Date});
vm.runInNewContext(compile('src/lib/print-job-visuals.ts'),{exports:visuals,URL});
vm.runInNewContext(compile('src/lib/quotation-inbox.ts'),{exports:inbox});
vm.runInNewContext(compile('src/lib/print-job-workflow.ts'),{exports:domain,require:name=>name==='./quotation-inbox'?inbox:name==='./print-job-visuals'?visuals:null,Date,Intl,URL});
vm.runInNewContext(compile('src/lib/print-job-workspace-access.ts'),{exports:workspaceAccess,require:name=>name==='./email-quote'?emailQuote:name==='./print-job-workflow'?domain:null});
function setup({allowed=['/admin','/admin/quotation-approval','/admin/orders','/admin/inbox'],signedIn=true,email=[],failCollection='',records:initial={}}={}){
 const records=new Map(Object.entries(initial));const reads=[];const writes=[];let inboxReads=0;
 const snapshot=ref=>({exists:()=>records.has(ref),data:()=>records.get(ref)});
 const modules={
  'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts)}},
  'firebase/firestore':{doc:(_db,c,id)=>`${c}/${id}`,collection:(_db,c)=>c,orderBy:(...args)=>args,where:(...args)=>({where:args}),limit:n=>n,query:(name,...rest)=>({name,rest}),getDocs:async q=>{reads.push(q.name);if(q.name===failCollection)throw new Error('unavailable');return{docs:[...records].filter(([k,v])=>k.startsWith(q.name+'/') && q.rest.filter(r=>r&&r.where).every(r=>v[r.where[0]]===r.where[2])).map(([k,v])=>({id:k.slice(q.name.length+1),data:()=>v}))};},arrayUnion:value=>({union:value}),runTransaction:async(_db,fn)=>fn({get:async ref=>{reads.push(ref);return snapshot(ref);},update:(ref,update)=>{writes.push({ref,update});const old=records.get(ref);const resolved={...update};for(const [k,v] of Object.entries(resolved))if(v&&v.union)resolved[k]=[...(old[k]||[]),v.union];records.set(ref,{...old,...resolved});}})},
  '@/lib/firebase':{db:{}},
  '@/lib/admin-request':{getAdminRequestSession:async()=>signedIn?{userId:'staff',email:'staff@example.test',displayName:'Staff',allowedPages:allowed,isOwner:false}:null},
  '@/lib/admin-access':access,
  '@/lib/print-job-workspace-access':workspaceAccess,
  '@/lib/print-job-workflow':domain,
  '@/lib/email-intake':{listEmailIntake:async()=>{inboxReads++;return{enquiries:email,lastSyncAt:'2026-10-01',error:''};}},
  '@/lib/request-safety':{isRequestOriginAllowed:req=>!req.headers.get('origin')||req.headers.get('origin')===new URL(req.url).origin,isContentLengthWithinLimit:(headers,max)=>!headers.get('content-length')||Number(headers.get('content-length'))<=max},
 };
 const load=file=>{const exports={};vm.runInNewContext(compile(file),{exports,require:name=>{if(!modules[name])throw new Error(name);return modules[name];},Date,TextDecoder,console});return exports;};
 const list=load('app/api/admin/print-jobs/route.ts');const detail=load('app/api/admin/print-jobs/[id]/route.ts');
 const send=({id='q',body={},origin='https://site.test',headers={},raw}={})=>detail.PATCH(new Request(`https://site.test/api/admin/print-jobs/${id}`,{method:'PATCH',headers:{'content-type':'application/json',origin,...headers},body:raw===undefined?JSON.stringify({stage:'confirmed',expectedVersion:0,requestId:'request-001',...body}):raw}),{params:Promise.resolve({id})});
 return{get:()=>list.GET(),send,records,reads,writes,get inboxReads(){return inboxReads;}};
}
const quote={name:'Customer',status:'new',createdAt:1,clientDecision:'accepted',paymentReceipt:{paymentStatus:'Paid'},orderTransactionId:'o'};
const enquiry={classification:'enquiry',threadId:'pending',version:'a'.repeat(24),updatedAtIso:'2026-10-01T00:00:00Z',items:[],missing:[],warnings:[],attachmentNames:[],lastMessage:{id:'m'},id:'gmail-pending',status:'needs_details',email:'client@example.test',subject:'Need shirts',draft:{name:'Sender',phone:'',lines:[]},lastReplyAt:'2026-10-01T00:00:00Z'};

test('GET and PATCH refuse unauthenticated callers before any data access',async()=>{
 const s=setup({signedIn:false});assert.equal((await s.get()).status,401);assert.equal((await s.send()).status,401);assert.equal(s.reads.length,0);assert.equal(s.inboxReads,0);
});
test('scoped quotation permission is required for writes',async()=>{
 for(const allowed of [[],['/admin'],['/admin/orders'],['/admin','/admin/orders']]){const s=setup({allowed});assert.equal((await s.send()).status,403);assert.equal(s.reads.length,0);}
});
test('GET only loads permitted collections and never joins inaccessible quote details',async()=>{
 const s=setup({allowed:['/admin','/admin/orders'],records:{'quotes/private':quote,'transactions/o':{quoteId:'private',status:'Delivered',transactionDate:1}}});
 const res=await s.get(),data=await res.json();assert.equal(res.headers.get('cache-control'),'private, no-store');assert.deepEqual(s.reads,['transactions']);assert.equal(s.inboxReads,0);assert.equal(data.items[0].quoteId,null);assert.equal(data.items[0].payment.verified,false);assert.equal(data.canQuotes,false);
});
test('GET reports partial load failure without fabricating an empty success',async()=>{
 const s=setup({failCollection:'quotes',records:{'transactions/o':{status:'Pending',transactionDate:1}}});const data=await(await s.get()).json();assert.equal(data.items.length,1);assert.match(data.warnings[0],/Quotes could not load/);
});
test('GET incorporates pending email and deduplicates already converted records',async()=>{
 const s=setup({email:[enquiry,{...enquiry,id:'gmail-ready',quoteId:'q'}],records:{'quotes/q':quote}});const data=await(await s.get()).json();assert.equal(data.items.length,2);assert.equal(data.items.filter(j=>j.intakeId).length,1);assert.equal(data.enquiries.length,2);assert.equal(data.lastEmailSync,'2026-10-01');
});
test('cross-origin, declared oversized and actual oversized payloads fail before any write',async()=>{
 for(const args of [{origin:'https://evil.test'},{headers:{'content-length':'17000'}},{raw:JSON.stringify({reason:'x'.repeat(17000)})}]){const s=setup({records:{'quotes/q':quote}});const response=await s.send(args);assert.ok([403,413].includes(response.status));assert.equal(s.writes.length,0);assert.equal(s.reads.length,0);}
});
test('malformed JSON, invalid content type and unsupported data mutations are rejected',async()=>{
 for(const args of [{raw:'{'},{headers:{'content-type':'text/plain'}},{body:{clientDecision:'accepted'}},{body:{stage:'completed'}},{id:'bad/id'}]){const s=setup({records:{'quotes/q':quote}});assert.ok([400,415].includes((await s.send(args)).status));assert.equal(s.writes.length,0);}
});
test('only metadata and history are persisted, leaving client decision, receipt and production untouched',async()=>{
 const order={status:'Pending',quoteId:'q'};const s=setup({records:{'quotes/q':quote,'transactions/o':order}});
 const result=await(await s.send()).json();assert.equal(result.ok,true);assert.equal(result.workflow.version,1);assert.equal(s.writes.length,1);assert.equal(s.writes[0].ref,'quotes/q');assert.deepEqual(Object.keys(s.writes[0].update).sort(),['printJobWorkflow','printJobWorkflowHistory']);assert.equal(s.records.get('quotes/q').clientDecision,'accepted');assert.deepEqual(s.records.get('transactions/o'),order);assert.equal(s.records.get('quotes/q').paymentReceipt.paymentStatus,'Paid');
});
test('request retry writes one history entry and a stale distinct edit gets 409',async()=>{
 const s=setup({records:{'quotes/q':quote}});assert.equal((await s.send()).status,200);const retry=await(await s.send()).json();assert.equal(retry.replayed,true);assert.equal(s.writes.length,1);assert.equal((await s.send({body:{requestId:'request-002'}})).status,409);assert.equal(s.writes.length,1);
});
test('missing quote is not created implicitly',async()=>{
 const s=setup();assert.equal((await s.send()).status,404);assert.equal(s.writes.length,0);
});
test('intake mutation requires inbox access in addition to quote workspace access',async()=>{
 const s=setup({allowed:['/admin','/admin/quotation-approval'],records:{'emailIntake/gmail-pending':enquiry}});assert.equal((await s.send({id:'gmail-pending',body:{targetType:'intake'}})).status,403);assert.equal(s.reads.length,0);
});
test('intake can be declined with a reason, without changing analysis/send state or creating a quote',async()=>{
 const s=setup({records:{'emailIntake/gmail-pending':enquiry}});const response=await s.send({id:'gmail-pending',body:{targetType:'intake',stage:'declined',closureKind:'shop_declined',reason:'Deadline is too soon'}});assert.equal(response.status,200);assert.equal(s.writes[0].ref,'emailIntake/gmail-pending');assert.equal(s.records.get('emailIntake/gmail-pending').status,'needs_details');assert.equal(s.records.size,1);
});
test('intake promoted to a quote returns conflict instead of creating a second workflow',async()=>{
 const s=setup({records:{'emailIntake/gmail-pending':{...enquiry,quoteId:'q'}}});assert.equal((await s.send({id:'gmail-pending',body:{targetType:'intake'}})).status,409);assert.equal(s.writes.length,0);
});
test('quote-only editors never read production collection while saving a stage',async()=>{
 const s=setup({allowed:['/admin','/admin/quotation-approval'],records:{'quotes/q':quote,'transactions/o':{status:'Delivered'}}});assert.equal((await s.send()).status,200);assert.deepEqual(s.reads,['quotes/q']);
});

function setupIntakeSync() {
 const crypto=require('node:crypto'),records=new Map(); let complete=false;
 const snapshot=ref=>({exists:()=>records.has(ref),data:()=>records.get(ref)});
 const set=(ref,value,options)=>records.set(ref,options?.merge?{...records.get(ref),...value}:value);
 const message={id:'first-message',threadId:'thread',from:'Customer <client@example.test>',to:'team@example.test',subject:'Shirts',date:'2026-10-01',receivedAtMs:1,text:'Twenty polos',labels:['INBOX']};
 const draft={name:'Customer',email:'client@example.test',phone:'',company:'',address:'',brn:'',vat:'',deadline:'',delivery:'',printMethod:'',notes:'Twenty polos',lines:[{description:'Polos',quantity:20}]};
 const quoteModule={},modelModule={};vm.runInNewContext(compile('src/lib/email-quote.ts'),{exports:quoteModule,Date});vm.runInNewContext(compile('src/lib/email-intake-model.ts'),{exports:modelModule});
 const modules={
  'node:crypto':crypto,nodemailer:{},
  'firebase/firestore':{doc:(_db,c,id)=>c+'/'+id,getDoc:async ref=>snapshot(ref),serverTimestamp:()=>123,setDoc:async(...args)=>set(...args),runTransaction:async(_db,fn)=>fn({get:async ref=>snapshot(ref),set,update:(ref,data)=>set(ref,data,{merge:true})})},
  '@/lib/firebase':{db:{}},'./gmail-connection-store':{getSavedGmailToken:async()=>null},
  './gmail-inbox':{INBOX_EMAIL:'team@example.test',createGmailConnection:async()=>async()=>({threads:[{id:'thread'}]}),readGmailThread:async()=>[message]},
  './email-quote':quoteModule,'./email-intake-model':modelModule,
  './email-intake-ai':{analyseEmailEnquiry:async()=>({classification:'enquiry',confidence:1,language:'en',summary:'Twenty polos',draft,items:[],missing:complete?[]:[{key:'sizes',label:'Sizes',question:'What sizes?'}],warnings:[]})},
 };
 const exports={};vm.runInNewContext(compile('src/lib/email-intake.ts'),{exports,require:n=>{if(!modules[n])throw new Error(n);return modules[n];},Date,Buffer,process:{env:{}}});
 return {records,async sync(){const state=records.get('integrations/email-intake');if(state)state.nextAllowedAt=0;return exports.syncEmailIntake();},reply(done=false){message.id+='-reply';complete=done;}};
}
test('email sync preserves staff closure, history, and version across replies and quote promotion',async()=>{
 const s=setupIntakeSync();await s.sync();const first=s.records.get('emailIntake/gmail-thread');assert.ok(first);
 const saved=domain.buildPrintJobWorkflowUpdate({},domain.validatePrintJobUpdate({stage:'declined',closureKind:'shop_declined',reason:'Cannot meet requested date',requestId:'decline-001',expectedVersion:0}),{userId:'staff',displayName:'Staff',email:''},'2026-10-01T00:00:00Z');
 first.printJobWorkflow=saved.workflow;first.printJobWorkflowHistory=[saved.historyEntry];
 s.reply(false);await s.sync();assert.equal(s.records.get('emailIntake/gmail-thread').printJobWorkflow.stage,'declined');assert.equal(s.records.get('emailIntake/gmail-thread').printJobWorkflowHistory.length,1);assert.equal(s.records.has('quotes/gmail-thread'),false);
 s.reply(true);await s.sync();const quote=s.records.get('quotes/gmail-thread');assert.equal(quote.printJobWorkflow.stage,'declined');assert.equal(quote.printJobWorkflow.version,1);assert.equal(quote.printJobWorkflowHistory[0].reason,'Cannot meet requested date');assert.equal(s.records.get('emailIntake/gmail-thread').quoteId,'gmail-thread');assert.equal(quote.status,'review');
});

test('reverse-only order links contribute to transition checks inside the save transaction',async()=>{
 const s=setup({records:{'quotes/q':{name:'Client',status:'new'},'transactions/reverse':{quoteId:'q',status:'Delivered'}}});
 assert.equal((await s.send({body:{stage:'new'}})).status,400);assert.equal(s.writes.length,0);
 assert.equal((await s.send({body:{stage:'new',reason:'Customer requested a reprint'}})).status,200);assert.equal(s.writes[0].update.printJobWorkflowHistory.union.fromStage,'completed');
});

test('manual email-to-quote creation carries closure history and links the preserved intake',async()=>{
 const records=new Map([['emailIntake/gmail-thread',{id:'gmail-thread',status:'waiting',sendState:'sent',printJobWorkflow:{stage:'declined',version:2,reason:'No capacity'},printJobWorkflowHistory:[{id:'saved-history'}]}]]);
 const snapshot=ref=>({exists:()=>records.has(ref),data:()=>records.get(ref)});
 const message={id:'message',threadId:'thread',from:'Client <client@example.test>',to:'team@example.test',subject:'Polos',text:'Please quote polos',snippet:''};
 const quoteModule={};vm.runInNewContext(compile('src/lib/email-quote.ts'),{exports:quoteModule,Date});
 const modules={
  'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts)}},
  'firebase/firestore':{doc:(_db,c,id)=>c+'/'+id,getDoc:async ref=>snapshot(ref),serverTimestamp:()=>123,runTransaction:async(_db,fn)=>fn({get:async ref=>snapshot(ref),set:(ref,value,options)=>records.set(ref,options?.merge?{...records.get(ref),...value}:value)})},
  '@/lib/firebase':{db:{}},'@/lib/gmail-connection-store':{getSavedGmailToken:async()=>null},
  '@/lib/admin-request':{getAdminRequestSession:async()=>({userId:'staff',allowedPages:[],isOwner:true})},'@/lib/admin-access':{hasAdminPageAccess:()=>true},
  '@/lib/gmail-inbox':{readInboxMessage:async()=>message,InboxError:class extends Error{}},'@/lib/email-quote':quoteModule,
  '@/lib/request-safety':{isRequestOriginAllowed:()=>true,isContentLengthWithinLimit:()=>true},
 };
 const exports={};vm.runInNewContext(compile('app/api/admin/inbox/quote/route.ts'),{exports,require:n=>modules[n],Buffer});
 const response=await exports.POST(new Request('https://site.test/api/admin/inbox/quote',{method:'POST',body:JSON.stringify({id:'message',action:'create',draft:{name:'Client',email:'client@example.test',lines:[{description:'Polo',quantity:20}]}})}));
 assert.equal(response.status,200);assert.equal(records.get('quotes/gmail-thread').printJobWorkflow.stage,'declined');assert.equal(records.get('quotes/gmail-thread').printJobWorkflowHistory[0].id,'saved-history');assert.equal(records.get('emailIntake/gmail-thread').quoteId,'gmail-thread');assert.equal(records.get('emailIntake/gmail-thread').sendState,'sent');
});

test('quote-only staff can use the workspace without dashboard permission',async()=>{
 const s=setup({allowed:['/admin/quotation-approval'],records:{'quotes/q':quote}});assert.equal((await s.get()).status,200);assert.equal((await s.send()).status,200);assert.equal(s.inboxReads,0);assert.equal(s.reads.some(r=>r.startsWith('transactions')),false);
});
test('missing or conflicting explicit order links fall back to reverse Delivered order for validation and audit',async()=>{
 for(const explicit of ['missing','wrong']) {
  const s=setup({records:{'quotes/q':{name:'Client',status:'new',orderTransactionId:explicit},'transactions/wrong':{quoteId:'different',status:'Pending'},'transactions/reverse':{quoteId:'q',status:'Delivered'}}});
  assert.equal((await s.send({body:{stage:'new'}})).status,400);assert.equal(s.writes.length,0);
  assert.equal((await s.send({body:{stage:'new',reason:'Requested reprint'}})).status,200);assert.equal(s.writes[0].update.printJobWorkflowHistory.union.fromStage,'completed');assert.equal(s.writes[0].update.printJobWorkflow.basisSnapshot.orderStatus,'delivered');
 }
});

test('Tanvi gets saved enquiries and production state without broad inbox or order permissions',async()=>{
 const s=setup({allowed:['/admin/tanvi'],email:[enquiry],records:{'quotes/q':quote,'transactions/o':{quoteId:'q',status:'In Process'}}});const response=await s.get();assert.equal(response.status,200);const body=await response.json();assert.equal(body.canInbox,false);assert.equal(body.canOrders,false);assert.equal(body.canEnquiries,true);assert.equal(body.canProductionWorkspace,true);assert.equal(body.items.find(j=>j.quoteId==='q').stage,'production');assert.equal(body.items.filter(j=>j.intakeId).length,1);assert.equal((await s.send({body:{reason:'Return to confirmation'}})).status,200);assert.equal(s.inboxReads,1);assert.equal(s.reads.some(r=>r.startsWith('transactions')),true);
});

test('Tanvi job DTO excludes order finance, mailbox routing fields and arbitrary private records',async()=>{
 const privateValue='PRIVATE_FINANCIAL_SENTINEL';
 const linked={quoteId:'q',status:'In Process',amount:99999,paymentMethod:privateValue,cost:privateValue,account:{notes:privateValue},documentProfile:{paymentStatus:privateValue,notes:privateValue,amountReceived:8888,discount:77,clientCompany:'Job company'},products:[{product:'Polo',quantity:12,color:'Navy',size:'L',unitPrice:12345,price:148140,cost:privateValue}]};
 const pending={...enquiry,privateLedger:privateValue,lastMessage:{id:'m',to:privateValue,messageIdHeader:privateValue,replyTo:privateValue},outboundMessageId:privateValue};
 const q={...quote,quote:{total:2500,currency:'Rs',lines:[{description:'Quoted polos',quantity:12,unitPrice:200}]}};
 const s=setup({allowed:['/admin/tanvi'],email:[pending,{...pending,id:'gmail-private',classification:'other'}],records:{'quotes/q':q,'transactions/o':linked,'transactions/standalone':{...linked,quoteId:undefined,customerName:'Standalone'}}});
 const result=await(await s.get()).json();const encoded=JSON.stringify(result);
 assert.equal(encoded.includes(privateValue),false);assert.equal(encoded.includes('99999'),false);assert.equal(encoded.includes('148140'),false);
 const job=result.items.find(j=>j.quoteId==='q');assert.equal(job.total,2500);assert.equal(job.details.pricingSource,'Quotation');assert.equal(job.details.pricingLines[0].unitPrice,200);assert.equal(job.details.products[0].description,'Polo');assert.equal(job.details.customer.company,'Job company');assert.equal(job.documents.some(d=>d.kind==='order'),false);
 const standalone=result.items.find(j=>j.orderId==='standalone');assert.equal(standalone.total,null);assert.equal(standalone.lines[0].unitPrice,null);assert.equal(standalone.details.pricingLines[0].lineTotal,null);assert.equal(standalone.payment.recordedLabel,'');assert.equal(standalone.editable,false);
 assert.equal(result.enquiries.length,1);assert.equal(result.enquiries[0].lastMessage.to,'');
});

test('Tanvi can organise saved enquiry workflow but cannot expose ignored non-enquiries',async()=>{
 const s=setup({allowed:['/admin/tanvi'],records:{'emailIntake/gmail-pending':enquiry}});
 assert.equal((await s.send({id:'gmail-pending',body:{targetType:'intake',stage:'needs_details',reason:'Confirm sizes'}})).status,200);
 assert.deepEqual(Object.keys(s.writes[0].update).sort(),['printJobWorkflow','printJobWorkflowHistory']);
 const denied=setup({allowed:['/admin/tanvi'],records:{'emailIntake/gmail-pending':{...enquiry,classification:'other'}}});
 assert.equal((await denied.send({id:'gmail-pending',body:{targetType:'intake'}})).status,404);assert.equal(denied.writes.length,0);
});
