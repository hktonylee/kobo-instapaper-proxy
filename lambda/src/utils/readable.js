import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { buildArticleHtml } from './html.js';
import { resolveAndRewrite } from './dom.js';

export const renderReadablePage = (pageContent, targetUrl, proxyBase) => {
  const dom = new JSDOM(pageContent, { url: targetUrl, runScripts: 'dangerously' });
  const article = new Readability(dom.window.document).parse();

  const contentHtml = article?.content || dom.window.document.body.innerHTML;
  const articleDom = new JSDOM(contentHtml, { url: targetUrl });

  if (proxyBase) {
    resolveAndRewrite(articleDom.window.document, proxyBase, targetUrl);
  }

  const title = article?.title || dom.window.document.title || 'Saved article';
  const bodyHtml = articleDom.window.document.body.innerHTML;
  const html = buildArticleHtml(title, bodyHtml);

  return { html, title };
};
