const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, modules={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in modules))throw Error(n);return modules[n];},File,Buffer,URL,console});
 return exports;
}
const helper=load('src/lib/quotation-whatsapp.ts');
test('local and international WhatsApp numbers are normalized',()=>{
 for(const value of ['5988 3880','+230 5988 3880','00230 59883880']) assert.equal(helper.normalizeWhatsAppPhone(value),'23059883880');
 assert.equal(helper.normalizeWhatsAppPhone('+44 7700 900123'),'447700900123');
 for(const value of ['','phone','123','59883880 ext 1']) assert.equal(helper.normalizeWhatsAppPhone(value),null);
 const url=new URL(helper.buildQuotationWhatsAppUrl('59883880','A & B','Q-1','https://site.test/quotation/q?token=abc&preview=1'));
 assert.equal(url.pathname,'/23059883880');
 assert.match(url.searchParams.get('text'),/A & B/);
 assert.match(url.searchParams.get('text'),/upload your payment proof/);
 assert.ok(url.searchParams.get('text').includes('token=abc&preview=1'));
});
const storedQuote=()=>({documentType:'quotation',documentNumber:'Q-1',currency:'Rs',lines:[{description:'T-shirt',quantity:1,unitPrice:500}]});
function setup(options={}){
 const initial={name:'Client',phone:'59883880',quote:storedQuote(),...(options.stored||{})};
 const records=new Map([['quotes/q',structuredClone(initial)]]);const reads=[];const writes=[];const uploads=[];const pdfBuilds=[];
 const snap=ref=>({exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))});
 const firestore={
  doc:(_db,collection,id)=>`${collection}/${id}`,
  getDoc:async ref=>{reads.push(ref);return snap(ref);},
  serverTimestamp:()=>123,
  runTransaction:async(_db,callback)=>callback({
   get:async ref=>{reads.push(ref);return snap(ref);},
   update:(ref,data)=>{writes.push({ref,data});records.set(ref,{...records.get(ref),...structuredClone(data)});},
  }),
 };
 const route=load('app/api/admin/quotes/whatsapp/route.ts',{
  'next/server':{NextResponse:{json:(body,responseOptions)=>Response.json(body,responseOptions)}},
  'firebase/firestore':firestore,
  '@/lib/admin-request':{getAdminRequestSession:async()=>options.signedIn===false?null:{allowedPages:['/admin/quotation-approval']}},
  '@/lib/admin-access':{hasAdminPageAccess:()=>options.pageAccess!==false},
  '@/lib/firebase':{db:{}},
  '@/lib/quote-product-edit':{
   activeEditLock:data=>data.productEditLock||null,
   documentContentVersion:value=>JSON.stringify(value||{}),
  },
  '@/lib/quote-response-links':{buildQuoteResponseUrl:()=> 'https://www.mo-tshirt.mu/quotation/q?action=accept&token=signed'},
  '@/lib/public-upload-store':{storePublicUploadBuffer:async data=>{uploads.push(data);return {url:'/pdf',filename:data.filename};}},
  '@/lib/quotation-whatsapp':helper,
  '@/lib/quotation-pdf':{buildSavedQuotationPdf:data=>{pdfBuilds.push(structuredClone(data));return Buffer.from('built-stored-pdf');}},
  '@/lib/request-safety':{
   isContentLengthWithinLimit:(headers,max)=>!headers.get('content-length')||Number(headers.get('content-length'))<=max,
   isRequestOriginAllowed:request=>request.headers.get('origin')==='https://site.test',
  },
 });
 async function sendMultipart({phone='59883880',origin='https://site.test',name='Client',quote=storedQuote()}={}) {
  const form=new FormData();form.set('quoteId','q');form.set('clientPhone',phone);form.set('clientName',name);form.set('quote',JSON.stringify(quote));form.set('pdf',new File(['multipart-pdf'],'quote.pdf',{type:'application/pdf'}));
  return route.POST(new Request('https://site.test/api/admin/quotes/whatsapp',{method:'POST',headers:{origin},body:form}));
 }
 async function sendQuick({quoteId='q',origin='https://site.test'}={}) {
  return route.POST(new Request('https://site.test/api/admin/quotes/whatsapp',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({quoteId})}));
 }
 return {sendMultipart,sendQuick,records,reads,writes,uploads,pdfBuilds};
}
test('requires a signed-in quotation admin and same origin before reading or storing anything',async()=>{
 for(const options of [{signedIn:false},{pageAccess:false}]){
  const s=setup(options);assert.equal((await s.sendQuick()).status,403);assert.deepEqual(s.reads,[]);assert.deepEqual(s.uploads,[]);assert.deepEqual(s.writes,[]);assert.deepEqual(s.pdfBuilds,[]);
 }
 const crossOrigin=setup();assert.equal((await crossOrigin.sendQuick({origin:'https://other.test'})).status,403);assert.deepEqual(crossOrigin.reads,[]);assert.deepEqual(crossOrigin.uploads,[]);assert.deepEqual(crossOrigin.writes,[]);
});
test('rejects invalid stored and multipart WhatsApp phones without storing or attaching a PDF',async()=>{
 const quick=setup({stored:{phone:'invalid'}});assert.equal((await quick.sendQuick()).status,400);assert.equal(quick.uploads.length,0);assert.equal(quick.writes.length,0);
 const multipart=setup();assert.equal((await multipart.sendMultipart({phone:'invalid'})).status,400);assert.equal(multipart.reads.length,0);assert.equal(multipart.uploads.length,0);assert.equal(multipart.writes.length,0);
});
test('multipart sharing preserves the supplied PDF and attaches it without marking the quotation sent',async()=>{
 const s=setup();const response=await s.sendMultipart();assert.equal(response.status,200);
 const result=await response.json();const url=new URL(result.whatsappUrl);const message=url.searchParams.get('text');
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/23059883880');assert.match(message,/preview=1/);assert.match(message,/token=signed/);
 assert.equal(s.pdfBuilds.length,0);assert.equal(s.uploads[0].buffer.toString(),'multipart-pdf');assert.equal(s.uploads[0].filename,'Q-1.pdf');
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].ref,'quotes/q');assert.equal(s.writes[0].data.quotationDocument.filename,'Q-1.pdf');
 assert.equal(s.writes[0].data.status,undefined);assert.equal(s.writes[0].data.sentAt,undefined);assert.equal(s.writes[0].data.email,undefined);
});
test('JSON quick-share builds the PDF from the stored quote, stores and attaches it, then returns wa.me',async()=>{
 const s=setup({stored:{name:''}});const response=await s.sendQuick();assert.equal(response.status,200);
 const result=await response.json();const url=new URL(result.whatsappUrl);const message=url.searchParams.get('text');
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/23059883880');assert.match(message,/Hi Customer/);assert.match(message,/quotation Q-1/);assert.match(message,/token=signed/);assert.match(message,/preview=1/);
 assert.equal(s.pdfBuilds.length,1);assert.equal(s.pdfBuilds[0].quote.documentNumber,'Q-1');assert.equal(s.uploads.length,1);assert.equal(s.uploads[0].buffer.toString(),'built-stored-pdf');
 assert.equal(s.uploads[0].filename,'Q-1.pdf');assert.equal(s.uploads[0].contentType,'application/pdf');assert.equal(s.uploads[0].sessionId,'q');assert.equal(s.uploads[0].source,'quotation-whatsapp-document');
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].ref,'quotes/q');assert.deepEqual(s.writes[0].data.quotationDocument,{url:'/pdf',filename:'Q-1.pdf'});assert.equal(s.writes[0].data.whatsappPreparedAt,123);
 assert.equal(s.records.get('quotes/q').quotationDocument.filename,'Q-1.pdf');assert.equal(s.writes[0].data.status,undefined);assert.equal(s.writes[0].data.sentAt,undefined);
});
