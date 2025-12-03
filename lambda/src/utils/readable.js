import 'whatwg-fetch';
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import { buildArticleHtml } from './html.js';
import { resolveAndRewrite } from './dom.js';

const applyFetchPolyfill = (window) => {
  if (!window.fetch && globalThis.fetch) {
    window.fetch = globalThis.fetch;
  }
  if (!window.Headers && globalThis.Headers) {
    window.Headers = globalThis.Headers;
  }
  if (!window.Request && globalThis.Request) {
    window.Request = globalThis.Request;
  }
  if (!window.Response && globalThis.Response) {
    window.Response = globalThis.Response;
  }
};

const createVirtualConsole = () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    const message = error?.cause?.message ?? error?.message ?? String(error);
    console.error(`[JSDOM] ${message}`);
  });

  return virtualConsole;
};

export const renderReadablePage = (pageContent, targetUrl, proxyBase, { jpgProxyBase = '' } = {}) => {
  const virtualConsole = createVirtualConsole();

  const dom = new JSDOM(pageContent, {
    url: targetUrl,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
  });
  applyFetchPolyfill(dom.window);
  const article = new Readability(dom.window.document).parse();

  const contentHtml = article?.content || dom.window.document.body.innerHTML;
  const articleDom = new JSDOM(contentHtml, {
    url: targetUrl,
    virtualConsole,
    pretendToBeVisual: true,
  });
  applyFetchPolyfill(articleDom.window);

  if (proxyBase) {
    resolveAndRewrite(articleDom.window.document, proxyBase, targetUrl, { jpgProxyBase });
  }

  const title = article?.title || dom.window.document.title || 'Saved article';
  const bodyHtml = articleDom.window.document.body.innerHTML;
  const html = buildArticleHtml(title, bodyHtml);

  return { html, title };
};

export const renderLinkRewrittenPage = (pageContent, targetUrl, proxyBase, { jpgProxyBase = '' } = {}) => {
  const virtualConsole = createVirtualConsole();

  const dom = new JSDOM(pageContent, {
    url: targetUrl,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
  });
  applyFetchPolyfill(dom.window);

  if (proxyBase) {
    resolveAndRewrite(dom.window.document, proxyBase, targetUrl, { jpgProxyBase });
  }

  const html = dom.serialize();
  const title = dom.window.document.title || 'Saved article';

  return { html, title };
};
