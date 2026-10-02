const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const nodeCrypto = require('node:crypto');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function load(file, modules = {}, extras = {}) {
 const exports = {};
 vm.runInNewContext(compile(file), { exports, require: name => { if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`); return modules[name]; }, Date, Intl, URL, TextDecoder, Buffer, console: {error(){}}, ...extras });
 return exports;
}
const inbox = load('src/lib/quotation-inbox.ts');
const visuals = load('src/lib/print-job-visuals.ts');
const workflow = load('src/lib/print-job-workflow.ts', {'./quotation-inbox':inbox,'./print-job-visuals':visuals});
const packet = load('src/lib/production-packet.ts', {'node:crypto':nodeCrypto,'./print-job-workflow':workflow});
const domain = load('src/lib/print-job-handoff.ts', {'node:crypto':nodeCrypto,'./production-packet':packet});
const packetHash = q => packet.productionPacketFingerprint(packet.buildProductionPacket('q',q));
const now=Date.now(), today=domain.mauritiusDate(now), origin='https://site.test';
const actor={userId:'staff',displayName:'Staff',email:'staff@example.test'};
const settings=()=>({configured:true,version:1,partnerId:'yan',testEnabled:true,testRecipient:'test-recipient@example.test',testDate:today,requiredPaymentPercent:50,liveEnabled:false,updatedAtIso:new Date(now).toISOString()});
const registry=()=>({partners:[{id:'yan',name:'Production partner',email:'partner@example.test',emails:['partner@example.test'],active:true,emailNotificationsEnabled:false}]});
const quote=()=>({name:'Private customer',email:'private@example.test',phone:'555-PRIVATE',deliveryAddress:'PRIVATE ADDRESS',message:'PRIVATE NOTES',status:'approved',clientDecision:'accepted',printMethod:'DTF',printPlacement:'Front chest',printDimensions:'20 x 25 cm',deadline:'Tomorrow',quote:{documentType:'quotation',documentNumber:'Q-TEST',currency:'Rs',total:1001.01,subtotal:1001.01,lines:[{description:'Polo',quantity:2,unitPrice:500.505}],paymentStatus:'Paid',amountReceived:1001.01},garments:[{garment:'Polo',color:'Black',size:'M',quantity:2}],attachments:[{filename:'logo.png',url:'/uploads/logo.png'}],paymentReceipt:{paymentStatus:'Paid',amountReceived:1001.01},paymentEvidence:{verificationStatus:'confirmed',uploadId:'proof-one',url:'https://site.test/private-proof.png'}});
const action=(value)=>domain.validateHandoffAction(value);
function approvedQuote(amount=500.51) {
 const q=quote(),pricing=domain.quotePricing(q);
 q.printJobHandoff={version:2,priceConfirmation:{id:'price-0001',pricingFingerprint:pricing.fingerprint,packetFingerprint:packetHash(q),lifecycleFingerprint:domain.handoffLifecycleFingerprint(q),agreedTotal:pricing.quotedTotal,currency:pricing.currency,note:'Client agreed',actor,confirmedAtIso:new Date(now).toISOString()},payments:[{id:'payment-0001',amountReceived:amount,currency:'Rs',paymentDate:today,reference:'BANK-001',evidenceId:'proof-one',note:'Checked bank receipt',actor,confirmedAtIso:new Date(now).toISOString()}],preview:null,delivery:null};
 return q;
}
function setup({initialQuote=quote(),config=settings(),partners=registry(),sendFails=false,partialAccept=false,failResultWrite=false,duringSend,smtp=true,smtpEnv={},signedIn=true,isOwner=false,allowed=['/admin/quotation-approval']}={}) {
 const records=new Map([['quotes/q',initialQuote],...(config?[['adminSettings/printJobHandoff',config]]:[]),...(partners?[['adminSettings/printPartners',partners]]:[])]), reads=[],writes=[],mails=[];
 let gate=Promise.resolve();
 const snap=key=>({exists:()=>records.has(key),data:()=>records.has(key)?structuredClone(records.get(key)):undefined});
 const firestore={doc:(_db,...parts)=>parts.join('/'),collection:(_db,name)=>name,where:(key,op,value)=>({key,value}),limit:amount=>({limit:amount}),query:(name,...clauses)=>({name,clauses}),getDocs:async query=>{reads.push(query.name);return{docs:[...records].filter(([key,value])=>key.startsWith(query.name+'/')&&query.clauses.filter(c=>c.key).every(c=>value[c.key]===c.value)).map(([key,value])=>({id:key.slice(query.name.length+1),data:()=>structuredClone(value)}))};},getDoc:async key=>{reads.push(key);return snap(key);},runTransaction:async(_db,fn)=>{const previous=gate;let release;gate=new Promise(r=>release=r);await previous;try{if(failResultWrite&&mails.length)throw new Error('Persistence unavailable');const pending=[];const result=await fn({get:async key=>{reads.push(key);return snap(key);},set:(key,value,options)=>pending.push({key,value,options}),update:(key,value)=>pending.push({key,value,options:{merge:true}})});for(const operation of pending){writes.push(operation);records.set(operation.key,operation.options?.merge?{...records.get(operation.key),...structuredClone(operation.value)}:structuredClone(operation.value));}return result;}finally{release();}}};
 const smtpModule={createTransport:()=>({sendMail:async payload=>{mails.push(payload);if(duringSend)await duringSend(records);if(sendFails)throw new Error('SMTP timeout');return{accepted:partialAccept?[]:payload.to,rejected:[]};}})};
 const modules={'node:crypto':nodeCrypto,'firebase/firestore':firestore,'./firebase':{db:{}},'./print-job-handoff':domain,'./production-packet':packet,nodemailer:smtpModule};
 const store=load('src/lib/print-job-handoff-store.ts',modules,{process:{env:{...(smtp?{SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASS:'fixture-only'}:{}),...smtpEnv}}});
 const safety={isRequestOriginAllowed:req=>!req.headers.get('origin')||req.headers.get('origin')===new URL(req.url).origin,isContentLengthWithinLimit:(headers,max)=>!headers.get('content-length')||Number(headers.get('content-length'))<=max};
 const request=load('src/lib/print-job-handoff-request.ts',{'./print-job-handoff':domain,'./request-safety':safety});
 class NextResponse extends Response {static json(body,options){return Response.json(body,options);}}
 const apiModules={'next/server':{NextResponse},'@/lib/admin-request':{getAdminRequestSession:async()=>signedIn?{...actor,isOwner,allowedPages:allowed}:null},'@/lib/admin-access':{hasAdminPageAccess:(pages,path,user)=>user.isOwner||pages.includes(path)||(path==='/admin/quotation-approval'&&pages.includes('/admin/tanvi'))},'@/lib/print-job-handoff':domain,'@/lib/print-job-handoff-request':request,'@/lib/print-job-handoff-store':store,'firebase/firestore':firestore,'@/lib/firebase':{db:{}},'@/lib/quotation-pdf':{buildSavedQuotationPdf:()=>Buffer.from('%PDF-fixture')}};
 const api=load('app/api/admin/print-jobs/[id]/handoff/route.ts',apiModules);
 const settingsApi=load('app/api/admin/print-jobs/handoff-settings/route.ts',apiModules);
 const documentApi=load('app/api/admin/print-jobs/[id]/document/route.ts',apiModules);
 const context={params:Promise.resolve({id:'q'})};
 const req=(body,options={})=>new Request(origin+'/api/admin/print-jobs/q/handoff',{method:'POST',headers:{'content-type':'application/json',origin,...options.headers},body:options.raw??JSON.stringify(body)});
 const post=(body,options)=>api.POST(req(body,options),context);
 const perform=value=>store.performJobHandoff('q',action(value),actor,origin,isOwner);
 return {records,reads,writes,mails,store,post,perform,get:()=>api.GET(new Request(origin+'/api/admin/print-jobs/q/handoff'),context),settingsGet:()=>settingsApi.GET(),settingsPut:(body,options)=>settingsApi.PUT(req(body,options)),documentGet:()=>documentApi.GET(new Request(origin+'/api/admin/print-jobs/q/document'),context)};
}
async function confirm(s) {
 const pricing=domain.quotePricing(s.records.get('quotes/q'));
 return s.perform({action:'confirm-price',requestId:'confirm-price-001',expectedVersion:0,pricingFingerprint:pricing.fingerprint,packetFingerprint:packetHash(s.records.get('quotes/q')),agreedTotal:pricing.quotedTotal,note:'Client agreed the current price on WhatsApp'});
}
async function verify(s,amount=500.51,extra={}) {
 return s.perform({action:'verify-payment',requestId:'verify-payment-001',expectedVersion:1,amountReceived:amount,paymentDate:today,reference:'BANK-001',evidenceId:'proof-one',acknowledgeBankReceipt:true,...extra});
}
async function preview(s,extra={}) {return s.perform({action:'preview',requestId:'preview-0001',expectedVersion:2,...extra});}
const sendBody=view=>({action:'send',requestId:'send-request-001',previewId:view.preview.id,previewFingerprint:view.preview.fingerprint,acknowledgeSend:true});

test('accepted status, draft Paid, automatic receipt and un-sized legacy proof cannot release production',()=>{
 const view=domain.buildHandoffView('q',quote(),settings(),registry(),origin,false,now);
 assert.equal(view.payment.verifiedAmount,0);assert.equal(view.payment.legacyEvidenceVerified,true);assert.equal(view.gates.priceAgreed,false);assert.equal(view.gates.paymentSatisfied,false);assert.equal(view.gates.canPreview,false);
});
test('current agreed price and 50 percent verified money satisfy exact integer-cent threshold',()=>{
 const good=domain.buildHandoffView('q',approvedQuote(500.51),settings(),registry(),origin,false,now);
 const short=domain.buildHandoffView('q',approvedQuote(500.50),settings(),registry(),origin,false,now);
 assert.equal(good.gates.requiredAmount,500.51);assert.equal(good.gates.canPreview,true);assert.equal(good.payment.balance,500.50);assert.equal(short.gates.paymentSatisfied,false);
});
test('price changes invalidate agreement while same-currency actual money persists; currency changes invalidate money too',()=>{
 const q=approvedQuote();q.quote.total=1200;let view=domain.buildHandoffView('q',q,settings(),registry(),origin,false,now);
 assert.equal(view.gates.priceAgreed,false);assert.equal(view.payment.verifiedAmount,500.51);assert.equal(view.gates.requiredAmount,600);
 q.quote.currency='USD';view=domain.buildHandoffView('q',q,settings(),registry(),origin,false,now);assert.equal(view.payment.verifiedAmount,0);assert.equal(view.gates.paymentSatisfied,false);
});
test('receipt and payment label changes never change the actual quote pricing fingerprint',()=>{
 const q=quote(),old=domain.quotePricing(q).fingerprint;q.quote.paymentStatus='Unpaid';q.quote.amountReceived=0;q.paymentReceipt={};assert.equal(domain.quotePricing(q).fingerprint,old);q.quote.lines[0].unitPrice=600;assert.notEqual(domain.quotePricing(q).fingerprint,old);
});
test('unconfigured/null policy/expired tests never fall through to live partner recipients',()=>{
 for(const conf of [{...settings(),configured:false},{...settings(),requiredPaymentPercent:null},{...settings(),testDate:'2000-01-01'},{...settings(),liveEnabled:true}]){
  const view=domain.buildHandoffView('q',approvedQuote(),conf,registry(),origin,false,now);assert.equal(view.gates.canPreview,false);assert.ok(view.delivery.recipients.every(r=>r==='test-recipient@example.test'));
 }
});
test('missing private partner cannot inherit historical hardcoded registry defaults',()=>{
 const view=domain.buildHandoffView('q',approvedQuote(),settings(),{},origin,false,now);assert.equal(view.gates.canPreview,false);assert.match(view.gates.blockers.join(' '),/partner contact/);assert.equal(domain.resolvePrivatePartner({}).recipients.length,0);
});
test('preview contains only selected production brief and safe artwork, without customer contacts, payment proof or banking',()=>{
 const q=approvedQuote();q.bankAccountNumber='PRIVATE BANK';
 const p=domain.prepareHandoffPreview('q',q,settings(),registry(),origin,'preview-0001',now);
 assert.deepEqual(Array.from(p.recipients),['test-recipient@example.test']);assert.match(p.subject,/TEST ONLY/);assert.match(p.text,/do not begin production/);assert.match(p.text,/https:\/\/site.test\/uploads\/logo.png/);
 for(const hidden of ['private@example.test','555-PRIVATE','PRIVATE ADDRESS','PRIVATE NOTES','PRIVATE BANK','private-proof.png','500.51'])assert.ok(!p.text.includes(hidden));
});
test('printed jobs require actual artwork; explicit plain jobs do not',()=>{
 const q=approvedQuote();q.attachments=[];assert.equal(domain.buildHandoffView('q',q,settings(),registry(),origin,false,now).gates.canPreview,false);
 q.printMethod='No printing';q.printJobHandoff.priceConfirmation.packetFingerprint=packetHash(q);assert.equal(domain.buildHandoffView('q',q,settings(),registry(),origin,false,now).gates.canPreview,true);
});
test('validations require explicit acknowledgments, reference, positive current price and bounded body fields',()=>{
 for(const value of [{action:'verify-payment',requestId:'request-001',expectedVersion:0,amountReceived:500,paymentDate:today,reference:'BANK'},{action:'verify-payment',requestId:'request-001',expectedVersion:0,amountReceived:500,paymentDate:'2000-02-30',reference:'BANK',acknowledgeBankReceipt:true},{action:'send',requestId:'request-001',previewId:'preview-001',previewFingerprint:'a'.repeat(64)},{action:'confirm-price',requestId:'request-001',expectedVersion:0,pricingFingerprint:'a'.repeat(64),agreedTotal:0,note:'Approved'},{action:'preview',requestId:'request-001',expectedVersion:0,to:'evil@example.test'}])assert.throws(()=>action(value));
 assert.throws(()=>domain.validateHandoffSettings({expectedVersion:0,partnerId:'yan',testEnabled:true,testRecipient:'to@example.test',testDate:today,requiredPaymentPercent:20,liveEnabled:false}));
});
test('handoff GET is read-only and quote-only staff need no dashboard permission',async()=>{
 const s=setup(),response=await s.get(),view=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(view.canManageSettings,false);assert.equal(s.writes.length,0);assert.equal(s.mails.length,0);
});
test('authentication and quote scope gate all job reads and writes before data access',async()=>{
 for(const options of [{signedIn:false},{allowed:[]}]){const s=setup(options);assert.ok([401,403].includes((await s.get()).status));assert.ok([401,403].includes((await s.post({})).status));assert.equal(s.reads.length,0);assert.equal(s.writes.length,0);}
});
test('handoff settings are owner-only and fail closed by default',async()=>{
 const staff=setup();assert.equal((await staff.settingsGet()).status,403);assert.equal((await staff.settingsPut({})).status,403);assert.equal(staff.reads.length,0);
 const owner=setup({isOwner:true,config:null});const result=await(await owner.settingsGet()).json();assert.equal(result.settings.configured,false);assert.equal(result.settings.testEnabled,false);assert.equal(result.settings.liveEnabled,false);assert.equal(result.settings.testRecipient,'');assert.equal(result.settings.requiredPaymentPercent,50);
});
test('owner can configure today test mode without changing partner notifications, with version and explicit live guard',async()=>{
 const s=setup({isOwner:true,config:null});const payload={expectedVersion:0,partnerId:'yan',testEnabled:true,testRecipient:'test-recipient@example.test',testDate:today,requiredPaymentPercent:50,liveEnabled:false};
 assert.equal((await s.settingsPut(payload)).status,200);assert.equal(s.records.get('adminSettings/printPartners').partners[0].emailNotificationsEnabled,false);assert.equal((await s.settingsPut(payload)).status,409);
 assert.equal((await s.settingsPut({...payload,expectedVersion:1,testEnabled:false,liveEnabled:true})).status,400);assert.equal(s.mails.length,0);
});
test('cross-origin, oversized, malformed and unsupported recipient mutations never write or send',async()=>{
 for(const options of [{headers:{origin:'https://evil.test'}},{headers:{'content-length':'99999'}},{raw:'x'.repeat(17000)},{raw:'{'},{headers:{'content-type':'text/plain'}}]){
  const s=setup();assert.ok([400,403,413,415].includes((await s.post({action:'preview',requestId:'preview-0001',expectedVersion:0},options)).status));assert.equal(s.writes.length,0);assert.equal(s.mails.length,0);
 }
});
test('price confirmation requires exact current total and does not alter quotation, client decision or receipt',async()=>{
 const s=setup(),before=structuredClone(s.records.get('quotes/q'));
 await assert.rejects(()=>s.perform({action:'confirm-price',requestId:'price-wrong',expectedVersion:0,pricingFingerprint:domain.quotePricing(before).fingerprint,packetFingerprint:packetHash(before),agreedTotal:800,note:'Agreed'}),/current quotation/);
 const view=await confirm(s);assert.equal(view.priceConfirmation.current,true);assert.equal(view.version,1);assert.deepEqual(s.records.get('quotes/q').quote,before.quote);assert.deepEqual(s.records.get('quotes/q').paymentReceipt,before.paymentReceipt);assert.equal(s.records.get('quotes/q').clientDecision,'accepted');assert.equal(s.mails.length,0);
});
test('payment snapshot is cumulative, currency bound and immutable in audit; retries never sum or duplicate it',async()=>{
 const s=setup();await confirm(s);const first=await verify(s);assert.equal(first.payment.verifiedAmount,500.51);assert.equal(first.payment.records.length,1);
 const retry=await verify(s);assert.equal(retry.replayed,true);assert.equal(retry.payment.records.length,1);assert.equal(retry.payment.verifiedAmount,500.51);
 const duplicate=await verify(s,500.51,{requestId:'different-request',expectedVersion:2});assert.equal(duplicate.replayed,true);assert.equal(duplicate.payment.records.length,1);
 const second=await verify(s,1001.01,{requestId:'full-payment-001',expectedVersion:2,reference:'BANK-001+002',evidenceId:''});assert.equal(second.payment.verifiedAmount,1001.01);assert.equal(second.payment.records.length,2);assert.equal(second.payment.balance,0);
 const audits=[...s.records].filter(([k])=>k.includes('/handoffEvents/'));assert.equal(audits.length,3);assert.equal(s.records.get('quotes/q').paymentEvidence.verificationStatus,'confirmed');
});
test('reused evidence cannot silently change amounts and decreases require a correction note',async()=>{
 const s=setup();await confirm(s);await verify(s);
 await assert.rejects(()=>verify(s,1000,{expectedVersion:2,requestId:'different-request'}),/already used/);
 await assert.rejects(()=>verify(s,100,{expectedVersion:2,requestId:'correction-request',reference:'CORRECTION',evidenceId:''}),/Explain the correction/);
});
test('preview makes no SMTP call and any subsequent price, artwork or recipient change invalidates sending',async()=>{
 for(const change of ['price','artwork','recipient']) {
  const s=setup();await confirm(s);await verify(s);const reviewed=await preview(s);assert.equal(s.mails.length,0);
  if(change==='price')s.records.get('quotes/q').quote.total=1200;
  if(change==='artwork')s.records.get('quotes/q').attachments.push({filename:'new.png',url:'/uploads/new.png'});
  if(change==='recipient')s.records.get('adminSettings/printJobHandoff').testRecipient='changed@example.test';
  await assert.rejects(()=>s.perform(sendBody(reviewed)));assert.equal(s.mails.length,0);assert.equal(s.records.get('quotes/q').printJobHandoff.delivery,null);
 }
});
test('explicit reviewed test send goes only to configured test recipient and double clicks/retries send once',async()=>{
 const s=setup();await confirm(s);await verify(s);const reviewed=await preview(s),send=sendBody(reviewed);
 const results=await Promise.allSettled([s.perform(send),s.perform(send)]);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(s.mails.length,1);assert.deepEqual(Array.from(s.mails[0].to),['test-recipient@example.test']);assert.equal(s.mails[0].cc,undefined);assert.equal(s.mails[0].bcc,undefined);assert.equal(s.records.get('quotes/q').printJobHandoff.delivery.state,'sent');
 const retry=await s.perform(send);assert.equal(retry.replayed,true);assert.equal(s.mails.length,1);assert.equal(s.records.get('quotes/q').status,'approved');assert.equal(s.records.get('adminSettings/printPartners').partners[0].emailNotificationsEnabled,false);
});
test('SMTP failure or partial acceptance persists unknown and cannot be automatically retried',async()=>{
 for(const options of [{sendFails:true},{partialAccept:true}]){
  const s=setup(options);await confirm(s);await verify(s);const reviewed=await preview(s),send=sendBody(reviewed);
  await assert.rejects(()=>s.perform(send),/could not be confirmed/);assert.equal(s.records.get('quotes/q').printJobHandoff.delivery.state,'unknown');assert.equal(s.mails.length,1);
  await assert.rejects(()=>s.perform(send),/unconfirmed/);await assert.rejects(()=>s.perform({...send,requestId:'another-send-001'}),/unconfirmed/);assert.equal(s.mails.length,1);
 }
});
test('a lost final persistence result leaves a send lock and fails closed without sending again',async()=>{
 const s=setup({failResultWrite:true});await confirm(s);await verify(s);const reviewed=await preview(s);
 await assert.rejects(()=>s.perform(sendBody(reviewed)),/could not be recorded safely/);assert.equal(s.mails.length,1);assert.equal(s.records.get('quotes/q').printJobHandoff.delivery.state,'sending');
});
test('missing SMTP configuration is detected before any send lock is written',async()=>{
 const s=setup({smtp:false});await confirm(s);await verify(s);const reviewed=await preview(s);
 await assert.rejects(()=>s.perform(sendBody(reviewed)),/email server/);assert.equal(s.records.get('quotes/q').printJobHandoff.delivery,null);assert.equal(s.mails.length,0);
});
test('saved document endpoint is authenticated, read-only and refuses receipt documents',async()=>{
 const s=setup(),res=await s.documentGet();assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/pdf');assert.equal(s.writes.length,0);
 s.records.get('quotes/q').quote.documentType='receipt';assert.equal((await s.documentGet()).status,409);assert.equal(s.writes.length,0);assert.equal(s.mails.length,0);
});

test('an expired test date after preview blocks actual send without silently switching to live',async()=>{
 const s=setup();await confirm(s);await verify(s);const reviewed=await preview(s);
 s.records.get('adminSettings/printJobHandoff').testDate='2000-01-01';
 await assert.rejects(()=>s.perform(sendBody(reviewed)),/test date/);assert.equal(s.mails.length,0);assert.equal(s.records.get('quotes/q').printJobHandoff.delivery,null);
});
test('changing the payment snapshot after preview invalidates the reviewed send',async()=>{
 const s=setup();await confirm(s);await verify(s);const reviewed=await preview(s);
 await verify(s,1001.01,{expectedVersion:3,requestId:'later-payment-001',reference:'BANK-ALL',evidenceId:''});
 await assert.rejects(()=>s.perform(sendBody(reviewed)),/preview/);assert.equal(s.mails.length,0);
});
test('same request ID cannot authorize a different amount or action',async()=>{
 const s=setup();await confirm(s);await verify(s);
 await assert.rejects(()=>verify(s,1000),/already been used/);assert.equal(s.records.get('quotes/q').printJobHandoff.payments.length,1);
});

test('production preview includes displayed front/back final mockup fallbacks and print art, deduplicated against attachments',()=>{
 const q=approvedQuote();
 q.attachments=[{role:'print-artwork',side:'front',filename:'logo.png',url:'/uploads/logo.png'},{role:'print-artwork',side:'front',filename:'logo.png',url:'https://site.test/uploads/logo.png'},{filename:'guide.pdf',url:'/uploads/guide.pdf'}];
 q.designBrief={finalMockups:{front:'/renders/front.png',back:'https://site.test/renders/back.png'},productImages:{front:'/blank/product-front.png',back:'/blank/product-back.png'}};
 q.attachments.forEach(file=>{file.printPlacement='Front chest';file.printDimensions='20 x 25 cm';});q.printJobHandoff.priceConfirmation.packetFingerprint=packetHash(q);
 const p=domain.prepareHandoffPreview('q',q,settings(),registry(),origin,'preview-visuals',now);
 assert.equal(p.artwork.length,3);assert.equal(p.artwork.filter(f=>f.url==='https://site.test/uploads/logo.png').length,1);
 assert.match(p.text,/Front final mockup/);assert.match(p.text,/Back final mockup/);assert.match(p.text,/Front print artwork/);assert.match(p.text,/https:\/\/site.test\/renders\/front.png/);assert.match(p.text,/https:\/\/site.test\/renders\/back.png/);assert.ok(!p.text.includes('guide.pdf'));assert.ok(!p.text.includes('/blank/'));
});
test('a displayed final mockup changed after review invalidates the production send fingerprint',async()=>{
 const q=quote();q.designBrief={finalMockups:{front:'/renders/original.png'}};
 const s=setup({initialQuote:q});await confirm(s);await verify(s);const reviewed=await preview(s);
 s.records.get('quotes/q').designBrief.finalMockups.front='/renders/revised.png';
 await assert.rejects(()=>s.perform(sendBody(reviewed)),/changed|current quotation price/);assert.equal(s.mails.length,0);
});
test('payment confirmation requires the current price agreement before any verification write',async()=>{
 const s=setup();const before=structuredClone(s.records.get('quotes/q'));
 await assert.rejects(()=>verify(s),/Confirm the current quotation price/);assert.deepEqual(s.records.get('quotes/q'),before);assert.equal(s.writes.length,0);
 await confirm(s);s.records.get('quotes/q').quote.total=1500;
 await assert.rejects(()=>verify(s),/Confirm the current quotation price/);assert.equal(s.records.get('quotes/q').printJobHandoff.payments.length,0);assert.equal(s.mails.length,0);
});

test('closed, completed and newly rejected jobs invalidate old approval and block preview, send and direct price confirmation',async()=>{
 for(const closure of ['shop-declined','completed','client-rejected','client-changes']){
  const s=setup();await confirm(s);await verify(s);const reviewed=await preview(s),q=s.records.get('quotes/q');
  if(closure==='shop-declined'||closure==='completed')q.printJobWorkflow={stage:closure==='completed'?'completed':'declined',version:1,reason:'Closed by staff',updatedAtIso:new Date().toISOString(),updatedBy:actor};
  else {q.clientDecision=closure==='client-rejected'?'rejected':'changes_requested';q.clientDecisionComment='Client response after agreement';q.clientDecisionAtIso=new Date().toISOString();}
  const current=await s.store.readJobHandoff('q',origin,false);assert.equal(current.gates.canPreview,false);assert.equal(current.gates.priceAgreed,false);assert.equal(current.gates.reopenRequired,true);assert.equal(current.gates.jobClosed,closure!=='client-changes');
  await assert.rejects(()=>preview(s,{requestId:'preview-closed',expectedVersion:3}));await assert.rejects(()=>s.perform(sendBody(reviewed)));
  await assert.rejects(()=>s.perform({action:'confirm-price',requestId:'confirm-closed',expectedVersion:3,pricingFingerprint:domain.quotePricing(q).fingerprint,packetFingerprint:packetHash(q),agreedTotal:domain.quotePricing(q).quotedTotal,note:'Attempted new agreement'}),/reopened/);assert.equal(s.mails.length,0);assert.equal(q.status,'approved');
 }
});
test('explicit reopening alone does not reuse old approval; renewed agreement preserves the original rejection',async()=>{
 const s=setup();await confirm(s);await verify(s);const q=s.records.get('quotes/q');q.clientDecision='rejected';q.clientDecisionAtIso=new Date().toISOString();q.clientDecisionComment='Original client rejection';
 const opened=workflow.buildPrintJobWorkflowUpdate(q,workflow.validatePrintJobUpdate({stage:'new',reason:'Client returned and asked to proceed',expectedVersion:0,requestId:'explicit-reopen'}),actor,new Date().toISOString());
 q.printJobWorkflow=opened.workflow;q.printJobWorkflowHistory=[opened.historyEntry];
 const reopened=await s.store.readJobHandoff('q',origin,false);assert.equal(reopened.gates.jobClosed,false);assert.equal(reopened.gates.reopenRequired,false);assert.equal(reopened.gates.priceAgreed,false);assert.equal(reopened.gates.canPreview,false);
 const renewed=await s.perform({action:'confirm-price',requestId:'renewed-agreement',expectedVersion:2,pricingFingerprint:domain.quotePricing(q).fingerprint,packetFingerprint:packetHash(q),agreedTotal:domain.quotePricing(q).quotedTotal,note:'Client renewed agreement after reopening'});assert.equal(renewed.gates.priceAgreed,true);assert.equal(renewed.gates.canPreview,true);assert.equal(s.records.get('quotes/q').clientDecision,'rejected');assert.equal(s.mails.length,0);
});
test('delivered or cancelled linked production orders block even a manually open workspace stage, via either reference direction',async()=>{
 for(const status of ['Delivered','Cancelled'])for(const explicit of [true,false]){
  const s=setup();await confirm(s);await verify(s);const reviewed=await preview(s),q=s.records.get('quotes/q');
  if(explicit)q.orderTransactionId='order';s.records.set('transactions/order',{quoteId:'q',status});
  q.printJobWorkflow={stage:'production',version:1,reason:'Existing manual view',updatedAtIso:new Date().toISOString(),updatedBy:actor};
  const current=await s.store.readJobHandoff('q',origin,false);assert.equal(current.gates.jobClosed,true);assert.equal(current.gates.canPreview,false);await assert.rejects(()=>s.perform(sendBody(reviewed)));assert.equal(s.mails.length,0);assert.equal(s.records.get('transactions/order').status,status);
 }
});
test('a newer adverse client comment or response event invalidates a renewed agreement',()=>{
 const q=approvedQuote();q.clientResponseHistory=[{id:'new-change',action:'changes',decision:'changes_requested',comment:'Different sizes',submittedAtIso:new Date().toISOString()}];
 const view=domain.buildHandoffView('q',q,settings(),registry(),origin,false);assert.equal(view.gates.priceAgreed,false);assert.equal(view.gates.canPreview,false);
});

test('an adverse response edited without a timestamp still needs a fresh workflow review before renewing approval',async()=>{
 const s=setup();await confirm(s);await verify(s);let q=s.records.get('quotes/q');q.clientDecision='rejected';q.clientDecisionComment='First rejection';
 const opened=workflow.buildPrintJobWorkflowUpdate(q,workflow.validatePrintJobUpdate({stage:'new',reason:'Customer returned',expectedVersion:0,requestId:'reopen-before-renew'}),actor,new Date().toISOString());q.printJobWorkflow=opened.workflow;
 await s.perform({action:'confirm-price',requestId:'renewed-before-change',expectedVersion:2,pricingFingerprint:domain.quotePricing(q).fingerprint,packetFingerprint:packetHash(q),agreedTotal:domain.quotePricing(q).quotedTotal,note:'Renewed price agreement'});
 q=s.records.get('quotes/q');q.clientDecisionComment='A different adverse response';
 const view=await s.store.readJobHandoff('q',origin,false);assert.equal(view.gates.reopenRequired,true);assert.equal(view.gates.canPreview,false);
 await assert.rejects(()=>s.perform({action:'confirm-price',requestId:'renewed-without-review',expectedVersion:3,pricingFingerprint:domain.quotePricing(q).fingerprint,packetFingerprint:packetHash(q),agreedTotal:domain.quotePricing(q).quotedTotal,note:'Attempted renewal'}),/reopened/);
});

test('handoff sender accepts configured addresses and legacy display names without inventing an identity',async()=>{
 for(const [from,expected] of [[undefined,'sender@example.test'],['','sender@example.test'],['MO T-SHIRT <>','sender@example.test'],['MO T-SHIRT','sender@example.test'],['MO T-SHIRT <verified@example.test>','verified@example.test'],['verified@example.test','verified@example.test'],['bad@example.test,other@example.test','sender@example.test'],['Brand\r\nBcc: other@example.test','sender@example.test']]){
  const s=setup({initialQuote:approvedQuote(),smtpEnv:{SMTP_FROM:from}});
  const reviewed=await preview(s);const sent=await s.perform(sendBody(reviewed));
  assert.equal(sent.handoff.state,'sent');assert.equal(s.mails.length,1);
  assert.equal(s.mails[0].from,expected);assert.equal(s.mails[0].envelope.from,expected);
  assert.deepEqual(Array.from(s.mails[0].to),['test-recipient@example.test']);
  assert.deepEqual(Array.from(s.mails[0].envelope.to),['test-recipient@example.test']);
  assert.match(s.mails[0].subject,/TEST ONLY/);assert.ok(!s.mails[0].bcc);
 }
});
test('SMTP configuration errors name only invalid fields and occur before send state or payment changes',async()=>{
 for(const [env,field] of [[{SMTP_HOST:''},'SMTP_HOST'],[{SMTP_USER:' '},'SMTP_USER'],[{SMTP_PASS:' '},'SMTP_PASS'],[{SMTP_USER:'not-an-address',SMTP_FROM:'MO T-SHIRT <>'},'SMTP_FROM'],[{SMTP_PORT:'0'},'SMTP_PORT'],[{SMTP_PORT:'65536'},'SMTP_PORT'],[{SMTP_PORT:'465.5'},'SMTP_PORT'],[{SMTP_PORT:'invalid-port-value'},'SMTP_PORT']]){
  const s=setup({initialQuote:approvedQuote(),smtpEnv:env});const reviewed=await preview(s);
  const before=structuredClone([...s.records]),writes=s.writes.length;
  const response=await s.post(sendBody(reviewed));const body=await response.json();
  assert.equal(response.status,503);assert.ok(body.error.includes(field));assert.match(body.error,/No handoff was sent/);
  for(const value of ['fixture-only','smtp.example.test','sender@example.test','not-an-address','invalid-port-value'])assert.ok(!body.error.includes(value));
  assert.equal(s.mails.length,0);assert.equal(s.writes.length,writes);assert.deepEqual([...s.records],before);
 }
});
test('valid SMTP port bounds and explicit sender with non-email SMTP login remain supported',async()=>{
 for(const port of ['1','465','587','65535']){
  const s=setup({initialQuote:approvedQuote(),smtpEnv:{SMTP_USER:'smtp-login',SMTP_FROM:'Brand <verified@example.test>',SMTP_PORT:port}});
  const reviewed=await preview(s);await s.perform(sendBody(reviewed));assert.equal(s.mails.length,1);assert.equal(s.mails[0].from,'verified@example.test');
 }
});

const liveSettings = () => ({...settings(),testEnabled:false,liveEnabled:true});
const saveSpecs = async (s,view,specs=view.productionSpecs,extra={}) => s.perform({action:'save-production-specs',requestId:'save-specs-0001',expectedVersion:view.version,packetFingerprint:view.productionPacketFingerprint,specs,...extra});

test('live delivery atomically creates one immutable release and Yan assignment; exact replay sends and assigns once',async()=>{
 const q=approvedQuote(),s=setup({initialQuote:q,config:liveSettings()});const reviewed=await preview(s);
 const result=await s.perform(sendBody(reviewed)),saved=s.records.get('quotes/q');
 assert.equal(result.handoff.state,'sent');assert.equal(result.handoff.releaseState,'released');assert.equal(saved.productionRelease.mode,'live');assert.equal(saved.productionRelease.packetFingerprint,reviewed.preview.packetFingerprint);assert.deepEqual(saved.productionRelease.packet,structuredClone(reviewed.preview.packet));assert.equal(saved.productionRelease.priceConfirmationId,'price-0001');assert.equal(saved.productionRelease.paymentRecordId,'payment-0001');assert.ok(saved.partner.visibleTo.includes('yan'));assert.equal(saved.partner.id,'yan');
 assert.equal(packet.productionReleaseReadiness('q',saved).ready,true);
 const release=structuredClone(saved.productionRelease);await s.perform(sendBody(reviewed));assert.equal(s.mails.length,1);assert.deepEqual(s.records.get('quotes/q').productionRelease,release);
 const value=JSON.stringify(saved.productionRelease.packet);for(const secret of ['Private customer','private@example.test','555-PRIVATE','PRIVATE ADDRESS','PRIVATE NOTES','proof-one','BANK-001','staff@example.test'])assert.ok(!value.includes(secret));
 assert.ok(s.writes.every(w=>!w.key.startsWith('transactions/')&&!w.key.startsWith('stock')));
});
test('test delivery never creates or edits production release or partner assignment',async()=>{
 const q=approvedQuote();q.partner={id:'other',visibleTo:['other'],lockedBy:'other',responses:{other:{comments:'Keep'}}};const before=structuredClone(q.partner),s=setup({initialQuote:q});const reviewed=await preview(s);await s.perform(sendBody(reviewed));const saved=s.records.get('quotes/q');assert.equal(saved.productionRelease,undefined);assert.deepEqual(saved.partner,before);assert.equal(saved.printJobHandoff.delivery.releaseState,'not_applicable');
});
test('a prior Yan shared offer is restricted to Yan while preserving other response history and existing lock',async()=>{
 const q=approvedQuote();q.partner={id:'yan',name:'Yan',visibleTo:['yan','third'],lockedBy:'yan',responses:{other:{comments:'Keep private negotiation',requestStatus:'rejected'}},customField:'Keep'};const s=setup({initialQuote:q,config:liveSettings()}),reviewed=await preview(s);await s.perform(sendBody(reviewed));const partner=s.records.get('quotes/q').partner;assert.equal(partner.id,'yan');assert.equal(partner.name,'Yan');assert.equal(partner.lockedBy,'yan');assert.deepEqual(partner.visibleTo,['yan']);assert.equal(partner.responses.other.comments,'Keep private negotiation');assert.equal(partner.customField,'Keep');assert.deepEqual(s.records.get('quotes/q/handoffEvents/result-send-request-001').previousAssignment.visibleTo,['yan','third']);
});
test('another assigned or accepted partner blocks handoff even without a lock',async()=>{
 for(const partner of [{id:'other',visibleTo:['other']},{id:'yan',visibleTo:['yan','other'],responses:{other:{requestStatus:'accepted'}}}]){const q=approvedQuote();q.partner=partner;const s=setup({initialQuote:q,config:liveSettings()});await assert.rejects(()=>preview(s),/Another production partner/);assert.equal(s.mails.length,0);assert.deepEqual(s.records.get('quotes/q').partner,partner);}
});
test('another partner lock blocks live send before SMTP',async()=>{
 const q=approvedQuote();q.partner={id:'other',lockedBy:'other'};const s=setup({initialQuote:q,config:liveSettings()});await assert.rejects(()=>preview(s),/Another production partner/);assert.equal(s.mails.length,0);assert.equal(s.records.get('quotes/q').productionRelease,undefined);
});
test('confirmed SMTP delivery with intervening job, file, financial, mode or assignment edits records sent-but-blocked and never releases',async()=>{
 const changes=[q=>{q.garments[0].size='L'},q=>{q.attachments[0].url='/revised/logo.png'},q=>{q.printDimensions='40 x 40 cm'},q=>{q.quote.total=2000},q=>{q.clientDecision='rejected'},q=>{q.printJobWorkflow={stage:'completed',version:1}},q=>{q.partner={id:'other',lockedBy:'other'}},q=>{q.printJobHandoff.payments.push({...q.printJobHandoff.payments[0],id:'correction',amountReceived:0})}];
 for(const change of changes){const s=setup({initialQuote:approvedQuote(),config:liveSettings(),duringSend:records=>change(records.get('quotes/q'))});const reviewed=await preview(s);await assert.rejects(()=>s.perform(sendBody(reviewed)),/email was sent, but production was not released/);const saved=s.records.get('quotes/q');assert.equal(s.mails.length,1);assert.equal(saved.printJobHandoff.delivery.state,'sent');assert.equal(saved.printJobHandoff.delivery.releaseState,'blocked');assert.ok(saved.printJobHandoff.delivery.releaseBlockers.length);assert.equal(saved.productionRelease,undefined);await assert.rejects(()=>s.perform(sendBody(reviewed)),/not released/);assert.equal(s.mails.length,1);}
 const s=setup({initialQuote:approvedQuote(),config:liveSettings(),duringSend:records=>{records.get('adminSettings/printJobHandoff').liveEnabled=false}});const reviewed=await preview(s);await assert.rejects(()=>s.perform(sendBody(reviewed)),/not released/);assert.equal(s.records.get('quotes/q').productionRelease,undefined);
});
test('closed linked order discovered after SMTP never silently releases production',async()=>{
 const s=setup({initialQuote:approvedQuote(),config:liveSettings(),duringSend:records=>records.set('transactions/order',{quoteId:'q',status:'Delivered'})});const reviewed=await preview(s);await assert.rejects(()=>s.perform(sendBody(reviewed)),/not released/);assert.equal(s.records.get('quotes/q').productionRelease,undefined);assert.equal(s.records.get('transactions/order').status,'Delivered');
});
test('uncertain SMTP or final persistence never releases live jobs or clears their durable send lock',async()=>{
 for(const options of [{sendFails:true},{partialAccept:true},{failResultWrite:true}]){const s=setup({initialQuote:approvedQuote(),config:liveSettings(),...options});const reviewed=await preview(s);await assert.rejects(()=>s.perform(sendBody(reviewed)));const saved=s.records.get('quotes/q');assert.equal(saved.productionRelease,undefined);assert.equal(saved.partner,undefined);assert.ok(['unknown','sending'].includes(saved.printJobHandoff.delivery.state));await assert.rejects(()=>s.perform(sendBody(reviewed)));assert.equal(s.mails.length,1);}
});
test('spec save validates current packet identity and recorded file variants, invalidates price agreement and preview only',async()=>{
 const s=setup({initialQuote:approvedQuote()});const view=await s.store.readJobHandoff('q',origin,false),oldQuote=structuredClone(s.records.get('quotes/q').quote),specs=structuredClone(view.productionSpecs);specs.artworks[0].widthCm=21;
 const changed=await saveSpecs(s,view,specs);assert.equal(changed.priceConfirmation.current,false);assert.equal(changed.preview,null);assert.equal(changed.productionPacket.artworks[0].widthCm,21);assert.deepEqual(s.records.get('quotes/q').quote,oldQuote);assert.equal(s.mails.length,0);assert.equal(changed.payment.verifiedAmount,500.51);
 await assert.rejects(()=>saveSpecs(s,view,specs,{requestId:'stale-specs-0002',expectedVersion:changed.version}),/products or files changed/);
 const bad=structuredClone(changed.productionSpecs);bad.artworks[0].selectedVariant='processed';await assert.rejects(()=>saveSpecs(s,changed,bad,{requestId:'unavailable-variant'}),/unavailable variant/);
 const injected=structuredClone(changed.productionSpecs);injected.artworks[0].url='https://attacker.test/print.png';await assert.rejects(()=>saveSpecs(s,changed,injected,{requestId:'unknown-file-url'}),/valid production/);
 const external=structuredClone(changed.productionSpecs);external.artworks[0].fileKey='file-'+'a'.repeat(24);await assert.rejects(()=>saveSpecs(s,changed,external,{requestId:'unknown-file-key'}),/artwork files changed/);
});
test('price agreement requires the exact reviewed packet, not only unchanged price or handoff version',async()=>{
 const s=setup(),q=s.records.get('quotes/q'),old=packetHash(q);q.garments[0].color='Red';await assert.rejects(()=>s.perform({action:'confirm-price',requestId:'stale-price-0001',expectedVersion:0,packetFingerprint:old,pricingFingerprint:domain.quotePricing(q).fingerprint,agreedTotal:1001.01,note:'Client agreed'}),/production packet changed/);assert.equal(s.writes.length,0);
});
test('source and processed variants have separate immutable metadata, chosen file and fingerprint coverage',()=>{
 const q=quote();q.attachments=[{filename:'transparent.png',url:'/processed.png',size:321,contentType:'image/png',originalFilename:'source.pdf',originalUrl:'/original.pdf',originalSize:987,originalContentType:'application/pdf',originalProvenance:'client-upload',backgroundRemovalMethod:'ai',role:'print-artwork',side:'front'}];const initial=packet.buildProductionPacket('q',q),specs=packet.productionSpecsFromPacket(initial);specs.artworks[0].selectedVariant='processed';q.productionSpecs=specs;const current=packet.buildProductionPacket('q',q);assert.equal(current.artworks[0].source.url,'/original.pdf');assert.equal(current.artworks[0].source.sizeBytes,987);assert.equal(current.artworks[0].processed.url,'/processed.png');assert.equal(current.artworks[0].selectedFile.url,'/processed.png');assert.equal(current.artworks[0].processed.provenance,'ai');assert.equal(packet.productionPacketReadiness(current).ready,true);assert.notEqual(packet.productionPacketFingerprint(current),packet.productionPacketFingerprint(initial));q.attachments[0].originalSize=988;assert.notEqual(packetHash(q),packet.productionPacketFingerprint(current));
});
test('mockup-only, filename-only, missing dimensions, undecided method and incomplete garment rows all fail closed; explicit plain is exempt',()=>{
 const cases=[q=>{q.attachments=[{role:'final-mockup',filename:'final-mockup.png',url:'/mockup.png'}]},q=>{q.attachments=[{filename:'logo.png'}]},q=>{delete q.printDimensions},q=>{q.printMethod='Not sure'},q=>{q.garments[0].size=''},q=>{q.garments[0].quantity=1.5}];for(const change of cases){const q=quote();change(q);assert.equal(packet.productionPacketReadiness(packet.buildProductionPacket('q',q)).ready,false)}const q=quote();q.attachments=[];q.printMethod='No customization';delete q.printDimensions;delete q.printPlacement;assert.equal(packet.productionPacketReadiness(packet.buildProductionPacket('q',q)).ready,true);
});
test('unrelated attachments stay unselected, known print variants cannot substitute mockups, and packet deadline is honest',()=>{
 const q=quote();q.attachments.push({filename:'instructions.pdf',url:'/instructions.pdf'},{role:'final-mockup',filename:'preview.png',url:'/preview.png'});q.attachments[0].printPlacement='Front';q.attachments[0].printDimensions='20 x 25 cm';const current=packet.buildProductionPacket('q',q);assert.equal(current.artworks.length,2);assert.equal(current.artworks[1].useForPrint,false);assert.equal(current.mockups.length,1);assert.equal(current.deadline.date,null);assert.equal(current.deadline.label,'Unconfirmed: Tomorrow');assert.equal(packet.productionPacketReadiness(current).ready,true);q.productionSpecs=packet.productionSpecsFromPacket(current);q.productionSpecs.deadline='2026-10-20';assert.equal(packet.buildProductionPacket('q',q).deadline.date,'2026-10-20');
});
test('release parser strips injected fields and checks fingerprint, changed or closed releases block production',async()=>{
 const s=setup({initialQuote:approvedQuote(),config:liveSettings()}),reviewed=await preview(s);await s.perform(sendBody(reviewed));const saved=s.records.get('quotes/q'),release=structuredClone(saved.productionRelease);release.secret='PRIVATE';release.packet.customer='PRIVATE';const parsed=packet.parseProductionRelease(release);assert.ok(parsed);assert.equal(parsed.secret,undefined);assert.equal(parsed.packet.customer,undefined);release.packet.products[0].size='L';assert.equal(packet.parseProductionRelease(release),null);
 saved.garments[0].color='Blue';assert.equal(packet.productionReleaseReadiness('q',saved).ready,false);saved.garments[0].color='Black';saved.clientDecision='rejected';assert.equal(packet.productionReleaseReadiness('q',saved).ready,false);
});


test('later cumulative verified balance payment preserves the release while corrections below 50 percent fail closed',async()=>{
 const s=setup({initialQuote:approvedQuote(),config:liveSettings()}),reviewed=await preview(s);await s.perform(sendBody(reviewed));let saved=s.records.get('quotes/q');const version=saved.printJobHandoff.version;await verify(s,1001.01,{expectedVersion:version,requestId:'balance-payment-001',reference:'BANK-001+BALANCE',evidenceId:''});saved=s.records.get('quotes/q');assert.equal(packet.productionReleaseReadiness('q',saved).ready,true);assert.equal(saved.productionRelease.paymentRecordId,'payment-0001');saved.printJobHandoff.payments.push({...saved.printJobHandoff.payments.at(-1),id:'correction',amountReceived:1});assert.equal(packet.productionReleaseReadiness('q',saved).ready,false);
});

test('financial attachments and evidence-linked URLs or upload IDs never enter packets, previews, mockups or releases',async()=>{
 const q=quote();q.attachments.push({role:'payment-evidence',filename:'receipt.png',url:'/private-receipt.png'},{role:'print-artwork',filename:'innocent.png',url:'https://site.test/private-proof.png'},{role:'print-artwork',filename:'renamed.png',url:'/renamed-private.png',uploadId:'proof-one'},{filename:'bank-statement.pdf',url:'/private-bank.pdf'},{role:'final-mockup',filename:'innocent-render.png',url:'/private-proof.png'});q.designBrief={finalMockups:{back:'/private-proof.png'}};const current=packet.buildProductionPacket('q',q);assert.equal(current.artworks.length,1);assert.equal(current.mockups.length,0);const value=JSON.stringify(current);for(const privateName of ['private-receipt','private-proof','renamed-private','private-bank','bank-statement','receipt.png'])assert.ok(!value.includes(privateName));const s=setup({initialQuote:q,config:liveSettings()});await confirm(s);await verify(s);const reviewed=await preview(s);await s.perform(sendBody(reviewed));assert.equal(s.records.get('quotes/q').productionRelease.packet.artworks.length,1);
});


test('a financial role or filename alone also blocks all linked finalMockup aliases without paymentEvidence',()=>{
 for(const sensitive of [{role:'payment-proof',filename:'innocent.png'},{filename:'receipt.png'}]){const q=quote();delete q.paymentEvidence;delete q.paymentReceipt;q.attachments=[{...sensitive,url:'/private-bank-image.png',originalUrl:'/private-bank-original.png',originalFilename:'other.png',contentType:'image/png'}];q.designBrief={finalMockups:{front:'/private-bank-image.png',back:'https://site.test/private-bank-original.png'}};const value=packet.buildProductionPacket('q',q);assert.equal(value.artworks.length,0);assert.equal(value.mockups.length,0);assert.ok(!JSON.stringify(value).includes('private-bank'));}
});


test('only selected artwork crosses into approved preview, immutable release and partner packet',async()=>{
 const q=quote();q.attachments.push({filename:'private-neutral-reference.pdf',url:'/neutral-unselected.pdf',contentType:'application/pdf'});q.attachments[0].printPlacement='Front';q.attachments[0].printDimensions='20 x 25 cm';const current=packet.buildProductionPacket('q',q);assert.equal(current.artworks.length,2);assert.equal(current.artworks[1].useForPrint,false);const originalHash=packet.productionPacketFingerprint(current);q.attachments[1].url='/changed-unselected.pdf';assert.equal(packetHash(q),originalHash);
 const s=setup({initialQuote:q,config:liveSettings()});await confirm(s);await verify(s);const reviewed=await preview(s);assert.equal(reviewed.productionPacket.artworks.length,2);assert.equal(reviewed.preview.packet.artworks.length,1);assert.ok(!JSON.stringify(reviewed.preview).includes('unselected.pdf'));await s.perform(sendBody(reviewed));const saved=s.records.get('quotes/q');assert.equal(saved.productionRelease.packet.artworks.length,1);assert.ok(!JSON.stringify(packet.productionReleaseReadiness('q',saved).packet).includes('unselected.pdf'));assert.equal(packet.productionReleaseReadiness('q',saved).ready,true);
});

test('artwork targets derive exact saved product, colour, size and quantity rows and change approval fingerprints',()=>{
 const q=quote();q.garments=[{garment:'Polo',color:'Black',size:'M',quantity:2},{garment:'T-shirt',color:'White',size:'L',quantity:3}];q.attachments=[{filename:'front-a.png',url:'/front-a.png',role:'print-artwork'},{filename:'front-b.png',url:'/front-b.png',role:'print-artwork'}];q.designBrief={artwork:[{product:'Polo',color:'Black',size:'M',quantity:2,printPlacement:'Front',printDimensions:'20 x 25 cm',files:[{filename:'front-a.png',side:'front'}]},{product:'T-shirt',color:'White',size:'L',quantity:3,printPlacement:'Front',printDimensions:'10 x 15 cm',files:[{filename:'front-b.png',side:'front'}]}]};const current=packet.buildProductionPacket('q',q);assert.deepEqual(Array.from(current.artworks[0].targetProductIndexes),[0]);assert.deepEqual(Array.from(current.artworks[1].targetProductIndexes),[1]);assert.equal(packet.productionPacketReadiness(current).ready,true);const hash=packetHash(q);q.designBrief.artwork[0].product='T-shirt';q.designBrief.artwork[0].color='White';q.designBrief.artwork[0].size='L';q.designBrief.artwork[0].quantity=3;assert.notEqual(packetHash(q),hash);assert.equal(packet.productionPacketReadiness(packet.buildProductionPacket('q',q)).ready,false);
});
test('ambiguous multi-row artwork needs explicit complete-row targets and rejects partial quantity assumptions',async()=>{
 const q=quote();q.garments.push({garment:'Polo',color:'Black',size:'L',quantity:3});q.designBrief={artwork:[{product:'Polo',color:'Black',quantity:1,files:[{filename:'logo.png'}]}]};const current=packet.buildProductionPacket('q',q);assert.deepEqual(Array.from(current.artworks[0].targetProductIndexes),[]);assert.equal(packet.productionPacketReadiness(current).ready,false);const s=setup({initialQuote:q}),view=await s.store.readJobHandoff('q',origin,false),specs=structuredClone(view.productionSpecs);specs.artworks[0].targetProductIndexes=[0,1];specs.artworks[0].placement='Front';specs.artworks[0].widthCm=20;specs.artworks[0].heightCm=25;const saved=await saveSpecs(s,view,specs);assert.equal(saved.productionReadiness.ready,true);const invalid=structuredClone(saved.productionSpecs);invalid.artworks[0].targetProductIndexes=[2];await assert.rejects(()=>saveSpecs(s,saved,invalid,{requestId:'invalid-target-0001'}),/artwork files changed/);const duplicate=structuredClone(saved.productionSpecs);duplicate.artworks[0].targetProductIndexes=[0,0];await assert.rejects(()=>saveSpecs(s,saved,duplicate,{requestId:'duplicate-target-001'}));
});


test('mixed plain-plus-printing instructions cannot bypass artwork or physical production checks',()=>{
 for(const method of ['No printing on front; DTF logo on back','Blank shirts with screen printing','Plain + embroidery','No customization, except printed sleeves']){const q=quote();q.printMethod=method;q.attachments=[];assert.equal(packet.isPlainProductionMethod(method),false);assert.equal(packet.productionPacketReadiness(packet.buildProductionPacket('q',q)).ready,false);}for(const method of ['Plain','Blank','No printing','No customization','Sans impression'])assert.equal(packet.isPlainProductionMethod(method),true);
});
