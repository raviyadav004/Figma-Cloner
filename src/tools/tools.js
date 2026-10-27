import { createElement } from '../core/State.js';
import { CreateElementCommand } from '../core/CommandManager.js';
import { snapToGrid } from '../utils/snapping.js';

const MIN_ELEMENT_SIZE = 2;
const DEFAULT_ELEMENT_SIZE = 100;
function getSnappedPoint(state, x, y) {
  const settings = state.data.settings;
  if (!settings.snap) {
    return { x, y };
  }

  const gridSize = settings.gridSize;
  return {
    x: snapToGrid(x, gridSize),
    y: snapToGrid(y, gridSize),
  };
}

function getNormalizedBounds(startX, startY, endX, endY) {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export class BaseTool {
  constructor(editor) {
    if ( !editor?.state || !editor?.renderer || !editor?.selection || !editor?.commands ) {
      throw new TypeError( 'BaseTool requires a valid editor instance.' );
    }
    this.editor = editor;
    this.state = editor.state;
    this.renderer = editor.renderer;
    this.selection = editor.selection;
    this.commands = editor.commands;
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.tempElement = null;
  }

  onPointerDown(x, y, event) {
    this.isDrawing = true;
    this.startX = x;
    this.startY = y;
  }

  onPointerMove(x, y, event) {}
  onPointerUp(x, y, event) {
    this.isDrawing = false;
  }

  cleanup() {
    if (this.tempElement) {
      this.state.removeElement(this.tempElement.id);
      this.tempElement = null;
    }
    this.isDrawing = false;
  }
}

export class ShapeTool extends BaseTool {
  constructor(editor, type) {
    super(editor);
    const supportedTypes = [ 'rectangle', 'ellipse', 'line', 'frame', ];
    if (!supportedTypes.includes(type)) {
      throw new TypeError( `Unsupported shape tool: ${type}` );
    }
    this.type = type;
  }

  onPointerDown(x, y, event) {
    super.onPointerDown(x, y, event);
    const point = getSnappedPoint(this.state, x, y);
    this.startX = point.x;
    this.startY = point.y;
    this.tempElement = createElement(this.type, {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      flipX: false,
      flipY: false,
    });

    this.state.addElement(this.tempElement);
    this.tempElement = this.state.getElementById( this.tempElement.id );
  }

  onPointerMove(x, y, event) {
    if (!this.isDrawing || !this.tempElement) {
      return;
    }

    const point = getSnappedPoint(this.state, x, y);
    let endX = point.x;
    let endY = point.y;
    let width = endX - this.startX;
    let height = endY - this.startY;
    if (event?.shiftKey && this.type !== 'line') {
      const size = Math.max( Math.abs(width), Math.abs(height) );
      width = Math.sign(width || 1) * size;
      height = Math.sign(height || 1) * size;
      endX = this.startX + width;
      endY = this.startY + height;
    }

    let bounds;
    if (this.type === 'line') {
      bounds = {
        x: Math.min(this.startX, endX),
        y: Math.min(this.startY, endY),
        width: Math.abs(endX - this.startX),
        height: Math.abs(endY - this.startY),
        flipX: endX < this.startX,
        flipY: (endX < this.startX) !== (endY < this.startY),
      };
    } else {
      bounds = getNormalizedBounds( this.startX, this.startY, endX, endY );
      bounds.width = Math.max(1, bounds.width);
      bounds.height = Math.max(1, bounds.height);
    }

    this.state.updateElement( this.tempElement.id, bounds );
  }

  onPointerUp(x, y, event) {
    if (!this.tempElement) {
      this.isDrawing = false;
      return;
    }

    this.onPointerMove(x, y, event);
    const currentElement = this.state.getElementById( this.tempElement.id );
    if (!currentElement) {
      this.tempElement = null;
      this.isDrawing = false;
      return;
    }

    const element = { ...currentElement };
    this.state.removeElement(element.id);
    this.tempElement = null;
    this.isDrawing = false;
    if (this.type === 'line') {
      if ( element.width < MIN_ELEMENT_SIZE && element.height < MIN_ELEMENT_SIZE ) {
        return;
      }
    } else if ( element.width < MIN_ELEMENT_SIZE || element.height < MIN_ELEMENT_SIZE ) {
      element.x = this.startX;
      element.y = this.startY;
      element.width = DEFAULT_ELEMENT_SIZE;
      element.height = DEFAULT_ELEMENT_SIZE;
    }

    this.commands.execute( new CreateElementCommand(this.state, element) );
    this.selection.select(element.id);
    this.editor.setTool('select');
  }
}

export class FreeformTool extends BaseTool {
  constructor(editor) {
    super(editor);
    this.type = 'freeform';
    this.points = [];
    this.lastPoint = null;
    this.maxPoints = 2000;
    this.minimumPointDistance = 1.25;
  }

  onPointerDown(x, y) {
    super.onPointerDown(x, y);
    const point = { x, y };
    this.points = [point];
    this.lastPoint = point;
    this.tempElement = createElement('freeform', {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      points: [{ x: 0, y: 0 }],
    });
    this.state.addElement(this.tempElement);
    this.tempElement = this.state.getElementById(this.tempElement.id);
  }

  _recordPoint(x, y) {
    if (!this.isDrawing || this.points.length >= this.maxPoints) return;
    const point = { x, y };
    const previous = this.lastPoint;
    if (previous) {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      if (Math.hypot(dx, dy) < this.minimumPointDistance) return;
    }
    this.points.push(point);
    this.lastPoint = point;
  }

  _getNormalizedPath() {
    const minX = Math.min(...this.points.map((point) => point.x));
    const minY = Math.min(...this.points.map((point) => point.y));
    const maxX = Math.max(...this.points.map((point) => point.x));
    const maxY = Math.max(...this.points.map((point) => point.y));
    const width = maxX - minX;
    const height = maxY - minY;
    const points = this.points.map((point) => ({
      x: (point.x - minX) / Math.max(width, 1),
      y: (point.y - minY) / Math.max(height, 1),
    }));

    return { x: minX, y: minY, width, height, points };
  }

  onPointerMove(x, y) {
    if (!this.isDrawing || !this.tempElement) return;
    this._recordPoint(x, y);
    this.state.updateElement(this.tempElement.id, this._getNormalizedPath());
  }

  onPointerUp(x, y) {
    if (!this.tempElement) {
      this.isDrawing = false;
      this.points = [];
      this.lastPoint = null;
      return;
    }

    this._recordPoint(x, y);
    const currentElement = this.state.getElementById(this.tempElement.id);
    if (!currentElement) {
      this.tempElement = null;
      this.isDrawing = false;
      this.points = [];
      this.lastPoint = null;
      return;
    }

    const element = { ...currentElement, ...this._getNormalizedPath() };
    this.state.removeElement(element.id);
    this.tempElement = null;
    this.isDrawing = false;
    this.points = [];
    this.lastPoint = null;

    const pathLength = element.points.reduce((total, point, index, points) => {
      if (index === 0) return total;
      const previous = points[index - 1];
      return total + Math.hypot(
        (point.x - previous.x) * Math.max(element.width, 1),
        (point.y - previous.y) * Math.max(element.height, 1),
      );
    }, 0);
    if (pathLength < MIN_ELEMENT_SIZE) return;

    this.commands.execute(new CreateElementCommand(this.state, element));
    this.selection.select(element.id);
    this.editor.setTool('select');
  }

  cleanup() {
    super.cleanup();
    this.points = [];
    this.lastPoint = null;
  }
}

export class TextTool extends BaseTool {
  constructor(editor) {
    super(editor);
    this.type = 'text';
  }

  onPointerDown(x, y, event) {
    super.onPointerDown(x, y, event);
    const point = getSnappedPoint(this.state, x, y);
    const element = createElement('text', {
      x: point.x,
      y: point.y,
    });

    this.commands.execute( new CreateElementCommand(this.state, element) );
    this.selection.select(element.id);
    this.editor.setTool('select');
    this.isDrawing = false;
    setTimeout(() => {
      if ( !this.editor._destroyed && this.state.getElementById(element.id) ) {
        if (typeof this.editor.editText === 'function') {
          this.editor.editText(element.id);
        } else if ( typeof this.editor.editSelectedText === 'function' ) {
          this.editor.editSelectedText();
        }
      }
    }, 50);
  }
}

export class FrameTool extends ShapeTool {
  constructor(editor) {
    super(editor, 'frame');
  }
}