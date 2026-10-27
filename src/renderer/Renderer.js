import { getElementCenter, getRotatedCorners, getSelectionBounds, } from '../utils/geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = {
  gridMinor: '#ececf0',
  gridMajor: '#e0e0e6',
  selection: '#2563eb',
  guide: '#ec4899',
  handleFill: '#ffffff',
  handleStroke: '#2563eb',
  marqueeFill: 'rgba(37, 99, 235, 0.08)',
};

const createSvgElement = (tag) => document.createElementNS(SVG_NS, tag);
const finiteNumber = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const safeOpacity = (value) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
const escapeAttribute = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeText = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export class Renderer {
  constructor(state, svgEl) {
    if (!state || !svgEl) {
      throw new Error('Renderer requires a valid state and SVG element.');
    }

    this.state = state;
    this.svg = svgEl;
    this.defs = svgEl.querySelector('#canvas-defs');
    this.gridLayer = svgEl.querySelector('#grid-layer');
    this.contentLayer = svgEl.querySelector('#content-layer');
    this.guidesLayer = svgEl.querySelector('#guides-layer');
    this.overlayLayer = svgEl.querySelector('#overlay-layer');

    const requiredLayers = [
      this.defs,
      this.gridLayer,
      this.contentLayer,
      this.guidesLayer,
      this.overlayLayer,
    ];

    if (requiredLayers.some((layer) => !layer)) {
      throw new Error( 'Renderer could not find all required SVG layers. Check index.html.' );
    }

    this.elementNodes = new Map();
    this._gridCacheKey = null;
    this._initDefs();
  }

  _initDefs() {
    if (this.defs.querySelector('#checker')) {
      return;
    }

    const pattern = createSvgElement('pattern');
    pattern.id = 'checker';
    pattern.setAttribute('width', '10');
    pattern.setAttribute('height', '10');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');

    const firstRect = createSvgElement('rect');
    firstRect.setAttribute('width', '5');
    firstRect.setAttribute('height', '5');
    firstRect.setAttribute('fill', '#f0f0f2');

    const secondRect = createSvgElement('rect');
    secondRect.setAttribute('x', '5');
    secondRect.setAttribute('y', '5');
    secondRect.setAttribute('width', '5');
    secondRect.setAttribute('height', '5');
    secondRect.setAttribute('fill', '#f0f0f2');

    pattern.append(firstRect, secondRect);
    this.defs.appendChild(pattern);
  }

  screenToCanvas(screenX, screenY) {
    const rect = this.svg.getBoundingClientRect();
    const viewport = this.state.data.viewport;
    const { width, height } = this.state.data;
    const zoom = Math.max(0.0001, finiteNumber(viewport.zoom, 1));

    // Convert client coordinates to the SVG's own coordinate space first.
    // This avoids offset/scale drift when the editor is resized responsively.
    let localX = screenX - rect.left;
    let localY = screenY - rect.top;

    if (typeof this.svg.createSVGPoint === 'function' && this.svg.getScreenCTM) {
      const matrix = this.svg.getScreenCTM();
      if (matrix) {
        const point = this.svg.createSVGPoint();
        point.x = screenX;
        point.y = screenY;
        const localPoint = point.matrixTransform(matrix.inverse());
        localX = localPoint.x;
        localY = localPoint.y;
      }
    }

    return {
      x: (localX - rect.width / 2 - viewport.x) / zoom + width / 2,
      y: (localY - rect.height / 2 - viewport.y) / zoom + height / 2,
    };
  }

  canvasToScreen(canvasX, canvasY) {
    const rect = this.svg.getBoundingClientRect();
    const viewport = this.state.data.viewport;
    const { width, height } = this.state.data;
    return {
      x: (canvasX - width / 2) * viewport.zoom + viewport.x + rect.width / 2 + rect.left,
      y: (canvasY - height / 2) * viewport.zoom + viewport.y + rect.height / 2 + rect.top,
    };
  }

  canvasToViewport(canvasX, canvasY) {
    const rect = this.svg.getBoundingClientRect();
    const viewport = this.state.data.viewport;
    const { width, height } = this.state.data;
    return {
      x: viewport.x + rect.width / 2 + (canvasX - width / 2) * viewport.zoom,
      y: viewport.y + rect.height / 2 + (canvasY - height / 2) * viewport.zoom,
    };
  }

  applyViewport() {
    const viewport = this.state.data.viewport;
    const { width, height } = this.state.data;
    const rect = this.svg.getBoundingClientRect();
    const translateX = viewport.x + rect.width / 2;
    const translateY = viewport.y + rect.height / 2;
    const transform = `translate(${translateX}, ${translateY}) ` + `scale(${viewport.zoom}) ` + `translate(${-width / 2}, ${-height / 2})`;
    this.contentLayer.setAttribute('transform', transform);
    this.gridLayer.setAttribute('transform', transform);
    this.guidesLayer.setAttribute('transform', transform);
    this.overlayLayer.removeAttribute('transform');
  }

  renderGrid() {
    const { grid, gridSize } = this.state.data.settings;
    const { width, height, background } = this.state.data;
    const zoom = Math.max(0.0001, finiteNumber(this.state.data.viewport.zoom, 1));
    const safeGridSize = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 10;
    const cacheKey = [grid, safeGridSize, width, height, background, zoom].join('|');

    if (this._gridCacheKey === cacheKey) {
      return;
    }

    this._gridCacheKey = cacheKey;
    const fragment = document.createDocumentFragment();
    const backgroundRect = createSvgElement('rect');
    backgroundRect.setAttribute('width', width);
    backgroundRect.setAttribute('height', height);
    backgroundRect.setAttribute('fill', background || '#ffffff');
    backgroundRect.setAttribute('pointer-events', 'none');
    fragment.appendChild(backgroundRect);

    if (grid) {
      const majorInterval = safeGridSize * 10;
      const appendGridLine = (x1, y1, x2, y2, isMajor) => {
        const line = createSvgElement('line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', isMajor ? COLORS.gridMajor : COLORS.gridMinor);
        line.setAttribute('stroke-width', (isMajor ? 1 : 0.5) / zoom);
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('pointer-events', 'none');
        fragment.appendChild(line);
      };

      for (let x = 0; x <= width; x += safeGridSize) {
        appendGridLine(x, 0, x, height, Math.round(x) % majorInterval === 0);
      }

      for (let y = 0; y <= height; y += safeGridSize) {
        appendGridLine(0, y, width, y, Math.round(y) % majorInterval === 0);
      }
    }

    const border = createSvgElement('rect');
    border.setAttribute('width', width);
    border.setAttribute('height', height);
    border.setAttribute('fill', 'none');
    border.setAttribute('stroke', '#d0d0d6');
    border.setAttribute('stroke-width', 1 / zoom);
    border.setAttribute('vector-effect', 'non-scaling-stroke');
    border.setAttribute('pointer-events', 'none');
    fragment.appendChild(border);

    this.gridLayer.replaceChildren(fragment);
  }

  _tagForType(type) {
    const tags = {
      rectangle: 'rect',
      frame: 'rect',
      ellipse: 'ellipse',
      line: 'line',
      freeform: 'path',
      text: 'text',
    };
    return tags[type] || null;
  }

  _createElementNode(element) {
    const tagName = this._tagForType(element.type);
    if (!tagName) {
      return null;
    }

    const node = createSvgElement(tagName);
    node.dataset.id = element.id;
    this._updateElementNode(node, element);
    return node;
  }

  _isValidRenderableElement(element) {
    return ( element !== null && typeof element === 'object' && typeof element.id === 'string' && element.id.length > 0 );
  }

  _ensureElementNode(element) {
    const expectedTag = this._tagForType(element.type);
    let node = this.elementNodes.get(element.id);
    if (!expectedTag) {
      if (node) {
        node.remove();
        this.elementNodes.delete(element.id);
      }
      return null;
    }

    const needsReplacement = !node || node.tagName.toLowerCase() !== expectedTag;
    if (needsReplacement) {
      node?.remove();
      node = this._createElementNode(element);
      if (!node) {
        this.elementNodes.delete(element.id);
        return null;
      }

      this.elementNodes.set(element.id, node);
    } else {
      this._updateElementNode(node, element);
    }
    return node;
  }

  _removeStaleElementNodes(seenIds) {
    for (const [id, node] of this.elementNodes) {
      if (seenIds.has(id)) {
        continue;
      }
      node.remove();
      this.elementNodes.delete(id);
    }
  }

  _syncElementLayerOrder(elements) {
    const desiredNodes = [];
    for (const element of elements) {
      if (!this._isValidRenderableElement(element)) {
        continue;
      }

      const node = this.elementNodes.get(element.id);
      if (node) {
        desiredNodes.push(node);
      }
    }

    const currentNodes = Array.from(this.contentLayer.children);
    const orderMatches = currentNodes.length === desiredNodes.length && currentNodes.every((node, index) => node === desiredNodes[index]);
    if (orderMatches) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const node of desiredNodes) {
      fragment.appendChild(node);
    }
    this.contentLayer.appendChild(fragment);
  }

  renderContent() {
    const elements = this.state.data.elements;
    const seenIds = new Set();
    for (const element of elements) {
      if (!this._isValidRenderableElement(element)) {
        continue;
      }
      seenIds.add(element.id);
      this._ensureElementNode(element);
    }
    this._removeStaleElementNodes(seenIds);
    this._syncElementLayerOrder(elements);
  }

  _updateCommonAttributes(node, element, centerX, centerY) {
    const rotation = finiteNumber(element.rotation);
    node.dataset.id = element.id;
    node.style.display = element.visible === false ? 'none' : '';
    node.style.opacity = String(safeOpacity(element.opacity));
    node.setAttribute( 'transform', `rotate(${rotation} ${centerX} ${centerY})` );
  }

  _updateShapeStyle(node, element) {
    const strokeWidth = Math.max(0, Number(element.strokeWidth) || 0);
    node.setAttribute('fill', element.fill || 'none');
    node.setAttribute( 'stroke', strokeWidth > 0 ? element.stroke || '#000000' : 'none' );
    node.setAttribute('stroke-width', strokeWidth);
  }

  _updateRectangle(node, element, x, y, width, height) {
    node.setAttribute('x', x);
    node.setAttribute('y', y);
    node.setAttribute('width', Math.max(0, width));
    node.setAttribute('height', Math.max(0, height));
    node.setAttribute('rx', element.type === 'frame' ? 2 : 0);
    this._updateShapeStyle(node, element);
  }

  _updateEllipse(node, element, centerX, centerY, width, height) {
    node.setAttribute('cx', centerX);
    node.setAttribute('cy', centerY);
    node.setAttribute('rx', Math.max(0, width / 2));
    node.setAttribute('ry', Math.max(0, height / 2));
    this._updateShapeStyle(node, element);
  }

  _updateLine(node, element, x, y, width, height) {
    const startY = y + (element.flipY ? height : 0);
    const endY = y + (element.flipY ? 0 : height);
    node.setAttribute('x1', x);
    node.setAttribute('y1', startY);
    node.setAttribute('x2', x + width);
    node.setAttribute('y2', endY);
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', element.stroke || '#000000');
    node.setAttribute( 'stroke-width', Math.max(0.5, Number(element.strokeWidth) || 0) );
    node.setAttribute('stroke-linecap', 'round');
  }

  _updateFreeform(node, element, x, y, width, height) {
    const points = Array.isArray(element.points) ? element.points : [];
    const pathData = points.map((point, index) => {
      const px = x + finiteNumber(point.x) * width;
      const py = y + finiteNumber(point.y) * height;
      return `${index === 0 ? 'M' : 'L'} ${px} ${py}`;
    }).join(' ');

    node.setAttribute('d', pathData);
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', element.stroke || '#1a1a2e');
    node.setAttribute('stroke-width', Math.max(0.5, Number(element.strokeWidth) || 0));
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('vector-effect', 'non-scaling-stroke');
  }

  _updateText(node, element, x, y) {
    const fontSize = Number(element.fontSize) || 24;
    const fontWeight = element.fontWeight || 400;
    let textAnchor = 'start';
    if (element.textAlign === 'center') {
      textAnchor = 'middle';
    } else if (element.textAlign === 'right') {
      textAnchor = 'end';
    }

    node.setAttribute('x', x);
    node.setAttribute('y', y + fontSize);
    node.setAttribute('fill', element.fill || '#000000');
    node.setAttribute('font-size', fontSize);
    node.setAttribute('font-weight', fontWeight);
    node.setAttribute('text-anchor', textAnchor);
    node.setAttribute('dominant-baseline', 'alphabetic');

    if (element.letterSpacing) {
      node.setAttribute('letter-spacing', element.letterSpacing);
    } else {
      node.removeAttribute('letter-spacing');
    }

    node.replaceChildren();
    const lines = String(element.text || '').split('\n');
    const lineHeight = fontSize * (Number(element.lineHeight) || 1.4);
    lines.forEach((line, index) => {
      if (index === 0) {
        node.appendChild(document.createTextNode(line));
        return;
      }

      const tspan = createSvgElement('tspan');
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', lineHeight);
      tspan.textContent = line;
      node.appendChild(tspan);
    });
  }

  _updateElementNode(node, element) {
    const x = finiteNumber(element.x);
    const y = finiteNumber(element.y);
    const width = finiteNumber(element.width);
    const height = finiteNumber(element.height);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    this._updateCommonAttributes(node, element, centerX, centerY);
    switch (element.type) {
      case 'rectangle':
      case 'frame':
        this._updateRectangle(node, element, x, y, width, height);
        break;

      case 'ellipse':
        this._updateEllipse(node, element, centerX, centerY, width, height);
        break;

      case 'line':
        this._updateLine(node, element, x, y, width, height);
        break;

      case 'freeform':
        this._updateFreeform(node, element, x, y, width, height);
        break;

      case 'text':
        this._updateText(node, element, x, y);
        break;

      default:
        break;
    }
  }

  _screenMapper() {
    const viewport = this.state.data.viewport;
    const rect = this.svg.getBoundingClientRect();
    const { width, height } = this.state.data;
    return (x, y) => ({
      x: viewport.x + rect.width / 2 + (x - width / 2) * viewport.zoom,
      y: viewport.y + rect.height / 2 + (y - height / 2) * viewport.zoom,
    });
  }

  _appendSelectionPolygon(element, toScreen) {
    const points = getRotatedCorners(element).map((corner) => {
        const point = toScreen(corner.x, corner.y);
        return `${point.x},${point.y}`;
      }).join(' ');

    const polygon = createSvgElement('polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', 'none');
    polygon.setAttribute('stroke', COLORS.selection);
    polygon.setAttribute('stroke-width', '1.5');
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    this.overlayLayer.appendChild(polygon);
  }

  _appendHandle(name, x, y, cursor, size = 7) {
    const handle = createSvgElement('rect');
    handle.setAttribute('x', x - size / 2);
    handle.setAttribute('y', y - size / 2);
    handle.setAttribute('width', size);
    handle.setAttribute('height', size);
    handle.setAttribute('fill', COLORS.handleFill);
    handle.setAttribute('stroke', COLORS.handleStroke);
    handle.setAttribute('stroke-width', '1.5');
    handle.dataset.handle = name;
    handle.setAttribute('cursor', cursor);
    handle.setAttribute('vector-effect', 'non-scaling-stroke');
    this.overlayLayer.appendChild(handle);
  }

  _renderRotationHandle(selection, bounds, topLeft, toScreen, zoom) {
    if (selection.length !== 1) {
      return;
    }

    const center = getElementCenter(selection[0]);
    const screenCenter = toScreen(center.x, center.y);
    const handlePosition = toScreen( center.x, bounds.y - 24 / Math.max(0.0001, zoom) );
    const line = createSvgElement('line');
    line.setAttribute('x1', screenCenter.x);
    line.setAttribute('y1', topLeft.y);
    line.setAttribute('x2', screenCenter.x);
    line.setAttribute('y2', handlePosition.y);
    line.setAttribute('stroke', COLORS.selection);
    line.setAttribute('stroke-width', '1');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    this.overlayLayer.appendChild(line);

    const handle = createSvgElement('circle');
    handle.setAttribute('cx', screenCenter.x);
    handle.setAttribute('cy', handlePosition.y);
    handle.setAttribute('r', '5');
    handle.setAttribute('fill', COLORS.handleFill);
    handle.setAttribute('stroke', COLORS.handleStroke);
    handle.setAttribute('stroke-width', '1.5');
    handle.dataset.handle = 'rotate';
    handle.setAttribute('cursor', 'grab');
    this.overlayLayer.appendChild(handle);
  }

  _renderResizeHandles(topLeft, boxWidth, boxHeight) {
    const handles = [
      ['nw', topLeft.x, topLeft.y, 'nwse-resize'],
      ['n', topLeft.x + boxWidth / 2, topLeft.y, 'ns-resize'],
      ['ne', topLeft.x + boxWidth, topLeft.y, 'nesw-resize'],
      ['e', topLeft.x + boxWidth, topLeft.y + boxHeight / 2, 'ew-resize'],
      ['se', topLeft.x + boxWidth, topLeft.y + boxHeight, 'nwse-resize'],
      ['s', topLeft.x + boxWidth / 2, topLeft.y + boxHeight, 'ns-resize'],
      ['sw', topLeft.x, topLeft.y + boxHeight, 'nesw-resize'],
      ['w', topLeft.x, topLeft.y + boxHeight / 2, 'ew-resize'],
    ];

    for (const [name, x, y, cursor] of handles) {
      this._appendHandle(name, x, y, cursor);
    }
  }

  renderSelection(selection, currentTool = 'select') {
    this.overlayLayer.replaceChildren();
    if (currentTool !== 'select' || !selection?.length) {
      return;
    }

    const toScreen = this._screenMapper();
    for (const element of selection) {
      this._appendSelectionPolygon(element, toScreen);
    }

    const bounds = getSelectionBounds(selection);
    if (!bounds) {
      return;
    }

    const topLeft = toScreen(bounds.x, bounds.y);
    const bottomRight = toScreen( bounds.x + bounds.width, bounds.y + bounds.height );
    const boxWidth = bottomRight.x - topLeft.x;
    const boxHeight = bottomRight.y - topLeft.y;
    const boundingBox = createSvgElement('rect');
    boundingBox.setAttribute('x', topLeft.x);
    boundingBox.setAttribute('y', topLeft.y);
    boundingBox.setAttribute('width', boxWidth);
    boundingBox.setAttribute('height', boxHeight);
    boundingBox.setAttribute('fill', 'none');
    boundingBox.setAttribute('stroke', COLORS.selection);
    boundingBox.setAttribute('stroke-width', '1');
    boundingBox.setAttribute('opacity', '0.5');
    boundingBox.setAttribute('vector-effect', 'non-scaling-stroke');

    this.overlayLayer.appendChild(boundingBox);
    this._renderRotationHandle( selection, bounds, topLeft, toScreen, this.state.data.viewport.zoom );
    this._renderResizeHandles(topLeft, boxWidth, boxHeight);
  }

  renderGuides(guides) {
    this.guidesLayer.replaceChildren();
    if (!guides) {
      return;
    }

    const toScreen = this._screenMapper();
    const zoom = Math.max( 0.0001, finiteNumber(this.state.data.viewport.zoom, 1) );
    const strokeWidth = 1 / zoom;
    const fragment = document.createDocumentFragment();
    const appendGuide = (x1, y1, x2, y2) => {
      const line = createSvgElement('line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', COLORS.guide);
      line.setAttribute('stroke-width', strokeWidth);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      fragment.appendChild(line);
    };

    for (const guide of guides.v || []) {
      const start = toScreen(guide.x, guide.y1);
      const end = toScreen(guide.x, guide.y2);
      appendGuide(start.x, start.y, end.x, end.y);
    }

    for (const guide of guides.h || []) {
      const start = toScreen(guide.x1, guide.y);
      const end = toScreen(guide.x2, guide.y);
      appendGuide(start.x, start.y, end.x, end.y);
    }
    this.guidesLayer.appendChild(fragment);
  }

  renderMarquee(rect) {
    this.guidesLayer.replaceChildren();
    if (!rect) {
      return;
    }

    const toScreen = this._screenMapper();
    const position = toScreen(rect.x, rect.y);
    const zoom = this.state.data.viewport.zoom;
    const marquee = createSvgElement('rect');
    marquee.setAttribute('x', position.x);
    marquee.setAttribute('y', position.y);
    marquee.setAttribute('width', Math.abs(rect.width * zoom));
    marquee.setAttribute('height', Math.abs(rect.height * zoom));
    marquee.setAttribute('fill', COLORS.marqueeFill);
    marquee.setAttribute('stroke', COLORS.selection);
    marquee.setAttribute('stroke-width', '1');
    marquee.setAttribute('stroke-dasharray', '4 2');
    marquee.setAttribute('vector-effect', 'non-scaling-stroke');
    this.guidesLayer.appendChild(marquee);
  }

  clearGuides() {
    this.guidesLayer.replaceChildren();
  }

  render() {
    this.applyViewport();
    this.renderGrid();
    this.renderContent();
  }

  exportSVG() {
    const { width, height, background, elements } = this.state.data;
    const pieces = [
      `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" ` + `viewBox="0 0 ${width} ${height}">`,
      `<rect width="${width}" height="${height}" ` + `fill="${escapeAttribute(background || '#ffffff')}"/>`,
    ];

    for (const element of elements) {
      if (!element || element.visible === false) {
        continue;
      }
      pieces.push(this._elementToSVG(element));
    }
    pieces.push('</svg>');
    return pieces.join('');
  }

  _elementToSVG(element) {
    const x = finiteNumber(element.x);
    const y = finiteNumber(element.y);
    const width = finiteNumber(element.width);
    const height = finiteNumber(element.height);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const rotation = finiteNumber(element.rotation);
    const transform = rotation ? ` transform="rotate(${rotation} ${centerX} ${centerY})"` : '';
    const opacityValue = safeOpacity(element.opacity);
    const opacity = opacityValue < 1 ? ` opacity="${opacityValue}"` : '';
    const fill = escapeAttribute(element.fill || 'none');
    const stroke = escapeAttribute(element.stroke || '#000000');
    const strokeWidth = Math.max(0, Number(element.strokeWidth) || 0);

    switch (element.type) {
      case 'rectangle':
      case 'frame':
        return this._rectangleToSVG(
          element,
          { x, y, width, height, fill, stroke, strokeWidth },
          transform,
          opacity
        );

      case 'ellipse':
        return this._ellipseToSVG(
          { centerX, centerY, width, height, fill, stroke, strokeWidth },
          transform,
          opacity
        );

      case 'line':
        return this._lineToSVG(
          { x, y, width, height, stroke, strokeWidth },
          element.flipY,
          transform,
          opacity
        );

      case 'freeform': {
        const points = Array.isArray(element.points) ? element.points : [];
        const d = points.map((point, index) => {
          const px = x + finiteNumber(point.x) * width;
          const py = y + finiteNumber(point.y) * height;
          return `${index === 0 ? 'M' : 'L'} ${px} ${py}`;
        }).join(' ');
        return `<path d="${escapeAttribute(d)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${transform}${opacity}/>`;
      }

      case 'text':
        return this._textToSVG(
          element,
          { x, y },
          transform,
          opacity
        );

      default:
        return '';
    }
  }

  _rectangleToSVG(element, values, transform, opacity) {
    const { x, y, width, height, fill, stroke, strokeWidth } = values;
    const radius = element.type === 'frame' ? 2 : 0;
    const strokeAttributes = strokeWidth > 0 ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : '';
    return (
      `<rect x="${x}" y="${y}" width="${Math.max(0, width)}" ` +
      `height="${Math.max(0, height)}" rx="${radius}" ` +
      `fill="${fill}"${strokeAttributes}${transform}${opacity}/>`
    );
  }

  _ellipseToSVG(values, transform, opacity) {
    const { centerX, centerY, width, height, fill, stroke, strokeWidth } = values;
    const strokeAttributes = strokeWidth > 0 ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : '';
    return (
      `<ellipse cx="${centerX}" cy="${centerY}" ` +
      `rx="${Math.max(0, width / 2)}" ` +
      `ry="${Math.max(0, height / 2)}" ` +
      `fill="${fill}"${strokeAttributes}${transform}${opacity}/>`
    );
  }

  _lineToSVG(values, flipY, transform, opacity) {
    const { x, y, width, height, stroke, strokeWidth } = values;
    const startY = y + (flipY ? height : 0);
    const endY = y + (flipY ? 0 : height);
    return (
      `<line x1="${x}" y1="${startY}" ` +
      `x2="${x + width}" y2="${endY}" ` +
      `fill="none" stroke="${stroke}" ` +
      `stroke-width="${Math.max(0.5, strokeWidth)}" ` +
      `stroke-linecap="round"${transform}${opacity}/>`
    );
  }

  _textToSVG(element, position, transform, opacity) {
    const { x, y } = position;
    const fontSize = Number(element.fontSize) || 24;
    const fontWeight = element.fontWeight || 400;
    let anchor = 'start';
    if (element.textAlign === 'center') {
      anchor = 'middle';
    } else if (element.textAlign === 'right') {
      anchor = 'end';
    }

    const letterSpacing = element.letterSpacing ? ` letter-spacing="${escapeAttribute(element.letterSpacing)}"` : '';
    const lineHeight = fontSize * (Number(element.lineHeight) || 1.4);
    const lines = String(element.text || '').split('\n');
    const content = lines.map((line, index) => {
        const safeLine = escapeText(line);
        if (index === 0) {
          return safeLine;
        }
        return ( `<tspan x="${x}" dy="${lineHeight}">` + `${safeLine}</tspan>` );
      }).join('');

    return (
      `<text x="${x}" y="${y + fontSize}" ` +
      `fill="${escapeAttribute(element.fill || '#000000')}" ` +
      `font-size="${fontSize}" ` +
      `font-weight="${escapeAttribute(fontWeight)}" ` +
      `text-anchor="${anchor}"${letterSpacing}${transform}${opacity}>` +
      `${content}</text>`
    );
  }
}