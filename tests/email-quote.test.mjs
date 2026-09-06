import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEmailQuote, normalizeEmailQuoteDraft, emailQuoteId, isWebsiteQuotationCopy, buildEmailQuoteRecord } from '../src/lib/email-quote.ts';
const message = { id:'a1', threadId:'thread1', from:'Jane Doe <jane@example.com>', to:'motshirtmauritius@gmail.com', subject:'Uniform quotation', date:'6 September 2026', snippet:'', unread:true };
test('extracts client and garment details while retaining the entire enquiry', () => {
  const email = { ...message, text:'Company: Example Ltd\nPhone: +230 5123 4567\nAddress: Port Louis\nBRN: C12345\nVAT: VAT456\nPlease quote 40 black polo shirts, sizes S:10 M:20 L:10, embroidered logo on front.\nRequired by: 20 September\nPrinting method: embroidery\nDelivery: courier\nBudget: Rs 15000' };
  const draft = extractEmailQuote(email);
  assert.equal(draft.name,'Jane Doe'); assert.equal(draft.email,'jane@example.com'); assert.equal(draft.phone,'+230 5123 4567'); assert.equal(draft.company,'Example Ltd'); assert.equal(draft.address,'Port Louis'); assert.equal(draft.brn,'C12345'); assert.equal(draft.deadline,'20 September'); assert.equal(draft.lines[0].quantity,40); assert.match(draft.lines[0].description,/S:10 M:20 L:10/); assert.match(draft.notes,/Budget: Rs 15000/);
});
test('keeps unknown quantities and prices empty instead of inventing an order', () => {
  const email = { ...message, text:'Can you provide t-shirts for our event?' };
  const draft = extractEmailQuote(email);
  assert.equal(draft.lines[0].quantity,'');
  const record=buildEmailQuoteRecord(email,draft,'owner');
  assert.equal(record.quote.lines[0].unitPrice,''); assert.equal(record.quote.showTotals,false); assert.equal(record.status,'review');
});
test('uses reply-to and does not extract client fields from quoted history', () => {
  const draft = extractEmailQuote({ ...message, replyTo:'client@company.com', text:'Please quote 20 caps.\nOn Monday someone wrote:\nName: Old Client\nPhone: +230 5999 9999' });
  assert.equal(draft.email,'client@company.com'); assert.equal(draft.name,'Jane Doe'); assert.equal(draft.phone,''); assert.match(draft.notes,/Old Client/);
});
test('website form and studio notification copies cannot be imported', () => {
  assert.equal(isWebsiteQuotationCopy({...message,subject:'New Website Quotation from John'}),true);
  assert.equal(isWebsiteQuotationCopy({...message,subject:'Re: New Website Quotation from John'}),true);
  assert.equal(isWebsiteQuotationCopy(message),false);
});
test('repeated imports and replies use the same conversation quote ID', () => {
  assert.equal(emailQuoteId(message),emailQuoteId({...message,id:'a2'}));
  assert.notEqual(emailQuoteId(message),emailQuoteId({...message,threadId:'thread2'}));
});
test('normalizes untrusted drafts and retains email provenance separately from editable notes', () => {
  const draft=normalizeEmailQuoteDraft({name:' Jane ', email:'jane@example.com', lines:[{description:'caps',quantity:-3},{description:'polo',quantity:1.5},{description:'shirts',quantity:200001},{description:'tee',quantity:10}],notes:'Edited',admin:true});
  assert.deepEqual(draft.lines.map(l=>l.quantity),['','','',10]);
  const record=buildEmailQuoteRecord({...message,text:'Original enquiry',attachmentNames:['logo.pdf']},draft,'owner');
  assert.equal(record.emailImport.originalText,'Original enquiry'); assert.equal(record.emailImport.attachmentNames[0],'logo.pdf'); assert.equal(record.quote.notes,'Edited'); assert.equal(record.admin,undefined);
});
