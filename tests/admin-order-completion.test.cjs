const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// Exercise the actual existing editor action with a transactional store double.
// No Firebase project or business records are touched by these checks.
const file = path.resolve(__dirname,'../src/components/admin/OrdersEditorPage.tsx');
const source = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let actionSource;
function visit(node){ if(ts.isFunctionDeclaration(node) && node.name?.text === 'markCompletedAndAdjust') actionSource=node.getText(source); ts.forEachChild(node,visit); }
visit(source);
assert.ok(actionSource,'Order completion action must exist');
const code = ts.transpileModule(actionSource,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
function setup(status='In Process',products=[{product:'Tee',quantity:2}],stock={qty:10}) {
  const records = new Map([['transactions/order',{status,products}],['products/Tee',stock],['account/order',{status}]]);
  const notices=[];
  const bindings={db:{},doc:(_db,collection,id)=>`${collection}/${id}`,serverTimestamp:()=>123,
    normalizeSizeLabel:(size)=>size,normalizeInventorySizeMap:(sizes)=>({...sizes}),showToast:(notice)=>notices.push(notice),setOverrides:()=>{},
    runTransaction:async(_db,callback)=>{
      const writes=[];
      const result=await callback({
        get:async(ref)=>{if(writes.length)throw new Error('Read after write is invalid in Firestore');return {id:ref.split('/').at(-1),exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))};},
        update:(ref,data)=>writes.push([ref,data]),
      });
      for(const [ref,data] of writes) records.set(ref,{...records.get(ref),...data});
      return result;
    }};
  const complete = vm.runInNewContext(`${code}\nmarkCompletedAndAdjust`,bindings);
  return {records,notices,complete};
}
test('completion reads the account and inventory before writing, and updates them together',async()=>{
  const {records,notices,complete}=setup(); await complete('order');
  assert.equal(records.get('transactions/order').status,'Completed'); assert.equal(records.get('products/Tee').qty,8); assert.equal(records.get('account/order').status,'Completed'); assert.equal(notices.at(-1).type,'ok');
});
test('duplicate product lines deduct their combined quantity exactly once',async()=>{
  const {records,complete}=setup('In Process',[{product:'Tee',quantity:2},{product:'Tee',quantity:3}]);
  await complete('order'); await complete('order'); assert.equal(records.get('products/Tee').qty,5);
});
test('repeated colour and size lines accumulate without losing the first deduction',async()=>{
  const {records,complete}=setup('In Process',[{product:'Tee',color:'Black',size:'M',quantity:2},{product:'Tee',color:'Black',size:'M',quantity:3}],{colors:[{color:'Black',sizes:{M:10,L:6}}]});
  await complete('order'); assert.equal(records.get('products/Tee').colors[0].sizes.M,5); assert.equal(records.get('products/Tee').colors[0].sizes.L,6);
});
test('insufficient combined stock leaves the whole order and account unchanged',async()=>{
  const {records,notices,complete}=setup('In Process',[{product:'Tee',quantity:6},{product:'Tee',quantity:6}]);
  await complete('order'); assert.equal(records.get('products/Tee').qty,10); assert.equal(records.get('transactions/order').status,'In Process'); assert.equal(records.get('account/order').status,'In Process'); assert.equal(notices.at(-1).type,'err');
});
test('closed or cancelled orders are not reopened or deducted again',async()=>{
  for(const status of ['Completed','Delivered','Cancelled']) {const {records,complete}=setup(status);await complete('order');assert.equal(records.get('products/Tee').qty,10);assert.equal(records.get('transactions/order').status,status);}
});
test('a previously adjusted order keeps its stock when production is reopened',async()=>{
  const {records,complete}=setup();records.get('transactions/order').inventoryAdjustedAt=1;await complete('order');assert.equal(records.get('products/Tee').qty,10);assert.equal(records.get('transactions/order').status,'Completed');
});
