const EPSILON = 1e-9;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getNumber(value, fallback = 0) {
  return isFiniteNumber(value) ? value : fallback;
}

function isValidPoint(x, y) {
  return Number.isFinite(x) && Number.isFinite(y);
}

function getElementRotation(element) {
  return getNumber(element?.rotation, 0);
}

export function clamp(value, min, max) {
  const number = getNumber(value);
  const lower = getNumber(min);
  const upper = getNumber(max);
  return Math.min( Math.max(number, Math.min(lower, upper)), Math.max(lower, upper) );
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot( getNumber(x2) - getNumber(x1), getNumber(y2) - getNumber(y1) );
}

export function angle(x1, y1, x2, y2) {
  return ( Math.atan2( getNumber(y2) - getNumber(y1), getNumber(x2) - getNumber(x1) ) * (180 / Math.PI) );
}

export function normalizeAngle(value) {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

export function snapAngle(value, step = 15) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

export function rotatePoint(px, py, cx, cy, angleDeg) {
  const x = getNumber(px);
  const y = getNumber(py);
  const centerX = getNumber(cx);
  const centerY = getNumber(cy);
  const radians = (getNumber(angleDeg) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

export function getElementBounds(element) {
  if (!element || typeof element !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const x = getNumber(element.x);
  const y = getNumber(element.y);
  const width = getNumber(element.width);
  const height = getNumber(element.height);
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

export function getElementCenter(element) {
  const bounds = getElementBounds(element);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function getRotatedCorners(element) {
  const bounds = getElementBounds(element);
  const center = getElementCenter(element);
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];

  const rotation = getElementRotation(element);
  if (rotation === 0) return corners;
  return corners.map((corner) => rotatePoint( corner.x, corner.y, center.x, center.y, rotation ) );
}

export function getRotatedBounds(element) {
  const corners = getRotatedCorners(element);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return getElementBounds(element);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function normalizeRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const x = getNumber(rect.x);
  const y = getNumber(rect.y);
  const width = getNumber(rect.width);
  const height = getNumber(rect.height);

  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

export function rectIntersect(a, b) {
  const first = normalizeRect(a);
  const second = normalizeRect(b);
  if (!first || !second) return false;
  return !(
    first.x + first.width < second.x ||
    second.x + second.width < first.x ||
    first.y + first.height < second.y ||
    second.y + second.height < first.y
  );
}

export function pointInRect(px, py, rect) {
  if (!isValidPoint(px, py)) return false;
  const bounds = normalizeRect(rect);
  if (!bounds) return false;
  return (
    px >= bounds.x &&
    px <= bounds.x + bounds.width &&
    py >= bounds.y &&
    py <= bounds.y + bounds.height
  );
}

export function pointInRotatedRect(px, py, element) {
  if (!element || !isValidPoint(px, py)) return false;
  const center = getElementCenter(element);
  const localPoint = rotatePoint( px, py, center.x, center.y, -getElementRotation(element) );
  return pointInRect( localPoint.x, localPoint.y, getElementBounds(element) );
}

export function pointInEllipse(px, py, element) {
  if (!element || !isValidPoint(px, py)) return false;
  const bounds = getElementBounds(element);
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  if (rx <= EPSILON || ry <= EPSILON) return false;
  const center = getElementCenter(element);
  const localPoint = rotatePoint( px, py, center.x, center.y, -getElementRotation(element) );
  const dx = (localPoint.x - center.x) / rx;
  const dy = (localPoint.y - center.y) / ry;
  return dx * dx + dy * dy <= 1 + EPSILON;
}

export function distanceToSegment(px, py, x1, y1, x2, y2) {
  if (![px, py, x1, y1, x2, y2].every(Number.isFinite)) {
    return Infinity;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) {
    return distance(px, py, x1, y1);
  }

  const projection = clamp( ((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1 );
  return distance( px, py, x1 + projection * dx, y1 + projection * dy );
}

export function pointOnLine(px, py, element, threshold = 6) {
  if (!element || !isValidPoint(px, py)) return false;
  const center = getElementCenter(element);
  const localPoint = rotatePoint( px, py, center.x, center.y, -getElementRotation(element) );
  const x1 = getNumber(element.x);
  const y1 = getNumber(element.y);
  const x2 = x1 + getNumber(element.width);
  const y2 = y1 + getNumber(element.height);
  const tolerance = Math.max(0, getNumber(threshold, 6));
  return ( distanceToSegment( localPoint.x, localPoint.y, x1, y1, x2, y2 ) <= tolerance );
}

export function hitTest(px, py, element) {
  if ( !element || typeof element !== "object" || !isValidPoint(px, py) || element.visible === false || element.locked === true ) {
    return false;
  }

  switch (element.type) {
    case "rectangle":
    case "frame":
    case "text":
      return pointInRotatedRect(px, py, element);

    case "ellipse":
      return pointInEllipse(px, py, element);

    case "line":
      return pointOnLine(px, py, element);

    default:
      return false;
  }
}

export function getSelectionBounds(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return null;
  }

  const bounds = elements.filter((element) => element && typeof element === "object").map(getRotatedBounds).filter((rect) => [ rect.x, rect.y, rect.width, rect.height, ].every(Number.isFinite) );
  if (bounds.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rect of bounds) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function round(value, decimals = 0) {
  if (!Number.isFinite(value) || !Number.isFinite(decimals)) {
    return 0;
  }
  const precision = clamp(Math.trunc(decimals), -12, 12);
  const factor = 10 ** precision;
  return ( Math.round( (value + Number.EPSILON * Math.sign(value)) * factor ) / factor );
}