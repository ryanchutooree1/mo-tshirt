const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function load(relative) {
  const filename = path.resolve(__dirname, relative), m = new Module(filename, module);
  m.filename = filename; m.paths = module.paths;
  const original = m.require.bind(m);
  m.require = name => name === './quotation-inbox' ? load('../src/lib/quotation-inbox.ts') : original(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename);
  return m.exports;
}
const { buildPrintJobs, buildPendingEmailJobs, validatePrintJobUpdate, buildPrintJobWorkflowUpdate, safePrintJobUrl } = load('../src/lib/print-job-workflow.ts');
const now = Date.parse('2026-10-01T10:00:00Z');
const actor = {userId:'owner',displayName:'Owner',email:'owner@example.test'};
const q = (id, data={}) => ({id,data:{name:'Client',status:'new',createdAt:now,...data}});
const o = (id, data={}) => ({id,data:{customerName:'Client',status:'Pending',transactionDate:now,...data}});
const input = (changes={}) => validatePrintJobUpdate({stage:'confirmed',expectedVersion:0,requestId:'request-0001',...changes});
const update = (data,changes={},order) => buildPrintJobWorkflowUpdate(data,input(changes),actor,new Date(now).toISOString(),order);

test('merges both reference types while preserving unmatched orders and rejecting conflicting links', () => {
 const jobs=buildPrintJobs([q('a'),q('b',{orderTransactionId:'b-order'}),q('conflict',{orderTransactionId:'wrong'})],[o('a-order',{quoteId:'a'}),o('b-order'),o('wrong',{quoteId:'another'}),o('standalone')],now);
 assert.equal(jobs.length,5); assert.equal(jobs.find(j=>j.quoteId==='a').orderId,'a-order'); assert.equal(jobs.find(j=>j.quoteId==='b').orderId,'b-order'); assert.equal(jobs.find(j=>j.quoteId==='conflict').orderId,null);
});
test('two quotes cannot consume the same order or share its private details',()=>{
 const jobs=buildPrintJobs([q('a',{orderTransactionId:'order'}),q('b',{orderTransactionId:'order'})],[o('order')],now);
 assert.equal(jobs.filter(j=>j.orderId==='order').length,1);
});
test('acceptance, draft Paid, and an automatic receipt never prove verified payment or delivery',()=>{
 const [job]=buildPrintJobs([q('a',{clientDecision:'accepted',quote:{paymentStatus:'Paid'},paymentReceipt:{paymentStatus:'Paid'}})],[],now);
 assert.equal(job.stage,'confirmed'); assert.equal(job.payment.verified,false); assert.equal(job.payment.status,'unverified'); assert.match(job.payment.label,/unverified/); assert.equal(job.documents.find(d=>d.kind==='receipt').generatedAutomatically,true);
});
test('payment evidence remains separate from job stage and uploaded proof needs verification',()=>{
 for(const status of ['pending_manual_confirmation','confirmed']) {
  const [job]=buildPrintJobs([q('a',{clientDecision:'accepted',paymentEvidence:{url:'https://example.test/proof',verificationStatus:status}})],[],now);
  assert.equal(job.stage,'confirmed'); assert.equal(job.payment.verified,status==='confirmed');
 }
});
test('Completed production means ready, Delivered means completed, and Pending is not already printing',()=>{
 const jobs=buildPrintJobs([],['Completed','Delivered','Pending','In Process','Cancelled'].map(status=>o(status,{status})),now);
 const stage=status=>jobs.find(j=>j.orderId===status).stage;
 assert.equal(stage('Completed'),'ready'); assert.equal(stage('Delivered'),'completed'); assert.equal(stage('Pending'),'confirmed'); assert.equal(stage('In Process'),'production'); assert.equal(stage('Cancelled'),'declined');
});
test('client changes, client rejection and partner readiness have distinct derived stages',()=>{
 const jobs=buildPrintJobs([q('change',{clientDecision:'changes_requested'}),q('reject',{clientDecision:'rejected'}),q('ready',{clientDecision:'accepted',partner:{productionStatus:'completed'}})],[],now);
 assert.equal(jobs.find(j=>j.quoteId==='change').stage,'needs_details'); assert.equal(jobs.find(j=>j.quoteId==='reject').closureKind,'client_declined'); assert.equal(jobs.find(j=>j.quoteId==='ready').stage,'ready');
});
test('workflow override organizes linked work without changing or misreporting its production record',()=>{
 const result=update({},{stage:'completed',acknowledgeCompletion:true});
 const quote=q('q',{orderTransactionId:'o',printJobWorkflow:result.workflow,printJobWorkflowHistory:[result.historyEntry]});
 const order=o('o',{status:'Pending'}), before=JSON.stringify({quote,order});
 const [job]=buildPrintJobs([quote],[order],now);
 assert.equal(job.stage,'completed'); assert.equal(job.derivedStage,'confirmed'); assert.match(job.productionNote,/Pending/); assert.doesNotMatch(job.productionNote,/Delivered/); assert.equal(JSON.stringify({quote,order}),before); assert.equal(job.history[0].kind==='workflow'||job.history.some(e=>e.kind==='workflow'),true);
});
test('pending enquiries deduplicate converted quotes and expose intake targets',()=>{
 const fixture={id:'gmail-one',status:'needs_details',summary:'Sizes missing',draft:{name:'Sender',phone:'',lines:[{description:'Polo',quantity:20}]},email:'client@example.test',lastReplyAt:new Date(now).toISOString(),updatedAtIso:new Date(now).toISOString(),subject:'Polo enquiry'};
 const jobs=buildPendingEmailJobs([fixture,{...fixture,id:'gmail-two',quoteId:'q'},{...fixture,id:'gmail-three'}],['gmail-three'],now);
 assert.equal(jobs.length,1);assert.equal(jobs[0].intakeId,'gmail-one');assert.equal(jobs[0].quoteId,null);assert.equal(jobs[0].source,'email');assert.equal(jobs[0].stage,'needs_details');assert.equal(jobs[0].quantity,20);assert.equal(jobs[0].editable,true);
});
test('pending enquiry workflow closure survives normalization',()=>{
 const workflow=update({}, {stage:'declined',closureKind:'shop_declined',reason:'Cannot meet date'}).workflow;
 const [job]=buildPendingEmailJobs([{id:'gmail-one',status:'waiting',draft:{name:'Sender',lines:[]},email:'client@example.test',lastReplyAt:new Date(now).toISOString(),printJobWorkflow:workflow}],[],now);
 assert.equal(job.stage,'declined');assert.equal(job.closureKind,'shop_declined');assert.equal(job.attention,false);
});
test('amount, quantity, summary, dates and safe artwork normalize without price invention',()=>{
 const [job]=buildPrintJobs([q('q',{garments:[{garment:'Polo',color:'Blue',size:'L',quantity:4}],quote:{lines:[],total:0},deadline:'2026-09-30',attachments:[{url:'javascript:alert(1)'},{url:'/\\evil.test'},{url:'https://example.test/art.pdf'}]})],[],now);
 assert.equal(job.quantity,4);assert.equal(job.total,null);assert.equal(job.garmentSummary,'Polo');assert.equal(job.overdue,true);assert.equal(job.artwork.length,1);
 const [legacy]=buildPrintJobs([],[o('o',{products:[{product:'Polo',quantity:3,price:1350},{product:'Tee',quantity:2,unitPrice:200}]})],now);assert.equal(legacy.total,1750);
});
test('safe links reject dangerous browser-normalized URLs and credentials',()=>{
 for(const url of ['javascript:x','//evil.test','/\\evil.test','https://user:password@example.test','https:\\evil.test','/\n/evil.test','data:text/html,x'])assert.equal(safePrintJobUrl(url),'');
 assert.equal(safePrintJobUrl('/uploads/art.pdf'),'/uploads/art.pdf');assert.equal(safePrintJobUrl('https://example.test/art.pdf'),'https://example.test/art.pdf');
});
test('orders-only sources never reveal inaccessible quote IDs, artwork or payment proof',()=>{
 const [job]=buildPrintJobs([],[o('o',{quoteId:'private',status:'Delivered'})],now);assert.equal(job.quoteId,null);assert.equal(job.editable,false);assert.deepEqual(job.artwork,[]);assert.equal(job.payment.verified,false);
});
test('timestamps preserve receivers and invalid calendar dates do not cause false overdue flags',()=>{
 class Timestamp{constructor(seconds){this.seconds=seconds;}toMillis(){return this.seconds*1000;}}
 const [job]=buildPrintJobs([q('q',{createdAt:new Timestamp(100),deadline:'2026-02-30'})],[],now);assert.equal(job.createdAt,100000);assert.equal(job.overdue,false);assert.doesNotThrow(()=>JSON.stringify(job));
});
test('stage validation rejects missing reasons, unknown fields, bad types, dates and incomplete closure',()=>{
 for(const changes of [{stage:'fake'},{stage:'needs_details'},{stage:'declined',reason:'No capacity'},{stage:'completed'},{followUpDate:'2026-02-30'},{followUpDate:'tomorrow'},{expectedVersion:'0'},{clientDecision:'accepted'},{reason:'a'.repeat(1501)},{reason:5},{requestId:'x'},{targetType:'orders'},{closureKind:'shop_declined'}]) assert.throws(()=>input(changes));
 assert.equal(input({stage:'declined',closureKind:'cancelled',reason:'No longer needed'}).closureKind,'cancelled');
});
test('save only produces isolated workflow metadata and an audit event',()=>{
 const original={clientDecision:'accepted',status:'approved',paymentReceipt:{paymentStatus:'Paid'},quote:{total:500},orderTransactionId:'o'}, before=JSON.stringify(original);
 const result=update(original);assert.equal(result.workflow.version,1);assert.equal(result.historyEntry.fromStage,'confirmed');assert.equal(result.historyEntry.updatedBy.userId,'owner');assert.equal(JSON.stringify(original),before);assert.deepEqual(Object.keys(result).sort(),['historyEntry','replayed','workflow']);
});
test('optimistic concurrency rejects stale writes and duplicate requests are idempotent',()=>{
 const first=update({});const saved={printJobWorkflow:first.workflow,printJobWorkflowHistory:[first.historyEntry]};
 const retry=update(saved);assert.equal(retry.replayed,true);assert.equal(retry.workflow.version,1);
 assert.throws(()=>update(saved,{requestId:'request-0002'}),/Someone updated/);
 assert.throws(()=>update(saved,{stage:'production'}),/already used/);
 const second=update(saved,{stage:'production',expectedVersion:1,requestId:'request-0002'});assert.equal(second.workflow.version,2);
});
test('reopening a closed job or moving backward requires explanation',()=>{
 const closed=update({},{stage:'declined',reason:'No capacity',closureKind:'shop_declined'});
 assert.throws(()=>update({printJobWorkflow:closed.workflow},{stage:'new',expectedVersion:1,requestId:'reopen-001'}),/reason/);
 assert.equal(update({printJobWorkflow:closed.workflow},{stage:'new',reason:'Capacity now available',expectedVersion:1,requestId:'reopen-001'}).workflow.stage,'new');
 assert.throws(()=>update({},{stage:'new'}, {status:'In Process'}),/reason/);
});

