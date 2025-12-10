import { Readability } from '@mozilla/readability';

const defaultReadability = {
  parse: (document) => new Readability(document).parse(),
};

const duckDuckGoReadability = {
  parse: (document) => {
    const linksContainer = document.querySelector('#links');
    const contentSource = linksContainer || document.body;
    const contentHtml = contentSource?.innerHTML ?? '';
    const wrappedContent = `<article>${contentHtml}</article>`;
    const title = document.title || 'DuckDuckGo Search Results';

    return { title, content: wrappedContent };
  },
};

const readabilityRules = [
  {
    match: (url) => {
      const hostname = new URL(url).hostname;
      return hostname.toLowerCase().includes('duckduckgo.com');
    },
    create: () => duckDuckGoReadability,
  },
];

const safeMatches = (rule, url) => {
  try {
    return rule.match(url);
  } catch (error) {
    console.warn('Readability rule match failed', { url, message: error?.message });
    return false;
  }
};

export const selectReadability = (targetUrl) => {
  const matchingRule = readabilityRules.find((rule) => safeMatches(rule, targetUrl));
  return matchingRule?.create?.() || defaultReadability;
};

