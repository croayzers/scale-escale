const SUSPICIOUS_RE = /[\u00C2\u00C3\u00E2\u00EF\u00F0\uFFFD]/;
const ATTRIBUTES_TO_SANITIZE = ['placeholder', 'title', 'aria-label', 'alt', 'value'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
const CP1252_REVERSE = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
  [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
  [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
  [0x017E, 0x9E], [0x0178, 0x9F]
]);

let observer = null;
let started = false;

function suspiciousScore(value) {
  const matches = String(value || '').match(/[\u00C2\u00C3\u00E2\u00EF\u00F0\uFFFD]/g);
  return matches ? matches.length : 0;
}

function cp1252ByteForChar(char) {
  const codePoint = char.codePointAt(0);
  if (typeof codePoint !== 'number') return 0x3F;
  if (codePoint <= 0xFF) return codePoint;
  return CP1252_REVERSE.get(codePoint) ?? 0x3F;
}

function decodeCp1252Utf8(value) {
  try {
    const bytes = Uint8Array.from([...String(value || '')].map(cp1252ByteForChar));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    return String(value || '');
  }
}

export function repairUiText(value) {
  const raw = String(value ?? '');
  if (!raw || !SUSPICIOUS_RE.test(raw)) return raw;

  let best = raw;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidate = decodeCp1252Utf8(best);
    if (!candidate || candidate === best) break;
    if (suspiciousScore(candidate) <= suspiciousScore(best) && !candidate.includes('\uFFFD')) {
      best = candidate;
      continue;
    }
    break;
  }

  return best;
}

function sanitizeTextNode(node) {
  if (!node?.nodeValue) return;
  const parentTag = node.parentElement?.tagName || '';
  if (SKIP_TAGS.has(parentTag)) return;
  const fixed = repairUiText(node.nodeValue);
  if (fixed !== node.nodeValue) node.nodeValue = fixed;
}

function sanitizeElementAttributes(element) {
  if (!element || SKIP_TAGS.has(element.tagName)) return;

  ATTRIBUTES_TO_SANITIZE.forEach(attribute => {
    const current = element.getAttribute(attribute);
    if (!current) return;
    const fixed = repairUiText(current);
    if (fixed !== current) element.setAttribute(attribute, fixed);
  });

  if (element instanceof HTMLInputElement) {
    const type = String(element.type || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'reset') {
      const fixed = repairUiText(element.value);
      if (fixed !== element.value) element.value = fixed;
    }
  }
}

function sanitizeNode(node) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    sanitizeTextNode(node);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node;
  sanitizeElementAttributes(element);

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    sanitizeTextNode(walker.currentNode);
  }

  element.querySelectorAll('*').forEach(child => sanitizeElementAttributes(child));
}

export function sanitizeDocumentText(root = document.body) {
  if (!root) return;
  sanitizeNode(root);
  document.title = repairUiText(document.title);
}

export function init() {
  if (started) return;
  started = true;
  sanitizeDocumentText(document.body);
  requestAnimationFrame(() => sanitizeDocumentText(document.body));
  window.setTimeout(() => sanitizeDocumentText(document.body), 150);
  window.setTimeout(() => sanitizeDocumentText(document.body), 800);

  observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'characterData') {
        sanitizeTextNode(mutation.target);
        return;
      }
      if (mutation.type === 'attributes') {
        sanitizeElementAttributes(mutation.target);
        return;
      }
      mutation.addedNodes.forEach(node => sanitizeNode(node));
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ATTRIBUTES_TO_SANITIZE,
    childList: true,
    characterData: true,
    subtree: true
  });
}

export const TextSanitizer = {
  init,
  repairUiText,
  sanitizeDocumentText
};
