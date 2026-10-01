const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/print-job-visuals.ts');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { buildPrintJobVisuals: visuals, buildPrintJobGarmentSummary: summary, MAX_PRINT_JOB_VISUALS } = loaded.exports;
const image = (url, changes = {}) => ({ url, filename: 'design.png', contentType: 'image/png', ...changes });

test('all front/back final garments and separate original production logos survive normalization', () => {
  const quote = { attachments: [
    image('/art/back-clean.png', { role: 'print-artwork', label: 'Back print artwork', originalUrl: '/art/back-original.png', originalFilename: 'back-original.png', originalContentType: 'image/png' }),
    image('/mockups/back-current.png', { role: 'final-mockup', label: 'Back final mockup', originalUrl: '/mockups/back-old.png' }),
    image('/art/front.png', { role: 'print-artwork', label: 'Front print artwork' }),
    image('/mockups/front.png', { role: 'final-mockup', label: 'Front final mockup' }),
  ], designBrief: { finalMockups: { front: '/mockups/front.png', back: '/mockups/back-old.png' } } };
  const before = JSON.stringify(quote), result = visuals(quote);
  assert.deepEqual(result.mockups.map(file => [file.url, file.side]), [['/mockups/front.png', 'front'], ['/mockups/back-current.png', 'back']]);
  assert.deepEqual(result.artworks.map(file => [file.url, file.side]), [['/art/front.png', 'front'], ['/art/back-original.png', 'back']]);
  assert.ok(result.mockups.every(file => file.kind === 'mockup'));
  assert.ok(result.artworks.every(file => file.kind === 'artwork'));
  assert.equal(JSON.stringify(quote), before);
});

test('known finalMockups schema supplies image fallbacks including extensionless upload URLs', () => {
  const result = visuals({ designBrief: { finalMockups: { front: '/api/quotation/uploads/a', back: 'https://example.test/render.png?token=existing' } } });
  assert.deepEqual(result.mockups.map(file => file.side), ['front', 'back']);
  assert.equal(result.artworks.length, 0);
});

test('plain garment bases, client design flags, logo filenames and ephemeral previews never become mockups', () => {
  assert.deepEqual(visuals({ designBrief: { productImages: { front: '/blank-front.png', back: '/blank-back.png' }, frontLogo: true, backLogo: true, artworkFiles: { front: 'front.png' }, previewUrl: 'blob:local' } }), { mockups: [], artworks: [] });
  assert.equal(visuals({ attachment: image('/logo.png', { role: 'print-artwork', filename: 'final-mockup.png' }) }).mockups.length, 0);
});

test('legacy singular attachments, named final mockups, and multiple artworks are supported', () => {
  assert.equal(visuals({ attachment: image('/front.png', { filename: 'shirt-front-final-mockup.png' }) }).mockups[0].side, 'front');
  const result = visuals({ attachments: [image('/one.png'), image('/two.png'), image('/three.png')] });
  assert.equal(result.artworks.length, 3);
  assert.ok(result.artworks.every(file => file.side === 'other'));
  assert.equal(visuals({ attachments: [image('/current.png')], attachment: image('/stale.png') }).artworks.length, 1);
});

test('sides require actual metadata and ambiguous sides remain neutral', () => {
  const result = visuals({ attachments: [image('/one.png', { label: 'Front and back logo' }), image('/two.png', { filename: 'background-logo.png' }), image('/three.png', { side: 'back' })] });
  assert.deepEqual(result.artworks.map(file => file.side), ['back', 'other', 'other']);
  const mapped = visuals({ attachment: image('/upload.png', { filename: 'mark.png' }), designBrief: { artwork: [{ files: [{ filename: 'mark.png', side: 'back' }] }] } });
  assert.equal(mapped.artworks[0].side, 'back');
  assert.equal(visuals({ attachment: image('/upload.png', { filename: 'mark.png' }), designBrief: { artworkFiles: { front: 'mark.png', back: 'mark.png' } } }).artworks[0].side, 'other');
  assert.equal(visuals({ attachment: image('/upload.png', { filename: 'mark.png', label: 'Front and back logo' }), designBrief: { artworkFiles: { front: 'mark.png' } } }).artworks[0].side, 'other');
});

