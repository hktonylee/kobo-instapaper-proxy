import { UNSUPPORTED_PROTOCOLS } from './constants.js';

const hasUnsupportedProtocol = (value) => {
  const protocol = value.split(':')[0].toLowerCase();
  return UNSUPPORTED_PROTOCOLS.includes(`${protocol}:`);
};

const rewriteImageSources = (doc, { makeAbsolute, toJpgProxy }) => {
  const imageElements = doc.querySelectorAll('img[src], source[src]');
  imageElements.forEach((element) => {
    const value = element.getAttribute('src');
    if (!value) return;
    if (hasUnsupportedProtocol(value)) return;

    const absolute = makeAbsolute(value);
    if (!absolute) return;

    element.setAttribute('src', toJpgProxy(absolute));
  });

  const srcsetElements = doc.querySelectorAll('img[srcset], source[srcset]');
  srcsetElements.forEach((element) => {
    const entries = element.getAttribute('srcset')
      ?.split(',')
      .map((part) => part.trim())
      .map((part) => {
        const [url, descriptor] = part.split(/\s+/, 2);
        if (!url || hasUnsupportedProtocol(url)) return null;
        const absolute = makeAbsolute(url);
        return absolute ? `${toJpgProxy(absolute)}${descriptor ? ` ${descriptor}` : ''}` : null;
      })
      .filter(Boolean);

    if (entries?.length) {
      element.setAttribute('srcset', entries.join(', '));
    }
  });
};

export const resolveAndRewrite = (doc, proxyBase, originUrl, { jpgProxyBase = '' } = {}) => {
  const makeAbsolute = (value) => {
    try {
      return new URL(value, originUrl).toString();
    } catch (error) {
      console.warn('Failed to absolutize URL', value, error);
      return null;
    }
  };

  const toProxy = (absoluteUrl) => `${proxyBase}/${encodeURI(absoluteUrl)}`;
  const toJpgProxy = (absoluteUrl) => `${jpgProxyBase}/${encodeURI(absoluteUrl)}`;

  const assetTags = new Set([
    'img',
    'picture',
    'source',
    'video',
    'audio',
    'track',
    'iframe',
    'embed',
    'object',
    'script',
    'link',
  ]);

  const elements = doc.querySelectorAll('[href], [src]');
  elements.forEach((element) => {
    const attribute = element.hasAttribute('href') ? 'href' : 'src';
    const value = element.getAttribute(attribute);
    if (!value) return;

    if (hasUnsupportedProtocol(value)) return;

    const tag = element.tagName.toLowerCase();
    if (attribute === 'src' && assetTags.has(tag)) return;

    const absolute = makeAbsolute(value);
    if (!absolute) return;

    element.setAttribute(attribute, toProxy(absolute));
  });

  const srcsetElements = doc.querySelectorAll('[srcset]');
  srcsetElements.forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (assetTags.has(tag)) return;

    const entries = element.getAttribute('srcset')
      ?.split(',')
      .map((part) => part.trim())
      .map((part) => {
        const [url, descriptor] = part.split(/\s+/, 2);
        const absolute = makeAbsolute(url);
        return absolute ? `${absolute}${descriptor ? ` ${descriptor}` : ''}` : null;
      })
      .filter(Boolean);

    if (entries?.length) {
      element.setAttribute('srcset', entries.join(', '));
    }
  });

  if (jpgProxyBase) {
    rewriteImageSources(doc, { makeAbsolute, toJpgProxy });
  }
};
