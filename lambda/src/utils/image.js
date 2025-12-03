import sharp from 'sharp';

const isJpegContentType = (contentType = '') => {
  const normalized = contentType.toLowerCase();
  return normalized.includes('image/jpeg') || normalized.includes('image/jpg');
};

const fetchImage = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || '';

  return { buffer, contentType };
};

export const fetchAndConvertToJpeg = async (url) => {
  const { buffer, contentType } = await fetchImage(url);

  if (isJpegContentType(contentType)) {
    return { buffer, contentType: 'image/jpeg' };
  }

  try {
    const converted = await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg()
      .toBuffer();

    return { buffer: converted, contentType: 'image/jpeg' };
  } catch (error) {
    console.error('JPEG conversion failed', { message: error.message });
    throw new Error('Failed to convert image to JPEG');
  }
};
