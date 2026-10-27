import { clone, uid } from '../utils/helpers.js';

const DEFAULT_HISTORY_LIMIT = 100;
const VALID_LAYER_ACTIONS = new Set([ 'front', 'back', 'forward', 'backward', ]);
function assertState(state) {
  if ( !state || typeof state.getElementById !== 'function' || typeof state.addElement !== 'function' || typeof state.removeElement !== 'function' || typeof state.updateElement !== 'function' || !Array.isArray(state.data?.elements) ) {
    throw new TypeError( '[CommandManager] A compatible State instance is required.' );
  }
}

function assertActiveState(state) {
  assertState(state);
  if ( typeof state.isDestroyed === 'function' && state.isDestroyed() ) {
    throw new Error( '[CommandManager] Cannot execute a command on a destroyed state.' );
  }
}

function notifyState(state) {
  if (typeof state?.notify === 'function') {
    state.notify();
  }
}

function getElements(state) {
  assertState(state);
  return state.data.elements;
}

function getElement(state, id) {
  return state.getElementById(id);
}

function updateElement(state, id, props) {
  if (!getElement(state, id)) {
    return false;
  }

  const updated = state.updateElement(id, clone(props));
  if (!updated) {
    throw new Error( `[CommandManager] Failed to update element "${id}".` );
  }
  return true;
}

function uniqueIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }
  return [ ...new Set( ids.filter( (id) => typeof id === 'string' && id.trim().length > 0 ) ), ];
}

function requireObject(value, label) {
  if ( !value || typeof value !== 'object' || Array.isArray(value) ) {
    throw new TypeError( `[CommandManager] ${label} must be an object.` );
  }
  return value;
}

function captureElementSnapshots(state, ids) {
  const elements = getElements(state);
  return ids.map((id) => {
      const index = elements.findIndex( (element) => element.id === id );
      if (index === -1) {
        return null;
      }
      return { id, index, element: clone(elements[index]), };
    }).filter(Boolean).sort((a, b) => a.index - b.index);
}

function restoreElementOrder(state, snapshots) {
  const elements = getElements(state);
  const byId = new Map( elements.map((element) => [element.id, element]) );
  const restored = [];
  const restoredIds = new Set();
  for (const snapshot of [...snapshots].sort( (a, b) => a.index - b.index )) {
    const element = byId.get(snapshot.id);
    if (element && !restoredIds.has(element.id)) {
      restored.push(element);
      restoredIds.add(element.id);
    }
  }

  for (const element of elements) {
    if (!restoredIds.has(element.id)) {
      restored.push(element);
      restoredIds.add(element.id);
    }
  }

  const unchanged = elements.length === restored.length && elements.every( (element, index) => element === restored[index] );
  if (unchanged) {
    return false;
  }

  state.data.elements = restored;
  notifyState(state);
  return true;
}

function restoreElementSnapshots(state, snapshots) {
  const elements = getElements(state);
  let changed = false;
  for (const snapshot of [...snapshots].sort( (a, b) => a.index - b.index )) {
    if (getElement(state, snapshot.id)) {
      continue;
    }

    const index = Math.max( 0, Math.min(snapshot.index, elements.length) );
    elements.splice(index, 0, clone(snapshot.element));
    changed = true;
  }

  if (changed) {
    notifyState(state);
  }
  return changed;
}

class Command {
  execute() {
    throw new Error( '[CommandManager] Command.execute() must be implemented.' );
  }

  undo() {
    throw new Error( '[CommandManager] Command.undo() must be implemented.' );
  }
}

export class CreateElementCommand extends Command {
  constructor(state, element) {
    super();
    assertState(state);
    requireObject(element, 'Element');
    this.state = state;
    this.element = clone(element);
    this.didCreate = false;
  }

  execute() {
    assertActiveState(this.state);
    if (getElement(this.state, this.element.id)) {
      if (this.didCreate) {
        return this.element.id;
      }
      throw new Error( `[CreateElementCommand] Element "${this.element.id}" already exists.` );
    }

    this.state.addElement(clone(this.element));
    this.didCreate = true;
    return this.element.id;
  }

  undo() {
    assertActiveState(this.state);
    if (!this.didCreate) {
      return false;
    }

    const removed = this.state.removeElement(this.element.id);
    if (removed) {
      this.didCreate = false;
    }
    return removed;
  }
}

export class DeleteElementsCommand extends Command {
  constructor(state, ids) {
    super();
    assertState(state);
    this.state = state;
    this.ids = uniqueIds(ids);
    this.snapshots = [];
    this.hasCapturedSnapshots = false;
  }

