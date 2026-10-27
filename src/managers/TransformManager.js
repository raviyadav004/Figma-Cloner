import { getSelectionBounds, angle, normalizeAngle, snapAngle, round, } from '../utils/geometry.js';
import { MoveElementsCommand, ResizeElementCommand, RotateElementsCommand, } from '../core/CommandManager.js';
import { snapToGrid, getGuideLines, } from '../utils/snapping.js';

const HANDLE_SIZE = 8;
const MIN_ELEMENT_SIZE = 1;
const SNAP_GUIDE_THRESHOLD = 6;
const ROTATION_SNAP_STEP = 15;
const NUMBER_EPSILON = 0.001;
function sameNumber(a, b) {
  return Math.abs((a ?? 0) - (b ?? 0)) <= NUMBER_EPSILON;
}

function isFinitePoint(x, y) {
  return Number.isFinite(x) && Number.isFinite(y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createCompositeCommand(commands) {
  return {
    execute() {
      const executed = [];
      try {
        for (const command of commands) {
          command.execute();
          executed.push(command);
        }
      } catch (error) {
        for (let i = executed.length - 1; i >= 0; i -= 1) {
          try {
            executed[i].undo();
          } catch (rollbackError) {
            console.error( 'Failed to roll back a transform command:', rollbackError );
          }
        }
        throw error;
      }
    },

    undo() {
      const undone = [];
      try {
        for (let i = commands.length - 1; i >= 0; i -= 1) {
          commands[i].undo();
          undone.push(commands[i]);
        }
      } catch (error) {
        for (let i = undone.length - 1; i >= 0; i -= 1) {
          try {
            undone[i].execute();
          } catch (rollbackError) {
            console.error( 'Failed to restore a transform command:', rollbackError );
          }
        }
        throw error;
      }
    },
  };
}

function getElementCenter(element) {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function rotatePointAroundCenter(point, center, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function getResizeHandleAxes(handle) {
  return {
    west: handle.includes('w'),
    east: handle.includes('e'),
    north: handle.includes('n'),
    south: handle.includes('s'),
  };
}

export class TransformManager {
  constructor(editor) {
    if ( !editor?.state || !editor?.selection || !editor?.commands || !editor?.renderer ) {
      throw new TypeError( 'TransformManager requires a fully initialized editor.' );
    }
    this.editor = editor;
    this.state = editor.state;
    this.selection = editor.selection;
    this.commands = editor.commands;
    this.renderer = editor.renderer;
    this.mode = null;
    this.startData = null;
    this.handle = null;
    this.shiftKey = false;
    this.altKey = false;
  }

  _getSnapshots() {
    return this.selection.getSelectedElements().map((element) => ({
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: Number.isFinite(element.rotation) ? element.rotation : 0,
    }));
  }

  _begin(mode, startX, startY, extra = {}) {
    if (!isFinitePoint(startX, startY)) {
      return false;
    }

    if (this.mode) {
      this.cancel();
    }

    const elements = this._getSnapshots();
    if (!elements.length) {
      return false;
    }

    this.mode = mode;
    this.startData = { startX, startY, elements, ...extra, };
    return true;
  }

  _getExistingSnapshots() {
    if (!this.startData) {
      return [];
    }

    return this.startData.elements.map((snapshot) => ({
        snapshot,
        element: this.state.getElementById(snapshot.id),
      })).filter(({ element }) => Boolean(element));
  }

  _restoreSnapshots(properties) {
    if (!this.startData || !properties.length) {
      return;
    }

    for (const { snapshot, element } of this._getExistingSnapshots()) {
      const values = {};
      for (const property of properties) {
        values[property] = snapshot[property];
      }
      this.state.updateElement(element.id, values);
    }
  }

  _clearSession() {
    this.mode = null;
    this.startData = null;
    this.handle = null;
    this.shiftKey = false;
    this.altKey = false;
    this.renderer.clearGuides?.();
  }

  _commitCommands(commands) {
    if (!commands.length) {
      return;
    }
    this.commands.execute(createCompositeCommand(commands));
  }

  _getElementBounds(element) {
    if (!element) {
      return null;
    }

    const bounds = getSelectionBounds([element]);
    if ( !bounds || ![ bounds.x, bounds.y, bounds.width, bounds.height, ].every(Number.isFinite) ) {
      return null;
    }
    return bounds;
  }

  _getOtherElements(selectedIds) {
    return this.state.getElements().filter( (element) => !selectedIds.has(element.id) && element.visible !== false && element.locked !== true );
  }

  _findBestGuide(bounds, otherElements, axis) {
    const movingValues = axis === 'x'
        ? [
            bounds.x,
            bounds.x + bounds.width / 2,
            bounds.x + bounds.width,
          ]
        : [
            bounds.y,
            bounds.y + bounds.height / 2,
            bounds.y + bounds.height,
          ];

    let best = null;
    for (const element of otherElements) {
      const target = this._getElementBounds(element);
      if (!target) {
        continue;
      }

      const targetValues = axis === 'x'
          ? [
              target.x,
              target.x + target.width / 2,
              target.x + target.width,
            ]
          : [
              target.y,
              target.y + target.height / 2,
              target.y + target.height,
            ];

      for (const movingValue of movingValues) {
        for (const targetValue of targetValues) {
          const offset = targetValue - movingValue;
          const distance = Math.abs(offset);
          if (distance > SNAP_GUIDE_THRESHOLD) {
            continue;
          }

          if (!best || distance < best.distance) {
            best = { offset, distance };
          }
        }
      }
    }
    return best;
  }

  startMove(startX, startY) {
    return this._begin('move', startX, startY);
  }

  updateMove(curX, curY, shiftKey = false, altKey = false) {
    if ( this.mode !== 'move' || !this.startData || !isFinitePoint(curX, curY) ) {
      return;
    }

    const start = this.startData;
    let dx = curX - start.startX;
    let dy = curY - start.startY;
    this.shiftKey = Boolean(shiftKey);
    this.altKey = Boolean(altKey);
    if (this.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    const originalElements = start.elements.map((snapshot) => ({
        snapshot,
        element: this.state.getElementById(snapshot.id),
      })).filter(({ element }) => Boolean(element));

    if (!originalElements.length) {
      return;
    }

    const originalBounds = getSelectionBounds(
      originalElements.map(({ snapshot, element }) => ({
        ...element,
        ...snapshot,
      }))
    );

    if (!originalBounds) {
      return;
    }

    const nextBounds = {
      x: originalBounds.x + dx,
      y: originalBounds.y + dy,
      width: originalBounds.width,
      height: originalBounds.height,
    };

    const settings = this.state.data.settings ?? {};
    const gridSize = settings.gridSize;
    if ( settings.snap && Number.isFinite(gridSize) && gridSize > 0 ) {
      nextBounds.x = snapToGrid(nextBounds.x, gridSize);
      nextBounds.y = snapToGrid(nextBounds.y, gridSize);
    }

    const selectedIds = new Set( start.elements.map((snapshot) => snapshot.id) );
    const others = this._getOtherElements(selectedIds);
    const verticalGuide = this._findBestGuide( nextBounds, others, 'x' );
    const horizontalGuide = this._findBestGuide( nextBounds, others, 'y' );
    if (verticalGuide) {
      nextBounds.x += verticalGuide.offset;
    }

    if (horizontalGuide) {
      nextBounds.y += horizontalGuide.offset;
    }

    const finalDx = nextBounds.x - originalBounds.x;
    const finalDy = nextBounds.y - originalBounds.y;
    for (const snapshot of start.elements) {
      if (!this.state.getElementById(snapshot.id)) {
        continue;
      }

      this.state.updateElement(snapshot.id, {
        x: round(snapshot.x + finalDx, 3),
        y: round(snapshot.y + finalDy, 3),
      });
    }

    this.renderer.renderGuides?.(
      getGuideLines(
        {
          ...originalBounds,
          x: nextBounds.x,
          y: nextBounds.y,
        },
        others,
        SNAP_GUIDE_THRESHOLD
      )
    );
  }

  endMove() {
    if (this.mode !== 'move' || !this.startData) {
      return;
    }

    const commands = [];
    for (const { snapshot, element } of this._getExistingSnapshots()) {
      if ( sameNumber(snapshot.x, element.x) && sameNumber(snapshot.y, element.y) ) {
        continue;
      }

      commands.push( new MoveElementsCommand(this.state, [ {
            id: element.id,
            fromX: snapshot.x,
            fromY: snapshot.y,
            toX: element.x,
            toY: element.y,
          },
        ])
      );
    }

    this._restoreSnapshots(['x', 'y']);
    try {
      this._commitCommands(commands);
    } catch (error) {
      this._restoreSnapshots(['x', 'y']);
      this._clearSession();
      throw error;
    }
    this._clearSession();
  }

  startResize(handle, startX, startY) {
    if ( typeof handle !== 'string' || !/^(n|s|e|w|ne|nw|se|sw)$/.test(handle) || !isFinitePoint(startX, startY) ) {
      return false;
    }

    const elements = this.selection.getSelectedElements();
    const bounds = getSelectionBounds(elements);
    if (!bounds || !elements.length) {
      return false;
    }

    const started = this._begin('resize', startX, startY, {
      bounds: { ...bounds },
    });

    this.handle = started ? handle : null;
    return started;
  }

  updateResize(curX, curY, shiftKey = false, altKey = false) {
    if ( this.mode !== 'resize' || !this.startData || !isFinitePoint(curX, curY) ) {
      return;
    }

    const { bounds, startX, startY } = this.startData;
    const axes = getResizeHandleAxes(this.handle);
    this.shiftKey = Boolean(shiftKey);
    this.altKey = Boolean(altKey);
    const dx = curX - startX;
    const dy = curY - startY;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    let left = bounds.x;
    let right = bounds.x + bounds.width;
    let top = bounds.y;
    let bottom = bounds.y + bounds.height;

    if (axes.east) right += dx;
    if (axes.west) left += dx;
    if (axes.south) bottom += dy;
    if (axes.north) top += dy;
    if (this.altKey) {
      if (axes.east) left = 2 * centerX - right;
      if (axes.west) right = 2 * centerX - left;
      if (axes.south) top = 2 * centerY - bottom;
      if (axes.north) bottom = 2 * centerY - top;
    }

    if (right - left < MIN_ELEMENT_SIZE) {
      if (axes.west && !axes.east) {
        left = right - MIN_ELEMENT_SIZE;
      } else {
        right = left + MIN_ELEMENT_SIZE;
      }
    }

    if (bottom - top < MIN_ELEMENT_SIZE) {
      if (axes.north && !axes.south) {
        top = bottom - MIN_ELEMENT_SIZE;
      } else {
        bottom = top + MIN_ELEMENT_SIZE;
      }
    }

    if (this.shiftKey) {
      const ratio = bounds.width > 0 && bounds.height > 0 ? bounds.width / bounds.height : 1;
      let width = Math.max(MIN_ELEMENT_SIZE, right - left);
      let height = Math.max(MIN_ELEMENT_SIZE, bottom - top);
      const horizontalActive = axes.east || axes.west;
      const verticalActive = axes.north || axes.south;
      if (horizontalActive && verticalActive) {
        const widthChange = Math.abs(width - bounds.width) / bounds.width;
        const heightChange = Math.abs(height - bounds.height) / bounds.height;

        if (widthChange >= heightChange) {
          height = width / ratio;
        } else {
          width = height * ratio;
        }
      } else if (horizontalActive) {
        height = width / ratio;
      } else if (verticalActive) {
        width = height * ratio;
      }

      width = Math.max(MIN_ELEMENT_SIZE, width);
      height = Math.max(MIN_ELEMENT_SIZE, height);

      if (this.altKey) {
        left = centerX - width / 2;
        right = centerX + width / 2;
        top = centerY - height / 2;
        bottom = centerY + height / 2;
      } else {
        if (axes.west) {
          left = right - width;
        } else if (horizontalActive) {
          right = left + width;
        }

        if (axes.north) {
          top = bottom - height;
        } else if (verticalActive) {
          bottom = top + height;
        } else {
          top = centerY - height / 2;
          bottom = centerY + height / 2;
        }

        if (horizontalActive && !verticalActive) {
          top = centerY - height / 2;
          bottom = centerY + height / 2;
        }
      }
    }

    const settings = this.state.data.settings ?? {};
    const gridSize = settings.gridSize;
    if ( settings.snap && Number.isFinite(gridSize) && gridSize > 0 ) {
      if (axes.west) {
        left = snapToGrid(left, gridSize);
      } else if (axes.east) {
        right = snapToGrid(right, gridSize);
      }

      if (axes.north) {
        top = snapToGrid(top, gridSize);
      } else if (axes.south) {
        bottom = snapToGrid(bottom, gridSize);
      }

      if (right - left < MIN_ELEMENT_SIZE) {
        if (axes.west) {
          left = right - MIN_ELEMENT_SIZE;
        } else {
          right = left + MIN_ELEMENT_SIZE;
        }
      }

      if (bottom - top < MIN_ELEMENT_SIZE) {
        if (axes.north) {
          top = bottom - MIN_ELEMENT_SIZE;
        } else {
          bottom = top + MIN_ELEMENT_SIZE;
        }
      }
    }

    const newBounds = {
      x: left,
      y: top,
      width: Math.max(MIN_ELEMENT_SIZE, right - left),
      height: Math.max(MIN_ELEMENT_SIZE, bottom - top),
    };

    const scaleX = bounds.width > 0 ? newBounds.width / bounds.width : 1;
    const scaleY = bounds.height > 0 ? newBounds.height / bounds.height : 1;
    for (const snapshot of this.startData.elements) {
      if (!this.state.getElementById(snapshot.id)) {
        continue;
      }

      const elementCenterX = snapshot.x + snapshot.width / 2;
      const elementCenterY = snapshot.y + snapshot.height / 2;
      const nextX = newBounds.x + (elementCenterX - bounds.x) * scaleX - (snapshot.width * scaleX) / 2;
      const nextY = newBounds.y + (elementCenterY - bounds.y) * scaleY - (snapshot.height * scaleY) / 2;
      this.state.updateElement(snapshot.id, {
        x: round(nextX, 3),
        y: round(nextY, 3),
        width: round( Math.max(MIN_ELEMENT_SIZE, snapshot.width * scaleX), 3 ),
        height: round( Math.max(MIN_ELEMENT_SIZE, snapshot.height * scaleY), 3 ),
      });
    }
    this._renderSnapGuides();
  }

  endResize() {
    if (this.mode !== 'resize' || !this.startData) {
      return;
    }

    const commands = [];
    for (const { snapshot, element } of this._getExistingSnapshots()) {
      const fromProps = {
        x: snapshot.x,
        y: snapshot.y,
        width: snapshot.width,
        height: snapshot.height,
      };

      const toProps = {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      };

      const changed = Object.keys(fromProps).some( (key) => !sameNumber(fromProps[key], toProps[key]) );
      if (!changed) {
        continue;
      }
      commands.push( new ResizeElementCommand( this.state, element.id, fromProps, toProps ) );
    }

    this._restoreSnapshots(['x', 'y', 'width', 'height']);
    try {
      this._commitCommands(commands);
    } catch (error) {
      this._restoreSnapshots(['x', 'y', 'width', 'height']);
      this._clearSession();
      throw error;
    }
    this._clearSession();
  }

  startRotate(startX, startY) {
    if (!isFinitePoint(startX, startY)) {
      return false;
    }
    const elements = this.selection.getSelectedElements();
    const bounds = getSelectionBounds(elements);
    if (!bounds || !elements.length) {
      return false;
    }

    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    return this._begin('rotate', startX, startY, {
      center,
      initialPointerAngle: angle( center.x, center.y, startX, startY ),
    });
  }

  updateRotate(curX, curY, shiftKey = false) {
    if ( this.mode !== 'rotate' || !this.startData || !isFinitePoint(curX, curY) ) {
      return;
    }

    const start = this.startData;
    const pointerAngle = angle( start.center.x, start.center.y, curX, curY );
    let delta = pointerAngle - start.initialPointerAngle;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    this.shiftKey = Boolean(shiftKey);
    if (this.shiftKey) {
      delta = snapAngle(delta, ROTATION_SNAP_STEP);
    }

    for (const snapshot of start.elements) {
      if (!this.state.getElementById(snapshot.id)) {
        continue;
      }

      const originalCenter = getElementCenter(snapshot);
      const nextCenter = rotatePointAroundCenter( originalCenter, start.center, delta );
      const rotation = normalizeAngle(snapshot.rotation + delta);
      this.state.updateElement(snapshot.id, {
        x: round(nextCenter.x - snapshot.width / 2, 3),
        y: round(nextCenter.y - snapshot.height / 2, 3),
        rotation: round(rotation, 1),
      });
    }
    this._renderSnapGuides();
  }

  endRotate() {
    if (this.mode !== 'rotate' || !this.startData) {
      return;
    }

    const commands = [];
    const moveItems = [];
    const rotationItems = [];
    for (const { snapshot, element } of this._getExistingSnapshots()) {
      const toRotation = Number.isFinite(element.rotation) ? element.rotation : 0;
      if ( !sameNumber(snapshot.x, element.x) || !sameNumber(snapshot.y, element.y) ) {
        moveItems.push({
          id: element.id,
          fromX: snapshot.x,
          fromY: snapshot.y,
          toX: element.x,
          toY: element.y,
        });
      }

      if (!sameNumber(snapshot.rotation, toRotation)) {
        rotationItems.push({
          id: element.id,
          fromRot: snapshot.rotation,
          toRot: toRotation,
        });
      }
    }

    this._restoreSnapshots(['x', 'y', 'rotation']);
    if (moveItems.length) {
      commands.push( new MoveElementsCommand(this.state, moveItems) );
    }

    if (rotationItems.length) {
      commands.push( new RotateElementsCommand(this.state, rotationItems) );
    }

    try {
      this._commitCommands(commands);
    } catch (error) {
      this._restoreSnapshots(['x', 'y', 'rotation']);
      this._clearSession();
      throw error;
    }
    this._clearSession();
  }

  _renderSnapGuides() {
    const selectedElements = this.selection.getSelectedElements();
    if (!selectedElements.length) {
      this.renderer.clearGuides?.();
      return;
    }

    const selectedIds = new Set( selectedElements.map((element) => element.id) );
    const others = this._getOtherElements(selectedIds);
    const bounds = getSelectionBounds(selectedElements);
    if (!bounds) {
      this.renderer.clearGuides?.();
      return;
    }
    this.renderer.renderGuides?.( getGuideLines(bounds, others, SNAP_GUIDE_THRESHOLD) );
  }

  getHandleAt(screenX, screenY) {
    if (!isFinitePoint(screenX, screenY)) {
      return null;
    }

    const overlay = this.renderer.overlayLayer;
    if (!overlay) {
      return null;
    }

    const handles = overlay.querySelectorAll('[data-handle]');
    for (const element of handles) {
      const rect = element.getBoundingClientRect();

      if (
        screenX >= rect.left - HANDLE_SIZE &&
        screenX <= rect.right + HANDLE_SIZE &&
        screenY >= rect.top - HANDLE_SIZE &&
        screenY <= rect.bottom + HANDLE_SIZE
      ) {
        return element.getAttribute('data-handle');
      }
    }
    return null;
  }

  cancel() {
    if (!this.startData) {
      this._clearSession();
      return;
    }

    const properties = this.mode === 'move' ? ['x', 'y'] : this.mode === 'resize' ? ['x', 'y', 'width', 'height'] : this.mode === 'rotate' ? ['x', 'y', 'rotation'] : [];
    this._restoreSnapshots(properties);
    this._clearSession();
  }
}