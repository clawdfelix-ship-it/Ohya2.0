const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderGuideContent } = require('../utils/guideContent');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Markdown guide content renders headings, emphasis, lists and links', () => {
  const html = renderGuideContent('## 產品亮點\n\n**一套過**：方便。\n\n- 現貨\n- 保密包裝\n\n去[商品頁](/product/41169)確認。');
  assert.match(html, /<h2>產品亮點<\/h2>/);
  assert.match(html, /<strong>一套過<\/strong>/);
  assert.match(html, /<ul>\s*<li>現貨<\/li>\s*<li>保密包裝<\/li>\s*<\/ul>/);
  assert.match(html, /<a href="\/product\/41169">商品頁<\/a>/);
  assert.doesNotMatch(html, /##|\[商品頁\]/);
});

test('existing HTML guide content keeps semantic paragraphs, tables and quotes', () => {
  const html = renderGuideContent('<h2>比較</h2><p>適合<strong>新手</strong></p><table><thead><tr><th>材質</th></tr></thead><tbody><tr><td>TPE</td></tr></tbody></table><blockquote>注意清潔</blockquote>');
  assert.match(html, /<h2>比較<\/h2>/);
  assert.match(html, /<p>適合<strong>新手<\/strong><\/p>/);
  assert.match(html, /<table>[\s\S]*<th>材質<\/th>[\s\S]*<td>TPE<\/td>[\s\S]*<\/table>/);
  assert.match(html, /<blockquote>注意清潔<\/blockquote>/);
});

test('guide rendering removes scripts, event handlers and unsafe links', () => {
  const html = renderGuideContent('<p onclick="steal()">文字</p><script>steal()</script><img src="x" onerror="steal()"><a href="javascript:steal()">連結</a><style>body{display:none}</style>');
  assert.doesNotMatch(html, /<script|onclick=|onerror=|javascript:|<style/);
  assert.match(html, /<p>文字<\/p>/);
  assert.match(html, /<a>連結<\/a>/);
});

test('guide template uses the renderer and scoped readable typography', () => {
  const view = read('views/guide-post.ejs');
  assert.match(view, /renderGuideContent\(post\.content\)/);
  assert.match(view, /class="guide-content /);
  assert.match(view, /\/css\/guide-content\.css/);
  const css = read('public/css/guide-content.css');
  for (const selector of ['.guide-content p', '.guide-content h2', '.guide-content li', '.guide-content a', '.guide-content table']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
  assert.match(css, /overflow-wrap/);
  assert.match(css, /overflow-x:\s*auto/);
});