  execute() {
    assertActiveState(this.state);
    if (!this.hasCapturedSnapshots) {
      this.snapshots = captureElementSnapshots( this.state, this.ids );
      this.hasCapturedSnapshots = true;
    }

    const existingSnapshots = this.snapshots.filter( (snapshot) => getElement(this.state, snapshot.id) );
    for (const snapshot of [...existingSnapshots].sort( (a, b) => b.index - a.index )) {
      this.state.removeElement(snapshot.id);
    }
    return this.snapshots.map((snapshot) => snapshot.id);
  }

  undo() {
    assertActiveState(this.state);
    return restoreElementSnapshots( this.state, this.snapshots );
  }
}

export class MoveElementsCommand extends Command {
  constructor(state, moves) {
    super();
    assertState(state);
    if (!Array.isArray(moves)) {
      throw new TypeError( '[MoveElementsCommand] Moves must be an array.' );
    }

    this.state = state;
    this.moves = moves.map((move) => {
      requireObject(move, 'Move');
      for (const key of [ 'fromX', 'fromY', 'toX', 'toY', ]) {
        if (!Number.isFinite(move[key])) {
          throw new TypeError( `[MoveElementsCommand] ${key} must be a finite number.` );
        }
      }

      if (typeof move.id !== 'string' || !move.id) {
        throw new TypeError( '[MoveElementsCommand] Every move requires an element ID.' );
      }
      return { ...move };
    });
  }

  execute() {
    assertActiveState(this.state);
    for (const move of this.moves) {
      updateElement(this.state, move.id, { x: move.toX, y: move.toY, });
    }
  }

  undo() {
    assertActiveState(this.state);
    for (const move of this.moves) {
      updateElement(this.state, move.id, { x: move.fromX, y: move.fromY, });
    }
  }
}

export class ResizeElementCommand extends Command {
  constructor(state, id, fromProps, toProps) {
    super();
    assertState(state);
    requireObject(fromProps, 'Original resize properties');
    requireObject(toProps, 'Target resize properties');
    this.state = state;
    this.id = id;
    this.fromProps = clone(fromProps);
    this.toProps = clone(toProps);
  }

  execute() {
    assertActiveState(this.state);
    updateElement(this.state, this.id, this.toProps);
  }

  undo() {
    assertActiveState(this.state);
    updateElement(this.state, this.id, this.fromProps);
  }
}

export class RotateElementsCommand extends Command {
  constructor(state, rotations) {
    super();
    assertState(state);
    if (!Array.isArray(rotations)) {
      throw new TypeError( '[RotateElementsCommand] Rotations must be an array.' );
    }

    this.state = state;
    this.rotations = rotations.map((rotation) => {
      requireObject(rotation, 'Rotation');
      if ( typeof rotation.id !== 'string' || !Number.isFinite(rotation.fromRot) || !Number.isFinite(rotation.toRot) ) {
        throw new TypeError( '[RotateElementsCommand] Invalid rotation data.' );
      }
      return { ...rotation };
    });
  }

  execute() {
    assertActiveState(this.state);
    for (const rotation of this.rotations) {
      updateElement(this.state, rotation.id, { rotation: rotation.toRot, });
    }
  }

  undo() {
    assertActiveState(this.state);
    for (const rotation of this.rotations) {
      updateElement(this.state, rotation.id, { rotation: rotation.fromRot, });
    }
  }
}

export class UpdatePropertyCommand extends Command {
  constructor(state, id, props, oldProps) {
    super();
    assertState(state);
    requireObject(props, 'New properties');
    requireObject(oldProps, 'Original properties');
    this.state = state;
    this.id = id;
    this.props = clone(props);
    this.oldProps = clone(oldProps);
  }

  execute() {
    assertActiveState(this.state);
    updateElement(this.state, this.id, this.props);
  }

  undo() {
    assertActiveState(this.state);
    updateElement(this.state, this.id, this.oldProps);
  }
}

export class DuplicateElementCommand extends Command {
  constructor(state, ids) {
    super();
    assertState(state);
    this.state = state;
    this.ids = uniqueIds(ids);
    this.duplicates = [];
    this.hasCreatedDuplicates = false;
    this.originalIndices = new Map();
  }

