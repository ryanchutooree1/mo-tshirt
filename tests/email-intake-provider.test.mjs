import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseEmailEnquiry } from '../src/lib/email-intake-ai.ts';
const message={id:'a',threadId:'t',from:'Jane <jane@example.com>',subject:'20 polos',date:'today',snippet:'',text:'20 polos',attachmentNames:[]};
const raw={classification:'enquiry',confidence:.99,language:'en',summary:'20 polos',fields:{},items:[{product:'polos',quantity:20,quantityEvidence:'20 polos'}]};
async function withFetch(fn,run){const old=globalThis.fetch,key=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test-secret';globalThis.fetch=fn;try{await run();}finally{globalThis.fetch=old;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}}
const result=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
test('uses only Groq, strict schema, and header authentication',async()=>withFetch(async(url,options)=>{
 assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-secret');const b=JSON.parse(options.body);assert.equal(b.model,'openai/gpt-oss-120b');assert.equal(b.response_format.json_schema.strict,true);assert.equal(b.response_format.json_schema.schema.additionalProperties,false);assert.equal(b.response_format.json_schema.schema.properties.fields.additionalProperties,false);return result();
},async()=>{assert.equal((await analyseEmailEnquiry([message])).classification,'enquiry');}));
test('respects provider quota retry time instead of repeatedly calling it',async()=>withFetch(async()=>new Response('',{status:429,headers:{'retry-after':'3600'}}),async()=>{await assert.rejects(analyseEmailEnquiry([message]),e=>e.retryAfterMs===3600000&&!e.message.includes('test-secret'));}));
test('refuses incomplete output',async()=>withFetch(async()=>Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify(raw)}}]}),async()=>{await assert.rejects(analyseEmailEnquiry([message]),/incomplete/);}));
test('a truncated conversation can never automatically become a quote',async()=>withFetch(async()=>result(),async()=>{const a=await analyseEmailEnquiry([{...message,text:'20 polos '+ 'x'.repeat(9000)}]);assert.equal(a.classification,'uncertain');assert(a.warnings.some(w=>w.includes('manual review')));}));
test('missing Groq key never falls back to Google',async()=>{const key=process.env.GROQ_API_KEY;delete process.env.GROQ_API_KEY;try{await assert.rejects(analyseEmailEnquiry([message]),/GROQ_API_KEY/);}finally{if(key!==undefined)process.env.GROQ_API_KEY=key;}});
