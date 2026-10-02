const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const root = path.resolve(__dirname, '..');
const globals = postcss.parse(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'));
const jobs = postcss.parse(fs.readFileSync(path.join(root, 'src/components/admin/print-jobs/print-jobs.module.css'), 'utf8'));

function rule(css, selector) {
  let found;
  css.walkRules(selector, (entry) => { found = entry; });
  assert.ok(found, `Missing selector: ${selector}`);
  return found;
}
function value(entry, property) {
  let found;
  entry.walkDecls(property, (declaration) => { found = declaration.value; });
  assert.ok(found, `Missing ${property} in ${entry.selector}`);
  return found;
}
function tokenRule(css, selector, property) {
  let found;
  css.walkRules(selector, (entry) => {
    if (entry.nodes.some((node) => node.prop === property)) found = entry;
  });
  assert.ok(found);
  return found;
}
function luminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function inScreen(entry) {
  for (let parent = entry.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && parent.params === 'screen') return true;
  }
  return false;
}

test('small admin text and primary actions meet WCAG AA contrast', () => {
  const palette = tokenRule(globals, '.admin-root', '--admin-ink');
  const dark = tokenRule(globals, '.admin-root.admin-dark', '--admin-ink');
  for (const [foreground, background] of [
    [value(palette, '--admin-ink'), value(palette, '--admin-surface')],
    [value(palette, '--admin-muted'), value(palette, '--admin-canvas')],
    [value(palette, '--admin-accent-ink'), value(palette, '--admin-accent-soft')],
    ['#ffffff', value(palette, '--admin-action')],
    ['#ffffff', value(palette, '--admin-action-hover')],
    [value(dark, '--admin-muted'), value(dark, '--admin-surface')],
    [value(dark, '--admin-accent-ink'), value(dark, '--admin-accent-soft')],
  ]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
});

test('every job stage stays labelled with readable light and dark colours', () => {
  for (const stage of ['new', 'needs_details', 'awaiting_client', 'confirmed', 'production', 'ready', 'completed', 'declined']) {
    for (const prefix of ['', '.workspace[data-theme=dark] ']) {
      const selector = `${prefix}.badge[data-stage=${stage}]`;
      let entry;
      jobs.walkRules((candidate) => {
        if (candidate.selector.split(',').map((part) => part.trim()).includes(selector)) entry = candidate;
      });
      assert.ok(entry, selector);
      assert.ok(inScreen(entry), `Printed output is excluded: ${selector}`);
      assert.ok(contrast(value(entry, 'color'), value(entry, 'background')) >= 4.5, selector);
    }
  }
});

test('shared palette is admin-scoped and screen-only', () => {
  globals.walkDecls(/^--admin-(ink|muted|line|surface|canvas|accent|action)/, (declaration) => {
    assert.ok(['.admin-root', '.admin-root.admin-dark'].includes(declaration.parent.selector));
    assert.ok(inScreen(declaration));
  });
  const placeholder = rule(globals, '.admin-root.admin-light .admin-page-shell input[aria-label="Search jobs"]::placeholder');
  assert.equal(value(placeholder, 'color'), 'var(--admin-muted)');
  assert.ok(inScreen(placeholder));
});

test('product titles do not inherit metadata grey and mobile actions can wrap', () => {
  assert.equal(value(rule(jobs, '.clientCardInfo>span:first-child>strong'), 'color'), 'var(--ink)');
  assert.equal(value(rule(jobs, '.listValue'), 'flex-wrap'), 'wrap');
  const motion = rule(jobs, '.clientCard');
  assert.equal(value(motion, 'transition'), 'none');
  assert.equal(motion.parent.params, '(prefers-reduced-motion:reduce)');
});

test('Tanvi semantic messages override generic paragraph colour in both themes', () => {
  const tanvi = postcss.parse(fs.readFileSync(path.join(root, 'src/components/admin/print-jobs/tanvi-workflow.module.css'), 'utf8'));
  for (const selector of ['.panel .notice', '.panel .error']) {
    const entry = rule(tanvi, selector);
    assert.ok(contrast(value(entry, 'color'), value(entry, 'background')) >= 4.5);
  }
  assert.equal(value(rule(tanvi, '.panel .hint'), 'color'), 'var(--admin-muted, #5b6778)');
  const dark = tokenRule(globals, '.admin-root.admin-dark', '--admin-ink');
  for (const tone of ['--admin-success-ink', '--admin-warning-ink']) {
    assert.ok(contrast(value(dark, tone), value(dark, '--admin-surface')) >= 4.5);
  }
});

test('shared primary colours do not erase disabled quote-action styling', () => {
  let matched = 0;
  globals.walkRules((entry) => {
    if (!entry.selector.includes('.inline-flex:is(.bg-orange-500')) return;
    matched++;
    assert.ok(entry.selector.includes(':not(:disabled, [aria-disabled="true"])'));
  });
  assert.equal(matched, 2);
});
