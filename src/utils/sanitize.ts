import DOMPurify from 'dompurify';

const SAFE_TAGS = [
  'p', 'br', 'b', 'i', 'u', 'em', 'strong', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div',
  'sub', 'sup', 'hr', 'figure', 'figcaption', 'caption', 'colgroup', 'col',
];

const SAFE_ATTRS = [
  'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
  'class', 'style', 'colspan', 'rowspan', 'align', 'valign',
];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: SAFE_ATTRS,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  } as Record<string, unknown>);
}

export function sanitizeTableHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [...SAFE_TAGS, 'caption', 'colgroup', 'col'],
    ALLOWED_ATTR: SAFE_ATTRS,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  } as Record<string, unknown>);
}
