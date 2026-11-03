const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

marked.setOptions({
  gfm: true,
  breaks: false,
});

function renderGuideContent(content) {
  const source = String(content || '');
  const rendered = /<[a-z][\s\S]*>/i.test(source)
    ? source
    : marked.parse(source, { async: false });

  return sanitizeHtml(rendered, {
    allowedTags: [
      'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 's',
      'ul', 'ol', 'li', 'blockquote', 'a', 'article',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
    ],
    allowedAttributes: {
      a: ['href'],
      img: ['src', 'alt', 'title', 'loading'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
  });
}

module.exports = { renderGuideContent };
