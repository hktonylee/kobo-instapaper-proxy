export const MINIMAL_STYLES = `
  body { font-family: 'Georgia', 'Times New Roman', serif; margin: 1.5rem auto; max-width: 740px; padding: 0 1rem; background: #f9f9f9; color: #222; }
  article { background: #fff; padding: 1.25rem; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
  h1 { font-size: 1.8rem; line-height: 1.25; margin-bottom: 0.75rem; }
  h2, h3, h4 { margin-top: 1.25rem; line-height: 1.3; }
  p { line-height: 1.6; margin: 0.85rem 0; font-size: 1rem; }
  img, picture, video { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
  figure { margin: 1rem auto; }
  figcaption { font-size: 0.9rem; color: #555; text-align: center; }
  a { color: #0067c5; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 1.25rem; }
  blockquote { border-left: 4px solid #ddd; padding-left: 0.75rem; color: #555; }
  code { background: #f2f2f2; padding: 0.15rem 0.25rem; border-radius: 4px; font-size: 0.95rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #c9ced6; padding: 0.55rem 0.75rem; }
  th { background: #f2f4f7; text-align: left; }
  @media (max-width: 640px) {
    body { margin: 0; max-width: none; padding: 0.85rem; background: #fff; }
    article { box-shadow: none; border-radius: 0; background: none; padding: 0; }
  }
`;

export const UNSUPPORTED_PROTOCOLS = ['javascript:', 'data:', 'mailto:', 'tel:'];

export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1';

export const NAVIGATION_TIMEOUT_MS = 15000;
