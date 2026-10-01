// Entirely generic fixtures. Read-only normalization and server-rendered details.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = module.paths;
  const original = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/lib/')) return load(`src/lib/${name.slice(6)}.ts`);
    if (name.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    return original(name);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}
const { buildPrintJobs, buildPendingEmailJobs } = load('src/lib/print-job-workflow.ts');
const { default: JobOrderDetails, JobListSummary } = load('src/components/admin/print-jobs/JobOrderDetails.tsx');
const now = Date.parse('2026-10-01T10:00:00Z');
const quote = data => ({ id: 'synthetic-quote', data: { name: 'Example customer', status: 'review', createdAt: now, ...data } });
const build = data => buildPrintJobs([quote(data)], [], now)[0];

test('preserves explicit customer, separate delivery, garment sizes, print specifications and full notes', () => {
  const data = { email: 'customer@example.test', phone: '00000000', printMethod: 'DTF', notes: 'Keep supplied colours.', message: 'Please quote this request.', garments: [{ garment: 'Cotton T-shirt', color: 'Navy', size: 'M', quantity: '3' }, { garment: 'Cotton T-shirt', color: 'Navy', size: 'L', quantity: '4' }], delivery: 'Courier', deliveryName: 'Example recipient', deliveryPhone: '11111111', deliveryAddress: '2 Example delivery road', deliveryPostCode: '00000', deadline: '2026-10-20', designBrief: { printPlacement: 'small_front_large_back', printDimensions: 'Front 9 × 9 cm; back 22 × 22 cm', frontLogoDescription: 'Left chest logo', clientNotes: 'Keep supplied colours.' }, quote: { clientCompany: 'Example company', clientAddress: '1 Example billing road', notes: 'Proof required.', currency: 'Rs', total: 700, lines: [{ description: 'Cotton T-shirts', quantity: 7, unitPrice: 100 }] } };
  const before = JSON.stringify(data), job = build(data), details = job.details;
  assert.equal(JSON.stringify(data), before);
  assert.equal(details.customer.address, '1 Example billing road');
  assert.equal(details.delivery.address, '2 Example delivery road');
  assert.equal(details.delivery.recipient, 'Example recipient');
  assert.equal(details.customer.company, 'Example company');
  assert.deepEqual(details.products.map(row => [row.color, row.size, row.quantity]), [['Navy', 'M', 3], ['Navy', 'L', 4]]);
  assert.equal(details.printMethod, 'DTF');
  assert.equal(details.printPlacement, 'Small front + large back');
  assert.equal(details.printDimensions, 'Front 9 × 9 cm; back 22 × 22 cm');
  assert.equal(details.notes.filter(note => note.text === 'Keep supplied colours.').length, 1);
  assert.ok(details.notes.some(note => note.text === 'Left chest logo'));
  assert.equal(details.pricingLines.length, 1);
  assert.equal(details.pricingLines[0].lineTotal, 700);
});

test('billing address is never asserted to be an explicit delivery address', () => {
  const job = build({ quote: { clientAddress: 'Example billing address' } });
  assert.equal(job.details.customer.address, 'Example billing address');
  assert.equal(job.details.delivery.address, '');
  assert.match(renderToStaticMarkup(React.createElement(JobOrderDetails, { item: job })), /Delivery address<\/dt><dd>Not provided/);
});

test('missing fields and studio percentages never turn into physical dimensions or prices', () => {
  const job = build({ garments: [{ garment: 'Polo', size: '', quantity: '' }], designBrief: { front: { artwork: { scale: 70, x: 15, y: 10 }, text: { size: 34 } }, estimatedTotal: 1000 }, quote: { lines: [{ description: 'Polo', quantity: '', unitPrice: '' }] } });
  assert.equal(job.details.products[0].quantity, null);
  assert.equal(job.details.printDimensions, '');
  assert.equal(job.details.pricingLines[0].unitPrice, null);
  assert.equal(job.details.pricingLines[0].lineTotal, null);
  assert.equal(job.total, null);
  const markup = renderToStaticMarkup(React.createElement(JobOrderDetails, { item: job }));
  assert.match(markup, /Print dimensions<\/dt><dd>Not provided/);
  assert.doesNotMatch(markup, /70 cm|Rs 1,000|<details/);
});