test('matching finalMockups URL identifies an otherwise unnamed saved garment', () => {
  const result = visuals({ attachments: [image('/saved.png')], designBrief: { finalMockups: { back: '/saved.png' } } });
  assert.equal(result.mockups.length, 1);
  assert.equal(result.mockups[0].side, 'back');
  assert.equal(result.artworks.length, 0);
});

test('unsafe URLs and non-browser images cannot enter either gallery', () => {
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,a', 'blob:example', '//evil.test/x.png', '/\\evil.test/x.png', '/\n/evil.test/a.png', 'http://example.test/a.png', 'https://user:pass@example.test/a.png']) {
    assert.deepEqual(visuals({ attachment: image(url) }), { mockups: [], artworks: [] });
    assert.equal(visuals({ designBrief: { finalMockups: { front: url } } }).mockups.length, 0);
  }
  for (const attachment of [image('/logo.pdf'), image('/logo.png', { filename: 'logo.pdf' }), image('/logo.png', { contentType: 'application/pdf' }), image('/scan.heic'), image('/scan.tif'), image('/x', { filename: '', contentType: '' }), image('/x.png', { contentType: 'image/made-up' })]) {
    assert.equal(visuals({ attachment }).artworks.length, 0);
  }
  assert.equal(visuals({ designBrief: { finalMockups: { front: '/not-an-image.pdf' } } }).mockups.length, 0);
  assert.equal(visuals({ attachment: image('https://example.test/files%2Fart.webp?alt=media', { filename: '', contentType: '' }) }).artworks.length, 1);
});

test('brief fallbacks cannot override explicit non-image or artwork attachment metadata', () => {
  for (const attachment of [image('/api/quotation/uploads/file', { contentType: 'application/pdf' }), image('/api/quotation/uploads/file', { role: 'print-artwork' })]) {
    assert.equal(visuals({ attachment, designBrief: { finalMockups: { front: attachment.url } } }).mockups.length, 0);
  }
});

test('original and processed files are evaluated independently without carrying the wrong MIME', () => {
  const result = visuals({ attachment: image('/preview.png', { originalUrl: '/original.pdf', originalFilename: 'original.pdf', originalContentType: 'application/pdf' }) });
  assert.equal(result.artworks[0].url, '/preview.png');
  assert.equal(visuals({ attachment: image('/bad.pdf', { originalUrl: '/good.png', originalFilename: 'good.png', originalContentType: 'image/png' }) }).artworks[0].url, '/good.png');
});

test('duplicate images are bounded and conflicting repeated side claims are neutral', () => {
  const result = visuals({ attachments: [image('/same.png', { label: 'Front logo' }), image('/same.png', { label: 'Back logo' }), ...Array.from({ length: 100 }, (_, i) => image(`/image-${i}.png`))] });
  assert.equal(result.artworks.length, MAX_PRINT_JOB_VISUALS);
  assert.equal(result.artworks.find(file => file.url === '/same.png').side, 'other');
});

test('concise garment summaries use structured facts, collapse repeated products and retain size quantities', () => {
  const garments = [{ garment: 'Plain T-Shirt', color: 'Green', size: 'XS', quantity: 1 }, { garment: 'Plain T-Shirt', color: 'Green', size: 'M', quantity: 1 }];
  assert.equal(summary({ garments }), 'Plain T-Shirt · Green · XS × 1, M × 1');
  assert.equal(summary({ designBrief: { product: 'Polo', colour: 'Navy', selectedSizes: [{ size: 'M', quantity: '2' }] } }), 'Polo · Navy · M × 2');
  assert.equal(summary({ garments, designBrief: { color: 'Outdated', selectedSizes: [{ size: 'L', quantity: 9 }] } }), 'Plain T-Shirt · Green · XS × 1, M × 1');
  assert.equal(summary({ quote: { lines: [{ description: 'Unstructured price and print description' }] } }), '');
});

test('malformed sources safely produce empty collections', () => {
  for (const value of [undefined, null, [], 'quote', { attachments: [null, 9, 'file'], designBrief: [] }]) assert.deepEqual(visuals(value), { mockups: [], artworks: [] });
});