test('open waiting stage yields to client acceptance while keeping staff notes and follow-up',()=>{
 const original={status:'sent',clientDecision:'',sentAt:now-1000};
 const saved=update(original,{stage:'awaiting_client',reason:'Awaiting approval',nextAction:'Send reminder',followUpDate:'2026-10-03'});
 const [job]=buildPrintJobs([q('q',{...original,clientDecision:'accepted',printJobWorkflow:saved.workflow})],[],now+1000);
 assert.equal(saved.workflow.basisSnapshot.clientDecision,'');assert.equal(job.stage,'confirmed');assert.equal(job.workflowOverridden,true);assert.match(job.reason,/Client acceptance/);assert.notEqual(job.action,'Send reminder');assert.equal(job.followUpDate,'2026-10-03');assert.equal(job.workflow.reason,'Awaiting approval');
});
test('open production stage follows real order progression even when legacy orders lack updatedAt',()=>{
 const original={clientDecision:'accepted'};const saved=update(original,{stage:'production'},{status:'In Process'});
 for(const [status,expected] of [['Completed','ready'],['Delivered','completed']]){
  const [job]=buildPrintJobs([q('q',{...original,orderTransactionId:'o',printJobWorkflow:saved.workflow})],[o('o',{status})],now);
  assert.equal(job.stage,expected);assert.equal(job.workflowOverridden,true);assert.match(job.productionNote,new RegExp(status));
 }
});
test('client changes supersede an open stage and a repeated client response is detected by event time',()=>{
 const original={clientDecision:'accepted',clientDecisionAtIso:'2026-09-30T00:00:00Z'};
 const saved=update(original,{stage:'production'});
 const [job]=buildPrintJobs([q('q',{...original,clientDecision:'changes_requested',clientDecisionComment:'Please change the sizes',clientDecisionAtIso:'2026-10-01T12:00:00Z',printJobWorkflow:saved.workflow})],[],now);
 assert.equal(job.stage,'needs_details');assert.equal(job.reason,'Please change the sizes');assert.equal(job.workflowOverridden,true);
});
test('a new inbound email version supersedes a stale waiting stage',()=>{
 const intake={id:'gmail-one',version:'first',status:'waiting',draft:{name:'Client',lines:[]},email:'client@example.test',lastReplyAt:'2026-10-01T00:00:00Z'};
 const saved=update({intake},{stage:'awaiting_client'});
 const [job]=buildPendingEmailJobs([{...intake,version:'second',status:'needs_details',lastReplyAt:'2026-10-01T12:00:00Z',printJobWorkflow:saved.workflow}],[],now);
 assert.equal(job.stage,'needs_details');assert.equal(job.workflowOverridden,true);
});
test('explicit closures persist until explicit reopening despite client and production changes',()=>{
 for(const stage of ['declined','completed']){
  const saved=update({},{stage,reason:'Team explicitly closed this job',...(stage==='declined'?{closureKind:'shop_declined'}:{acknowledgeCompletion:true})});
  const [job]=buildPrintJobs([q('q',{clientDecision:'accepted',orderTransactionId:'o',printJobWorkflow:saved.workflow})],[o('o',{status:'In Process'})],now);
  assert.equal(job.stage,stage);assert.equal(job.workflowOverridden,false);
 }
});
test('payment changes, automatic receipts and generic update timestamps do not supersede staff stages',()=>{
 const original={clientDecision:'accepted'};const saved=update(original,{stage:'awaiting_client',reason:'Artwork sign-off required'});
 const [job]=buildPrintJobs([q('q',{...original,updatedAt:now+86400000,paymentEvidence:{verificationStatus:'confirmed'},paymentReceipt:{paymentStatus:'Paid'},printJobWorkflow:saved.workflow})],[],now+86400000);
 assert.equal(job.stage,'awaiting_client');assert.equal(job.workflowOverridden,false);assert.equal(job.payment.verified,true);
});
test('unchanged lifecycle keeps manual stage and missing order scope cannot falsely supersede it',()=>{
 const original={clientDecision:'accepted'},order={status:'In Process'};const saved=update(original,{stage:'needs_details',reason:'Need revised artwork'},order);
 const [scoped]=buildPrintJobs([q('q',{...original,printJobWorkflow:saved.workflow})],[],now);
 assert.equal(scoped.stage,'needs_details');assert.equal(scoped.workflowOverridden,false);
});
test('legacy stage metadata uses newer client lifecycle timestamps but never generic payment updates',()=>{
 const legacy=update({status:'sent'},{stage:'awaiting_client'}).workflow;delete legacy.basisSnapshot;
 const [accepted]=buildPrintJobs([q('q',{clientDecision:'accepted',clientDecisionAtIso:'2026-10-01T12:00:00Z',printJobWorkflow:legacy})],[],now);
 assert.equal(accepted.stage,'confirmed');assert.equal(accepted.workflowOverridden,true);
 const [generic]=buildPrintJobs([q('q',{updatedAt:now+86400000,paymentEvidence:{verificationStatus:'confirmed'},printJobWorkflow:legacy})],[],now);
 assert.equal(generic.stage,'awaiting_client');assert.equal(generic.workflowOverridden,false);
});
test('a subsequent save validates and audits against the superseding lifecycle stage',()=>{
 const original={status:'sent'};const saved=update(original,{stage:'awaiting_client'});
 const changed={...original,clientDecision:'accepted',printJobWorkflow:saved.workflow};
 assert.throws(()=>update(changed,{stage:'new',expectedVersion:1,requestId:'request-next'}),/reason/);
 const next=update(changed,{stage:'production',expectedVersion:1,requestId:'request-next'});
 assert.equal(next.historyEntry.fromStage,'confirmed');assert.equal(next.workflow.basisSnapshot.clientDecision,'accepted');
});