  execute() {
    assertActiveState(this.state);
    const elements = getElements(this.state);
    if (!this.hasCreatedDuplicates) {
      this.duplicates = [];
      for (const id of this.ids) {
        const original = getElement(this.state, id);
        if (!original) {
          continue;
        }

        const duplicate = clone(original);
        duplicate.id = uid(original.type || 'element');
        duplicate.name = `${original.name || original.type || 'Element'} copy`;
        duplicate.x = (Number(original.x) || 0) + 16;
        duplicate.y = (Number(original.y) || 0) + 16;
        this.originalIndices.set( duplicate.id, elements.length + this.duplicates.length );
        this.duplicates.push(clone(duplicate));
      }
      this.hasCreatedDuplicates = true;
    }

    for (const duplicate of this.duplicates) {
      if (getElement(this.state, duplicate.id)) {
        continue;
      }
      const requestedIndex = this.originalIndices.get( duplicate.id );
      const currentElements = getElements(this.state);
      const index = Math.max( 0, Math.min( Number.isInteger(requestedIndex) ? requestedIndex : currentElements.length, currentElements.length ) );
      this.state.addElement(clone(duplicate));
      const added = currentElements.pop();
      currentElements.splice(index, 0, added);
      notifyState(this.state);
    }
    return this.duplicates.map((duplicate) => duplicate.id);
  }

  undo() {
    assertActiveState(this.state);
    let changed = false;
    for (const duplicate of this.duplicates) {
      if (this.state.removeElement(duplicate.id)) {
        changed = true;
      }
    }
    return changed;
  }
}

export class ReorderLayerCommand extends Command {
  constructor(state, id, direction) {
    super();
    assertState(state);
    if (!VALID_LAYER_ACTIONS.has(direction)) {
      throw new TypeError( `[ReorderLayerCommand] Invalid direction: ${direction}` );
    }
    this.state = state;
    this.id = id;
    this.direction = direction;
    this.fromIndex = -1;
    this.toIndex = -1;
    this.hasExecuted = false;
  }

  execute() {
    assertActiveState(this.state);
    const elements = getElements(this.state);
    const currentIndex = elements.findIndex( (element) => element.id === this.id );
    if (currentIndex === -1) {
      return false;
    }

    if (!this.hasExecuted) {
      this.fromIndex = currentIndex;
    }

    const changed = this.state.reorderElement( this.id, this.direction );
    this.toIndex = getElements(this.state).findIndex( (element) => element.id === this.id );
    this.hasExecuted = true;
    return changed;
  }

  undo() {
    assertActiveState(this.state);
    if ( !this.hasExecuted || this.fromIndex < 0 || this.toIndex < 0 ) {
      return false;
    }
    return this.state.moveElementToIndex( this.id, this.fromIndex );
  }
}

export class MultiReorderCommand extends Command {
  constructor(state, ids, action) {
    super();
    assertState(state);
    if (!VALID_LAYER_ACTIONS.has(action)) {
      throw new TypeError( `[MultiReorderCommand] Invalid action: ${action}` );
    }
    this.state = state;
    this.ids = uniqueIds(ids);
    this.action = action;
    this.originalOrder = null;
  }

  execute() {
    assertActiveState(this.state);
    const elements = getElements(this.state);
    if (this.originalOrder === null) {
      this.originalOrder = elements.map( (element) => element.id );
    }
    const selectedIds = new Set(this.ids);
    const selected = elements.filter( (element) => selectedIds.has(element.id) );

    if (!selected.length) {
      return false;
    }

    const remaining = elements.filter( (element) => !selectedIds.has(element.id) );
    let ordered;
    if (this.action === 'front') {
      ordered = [...remaining, ...selected];
    } else if (this.action === 'back') {
      ordered = [...selected, ...remaining];
    } else {
      ordered = [...elements];

      if (this.action === 'forward') {
        for ( let index = ordered.length - 2; index >= 0; index-- ) {
          if ( selectedIds.has(ordered[index].id) && !selectedIds.has(ordered[index + 1].id) ) {
            [ ordered[index], ordered[index + 1], ] = [ ordered[index + 1], ordered[index], ];
          }
        }
      } else {
        for ( let index = 1; index < ordered.length; index++ ) {
          if ( selectedIds.has(ordered[index].id) && !selectedIds.has(ordered[index - 1].id) ) {
            [ ordered[index], ordered[index - 1], ] = [ ordered[index - 1], ordered[index], ];
          }
        }
      }
    }

    const changed = ordered.some( (element, index) => element !== elements[index] );
    if (!changed) {
      return false;
    }
    this.state.data.elements = ordered;
    notifyState(this.state);
    return true;
  }

  undo() {
    assertActiveState(this.state);
    if (this.originalOrder === null) {
      return false;
    }
    return restoreElementOrder( this.state, this.originalOrder.map((id, index) => ({ id, index, })) );
  }
}

export class GroupCommand extends Command {
  constructor(state, ids) {
    super();
    assertState(state);
    this.state = state;
    this.ids = uniqueIds(ids);
    this.groupId = uid('group');
    this.previousGroupIds = new Map();
    this.hasCapturedPreviousGroups = false;
  }

