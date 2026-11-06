// Local OCR: images never leave the loopback server. Language data is installed, not fetched at runtime.
function decodeImages(body) {
  const { images } = JSON.parse(body);
  if (!Array.isArray(images) || images.length < 1 || images.length > 16) throw new Error('Invalid images');
  let pixels = 0;
  const ids = new Set();
  return images.map(image => {
    if (!image || !/^[a-zA-Z0-9_-]{1,30}$/.test(image.id) || ids.has(image.id) ||
      !['text', 'digits', 'digit', 'rank'].includes(image.mode) || typeof image.png !== 'string' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image.png)) throw new Error('Invalid image');
    ids.add(image.id);
    const png = Buffer.from(image.png.slice(22), 'base64');
    if (png.length < 33 || png.length > 2e6 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG required');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    pixels += width * height;
    if (!width || !height || width > 4096 || height > 2048 || pixels > 12e6) throw new Error('Image too large');
    return { id: image.id, mode: image.mode, png };
  });
}

function createOCR() {
  let worker = null;
  let loading = null;
  let pending = Promise.resolve();
  // Parameters belong to a batch. Keep loading, parameters, images and shutdown
  // together so overlapping browser requests cannot change each other's reads.
  function enqueue(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }
  async function close() {
    if (loading) await loading.catch(() => {});
    const old = worker; worker = null;
    if (old) await old.terminate();
  }
  async function recognize(images) {
    if (!worker) {
      loading = require('tesseract.js').createWorker('eng', 1, {
        langPath: require('@tesseract.js-data/eng').langPath, cacheMethod: 'none',
        errorHandler: () => {},
      });
      try { worker = await loading; } finally { loading = null; }
    }
    const results = [];
    for (const image of images) {
      await worker.setParameters({ tessedit_pageseg_mode: image.mode === 'rank' ? '8' : image.mode === 'digit' ? '10' : '7',
        tessedit_char_whitelist: image.mode === 'rank' ? '2345678910JQKA' : image.mode === 'digits' || image.mode === 'digit' ? '0123456789' : '' });
      const { data } = await worker.recognize(image.png);
      results.push({ id: image.id, text: data.text.trim(), confidence: data.confidence });
    }
    return results;
  }
  return { recognize: images => enqueue(() => recognize(images)), close: () => enqueue(close) };
}
module.exports = { decodeImages, createOCR };
