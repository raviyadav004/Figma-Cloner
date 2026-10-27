import { hitTest, getSelectionBounds, } from '../utils/geometry.js';

export class SelectionManager {
  constructor(state) {
    if (
      !state ||
      typeof state.subscribe !== 'function' ||
      typeof state.getElementById !== 'function' ||
      typeof state.getElements !== 'function'
    ) {
      throw new TypeError( 'SelectionManager requires a valid State instance.' );
    }

    this.state = state;
    this.selectedIds = [];
    this.listeners = new Set();
    this.destroyed = false;
    this.unsubscribeState = this.state.subscribe(() => {
      this.pruneSelection();
    });
  }

  _assertActive() {
    if (this.destroyed) {
      throw new Error( 'SelectionManager has been destroyed.' );
    }
  }

  _isValidId(id) {
    return ( typeof id === 'string' && id.trim().length > 0 && Boolean(this.state.getElementById(id)) );
  }

  _sameIds(first, second) {
    return (
      first.length === second.length &&
      first.every((id, index) => id === second[index])
    );
  }

  subscribe(listener) {
    this._assertActive();
    if (typeof listener !== 'function') {
      throw new TypeError( 'SelectionManager.subscribe expects a function.' );
    }
    this.listeners.add(listener);

    try {
      listener( this.getSelectedIds(), this.getSelectedElements() );
    } catch (error) {
      console.error( 'SelectionManager listener failed:', error );
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
    const ids = this.getSelectedIds();
    const elements = this.getSelectedElements();
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try {
        listener([...ids], [...elements]);
      } catch (error) {
        console.error( 'SelectionManager listener failed:', error );
      }
    }
  }

  pruneSelection() {
    if ( this.destroyed || this.selectedIds.length === 0 ) {
      return;
    }

    const validIds = this.selectedIds.filter((id) => this._isValidId(id) );
    if (!this._sameIds(validIds, this.selectedIds)) {
      this.selectedIds = validIds;
      this.notify();
    }
  }

  getSelectedElements() {
    if (this.destroyed) return [];
    return this.selectedIds.map((id) => this.state.getElementById(id)).filter(Boolean);
  }

  getSelectedIds() {
    return [...this.selectedIds];
  }

  select(id) {
    if (this.destroyed) return;
    if (!this._isValidId(id)) {
      this.clear();
      return;
    }

    if ( this.selectedIds.length === 1 && this.selectedIds[0] === id ) {
      return;
    }
    this.selectedIds = [id];
    this.notify();
  }

  selectMany(ids = []) {
    if (this.destroyed) return;
    if (!Array.isArray(ids)) {
      this.clear();
      return;
    }

    const nextIds = [ ...new Set( ids.filter((id) => this._isValidId(id)) ), ];
    if (this._sameIds(nextIds, this.selectedIds)) {
      return;
    }
    this.selectedIds = nextIds;
    this.notify();
  }

  toggle(id) {
    if ( this.destroyed || !this._isValidId(id) ) {
      return;
    }

    if (this.isSelected(id)) {
      this.remove(id);
    } else {
      this.selectedIds = [...this.selectedIds, id];
      this.notify();
    }
  }

  add(id) {
    if ( this.destroyed || !this._isValidId(id) || this.isSelected(id) ) {
      return;
    }
    this.selectedIds = [...this.selectedIds, id];
    this.notify();
  }

  remove(id) {
    if ( this.destroyed || !this.isSelected(id) ) {
      return;
    }
    this.selectedIds = this.selectedIds.filter( (selectedId) => selectedId !== id );
    this.notify();
  }

  clear() {
    if ( this.destroyed || this.selectedIds.length === 0 ) {
      return;
    }
    this.selectedIds = [];
    this.notify();
  }

  isSelected(id) {
    return ( !this.destroyed && this.selectedIds.includes(id) );
  }

  hasSelection() {
    return ( !this.destroyed && this.selectedIds.length > 0 );
  }

  get count() {
    return this.destroyed ? 0 : this.selectedIds.length;
  }

  hitTest(x, y) {
    if ( this.destroyed || !Number.isFinite(x) || !Number.isFinite(y) ) {
      return null;
    }

    const elements = this.state.getElements();
    for ( let index = elements.length - 1; index >= 0; index -= 1 ) {
      const element = elements[index];
      if ( !element || element.visible === false || element.locked === true ) {
        continue;
      }

      if (hitTest(x, y, element)) {
        return element;
      }
    }
    return null;
  }

  getBounds() {
    const elements = this.getSelectedElements();
    if (elements.length === 0) {
      return null;
    }
    return getSelectionBounds(elements);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.listeners.clear();
    this.selectedIds = [];
  }
}