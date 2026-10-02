import DOMPurify from 'dompurify';

/** All model/document HTML passes this boundary, including highlighted code. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'style', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'id', 'name'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#)/i,
  });
}