test('known saved studio size breakdown replaces a collapsed Mixed garment row', () => {
  const job = build({ garments: [{ garment: 'Polo', color: 'Blue', size: 'Mixed', quantity: 5 }], designBrief: { product: 'Polo', color: 'Blue', selectedSizes: [{ size: 'S', quantity: 2 }, { size: 'L', quantity: 3 }], printMethod: 'Embroidery', printPlacement: 'Front' } });
  assert.deepEqual(job.details.products.map(row => [row.description, row.size, row.quantity]), [['Polo', 'S', 2], ['Polo', 'L', 3]]);
  assert.match(job.details.summary, /S × 2, L × 3/);
  const markup = renderToStaticMarkup(React.createElement(JobListSummary, { item: job }));
  assert.match(markup, /Polo/); assert.match(markup, /Blue/); assert.match(markup, /S × 2/); assert.match(markup, /Embroidery/);
});

test('line totals use saved order amounts or quantity times explicit unit price only', () => {
  const [job] = buildPrintJobs([], [{ id: 'synthetic-order', data: { products: [{ product: 'Polo', quantity: 3, price: 1350 }, { product: 'T-shirt', quantity: 2, unitPrice: 100.125 }, { product: 'Cap', quantity: '', unitPrice: 50 }, { product: 'Sample', quantity: 1, unitPrice: 0, includeInTotals: false }], documentProfile: { clientName: 'Example order customer', clientEmail: 'order@example.test', clientPhone: '00000000', clientAddress: 'Example order address', notes: 'Order-specific notes', deliveryFee: 100, discount: 20 } } }], now);
  assert.equal(job.details.pricingSource, 'Order');
  assert.deepEqual(job.details.pricingLines.map(row => row.lineTotal), [1350, 200.25, null, 0]);
  assert.equal(job.details.pricingLines[0].unitPrice, null);
  assert.equal(job.details.pricingLines[3].included, false);
  assert.equal(job.details.customer.email, 'order@example.test');
  assert.equal(job.details.deliveryFee, 100);
  assert.equal(job.details.discount, 20);
});

