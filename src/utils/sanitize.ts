import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'u', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'span', 'div', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'sub', 'sup', 'small', 'mark', 'del', 'ins', 'figure', 'figcaption',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
      'class', 'style', 'id', 'colspan', 'rowspan', 'align', 'valign',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

export function sanitizeTableHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'colgroup', 'col', 'a', 'b', 'i', 'u', 'em', 'strong', 'span',
      'br', 'p', 'div', 'img', 'sup', 'sub', 'small',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
      'class', 'style', 'id', 'colspan', 'rowspan', 'align', 'valign',
      'scope', 'border', 'cellpadding', 'cellspacing',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

export function stripHtml(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}
