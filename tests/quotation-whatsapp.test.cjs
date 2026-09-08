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
function setup(authorized=true){
 const writes=[];const uploads=[];
 const route=load('app/api/admin/quotes/whatsapp/route.ts',{
 'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},
 'firebase/firestore':{doc:()=> 'quote',getDoc:async()=>({exists:()=>true,data:()=>({name:'Client'})}),updateDoc:async(r,d)=>writes.push(d),serverTimestamp:()=>123},
 '@/lib/admin-request':{getAdminRequestSession:async()=>authorized?{allowedPages:[]}:null},
 '@/lib/admin-access':{hasAdminPageAccess:()=>authorized},
 '@/lib/firebase':{db:{}},
 '@/lib/quote-response-links':{buildQuoteResponseUrl:()=> 'https://www.mo-tshirt.mu/quotation/q?action=accept&token=signed'},
 '@/lib/public-upload-store':{storePublicUploadBuffer:async d=>{uploads.push(d);return {url:'/pdf',filename:d.filename};}},
 '@/lib/quotation-whatsapp':helper,
 '@/lib/request-safety':{isContentLengthWithinLimit:()=>true,isRequestOriginAllowed:r=>r.headers.get('origin')==='https://site.test'},
 });
 async function send(phone='59883880',origin='https://site.test') {
  const form=new FormData();form.set('quoteId','q');form.set('clientPhone',phone);form.set('clientName','Client');form.set('quote',JSON.stringify({documentType:'quotation',documentNumber:'Q-1',lines:[{description:'T-shirt',quantity:1,unitPrice:500}]}));form.set('pdf',new File(['pdf'],'quote.pdf',{type:'application/pdf'}));
  return route.POST(new Request('https://site.test/api/admin/quotes/whatsapp',{method:'POST',headers:{origin},body:form}));
 }
 return {send,writes,uploads};
}
test('requires admin access, same origin and valid client phone before storing anything',async()=>{
 for(const [s,phone,origin,status] of [[setup(false),'59883880','https://site.test',403],[setup(),'invalid','https://site.test',400],[setup(),'59883880','https://other.test',403]]){
 assert.equal((await s.send(phone,origin)).status,status);assert.equal(s.writes.length,0);assert.equal(s.uploads.length,0);
 }
});
test('saves current PDF and draft without email or falsely marking it sent',async()=>{
 const s=setup();const response=await s.send();assert.equal(response.status,200);
 const result=await response.json();const message=new URL(result.whatsappUrl).searchParams.get('text');
 assert.match(message,/preview=1/);assert.match(message,/token=signed/);
 assert.equal(s.uploads[0].buffer.toString(),'pdf');assert.equal(s.writes[0].quote.documentNumber,'Q-1');assert.equal(s.writes[0].phone,'59883880');
 assert.equal(s.writes[0].status,undefined);assert.equal(s.writes[0].sentAt,undefined);assert.equal(s.writes[0].email,undefined);
});
