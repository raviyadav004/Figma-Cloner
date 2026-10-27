let idCounter = 0;

const MAX_DECIMAL_PRECISION = 12;
function isFiniteNumber(value) {
  return ( typeof value === 'number' && Number.isFinite(value) );
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return ( prototype === Object.prototype || prototype === null );
}

export function uid(prefix = 'el') {
  const safePrefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim().replace(/[^a-zA-Z0-9_-]/g, '-') : 'el';
  idCounter += 1;
  let uniquePart;
  if ( typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function' ) {
    uniquePart = globalThis.crypto.randomUUID();
  } else {
    uniquePart = [
      Date.now().toString(36),
      idCounter.toString(36),
      Math.random().toString(36).slice(2, 12),
    ].join('-');
  }
  return `${safePrefix}-${uniquePart}`;
}

export function clamp(value, min, max) {
  if (![value, min, max].every(isFiniteNumber)) {
    return isFiniteNumber(value) ? value : 0;
  }
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, lower), upper);
}

export function round(value, decimals = 0) {
  if ( !isFiniteNumber(value) || !isFiniteNumber(decimals) ) {
    return 0;
  }
  const precision = clamp( Math.trunc(decimals), -MAX_DECIMAL_PRECISION, MAX_DECIMAL_PRECISION );
  const factor = 10 ** precision;
  return ( Math.round( (value + Number.EPSILON * Math.sign(value)) * factor ) / factor );
}

export function clone(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {}
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError( 'Value cannot be cloned. Use JSON-compatible editor data.' );
  }
}

export function deepMerge(target, source) {
  if ( !isPlainObject(target) || !isPlainObject(source) ) {
    return clone(source);
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (isPlainObject(sourceValue)) {
      result[key] = deepMerge( isPlainObject(targetValue) ? targetValue : {}, sourceValue );
    } else if (Array.isArray(sourceValue)) {
      result[key] = clone(sourceValue);
    } else {
      result[key] = sourceValue;
    }
  }
  return result;
}

export function isValidColor(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const color = value.trim();
  if (!color || /[;{}<>]/.test(color)) {
    return false;
  }

  if (/^#[\da-f]{3,4}$/i.test(color)) {
    return true;
  }

  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) {
    return true;
  }

  if (/^(?:transparent|currentcolor)$/i.test(color)) {
    return true;
  }

  const rgbPattern = /^rgba?\(\s*(?:\d+(?:\.\d+)?%?\s*,\s*){2}\d+(?:\.\d+)?%?(?:\s*[,/]\s*(?:\d+(?:\.\d+)?%?))?\s*\)$/i;
  const modernRgbPattern = /^rgba?\(\s*(?:\d+(?:\.\d+)?%?\s+){2}\d+(?:\.\d+)?%?(?:\s*\/\s*(?:\d+(?:\.\d+)?%?))?\s*\)$/i;
  if ( rgbPattern.test(color) || modernRgbPattern.test(color) ) {
    return true;
  }

  const hslPattern = /^hsla?\(\s*-?\d+(?:\.\d+)?(?:deg|rad|turn)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%(?:\s*[,/]\s*(?:\d+(?:\.\d+)?%?))?\s*\)$/i;
  const modernHslPattern = /^hsla?\(\s*-?\d+(?:\.\d+)?(?:deg|rad|turn)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*(?:\d+(?:\.\d+)?%?))?\s*\)$/i;
  return ( hslPattern.test(color) || modernHslPattern.test(color) );
}

export function normalizeColor( value, fallback = '#000000' ) {
  if ( typeof value !== 'string' || !value.trim() ) {
    return fallback;
  }

  const color = value.trim();
  if (/^#[\da-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split('').map((character) => character + character).join('')}`;
  }

  if (/^#[\da-f]{4}$/i.test(color)) {
    return `#${color.slice(1).split('').map((character) => character + character).join('')}`;
  }
  return color;
}

export function hexToRgba(value, alpha = 1) {
  const parsedAlpha = typeof alpha === 'number' ? alpha : Number(alpha);
  if (!Number.isFinite(parsedAlpha)) {
    return 'rgba(0, 0, 0, 1)';
  }

  const safeAlpha = clamp(parsedAlpha, 0, 1);
  const normalized = normalizeColor(value);
  const match = normalized.match( /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i );
  if (!match) {
    if (/^rgba?\(/i.test(normalized)) {
      return normalized;
    }
    return `rgba(0, 0, 0, ${safeAlpha})`;
  }

  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map((character) => character + character).join('');
  }

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const embeddedAlpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return `rgba(${red}, ${green}, ${blue}, ${round( embeddedAlpha * safeAlpha, 4 )})`;
}

export function sanitizeFilename(filename = 'download') {
  const safeName = String(filename).replace(/[\/<>:"\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim();
  return safeName || 'download';
}

export function downloadBlob( blob, filename = 'download' ) {
  if ( typeof Blob === 'undefined' || !(blob instanceof Blob) ) {
    throw new TypeError('A valid Blob is required.');
  }

  if ( typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' ) {
    throw new Error( 'File downloads are not supported in this environment.' );
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = sanitizeFilename(filename);
  link.style.display = 'none';
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
}

export function downloadText( text, filename = 'download.txt', mime = 'text/plain' ) {
  const content = typeof text === 'string' ? text : String(text ?? '');
  const contentType = typeof mime === 'string' && mime.trim() ? mime.trim() : 'text/plain';
  downloadBlob( new Blob([content], {
      type: `${contentType};charset=utf-8`,
    }),
    filename
  );
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject( new Error( 'File reading is not supported in this environment.' ) );
      return;
    }

    if ( typeof Blob === 'undefined' || !(file instanceof Blob) ) {
      reject(new TypeError('A valid file is required.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject( new Error( 'The file did not contain readable text.' ) );
      }
    };

    reader.onerror = () => {
      reject( reader.error || new Error('Failed to read file.') );
    };

    reader.onabort = () => {
      reject( new Error('File reading was cancelled.') );
    };
    reader.readAsText(file);
  });
}

export function svgToDataUrl(svgString) {
  if ( typeof svgString !== 'string' || !svgString.trim() ) {
    throw new TypeError( 'A non-empty SVG string is required.' );
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent( svgString )}`;
}

export function debounce(fn, ms = 0) {
  if (typeof fn !== 'function') {
    throw new TypeError('A function is required.');
  }

  let timeoutId = null;
  let lastArgs;
  let lastThis;
  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;

      const callArgs = lastArgs;
      const callThis = lastThis;
      lastArgs = undefined;
      lastThis = undefined;
      fn.apply(callThis, callArgs);
    }, Math.max(0, isFiniteNumber(ms) ? ms : 0));
  }

  debounced.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
    lastArgs = undefined;
    lastThis = undefined;
  };

  debounced.flush = () => {
    if (timeoutId === null) {
      return;
    }

    clearTimeout(timeoutId);
    timeoutId = null;
    const callArgs = lastArgs;
    const callThis = lastThis;
    lastArgs = undefined;
    lastThis = undefined;
    fn.apply(callThis, callArgs);
  };
  debounced.pending = () => timeoutId !== null;
  return debounced;
}

export function defaultElementName(type) {
  const names = {
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    line: 'Line',
    freeform: 'Freeform Path',
    text: 'Text',
    frame: 'Frame',
  };
  return names[type] || 'Element';
}