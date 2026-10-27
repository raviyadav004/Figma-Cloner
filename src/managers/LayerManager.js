import { DuplicateElementCommand, DeleteElementsCommand, MultiReorderCommand, UpdatePropertyCommand, } from '../core/CommandManager.js';

export class LayerManager {
  constructor(state, selection, commandManager) {
    if (
      !state ||
      typeof state.getElementById !== 'function' ||
      typeof state.getElements !== 'function' ||
      !selection ||
      !commandManager ||
      typeof commandManager.execute !== 'function'
    ) {
      throw new TypeError( 'LayerManager requires valid state, selection, and command manager instances.' );
    }

    this.state = state;
    this.selection = selection;
    this.commands = commandManager;
    this.listeners = new Set();
    this.destroyed = false;
    this.unsubscribeState = null;

    if (typeof this.state.subscribe === 'function') {
      this.unsubscribeState = this.state.subscribe(() => {
        this.notify();
      });
    }
  }

  _assertActive() {
    if (this.destroyed) {
      throw new Error('LayerManager has been destroyed.');
    }
  }

  subscribe(listener) {
    this._assertActive();
    if (typeof listener !== 'function') {
      throw new TypeError( 'LayerManager.subscribe expects a function.' );
    }

    this.listeners.add(listener);
    try {
      listener(this.getLayers());
    } catch (error) {
      console.error( 'LayerManager listener failed:', error );
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
    const layers = this.getLayers();
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try {
        listener([...layers]);
      } catch (error) {
        console.error( 'LayerManager listener failed:', error );
      }
    }
  }

  getLayers() {
    if (this.destroyed) return [];
    const elements = this.state.getElements();
    return Array.isArray(elements) ? [...elements] : [];
  }

  _getIds(ids) {
    if (this.destroyed) return [];
    const requestedIds = Array.isArray(ids) && ids.length > 0 ? ids : typeof this.selection.getSelectedIds === 'function' ? this.selection.getSelectedIds() : this.selection.selectedIds ?? [];
    if (!Array.isArray(requestedIds)) return [];
    return [ ...new Set( requestedIds.filter( (id) => typeof id === 'string' && id.trim().length > 0 && Boolean(this.state.getElementById(id)) ) ), ];
  }

  _updateProperty(id, property, value) {
    if (this.destroyed) return false;
    const element = this.state.getElementById(id);
    if (!element || element[property] === value) {
      return false;
    }
    const oldProps = {
      [property]: element[property],
    };
    const newProps = {
      [property]: value,
    };

    this.commands.execute( new UpdatePropertyCommand( this.state, id, newProps, oldProps ) );
    this.notify();
    return true;
  }

  rename(id, name) {
    if (this.destroyed || typeof name !== 'string') {
      return false;
    }

    const normalizedName = name.trim();
    if ( normalizedName.length === 0 || normalizedName.length > 100 ) {
      return false;
    }
    return this._updateProperty( id, 'name', normalizedName );
  }

  toggleVisible(id) {
    if (this.destroyed) return false;
    const element = this.state.getElementById(id);
    if (!element) return false;
    return this._updateProperty( id, 'visible', element.visible === false );
  }

  toggleLock(id) {
    if (this.destroyed) return false;
    const element = this.state.getElementById(id);
    if (!element) return false;
    return this._updateProperty( id, 'locked', element.locked !== true );
  }

  duplicate(ids) {
    if (this.destroyed) return [];
    const list = this._getIds(ids);
    if (list.length === 0) return [];
    const command = new DuplicateElementCommand( this.state, list );
    this.commands.execute(command);
    const newIds = (command.duplicates ?? []).map((duplicate) => duplicate?.id).filter( (id) => typeof id === 'string' && Boolean(this.state.getElementById(id)) );
    if (newIds.length > 0) {
      this.selection.selectMany(newIds);
    }

    this.notify();
    return newIds;
  }

  delete(ids) {
    if (this.destroyed) return false;
    const list = this._getIds(ids);
    if (list.length === 0) return false;
    this.commands.execute( new DeleteElementsCommand(this.state, list) );
    const remainingIds = this.selection.getSelectedIds().filter((id) => !list.includes(id));
    this.selection.selectMany(remainingIds);
    this.notify();
    return true;
  }

  _reorder(ids, direction) {
    if (this.destroyed) return false;
    const validDirections = new Set([ 'front', 'back', 'forward', 'backward', ]);
    if (!validDirections.has(direction)) {
      throw new TypeError( `Unsupported layer direction: ${direction}` );
    }

    const list = this._getIds(ids);
    if (list.length === 0) return false;
    this.commands.execute( new MultiReorderCommand( this.state, list, direction ) );
    this.notify();
    return true;
  }

  bringToFront(ids) {
    return this._reorder(ids, 'front');
  }

  sendToBack(ids) {
    return this._reorder(ids, 'back');
  }

  bringForward(ids) {
    return this._reorder(ids, 'forward');
  }

  sendBackward(ids) {
    return this._reorder(ids, 'backward');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.listeners.clear();
  }
}