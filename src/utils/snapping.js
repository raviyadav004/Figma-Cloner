import { getRotatedBounds } from './geometry.js';

const DEFAULT_GRID_SIZE = 10;
const DEFAULT_SNAP_THRESHOLD = 6;
const EPSILON = 1e-9;

function isFiniteNumber(value) {
  return ( typeof value === 'number' && Number.isFinite(value) );
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const { x, y, width, height } = bounds;
  if ( ![x, y, width, height].every(isFiniteNumber) ) {
    return null;
  }

  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function normalizeThreshold( value, fallback = DEFAULT_SNAP_THRESHOLD ) {
  return isFiniteNumber(value) ? Math.max(0, value) : fallback;
}

function getAlignmentPoints(bounds) {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return {
    left: bounds.x,
    centerX: bounds.x + bounds.width / 2,
    right,
    top: bounds.y,
    centerY: bounds.y + bounds.height / 2,
    bottom,
  };
}

function getTargetElements(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return elements.filter( (element) => element && typeof element === 'object' && element.visible !== false && element.locked !== true );
}

function getBestMatches( movingBounds, otherElements, threshold ) {
  const moving = getAlignmentPoints(movingBounds);
  const verticalMatches = [];
  const horizontalMatches = [];
  const movingX = [
    ['left', moving.left],
    ['centerX', moving.centerX],
    ['right', moving.right],
  ];

  const movingY = [
    ['top', moving.top],
    ['centerY', moving.centerY],
    ['bottom', moving.bottom],
  ];

  for (const element of getTargetElements(otherElements)) {
    const targetBounds = normalizeBounds( getRotatedBounds(element) );
    if (!targetBounds) {
      continue;
    }

    const target = getAlignmentPoints(targetBounds);
    const targetX = [
      ['left', target.left],
      ['centerX', target.centerX],
      ['right', target.right],
    ];

    const targetY = [
      ['top', target.top],
      ['centerY', target.centerY],
      ['bottom', target.bottom],
    ];

    for (const [movingKey, movingValue] of movingX) {
      for (const [targetKey, targetValue] of targetX) {
        const offset = targetValue - movingValue;
        const matchDistance = Math.abs(offset);
        if (matchDistance <= threshold + EPSILON) {
          verticalMatches.push({
            x: targetValue,
            offset,
            mKey: movingKey,
            tKey: targetKey,
            distance: matchDistance,
            elementId: element.id,
            targetBounds,
          });
        }
      }
    }

    for (const [movingKey, movingValue] of movingY) {
      for (const [targetKey, targetValue] of targetY) {
        const offset = targetValue - movingValue;
        const matchDistance = Math.abs(offset);
        if (matchDistance <= threshold + EPSILON) {
          horizontalMatches.push({
            y: targetValue,
            offset,
            mKey: movingKey,
            tKey: targetKey,
            distance: matchDistance,
            elementId: element.id,
            targetBounds,
          });
        }
      }
    }
  }

  const sortMatches = (a, b) => a.distance - b.distance || String(a.elementId ?? '').localeCompare( String(b.elementId ?? '') );
  verticalMatches.sort(sortMatches);
  horizontalMatches.sort(sortMatches);
  return {
    v: verticalMatches,
    h: horizontalMatches,
  };
}

export function snapToGrid( value, gridSize = DEFAULT_GRID_SIZE ) {
  if (!isFiniteNumber(value)) {
    return 0;
  }

  if (!isFiniteNumber(gridSize) || gridSize <= 0) {
    return value;
  }
  return Math.round(value / gridSize) * gridSize;
}

export function snapValue( value, targets, threshold = 4 ) {
  if ( !isFiniteNumber(value) || !Array.isArray(targets) ) {
    return value;
  }

  const tolerance = normalizeThreshold(threshold, 4);
  let closestTarget = value;
  let closestDistance = Infinity;
  for (const target of targets) {
    if (!isFiniteNumber(target)) {
      continue;
    }

    const currentDistance = Math.abs(value - target);
    if ( currentDistance <= tolerance + EPSILON && currentDistance < closestDistance ) {
      closestTarget = target;
      closestDistance = currentDistance;
    }
  }
  return closestTarget;
}

export function computeSnapGuides( movingBounds, otherElements, threshold = DEFAULT_SNAP_THRESHOLD ) {
  const bounds = normalizeBounds(movingBounds);
  if (!bounds) {
    return { v: [], h: [] };
  }

  const tolerance = normalizeThreshold(threshold);
  const matches = getBestMatches( bounds, otherElements, tolerance );
  return {
    v: matches.v.map( ({ x, offset, mKey, tKey, elementId }) => ({ x, offset, mKey, tKey, elementId, }) ),
    h: matches.h.map( ({ y, offset, mKey, tKey, elementId }) => ({ y, offset, mKey, tKey, elementId, }) ),
  };
}

export function applySnapGuides(bounds, guides) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) {
    return { x: 0, y: 0 };
  }

  function getNearestGuide(items, coordinate) {
    if (!Array.isArray(items)) {
      return null;
    }

    let nearest = null;
    for (const guide of items) {
      if (!isFiniteNumber(guide?.offset)) {
        continue;
      }

      if ( !nearest || Math.abs(guide.offset) < Math.abs(nearest.offset) || ( Math.abs(guide.offset) === Math.abs(nearest.offset) && Math.abs( getFiniteCoordinate(guide, coordinate) ) < Math.abs( getFiniteCoordinate(nearest, coordinate) ) ) ) {
        nearest = guide;
      }
    }
    return nearest;
  }

  const verticalGuide = getNearestGuide( guides?.v, 'x' );
  const horizontalGuide = getNearestGuide( guides?.h, 'y' );
  return {
    x: normalized.x + (verticalGuide?.offset ?? 0),
    y: normalized.y + (horizontalGuide?.offset ?? 0),
  };
}

function getFiniteCoordinate(guide, key) {
  return isFiniteNumber(guide?.[key]) ? guide[key] : 0;
}

export function getGuideLines( movingBounds, otherElements, threshold = DEFAULT_SNAP_THRESHOLD ) {
  const bounds = normalizeBounds(movingBounds);
  if (!bounds) {
    return { v: [], h: [] };
  }

  const tolerance = normalizeThreshold(threshold);
  const matches = getBestMatches( bounds, otherElements, tolerance );
  const movingRight = bounds.x + bounds.width;
  const movingBottom = bounds.y + bounds.height;
  const verticalGuides = matches.v.map((guide) => {
    const targetBounds = guide.targetBounds ?? bounds;
    return {
      x: guide.x,
      y1: Math.min(bounds.y, targetBounds.y),
      y2: Math.max( movingBottom, targetBounds.y + targetBounds.height ),
    };
  });

  const horizontalGuides = matches.h.map((guide) => {
    const targetBounds = guide.targetBounds ?? bounds;
    return {
      y: guide.y,
      x1: Math.min(bounds.x, targetBounds.x),
      x2: Math.max( movingRight, targetBounds.x + targetBounds.width ),
    };
  });

  return {
    v: verticalGuides,
    h: horizontalGuides,
  };
}