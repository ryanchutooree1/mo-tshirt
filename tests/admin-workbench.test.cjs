const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/admin-workbench.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { buildWorkItems } = loaded.exports;
const now = Date.parse('2026-09-05T10:00:00Z');
const quote = (id, data = {}) => ({id,data:{name:'Example customer',status:'new',createdAt:now,...data}});
const order = (id, data = {}) => ({id,data:{customerName:'Example customer',status:'Pending',transactionDate:now,...data}});

test('joins both kinds of quote/order references into one job and carries details forward', () => {
  const result = buildWorkItems([quote('q1',{email:'test@example.com',attachments:[{filename:'art.pdf',url:'https://example.com/art.pdf'}]}),quote('q2',{orderTransactionId:'o2'})],[order('o1',{quoteId:'q1',status:'In Process',products:[{product:'Polo',quantity:20,unitPrice:450}],amount:9000}),order('o2')],now);
  assert.equal(result.length,2);
  const joined = result.find(item => item.orderId === 'o1');
  assert.equal(joined.quoteId,'q1'); assert.equal(joined.quantity,20); assert.equal(joined.total,9000);
  assert.equal(joined.email,'test@example.com'); assert.equal(joined.artwork.length,1);
  assert.equal(joined.stage,'production'); assert.equal(joined.attention,false);
});
test('acceptance and an automatically generated receipt do not prove payment was verified', () => {
  const [item] = buildWorkItems([quote('q',{clientDecision:'accepted',paymentReceipt:{paymentStatus:'Paid'}})],[],now);
  assert.equal(item.stage,'waiting'); assert.equal(item.action,'Review payment');
});
test('confirmed payment identifies the production handover', () => {
  const [item] = buildWorkItems([quote('q',{clientDecision:'accepted',paymentEvidence:{verificationStatus:'confirmed'}})],[],now);
  assert.equal(item.stage,'production'); assert.equal(item.action,'Prepare job');
});
test('changes override a sent quote and a rejection closes it', () => {
  const result = buildWorkItems([quote('q',{status:'sent',clientDecision:'changes_requested',clientDecisionComment:'Change the sizes'}),quote('r',{status:'sent',clientDecision:'rejected',deadline:'2026-01-01'})],[],now);
  assert.equal(result[0].reason,'Change the sizes'); assert.equal(result[0].stage,'requests');
  assert.equal(result[1].stage,'done'); assert.equal(result[1].overdue,false); assert.equal(result[1].attention,false);
});
test('recently sent quotes wait quietly; unanswered quotes become follow-ups after three days', () => {
  const result = buildWorkItems([quote('recent',{status:'sent',sentAt:now-86400000}),quote('old',{status:'sent',sentAt:now-4*86400000})],[],now);
  assert.equal(result[0].quoteId,'old'); assert.equal(result[0].attention,true); assert.equal(result[1].attention,false);
});
test('only an unambiguous past requested date is marked overdue, using Mauritius date', () => {
  const result = buildWorkItems([quote('past',{deadline:'2026-09-04'}),quote('today',{deadline:'2026-09-05'}),quote('free',{deadline:'Next Friday'}),quote('future',{deadline:'2026-10-01'})],[],now);
  assert.deepEqual(result.filter(item=>item.overdue).map(item=>item.quoteId),['past']);
});
test('ready orders, delivered orders and urgent work have different next actions', () => {
  const result = buildWorkItems([], [order('ready',{status:'Completed'}),order('done',{status:'Delivered'}),order('urgent',{status:'Urgent'})],now);
  assert.equal(result[0].orderId,'urgent'); assert.equal(result[0].action,'Review urgent job');
  assert.equal(result.find(item=>item.orderId==='ready').stage,'ready');
  assert.equal(result.find(item=>item.orderId==='done').stage,'done');
});
test('real partner handover statuses show ready without claiming the customer received it', () => {
  for(const status of ['completed','will_post_tomorrow','ryan_to_collect']) {
    const [item] = buildWorkItems([quote('q',{clientDecision:'accepted',partner:{productionStatus:status}})],[],now);
    assert.equal(item.stage,'ready'); assert.equal(item.action,'Review handover');
  }
});
test('empty draft lines fall back to original garments and empty payment labels are normalized', () => {
  const [item] = buildWorkItems([quote('q',{quote:{lines:[],total:0,paymentStatus:'Select Payment Status'},garments:[{garment:'Polo',color:'Blue',size:'XL',quantity:4}]})],[],now);
  assert.equal(item.lines[0].description,'Polo'); assert.equal(item.quantity,4); assert.equal(item.total,null); assert.equal(item.payment,'Not recorded');
});
test('timestamps are serialized as plain numbers and retain their method receiver', () => {
  class Timestamp { constructor(seconds){this.seconds=seconds;} toMillis(){return this.seconds*1000;} }
  const [item] = buildWorkItems([quote('q',{createdAt:new Timestamp(100)})],[],now);
  assert.equal(item.createdAt,100000); assert.doesNotThrow(()=>JSON.stringify(item));
});
test('untrusted artwork URLs cannot become executable links', () => {
  const [item] = buildWorkItems([quote('q',{attachments:[{url:'javascript:alert(1)'},{url:'//evil.test'},{url:'https://example.com/logo.png'},{url:'/uploads/local.png'}]})],[],now);
  assert.equal(item.artwork.length,2);
});
test('sources with only order permission expose no private quote details', () => {
  const [item] = buildWorkItems([], [order('o',{quoteId:'private-quote'})],now);
  assert.equal(item.quoteId,null); assert.deepEqual(item.artwork,[]);
});
test('legacy orders calculate their value from line totals when amount was never stored', () => {
  const [item] = buildWorkItems([], [order('legacy',{products:[{product:'Polo',quantity:3,price:1350},{product:'Tee',quantity:2,unitPrice:200}]})],now);
  assert.equal(item.total,1750);
});