test('promoting an email enquiry to a quotation supersedes inherited open holds but keeps explicit closure',()=>{
 const intake={version:'first',status:'needs_details'};
 for(const stage of ['needs_details','declined']){
  const saved=update({intake},{stage,reason:'Waiting for sizes',...(stage==='declined'?{closureKind:'shop_declined'}:{})});
  const [job]=buildPrintJobs([q('gmail-one',{status:'review',source:'Gmail',emailImport:{threadId:'one'},printJobWorkflow:saved.workflow})],[],now);
  assert.equal(job.stage,stage==='declined'?'declined':'new');assert.equal(job.workflowOverridden,stage!=='declined');
 }
});

test('job thumbnail prefers original print artwork over final mockup and preserves full artwork links',()=>{
 const attachments=[{role:'final-mockup',filename:'shirt-mockup.jpg',url:'https://example.test/mockup.jpg',contentType:'image/jpeg'},{role:'print-artwork',filename:'removed-bg.png',url:'https://example.test/removed-bg.png',contentType:'image/png',originalFilename:'company-logo.jpg',originalUrl:'https://example.test/company-logo.jpg',originalContentType:'image/jpeg'},{filename:'print-guide.pdf',url:'https://example.test/guide.pdf',contentType:'application/pdf'}];
 const [job]=buildPrintJobs([q('q',{attachments})],[],now);
 assert.deepEqual(job.thumbnail,{name:'company-logo.jpg',url:'https://example.test/company-logo.jpg'});assert.equal(job.artwork.length,3);assert.equal(job.artwork[1].url,'https://example.test/removed-bg.png');
});
test('logo-labelled image outranks an ordinary photo and filename-described final mockup',()=>{
 const [job]=buildPrintJobs([q('q',{attachments:[{filename:'final_mockup_logo.jpg',url:'https://example.test/mockup.jpg'},{filename:'shirt.jpg',url:'https://example.test/shirt.jpg'},{label:'Client logo',filename:'file.png',url:'/uploads/file.png'}]})],[],now);
 assert.deepEqual(job.thumbnail,{name:'file.png',url:'/uploads/file.png'});
});
test('thumbnail identifies encoded Firebase image paths and extensionless image MIME uploads',()=>{
 const firebase='https://firebasestorage.googleapis.com/v0/b/example/o/quotes%2Fclient-logo.png?alt=media&token=sample';
 const [pathImage]=buildPrintJobs([q('q',{attachment:{url:firebase}})],[],now);assert.equal(pathImage.thumbnail.url,firebase);
 const [mimeImage]=buildPrintJobs([q('q',{attachment:{url:'/api/uploads/opaque-id',contentType:'image/webp',filename:'Logo'}})],[],now);assert.deepEqual(mimeImage.thumbnail,{url:'/api/uploads/opaque-id',name:'Logo'});
});
test('thumbnail falls back to legacy single attachment for empty attachment arrays',()=>{
 const [job]=buildPrintJobs([q('q',{attachments:[],attachment:{filename:'logo.png',url:'/uploads/logo.png'}})],[],now);assert.equal(job.thumbnail.url,'/uploads/logo.png');assert.equal(job.artwork.length,1);
});
test('PDF, non-image and unsafe links never become thumbnails; artwork documents remain available',()=>{
 for(const attachment of [{filename:'logo.pdf',url:'https://example.test/logo.pdf',contentType:'image/png'},{filename:'logo.png',url:'https://example.test/logo.pdf'},{filename:'logo.png',url:'https://example.test/logo',contentType:'application/pdf'},{filename:'logo.eps',url:'https://example.test/logo.eps'},{filename:'logo.png',url:'javascript:alert(1)'},{url:'/api/uploads/unknown'}]){
  const [job]=buildPrintJobs([q('q',{attachment})],[],now);assert.equal(job.thumbnail,null);
 }
 const [pdf]=buildPrintJobs([q('q',{attachment:{filename:'logo.pdf',url:'https://example.test/logo.pdf'}})],[],now);assert.equal(pdf.artwork.length,1);
});
test('non-image original does not hide a valid current image and a mockup is usable as last fallback',()=>{
 const [converted]=buildPrintJobs([q('q',{attachment:{role:'print-artwork',originalFilename:'logo.pdf',originalUrl:'https://example.test/logo.pdf',originalContentType:'application/pdf',filename:'preview.png',url:'https://example.test/preview.png',contentType:'image/png'}})],[],now);assert.equal(converted.thumbnail.url,'https://example.test/preview.png');
 const [mockup]=buildPrintJobs([q('q',{attachment:{role:'final-mockup',filename:'shirt.webp',url:'https://example.test/shirt.webp'}})],[],now);assert.equal(mockup.thumbnail.url,'https://example.test/shirt.webp');
 const [empty]=buildPrintJobs([], [o('o')],now);assert.equal(empty.thumbnail,null);
});
