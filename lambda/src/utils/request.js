const normalizePrefix = (value = '') => value.replace(/^\/+|\/+$/g, '');

export const normalizeTargetUrl = (rawPath = '') => {
  const trimmed = rawPath.replace(/^\/+/, '');
  if (!trimmed) return { targetUrl: null, pathPrefix: '' };

  const decoded = decodeURIComponent(trimmed);

  const protocolMatch = decoded.match(/([a-z][a-z0-9+.-]*:\/+)/i);
  if (!protocolMatch) {
    throw new Error('A fully-qualified http(s) URL is required in the path.');
  }

  const protocolIndex = protocolMatch?.index ?? -1;
  const pathPrefix = protocolIndex > 0 ? decoded.slice(0, protocolIndex).replace(/\/+$/, '') : '';
  const candidate = protocolIndex > -1 ? decoded.slice(protocolIndex) : decoded;

  const withNormalizedProtocolSlashes = candidate.replace(/^(https?:)\/(?!\/)/i, '$1//');

  const protocolSchemeMatch = withNormalizedProtocolSlashes.match(/^([a-z][a-z0-9+.-]*:)/i);
  if (protocolSchemeMatch) {
    const protocol = protocolSchemeMatch[1].toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  const targetUrl = withNormalizedProtocolSlashes.startsWith('http://')
    || withNormalizedProtocolSlashes.startsWith('https://')
    ? withNormalizedProtocolSlashes
    : `https://${withNormalizedProtocolSlashes}`;

  return { targetUrl, pathPrefix };
};

export const buildProxyBase = (event, pathPrefix = '') => {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || '';

  const combinedPrefixes = [
    event.headers?.['x-forwarded-prefix'],
    pathPrefix,
  ]
    .map(normalizePrefix)
    .filter(Boolean)
    .join('/');

  const prefixSegment = combinedPrefixes ? `/${combinedPrefixes}` : '';

  return host ? `${protocol}://${host}${prefixSegment}` : '';
};

export const logRequestMetadata = (event, { targetUrl, pathPrefix, proxyBase }) => {
  const headers = event.headers || {};

  console.info('Request URL metadata', {
    targetUrl,
    pathPrefix,
    rawPath: event.rawPath || event.path,
    rawQueryString: event.rawQueryString,
    proxyBase,
    forwarded: {
      proto: headers['x-forwarded-proto'],
      host: headers['x-forwarded-host'],
      prefix: headers['x-forwarded-prefix'],
      for: headers['x-forwarded-for'],
    },
    host: headers.host,
  });
};
