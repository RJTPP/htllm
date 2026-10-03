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

/** Only call with freshly generated highlighter markup, never model HTML. */
export function sanitizeHighlight(html: string): string {
  const fragment = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['pre', 'code', 'span'], ALLOWED_ATTR: ['class', 'style'], RETURN_DOM_FRAGMENT: true });
  for (const element of fragment.querySelectorAll('[style]')) {
    const color = element.getAttribute('style')?.match(/(?:^|;)\s*color\s*:\s*(#[\da-f]{3,8})\s*(?:;|$)/i)?.[1];
    element.removeAttribute('style');
    if (color && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) element.setAttribute('style', `color:${color}`);
  }
  const wrapper = document.createElement('div'); wrapper.append(fragment);
  return wrapper.innerHTML;
}
