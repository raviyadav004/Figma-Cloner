export class KeyboardManager {
  constructor(editor) {
    if (!editor) {
      throw new TypeError( 'KeyboardManager requires an editor instance.' );
    }
    this.editor = editor;
    this.enabled = true;
    this.spacePressed = false;
    this.destroyed = false;
    this._handleKeyDown = this._onKeyDown.bind(this);
    this._handleKeyUp = this._onKeyUp.bind(this);
    this._handleWindowBlur = this._onWindowBlur.bind(this);
    this._init();
  }

  _init() {
    if (typeof document === 'undefined') {
      return;
    }

    document.addEventListener( 'keydown', this._handleKeyDown );
    document.addEventListener( 'keyup', this._handleKeyUp );
    if (typeof window !== 'undefined') {
      window.addEventListener( 'blur', this._handleWindowBlur );
    }
  }

  isInputFocused() {
    if (typeof document === 'undefined') {
      return false;
    }

    const element = document.activeElement;
    if (!element) {
      return false;
    }
    const tagName = element.tagName?.toLowerCase();
    if ( tagName === 'input' || tagName === 'textarea' || tagName === 'select' || element.isContentEditable === true ) {
      return true;
    }
    return Boolean( element.closest?.('[contenteditable="true"]') );
  }

  _onKeyDown(event) {
    if (this.destroyed) {
      return;
    }

    if ( event.key === ' ' && !this.isInputFocused() ) {
      if (this.enabled && !this.spacePressed) {
        this.spacePressed = true;
        this.editor.spaceDown = true;
        this.editor.updateCursor?.();
      }

      if (this.enabled) {
        event.preventDefault();
      }
      return;
    }

    if ( !this.enabled || event.defaultPrevented || event.isComposing ) {
      return;
    }

    if (this.isInputFocused()) {
      return;
    }

    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    if (ctrl) {
      if ( this._handleModifierShortcut( key, shift, event ) ) {
        event.preventDefault();
      }
      return;
    }

    if (event.altKey) {
      return;
    }

    if (this._handleToolShortcut(key, event)) {
      event.preventDefault();
      return;
    }

    if ( this._handleArrowShortcut( key, shift, event ) ) {
      event.preventDefault();
      return;
    }

    if (shift && key === '1') {
      this.editor.fitToScreen();
      event.preventDefault();
    }
  }

  _handleToolShortcut(key, event) {
    if (event.shiftKey) {
      return false;
    }

    const tools = {
      v: 'select',
      r: 'rectangle',
      o: 'ellipse',
      t: 'text',
      l: 'line',
      p: 'freeform',
      f: 'frame',
    };

    if ( Object.prototype.hasOwnProperty.call( tools, key ) ) {
      this.editor.setTool(tools[key]);
      return true;
    }

    switch (key) {
      case 'delete':
      case 'backspace':
        this.editor.deleteSelected();
        return true;

      case 'escape':
        this.editor.transform?.cancel();
        this.editor.selection?.clear();
        return true;

      case 'enter':
        this.editor.editSelectedText();
        return true;

      default:
        return false;
    }
  }

  _handleArrowShortcut(key, shift, event) {
    if ( event.ctrlKey || event.metaKey || event.altKey ) {
      return false;
    }
    const distance = shift ? 10 : 1;
    const movements = {
      arrowleft: [-distance, 0],
      arrowright: [distance, 0],
      arrowup: [0, -distance],
      arrowdown: [0, distance],
    };

    const movement = movements[key];
    if (!movement) {
      return false;
    }
    this.editor.nudgeSelected( movement[0], movement[1] );
    return true;
  }

  _handleModifierShortcut(key, shift, event) {
    const editor = this.editor;
    switch (key) {
      case 'z':
        if (shift) {
          editor.commands.redo();
        } else {
          editor.commands.undo();
        }
        return true;

      case 'y':
        editor.commands.redo();
        return true;

      case 'c':
        editor.copySelected();
        return true;

      case 'v':
        editor.pasteClipboard();
        return true;

      case 'x':
        editor.cutSelected();
        return true;

      case 'd':
        editor.duplicateSelected();
        return true;

      case 'g':
        if (shift) {
          editor.ungroupSelected();
        } else {
          editor.groupSelected();
        }
        return true;

      case 'a':
        editor.selectAll();
        return true;

      case 's':
        editor.saveProject();
        return true;

      case '0':
        editor.resetZoom();
        return true;

      case '=':
      case '+':
        editor.zoomIn();
        return true;

      case '-':
      case '_':
        editor.zoomOut();
        return true;

      default:
        return false;
    }
  }

  _onKeyUp(event) {
    if ( this.destroyed || event.key !== ' ' ) {
      return;
    }
    this._releaseSpace();
  }

  _onWindowBlur() {
    this._releaseSpace();
  }

  _releaseSpace() {
    if ( !this.spacePressed && !this.editor.spaceDown ) {
      return;
    }
    this.spacePressed = false;
    this.editor.spaceDown = false;
    this.editor.updateCursor?.();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this._releaseSpace();
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this._releaseSpace();
    if (typeof document !== 'undefined') {
      document.removeEventListener( 'keydown', this._handleKeyDown );
      document.removeEventListener( 'keyup', this._handleKeyUp );
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener( 'blur', this._handleWindowBlur );
    }
  }
}