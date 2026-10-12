const AUTO_DIRECTION_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'TD', 'TH']);
const CODE_DIRECTION_TAGS = new Set(['PRE', 'CODE', 'KBD']);

export interface HtmlSanitizerOptions {
  allowedTags: ReadonlySet<string>;
  dropTags: ReadonlySet<string>;
  safeHref: (value: string) => string | null;
  safeImageSrc?: (value: string) => string | null;
  preserveDirection?: boolean;
}

// Only inert chart shapes and their numeric geometry survive a captured SVG.
const SVG_SHAPES = new Set(['SVG', 'G', 'PATH', 'RECT', 'CIRCLE', 'ELLIPSE', 'LINE', 'POLYLINE', 'POLYGON', 'TEXT', 'TSPAN']);
const SVG_NUMBERS = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:[\s,]+[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)*$/i;
const SVG_PATH = /^[\d\s,\.eE+\-MmLlHhVvCcSsQqTtAaZz]+$/;
const SVG_COLOR = /^(?:none|currentColor|transparent|#[0-9a-f]{3,8}|rgba?\([\d.%\s,]+\))$/i;
const SVG_NUMERIC_ATTRIBUTES = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size']);
function safeSvgAttributes(element: Element): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const attribute of [...element.attributes]) {
    const name = attribute.name, value = attribute.value.trim();
    if (!value || value.length > 20_000) continue;
    if (name === 'viewBox' && element.tagName.toUpperCase() === 'SVG' && SVG_NUMBERS.test(value) && value.split(/[\s,]+/).length === 4) result.push([name, value]);
    else if (SVG_NUMERIC_ATTRIBUTES.has(name) && value.length <= 50 && SVG_NUMBERS.test(value) && value.split(/[\s,]+/).length === 1) result.push([name, value]);
    else if (name === 'd' && element.tagName.toUpperCase() === 'PATH' && SVG_PATH.test(value)) result.push([name, value]);
    else if (name === 'points' && /^(?:POLYLINE|POLYGON)$/.test(element.tagName.toUpperCase()) && SVG_NUMBERS.test(value)) result.push([name, value]);
    else if ((name === 'stroke' || name === 'fill') && SVG_COLOR.test(value)) result.push([name, value]);
    else if (name === 'text-anchor' && /^(?:start|middle|end)$/.test(value)) result.push([name, value]);
    else if (name === 'preserveAspectRatio' && element.tagName.toUpperCase() === 'SVG' && /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: meet| slice)?)$/.test(value)) result.push([name, value]);
  }
  return result;
}

/**
 * Shared renderer sanitizer for markup that originated outside the Electron renderer.
 *
 * Callers own their tag policy; this owns the security-sensitive traversal and the tiny common
 * attribute allowlist so chat captures and Files markdown cannot drift in opposite directions.
 */
export function sanitizeHtmlTree(parent: ParentNode, options: HtmlSanitizerOptions, directionOwned = false): void {
  for (const node of [...parent.childNodes]) {
    // Numeric nodeType is realm-agnostic and still covers namespace elements such as SVG/MathML.
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    const tag = element.tagName.toUpperCase();
    if (options.dropTags.has(tag)) {
      element.remove();
      continue;
    }

    const sourceDir = options.preserveDirection ? element.getAttribute('dir')?.toLowerCase() : null;
    const explicitDir = sourceDir === 'ltr' || sourceDir === 'rtl' || sourceDir === 'auto' ? sourceDir : null;
    const automaticDir = options.preserveDirection === true && !directionOwned && AUTO_DIRECTION_TAGS.has(tag);
    const codeDir = options.preserveDirection === true && CODE_DIRECTION_TAGS.has(tag);
    const resolvedDir = options.allowedTags.has(tag) ? explicitDir ?? (codeDir ? 'ltr' : automaticDir ? 'auto' : null) : null;

    sanitizeHtmlTree(element, options, directionOwned || !!resolvedDir);
    if (!options.allowedTags.has(tag)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const href = tag === 'A' ? options.safeHref(element.getAttribute('href') ?? '') : null;
    const title = element.getAttribute('title');
    const start = tag === 'OL' ? element.getAttribute('start') : null;
    const colSpan = tag === 'TD' || tag === 'TH' ? element.getAttribute('colspan') : null;
    const rowSpan = tag === 'TD' || tag === 'TH' ? element.getAttribute('rowspan') : null;
    const imageSrc = tag === 'IMG' ? options.safeImageSrc?.(element.getAttribute('src') ?? '') : null;
    const imageAlt = tag === 'IMG' ? element.getAttribute('alt') : null;
    const svgAttributes = SVG_SHAPES.has(tag) && element.namespaceURI === 'http://www.w3.org/2000/svg' ? safeSvgAttributes(element) : [];
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    for (const [name, value] of svgAttributes) element.setAttribute(name, value);
    if (resolvedDir) element.setAttribute('dir', resolvedDir);
    if (tag === 'IMG') {
      if (imageSrc) {
        element.setAttribute('src', imageSrc);
        element.setAttribute('loading', 'lazy');
        element.setAttribute('referrerpolicy', 'no-referrer');
        element.setAttribute('decoding', 'async');
      }
      if (imageAlt) element.setAttribute('alt', imageAlt.slice(0, 300));
    }
    if (href) {
      element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noreferrer noopener');
    }
    if (title) element.setAttribute('title', title.slice(0, 500));
    if (start && /^\d{1,6}$/.test(start)) element.setAttribute('start', start);
    if (colSpan && /^\d{1,3}$/.test(colSpan)) element.setAttribute('colspan', colSpan);
    if (rowSpan && /^\d{1,3}$/.test(rowSpan)) element.setAttribute('rowspan', rowSpan);
  }
}