test('attachment files retain original download links and reject unsafe URLs', () => {
  const job = build({ attachments: [{ filename: 'artwork.pdf', url: 'https://example.test/artwork.pdf', originalFilename: 'original.ai', originalUrl: 'https://example.test/original.ai', description: 'Original print file' }, { filename: 'unsafe.svg', url: 'javascript:alert(1)', originalUrl: '//evil.example.test/file.svg' }], emailImport: { attachmentNames: ['artwork.pdf', 'missing-file.pdf'] } });
  assert.equal(job.details.attachments.length, 3);
  assert.equal(job.details.attachments[0].originalUrl, 'https://example.test/original.ai');
  assert.equal(job.details.attachments[1].url, '');
  const markup = renderToStaticMarkup(React.createElement(JobOrderDetails, { item: job }));
  assert.match(markup, /href="https:\/\/example.test\/original.ai"/);
  assert.match(markup, /missing-file.pdf/);
  assert.doesNotMatch(markup, /href="javascript:|href="\/\//);
});

test('pending email requests expose saved product and print fields with attachment names only', () => {
  const [job] = buildPendingEmailJobs([{ id: 'synthetic-intake', status: 'needs_details', email: 'enquiry@example.test', subject: 'Generic polo enquiry', lastReplyAt: new Date(now).toISOString(), draft: { name: 'Example enquiry', company: 'Example club', phone: '00000000', address: 'Example address', printMethod: 'DTF', notes: 'Please confirm artwork.', lines: [{ description: 'Polo', quantity: 5 }] }, items: [{ product: 'Polo', colour: 'Blue', sizes: 'M: 2, L: 3', quantity: 5, printMethod: 'DTF', placement: 'Front left chest', artwork: 'Attached logo' }], attachmentNames: ['example-logo.pdf'] }], [], now);
  assert.equal(job.details.products[0].size, 'M: 2, L: 3');
  assert.equal(job.details.printMethod, 'DTF');
  assert.equal(job.details.printPlacement, 'Front left chest');
  assert.equal(job.details.attachments[0].name, 'example-logo.pdf');
  assert.equal(job.details.attachments[0].url, '');
  assert.ok(job.details.notes.some(note => note.text === 'Please confirm artwork.'));
});

test('order-only authorized input never obtains private quote details from a quote ID', () => {
  const [job] = buildPrintJobs([], [{ id: 'order', data: { quoteId: 'unavailable-private-quote', customerName: 'Example order', products: [{ product: 'Cap', quantity: 4 }] } }], now);
  assert.equal(job.quoteId, null);
  assert.deepEqual(job.details.attachments, []);
  assert.deepEqual(job.details.notes, []);
  assert.equal(job.details.printMethod, '');
  assert.equal(job.details.customer.email, '');
});

test('every detail section is visible without disclosure toggles and old payloads still render', () => {
  const job = build({ quote: { lines: [{ description: 'Generic T-shirt', quantity: 2, unitPrice: 100 }], total: 200 } });
  const full = renderToStaticMarkup(React.createElement(JobOrderDetails, { item: job }));
  for (const label of ['Customer details', 'Delivery details', 'Products and size quantities', 'Recorded line pricing', 'Notes and instructions', 'Attachments']) assert.ok(full.includes(`aria-label="${label}"`));
  assert.doesNotMatch(full, /<details|<button|<input|<form/);
  delete job.details;
  assert.match(renderToStaticMarkup(React.createElement(JobOrderDetails, { item: job })), /Generic T-shirt/);
});

test('linked order pricing, fees and total keep their currency rather than the quote currency', () => {
  const [job] = buildPrintJobs([quote({ orderTransactionId: 'order', quote: { currency: 'USD', total: 30, deliveryFee: 99, discount: 77, lines: [{ description: 'Quoted polo', quantity: 3, unitPrice: 10 }] } })], [{ id: 'order', data: { amount: 1350, products: [{ product: 'Polo', quantity: 3, unitPrice: 450 }], documentProfile: { currency: 'Rs', deliveryFee: 100 } } }], now);
  assert.equal(job.details.pricingCurrency, 'Rs');
  assert.equal(job.currency, 'Rs');
  assert.equal(job.details.deliveryFee, 100);
  assert.equal(job.details.discount, null);
  const markup = renderToStaticMarkup(React.createElement(JobOrderDetails, { item: job }));
  assert.match(markup, /Rs 450/); assert.match(markup, /Rs 1,350/); assert.doesNotMatch(markup, /USD|Rs 77|Rs 99/);
});

test('garment count excludes charge lines and unknown size quantities stay unknown', () => {
  const job = build({ garments: [{ garment: 'Polo', color: 'Blue', size: 'M', quantity: 5 }], quote: { lines: [{ description: 'Polos', quantity: 5, unitPrice: 100 }, { description: 'Setup fee', quantity: 1, unitPrice: 100 }] } });
  assert.equal(job.quantity, 6); // Legacy financial-line count remains unchanged.
  assert.equal(job.details.garmentQuantity, 5);
  const summary = renderToStaticMarkup(React.createElement(JobListSummary, { item: job }));
  assert.match(summary, /5 pieces/); assert.doesNotMatch(summary, /6 pieces/);
  assert.equal(build({ garments: [{ garment: 'Polo', quantity: 5 }, { garment: 'Cap', quantity: '' }] }).details.garmentQuantity, null);
  assert.equal(build({ quote: { lines: [{ description: 'Setup fee', quantity: 1, unitPrice: 100 }] } }).details.garmentQuantity, null);
});

test('legacy linked total calculated from quote lines keeps quote currency when order has no money', () => {
  const [job] = buildPrintJobs([quote({ orderTransactionId: 'order', quote: { currency: 'USD', total: 40, lines: [{ description: 'Quoted polo', quantity: 3, unitPrice: 10 }] } })], [{ id: 'order', data: { status: 'Pending', documentProfile: { currency: 'Rs' } } }], now);
  assert.equal(job.total, 30);
  assert.equal(job.currency, 'USD');
  assert.equal(job.details.pricingCurrency, 'USD');
});
