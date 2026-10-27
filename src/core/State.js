import { uid, clone, defaultElementName, } from '../utils/helpers.js';

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const DEFAULT_BACKGROUND = '#ffffff';
const VALID_ELEMENT_TYPES = new Set([ 'rectangle', 'ellipse', 'line', 'freeform', 'text', 'frame', ]);
const VALID_TEXT_ALIGNMENTS = new Set([ 'left', 'center', 'right', ]);
const VALID_SETTINGS = new Set([ 'grid', 'snap', 'gridSize', ]);
const DEFAULT_SETTINGS = Object.freeze({ grid: true, snap: true, gridSize: 10, });
const DEFAULT_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1, });
const LAYER_DIRECTIONS = new Set([ 'front', 'back', 'forward', 'backward', ]);

function isPlainObject(value) {
  if ( value === null || typeof value !== 'object' || Array.isArray(value) ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return ( prototype === Object.prototype || prototype === null );
}

function finiteNumber(value, fallback = 0) {
  if ( value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ) {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneSafely(value) {
  return clone(value);
}

function sameValue(first, second) {
  return Object.is(first, second);
}

function notifyListeners(listeners, data) {
  for (const listener of [...listeners]) {
    try {
      listener(data);
    } catch (error) {
      console.error( '[Figma-Lite] State subscriber failed:', error );
    }
  }
}

function normalizeViewport(viewport = {}) {
  return {
    x: finiteNumber(viewport.x, DEFAULT_VIEWPORT.x),
    y: finiteNumber(viewport.y, DEFAULT_VIEWPORT.y),
    zoom: clamp( finiteNumber(viewport.zoom, DEFAULT_VIEWPORT.zoom), MIN_ZOOM, MAX_ZOOM ),
  };
}

function normalizeSettings(settings = {}) {
  return {
    grid: typeof settings.grid === 'boolean' ? settings.grid : DEFAULT_SETTINGS.grid,
    snap: typeof settings.snap === 'boolean' ? settings.snap : DEFAULT_SETTINGS.snap,
    gridSize: positiveNumber( settings.gridSize, DEFAULT_SETTINGS.gridSize ),
  };
}

function hasDuplicateElementIds(elements) {
  const ids = new Set();
  for (const element of elements) {
    if (ids.has(element.id)) {
      return element.id;
    }
    ids.add(element.id);
  }
  return null;
}

export function createDefaultState() {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    background: DEFAULT_BACKGROUND,
    elements: [],
    viewport: { ...DEFAULT_VIEWPORT },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function createElement(type, props = {}) {
  if (!VALID_ELEMENT_TYPES.has(type)) {
    throw new TypeError( `[Figma-Lite] Unsupported element type: ${String(type)}` );
  }

  if (!isPlainObject(props)) {
    throw new TypeError( '[Figma-Lite] Element properties must be a plain object.' );
  }

  const base = {
    id: uid(type),
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    fill: '#2563eb',
    stroke: '#000000',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: defaultElementName(type),
  };

  switch (type) {
    case 'rectangle':
      break;

    case 'ellipse':
      base.fill = '#10b981';
      break;

    case 'line':
      Object.assign(base, {
        fill: 'none',
        stroke: '#1a1a2e',
        strokeWidth: 2,
        width: 100,
        height: 0,
      });
      break;

    case 'freeform':
      Object.assign(base, {
        fill: 'none',
        stroke: '#1a1a2e',
        strokeWidth: 2,
        width: 0,
        height: 0,
        points: [{ x: 0, y: 0 }],
      });
      break;

    case 'text':
      Object.assign(base, {
        fill: '#1a1a2e',
        text: 'Text',
        fontSize: 24,
        fontWeight: 400,
        textAlign: 'left',
        lineHeight: 1.4,
        letterSpacing: 0,
        width: 120,
        height: 32,
      });
      break;

    case 'frame':
      Object.assign(base, {
        fill: '#ffffff',
        stroke: '#d0d0d6',
        strokeWidth: 1,
        width: 400,
        height: 300,
      });
      break;
  }

  return validateElement({
    ...base,
    ...cloneSafely(props),
    type,
  });
}

export function validateElement(element) {
  if (!isPlainObject(element)) {
    return null;
  }

  if ( typeof element.type !== 'string' || !VALID_ELEMENT_TYPES.has(element.type) ) {
    return null;
  }

  let source;
  try {
    source = cloneSafely(element);
  } catch {
    return null;
  }

  if (!isPlainObject(source)) {
    return null;
  }

  const type = source.type;
  const normalized = {
    ...source, id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : uid(type),
    type,
    x: finiteNumber(source.x),
    y: finiteNumber(source.y),
    width: Math.max( 0, finiteNumber(source.width, 100) ),
    height: Math.max( 0, finiteNumber(source.height, 100) ),
    rotation: finiteNumber(source.rotation),
    opacity: clamp( finiteNumber(source.opacity, 1), 0, 1 ),
    visible: source.visible !== false,
    locked: source.locked === true,
    fill: typeof source.fill === 'string' ? source.fill : '#2563eb',
    stroke: typeof source.stroke === 'string' ? source.stroke : '#000000',
    strokeWidth: Math.max( 0, finiteNumber(source.strokeWidth) ),
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : defaultElementName(type),
  };

  if (type === 'freeform') {
    const sourcePoints = Array.isArray(source.points) ? source.points.slice(0, 2000) : [];
    normalized.points = sourcePoints
      .filter((point) => isPlainObject(point) && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
      .map((point) => ({
        x: clamp(finiteNumber(point.x), 0, 1),
        y: clamp(finiteNumber(point.y), 0, 1),
      }));
    if (normalized.points.length === 0) {
      normalized.points = [{ x: 0, y: 0 }];
    }
    normalized.fill = 'none';
  }

  if (type === 'text') {
    normalized.text = typeof source.text === 'string' ? source.text : 'Text';
    normalized.fontSize = positiveNumber( source.fontSize, 24 );
    normalized.fontWeight = clamp( finiteNumber(source.fontWeight, 400), 100, 900 );
    normalized.textAlign = VALID_TEXT_ALIGNMENTS.has( source.textAlign ) ? source.textAlign : 'left';
    normalized.lineHeight = positiveNumber( source.lineHeight, 1.4 );
    normalized.letterSpacing = finiteNumber( source.letterSpacing );
  }
  return normalized;
}

export class State {
  constructor() {
    this.data = createDefaultState();
    this.listeners = new Set();
    this.destroyed = false;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError( '[Figma-Lite] State.subscribe expects a function.' );
    }
    this.assertActive();
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  notify() {
    if (this.destroyed) return;
    notifyListeners(this.listeners, this.data);
  }

  isDestroyed() {
    return this.destroyed;
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error( '[Figma-Lite] This State instance has been destroyed.' );
    }
  }

  getElements() {
    return this.data.elements;
  }

  getElementById(id) {
    return ( this.data.elements.find( (element) => element.id === id ) ?? null );
  }

  getDocumentInfo() {
    return {
      width: this.data.width,
      height: this.data.height,
      background: this.data.background,
    };
  }

  getViewport() {
    return { ...this.data.viewport };
  }

  getSettings() {
    return { ...this.data.settings };
  }

  getElementCount() {
    return this.data.elements.length;
  }

  addElement(element) {
    this.assertActive();
    const normalized = validateElement(element);
    if (!normalized) {
      throw new TypeError( '[Figma-Lite] Cannot add an invalid element.' );
    }

    if (this.getElementById(normalized.id)) {
      throw new Error( `[Figma-Lite] Duplicate element ID: "${normalized.id}".` );
    }
    this.data.elements.push(normalized);
    this.notify();
    return normalized;
  }

  removeElement(id) {
    this.assertActive();
    const index = this.data.elements.findIndex( (element) => element.id === id );
    if (index === -1) {
      return false;
    }
    this.data.elements.splice(index, 1);
    this.notify();
    return true;
  }

  updateElement(id, props) {
    this.assertActive();
    const element = this.getElementById(id);
    if (!element || !isPlainObject(props)) {
      return null;
    }

    let safeProps;
    try {
      safeProps = cloneSafely(props);
    } catch {
      return null;
    }

    const candidate = validateElement({
      ...element,
      ...safeProps,
      id: element.id,
      type: element.type,
    });

    if (!candidate) {
      return null;
    }

    const currentKeys = Object.keys(element);
    const candidateKeys = Object.keys(candidate);
    const unchanged = currentKeys.length === candidateKeys.length && currentKeys.every( (key) => hasOwn(candidate, key) && sameValue(element[key], candidate[key]) );
    if (unchanged) {
      return element;
    }

    Object.assign(element, candidate);
    for (const key of Object.keys(element)) {
      if (!hasOwn(candidate, key)) {
        delete element[key];
      }
    }
    this.notify();
    return element;
  }

  clearElements() {
    this.assertActive();
    if (!this.data.elements.length) {
      return false;
    }
    this.data.elements.length = 0;
    this.notify();
    return true;
  }

  reorderElement(id, direction) {
    this.assertActive();
    if (!LAYER_DIRECTIONS.has(direction)) {
      return false;
    }
    const elements = this.data.elements;
    const index = elements.findIndex( (element) => element.id === id );
    if (index === -1) {
      return false;
    }

    let targetIndex;
    switch (direction) {
      case 'front':
        targetIndex = elements.length - 1;
        break;

      case 'back':
        targetIndex = 0;
        break;

      case 'forward':
        targetIndex = Math.min(
          index + 1,
          elements.length - 1
        );
        break;

      case 'backward':
        targetIndex = Math.max(index - 1, 0);
        break;
    }

    if (targetIndex === index) {
      return false;
    }

    const [element] = elements.splice(index, 1);
    elements.splice(targetIndex, 0, element);
    this.notify();
    return true;
  }

  moveElementToIndex(id, newIndex) {
    this.assertActive();
    const elements = this.data.elements;
    const currentIndex = elements.findIndex( (element) => element.id === id );
    if ( currentIndex === -1 || !Number.isFinite(newIndex) || !Number.isInteger(newIndex) ) {
      return false;
    }

    const targetIndex = clamp( newIndex, 0, elements.length - 1 );
    if (currentIndex === targetIndex) {
      return true;
    }

    const [element] = elements.splice(currentIndex, 1);
    elements.splice(targetIndex, 0, element);
    this.notify();
    return true;
  }

  setViewport(viewport, { notify = true } = {}) {
    this.assertActive();
    if (!isPlainObject(viewport)) {
      return false;
    }

    const current = this.data.viewport;
    const next = { ...current };
    if (hasOwn(viewport, 'x')) {
      next.x = finiteNumber(viewport.x, current.x);
    }

    if (hasOwn(viewport, 'y')) {
      next.y = finiteNumber(viewport.y, current.y);
    }

    if (hasOwn(viewport, 'zoom')) {
      next.zoom = clamp( finiteNumber(viewport.zoom, current.zoom), MIN_ZOOM, MAX_ZOOM );
    }

    const changed = next.x !== current.x || next.y !== current.y || next.zoom !== current.zoom;
    if (!changed) {
      return true;
    }
    this.data.viewport = next;
    if (notify) {
      this.notify();
    }
    return true;
  }

  setSetting(key, value) {
    this.assertActive();
    if (!VALID_SETTINGS.has(key)) {
      return false;
    }

    if ( (key === 'grid' || key === 'snap') && typeof value !== 'boolean' ) {
      return false;
    }

    if ( key === 'gridSize' && ( typeof value !== 'number' || !Number.isFinite(value) || value <= 0 ) ) {
      return false;
    }

    if (sameValue(this.data.settings[key], value)) {
      return true;
    }
    this.data.settings[key] = value;
    this.notify();
    return true;
  }

  setBackground(color) {
    this.assertActive();
    if (typeof color !== 'string' || !color.trim()) {
      return false;
    }

    const nextColor = color.trim();
    if (this.data.background === nextColor) {
      return true;
    }
    this.data.background = nextColor;
    this.notify();
    return true;
  }

  setDocumentSize(dimensions) {
    this.assertActive();
    if (!isPlainObject(dimensions)) {
      return false;
    }

    const width = hasOwn(dimensions, 'width') ? dimensions.width : this.data.width;
    const height = hasOwn(dimensions, 'height') ? dimensions.height : this.data.height;
    if ( typeof width !== 'number' || !Number.isFinite(width) || width <= 0 || typeof height !== 'number' || !Number.isFinite(height) || height <= 0 ) {
      return false;
    }

    if ( width === this.data.width && height === this.data.height ) {
      return true;
    }
    this.data.width = width;
    this.data.height = height;
    this.notify();
    return true;
  }

  serialize() {
    this.assertActive();
    return JSON.stringify(this.data);
  }

  load(input) {
    this.assertActive();
    let data = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch {
        throw new Error( '[Figma-Lite] Invalid project JSON.' );
      }
    }

    if (!isPlainObject(data)) {
      throw new TypeError( '[Figma-Lite] Project data must be a plain object.' );
    }

    if (!Array.isArray(data.elements)) {
      throw new TypeError( '[Figma-Lite] Project data must contain an elements array.' );
    }

    const elements = data.elements.map( (element, index) => {
        const normalized = validateElement(element);
        if (!normalized) {
          throw new Error( `[Figma-Lite] Invalid element at index ${index}.` );
        }
        return normalized;
      }
    );

    const duplicateId = hasDuplicateElementIds(elements);
    if (duplicateId !== null) {
      throw new Error( `[Figma-Lite] Duplicate element ID "${duplicateId}".` );
    }

    const defaults = createDefaultState();
    const width = positiveNumber( data.width, DEFAULT_WIDTH );
    const height = positiveNumber( data.height, DEFAULT_HEIGHT );
    const background = typeof data.background === 'string' && data.background.trim() ? data.background.trim() : defaults.background;
    const viewportInput = isPlainObject(data.viewport) ? data.viewport : {};
    const settingsInput = isPlainObject(data.settings) ? data.settings : {};
    const viewport = normalizeViewport(viewportInput);
    const settings = normalizeSettings(settingsInput);
    let additionalProperties;
    try {
      additionalProperties = cloneSafely(data);
    } catch {
      throw new Error( '[Figma-Lite] Project data could not be cloned safely.' );
    }

    const nextState = {
      ...defaults,
      ...additionalProperties,
      width,
      height,
      background,
      viewport,
      settings,
      elements,
    };

    this.data = nextState;
    this.notify();
    return this.data;
  }

  clear() {
    this.assertActive();
    this.data = createDefaultState();
    this.notify();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.listeners.clear();
    this.destroyed = true;
  }
}