  execute() {
    assertActiveState(this.state);
    let changed = false;
    if (!this.hasCapturedPreviousGroups) {
      for (const id of this.ids) {
        const element = getElement(this.state, id);
        if (!element) continue;
        this.previousGroupIds.set( id, element.groupId ?? null );
      }
      this.hasCapturedPreviousGroups = true;
    }

    for (const id of this.ids) {
      const element = getElement(this.state, id);
      if (!element || element.groupId === this.groupId) {
        continue;
      }
      element.groupId = this.groupId;
      changed = true;
    }

    if (changed) {
      notifyState(this.state);
    }
    return this.groupId;
  }

  undo() {
    assertActiveState(this.state);
    let changed = false;
    for (const [id, previousGroupId] of this.previousGroupIds) {
      const element = getElement(this.state, id);
      if (!element) continue;
      if (previousGroupId == null) {
        if (!Object.prototype.hasOwnProperty.call(element, 'groupId')) {
          continue;
        }
        delete element.groupId;
      } else {
        if (element.groupId === previousGroupId) {
          continue;
        }
        element.groupId = previousGroupId;
      }
      changed = true;
    }

    if (changed) {
      notifyState(this.state);
    }
    return changed;
  }
}

export class UngroupCommand extends Command {
  constructor(state, ids) {
    super();
    assertState(state);
    this.state = state;
    this.ids = uniqueIds(ids);
    this.previousGroupIds = new Map();
    this.hasCapturedPreviousGroups = false;
  }

  execute() {
    assertActiveState(this.state);
    let changed = false;
    if (!this.hasCapturedPreviousGroups) {
      for (const id of this.ids) {
        const element = getElement(this.state, id);
        if (element?.groupId) {
          this.previousGroupIds.set(id, element.groupId);
        }
      }
      this.hasCapturedPreviousGroups = true;
    }

    for (const id of this.previousGroupIds.keys()) {
      const element = getElement(this.state, id);
      if (!element || !element.groupId) {
        continue;
      }
      delete element.groupId;
      changed = true;
    }

    if (changed) {
      notifyState(this.state);
    }
    return changed;
  }

  undo() {
    assertActiveState(this.state);
    let changed = false;
    for (const [id, groupId] of this.previousGroupIds) {
      const element = getElement(this.state, id);
      if (!element || element.groupId === groupId) {
        continue;
      }
      element.groupId = groupId;
      changed = true;
    }

    if (changed) {
      notifyState(this.state);
    }
    return changed;
  }
}

export class CommandManager {
  constructor({ historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
    if ( typeof historyLimit !== 'number' || !Number.isFinite(historyLimit) || historyLimit < 1 ) {
      throw new TypeError( '[CommandManager] historyLimit must be a positive number.' );
    }
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.historyLimit = Math.max( 1, Math.floor(historyLimit) );
    this.destroyed = false;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError( '[CommandManager] subscribe expects a function.' );
    }
    this.assertActive();
    this.listeners.add(listener);

    try {
      listener(this.canUndo(), this.canRedo());
    } catch (error) {
      console.error( '[CommandManager] Subscriber failed:', error );
    }

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  notify() {
    if (this.destroyed) return;
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try {
        listener(canUndo, canRedo);
      } catch (error) {
        console.error( '[CommandManager] Subscriber failed:', error );
      }
    }
  }

  execute(command) {
    this.assertActive();
    if ( !command || typeof command.execute !== 'function' || typeof command.undo !== 'function' ) {
      throw new TypeError( '[CommandManager] execute expects a reversible command.' );
    }

    const result = command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.historyLimit) {
      this.undoStack.shift();
    }

    this.redoStack.length = 0;
    this.notify();
    return result;
  }

  undo() {
    this.assertActive();
    const command = this.undoStack[this.undoStack.length - 1];
    if (!command) {
      return false;
    }
    command.undo();
    this.undoStack.pop();
    this.redoStack.push(command);
    this.notify();
    return true;
  }

  redo() {
    this.assertActive();
    const command = this.redoStack[this.redoStack.length - 1];
    if (!command) {
      return false;
    }

    command.execute();
    this.redoStack.pop();
    this.undoStack.push(command);
    if (this.undoStack.length > this.historyLimit) {
      this.undoStack.shift();
    }

    this.notify();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  getUndoCount() {
    return this.undoStack.length;
  }

  getRedoCount() {
    return this.redoStack.length;
  }

  clear() {
    this.assertActive();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.notify();
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error( '[CommandManager] This manager has been destroyed.' );
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.listeners.clear();
    this.destroyed = true;
  }
}