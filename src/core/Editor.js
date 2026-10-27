import { State } from './State.js';
import { CommandManager, CreateElementCommand, DeleteElementsCommand, UpdatePropertyCommand, GroupCommand, UngroupCommand, MoveElementsCommand, } from './CommandManager.js';
import { Renderer } from '../renderer/Renderer.js';
import { SelectionManager } from '../managers/SelectionManager.js';
import { TransformManager } from '../managers/TransformManager.js';
import { LayerManager } from '../managers/LayerManager.js';
import { KeyboardManager } from '../managers/KeyboardManager.js';
import { ExportManager } from '../managers/ExportManager.js';
import { ShapeTool, TextTool, FrameTool, FreeformTool } from '../tools/tools.js';
import { round } from '../utils/geometry.js';
import { clone, uid, debounce } from '../utils/helpers.js';

const STORAGE_KEY = 'figma-lite-project';
const AUTOSAVE_KEY = 'figma-lite-autosave';
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
export class Editor {
  constructor() {
    this.svg = document.getElementById('canvas');
    this.viewport = document.getElementById('viewport');
    this.textInput = document.getElementById('text-edit-input');
    if (!this.svg || !this.viewport) {
      throw new Error( 'Editor could not start: #canvas or #viewport is missing.' );
    }

    if (!this.textInput) {
      throw new Error( 'Editor could not start: #text-edit-input is missing.' );
    }

    const requiredLayers = [
      '#canvas-defs',
      '#grid-layer',
      '#content-layer',
      '#guides-layer',
      '#overlay-layer',
    ];

    for (const selector of requiredLayers) {
      if (!this.svg.querySelector(selector)) {
        throw new Error( `Editor could not start: required SVG layer ${selector} is missing.` );
      }
    }

    this.state = new State();
    this.renderer = new Renderer(this.state, this.svg);
    this.selection = new SelectionManager(this.state);
    this.commands = new CommandManager();
    this.transform = new TransformManager(this);
    this.layers = new LayerManager( this.state, this.selection, this.commands );
    this.keyboard = new KeyboardManager(this);
    this.exporter = new ExportManager(this);

    this.currentTool = 'select';
    this.activeTool = null;
    this.spaceDown = false;
    this.isPanning = false;
    this.panStart = null;

    this.isMarquee = false;
    this.marqueeStart = null;
    this.clipboard = [];
    this._editingTextId = null;
    this._activePointerId = null;

    this._propsSignature = null;
    this._layersSignature = null;
    this._statusTimer = null;
    this._resizeObserver = null;
    this._destroyed = false;

    this._handleResize = () => {
      if (this._destroyed || !this.svg.isConnected) return;
      const rect = this.svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.renderer.render();
      this._renderSelection();
      this._updateZoomDisplay();
    };

    this._initTools();
    this._initViewport();
    this._initUI();
    this._initPointer();
    this._initSubscriptions();

    this._loadAutosave();
    this._startAutosave();
    this.renderer.render();
    this._updateUI();
    this.setTool('select');
  }

  refreshLayout() {
    this._handleResize();
  }

  destroy() {
    this._destroyed = true;
    window.removeEventListener('resize', this._handleResize);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this.activeTool?.cleanup) {
      this.activeTool.cleanup();
    }

    if (this._autosave?.cancel) {
      this._autosave.cancel();
    }

    clearTimeout(this._statusTimer);
  }

  _getElement(id) {
    return document.getElementById(id);
  }

  _on(id, eventName, handler, options) {
    const element = this._getElement(id);
    if (element) {
      element.addEventListener(eventName, handler, options);
    }
    return element;
  }

  _initTools() {
    this.tools = {
      select: null,
      rectangle: new ShapeTool(this, 'rectangle'),
      ellipse: new ShapeTool(this, 'ellipse'),
      line: new ShapeTool(this, 'line'),
      freeform: new FreeformTool(this),
      text: new TextTool(this),
      frame: new FrameTool(this),
    };
  }

  _initViewport() {
    this.state.setViewport({ x: 0, y: 0, zoom: 1, });
  }

  setTool(tool) {
    if (!Object.prototype.hasOwnProperty.call(this.tools, tool)) {
      return;
    }

    if (this.activeTool?.cleanup) {
      this.activeTool.cleanup();
    }

    this.currentTool = tool;
    this.activeTool = this.tools[tool];
    document.querySelectorAll('[data-tool]').forEach((button) => {
      button.classList.toggle( 'active', button.dataset.tool === tool );
      button.setAttribute( 'aria-pressed', String(button.dataset.tool === tool) );
    });
    this.updateCursor();
    this._renderSelection();
  }

  updateCursor() {
    if (!this.viewport) return;
    this.viewport.classList.remove(
      'space-down',
      'tool-rectangle',
      'tool-ellipse',
      'tool-line',
      'tool-freeform',
      'tool-text',
      'tool-frame',
      'panning'
    );

    if (this.spaceDown) {
      this.viewport.classList.add('space-down');
    } else if (this.currentTool !== 'select') {
      this.viewport.classList.add(`tool-${this.currentTool}`);
    }
  }

  _initUI() {
    document.querySelectorAll('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        this.setTool(button.dataset.tool);
      });
    });

    this._on('undo-btn', 'click', () => this.commands.undo());
    this._on('redo-btn', 'click', () => this.commands.redo());
    this._on('zoom-in-btn', 'click', () => this.zoomIn());
    this._on('zoom-out-btn', 'click', () => this.zoomOut());
    this._on('zoom-display', 'click', () => this.resetZoom());
    this._on('fit-btn', 'click', () => this.fitToScreen());

    this._on('grid-btn', 'click', () => {
      const enabled = !this.state.data.settings.grid;
      this.state.setSetting('grid', enabled);
      this._syncToggleButton('grid-btn', enabled);
      this.renderer.render();
    });

    this._on('snap-btn', 'click', () => {
      const enabled = !this.state.data.settings.snap;
      this.state.setSetting('snap', enabled);
      this._syncToggleButton('snap-btn', enabled);
    });

    this._on('export-btn', 'click', () => this._showExportDialog());
    this._on('export-close-btn', 'click', () => this._hideExportDialog());
    this._on('export-cancel-btn', 'click', () => this._hideExportDialog());
    this._on('export-confirm-btn', 'click', () => this._doExport());
    this._on('export-format', 'change', (event) => {
      const isJpeg = event.target.value === 'jpeg';
      const qualityRow = this._getElement('quality-row');
      const scaleRow = this._getElement('scale-row');
      if (qualityRow) qualityRow.hidden = !isJpeg;
      if (scaleRow) scaleRow.hidden = false;
    });

    this._on('export-quality', 'input', (event) => {
      const display = this._getElement('quality-display');
      if (display) {
        display.textContent = `${Math.round(Number(event.target.value) * 100)}%`;
      }
    });

    this._on('save-btn', 'click', () => this.saveProject());
    this._on('load-btn', 'click', () => {
      this._getElement('load-file-input')?.click();
    });

    this._on('load-file-input', 'change', (event) => {
      this._loadFile(event);
    });

    this._on('bring-front-btn', 'click', () => {
      this.layers.bringToFront();
    });

    this._on('send-back-btn', 'click', () => {
      this.layers.sendToBack();
    });

    this._on('duplicate-layer-btn', 'click', () => {
      this.duplicateSelected();
    });

    this._on('delete-layer-btn', 'click', () => {
      this.deleteSelected();
    });

    this.textInput.addEventListener('blur', () => {
      this._finishTextEdit();
    });

    this.textInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this._finishTextEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this._cancelTextEdit();
      }
      event.stopPropagation();
    });

    window.addEventListener('resize', this._handleResize);
    if ('ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(this._handleResize);
      this._resizeObserver.observe(this.viewport);
      this._resizeObserver.observe(this.svg);
    }
  }

  _syncToggleButton(id, enabled) {
    const button = this._getElement(id);
    if (!button) return;
    button.dataset.active = String(enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }

  _initPointer() {
    this.viewport.addEventListener('pointerdown', (event) => {
      this._onPointerDown(event);
    });

    this.viewport.addEventListener('pointermove', (event) => {
      this._onPointerMove(event);
    });

    this.viewport.addEventListener('pointerup', (event) => {
      this._onPointerUp(event);
    });

    this.viewport.addEventListener('pointercancel', (event) => {
      this._onPointerCancel(event);
    });

    this.viewport.addEventListener( 'wheel', (event) => this._onWheel(event), { passive: false } );
    this.viewport.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  _initSubscriptions() {
    this.state.subscribe(() => this._onStateChange());
    this.selection.subscribe(() => {
      this._renderSelection();
    });

    this.commands.subscribe((canUndo, canRedo) => {
      const undoButton = this._getElement('undo-btn');
      const redoButton = this._getElement('redo-btn');
      if (undoButton) undoButton.disabled = !canUndo;
      if (redoButton) redoButton.disabled = !canRedo;
    });
    this.layers.subscribe(() => this._renderLayers());
  }

  _onStateChange() {
    this.renderer.render();
    this._renderSelection();
    this._renderLayers();
    this._updateEmptyState();
    this._updateZoomDisplay();
  }

  _onPointerDown(event) {
    if (event.button === 2 || event.target === this.textInput) return;
    if (this._activePointerId !== null && this._activePointerId !== event.pointerId) return;
    this._activePointerId = event.pointerId;
    try {
      this.viewport.setPointerCapture(event.pointerId);
    } catch {
    }

    const position = this.renderer.screenToCanvas( event.clientX, event.clientY );
    const { x, y } = position;
    if (this.spaceDown || event.button === 1) {
      this.isPanning = true;
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        vpX: this.state.data.viewport.x,
        vpY: this.state.data.viewport.y,
      };
      this.viewport.classList.add('panning');
      event.preventDefault();
      return;
    }

    if (this.currentTool !== 'select') {
      this.activeTool?.onPointerDown(x, y, event);
      return;
    }

    const handle = this.transform.getHandleAt( event.clientX, event.clientY );
    if (handle) {
      if (handle === 'rotate') {
        this.transform.startRotate(x, y);
      } else {
        this.transform.startResize(handle, x, y);
      }
      return;
    }

    const hit = this.selection.hitTest(x, y);
    if (hit) {
      if (event.shiftKey) {
        this.selection.toggle(hit.id);
      } else if (!this.selection.isSelected(hit.id)) {
        this.selection.select(hit.id);
      }

      if (!hit.locked) {
        this.transform.startMove(x, y);
      }
      return;
    }

    if (!event.shiftKey) {
      this.selection.clear();
    }
    this.isMarquee = true;
    this.marqueeStart = { x, y };
  }

  _onPointerMove(event) {
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    const position = this.renderer.screenToCanvas( event.clientX, event.clientY );
    const { x, y } = position;
    if (this.isPanning && this.panStart) {
      const dx = event.clientX - this.panStart.x;
      const dy = event.clientY - this.panStart.y;
      this.state.setViewport(
        {
          x: this.panStart.vpX + dx,
          y: this.panStart.vpY + dy,
        },
        { notify: false }
      );

      this.renderer.applyViewport();
      this._renderSelection();
      return;
    }

    if (this.transform.mode === 'move') {
      this.transform.updateMove( x, y, event.shiftKey, event.altKey );
      this._renderSelection();
      return;
    }

    if (this.transform.mode === 'resize') {
      this.transform.updateResize( x, y, event.shiftKey, event.altKey );
      this._renderSelection();
      return;
    }

    if (this.transform.mode === 'rotate') {
      this.transform.updateRotate(x, y, event.shiftKey);
      this._renderSelection();
      return;
    }

    if (this.isMarquee && this.marqueeStart) {
      this.renderer.renderMarquee({
        x: Math.min(this.marqueeStart.x, x),
        y: Math.min(this.marqueeStart.y, y),
        width: Math.abs(x - this.marqueeStart.x),
        height: Math.abs(y - this.marqueeStart.y),
      });
      return;
    }

    if (this.activeTool?.isDrawing) {
      this.activeTool.onPointerMove(x, y, event);
    }
  }

  _onPointerUp(event) {
    if (this._activePointerId === null || event.pointerId !== this._activePointerId) return;
    this._activePointerId = null;
    try {
      if (this.viewport.hasPointerCapture(event.pointerId)) {
        this.viewport.releasePointerCapture(event.pointerId);
      }
    } catch {
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.panStart = null;
      this.viewport.classList.remove('panning');
      this.updateCursor();
      return;
    }

    if (this.transform.mode === 'move') {
      this.transform.endMove();
      this._renderSelection();
      return;
    }

    if (this.transform.mode === 'resize') {
      this.transform.endResize();
      this._renderSelection();
      return;
    }

    if (this.transform.mode === 'rotate') {
      this.transform.endRotate();
      this._renderSelection();
      return;
    }

    if (this.isMarquee && this.marqueeStart) {
      const position = this.renderer.screenToCanvas( event.clientX, event.clientY );
      const rect = {
        x: Math.min(this.marqueeStart.x, position.x),
        y: Math.min(this.marqueeStart.y, position.y),
        width: Math.abs(position.x - this.marqueeStart.x),
        height: Math.abs(position.y - this.marqueeStart.y),
      };

      this.renderer.clearGuides();
      this.isMarquee = false;
      this.marqueeStart = null;
      if (rect.width > 2 && rect.height > 2) {
        const hits = this.state.getElements().filter((element) => {
          if (element.visible === false || element.locked) {
            return false;
          }

          const bounds = {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          };

          return !(
            bounds.x + bounds.width < rect.x ||
            rect.x + rect.width < bounds.x ||
            bounds.y + bounds.height < rect.y ||
            rect.y + rect.height < bounds.y
          );
        });
        this.selection.selectMany(hits.map((element) => element.id));
      }
      return;
    }

    if (this.activeTool?.isDrawing) {
      const position = this.renderer.screenToCanvas( event.clientX, event.clientY );
      this.activeTool.onPointerUp( position.x, position.y, event );
    }
  }

  _onPointerCancel(event) {
    if (this._activePointerId === null || event.pointerId !== this._activePointerId) return;
    this._activePointerId = null;

    try {
      if (this.viewport.hasPointerCapture(event.pointerId)) {
        this.viewport.releasePointerCapture(event.pointerId);
      }
    } catch {
    }

    this.isPanning = false;
    this.panStart = null;
    this.viewport.classList.remove('panning');
    this.transform.cancel();
    if (this.activeTool?.isDrawing || this.activeTool?.tempElement) {
      this.activeTool.cleanup();
    }
    this.isMarquee = false;
    this.marqueeStart = null;
    this.renderer.clearGuides();
    this.renderer.render();
    this._renderSelection();
    this.updateCursor();
  }

  _onWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const delta = -event.deltaY * 0.01;
      this._zoomAt( event.clientX, event.clientY, delta );
      return;
    }

    this.state.setViewport(
      {
        x: this.state.data.viewport.x - event.deltaX,
        y: this.state.data.viewport.y - event.deltaY,
      },
      { notify: false }
    );
    this.renderer.applyViewport();
    this._renderSelection();
  }

  _zoomAt(screenX, screenY, delta) {
    const viewport = this.state.data.viewport;
    const rect = this.svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const oldZoom = viewport.zoom;
    let newZoom = oldZoom * (1 + delta);
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (!Number.isFinite(newZoom) || oldZoom <= 0) return;
    const dx = screenX - rect.left - centerX - viewport.x;
    const dy = screenY - rect.top - centerY - viewport.y;
    const scale = newZoom / oldZoom;
    this.state.setViewport(
      {
        x: viewport.x - dx * (scale - 1),
        y: viewport.y - dy * (scale - 1),
        zoom: newZoom,
      },
      { notify: false }
    );
    this.renderer.applyViewport();
    this.renderer.renderGrid();
    this._renderSelection();
    this._updateZoomDisplay();
  }

  _zoomAtCenter(delta) {
    const rect = this.svg.getBoundingClientRect();
    this._zoomAt( rect.left + rect.width / 2, rect.top + rect.height / 2, delta );
  }

  zoomIn() {
    this._zoomAtCenter(0.2);
  }

  zoomOut() {
    this._zoomAtCenter(-0.15);
  }

  resetZoom() {
    this.state.setViewport(
      {
        x: 0,
        y: 0,
        zoom: 1,
      },
      { notify: false }
    );

    this.renderer.render();
    this._renderSelection();
    this._updateZoomDisplay();
  }

  fitToScreen() {
    const { width, height } = this.state.data;
    const rect = this.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (width <= 0 || height <= 0) return;
    const padding = 80;
    const scaleX = (rect.width - padding * 2) / width;
    const scaleY = (rect.height - padding * 2) / height;
    const zoom = Math.max( MIN_ZOOM, Math.min(scaleX, scaleY, 1) );
    this.state.setViewport(
      {
        x: 0,
        y: 0,
        zoom,
      },
      { notify: false }
    );
    this.renderer.render();
    this._renderSelection();
    this._updateZoomDisplay();
  }

  _updateZoomDisplay() {
    const display = this._getElement('zoom-display');
    if (!display) return;
    const zoom = this.state.data.viewport.zoom;
    display.textContent = `${Math.round(zoom * 100)}%`;
  }

  deleteSelected() {
    const ids = [...this.selection.selectedIds];
    if (!ids.length) return;
    this.commands.execute( new DeleteElementsCommand(this.state, ids) );
    this.selection.clear();
  }

  duplicateSelected() {
    if (!this.selection.selectedIds.length) return;
    this.layers.duplicate([...this.selection.selectedIds]);
  }

  nudgeSelected(dx, dy) {
    if (!this.selection.selectedIds.length) return;
    const moves = this.selection.selectedIds.map((id) => {
        const element = this.state.getElementById(id);
        if (!element || element.locked) return null;
        return {
          id,
          fromX: element.x,
          fromY: element.y,
          toX: element.x + dx,
          toY: element.y + dy,
        };
      }).filter(Boolean);

    if (moves.length) {
      this.commands.execute( new MoveElementsCommand(this.state, moves) );
    }
  }

  selectAll() {
    const ids = this.state.getElements().filter( (element) => element.visible !== false && !element.locked ).map((element) => element.id);
    this.selection.selectMany(ids);
  }

  copySelected() {
    const elements = this.selection.getSelectedElements();
    if (!elements.length) return;
    this.clipboard = elements.map((element) => clone(element));
    this.setStatus(`Copied ${elements.length} element(s)`);
  }

  cutSelected() {
    if (!this.selection.selectedIds.length) return;
    this.copySelected();
    this.deleteSelected();
  }

  pasteClipboard() {
    if (!this.clipboard.length) return;
    const newElements = this.clipboard.map((element) => {
      const duplicate = clone(element);
      duplicate.id = uid(element.type);
      duplicate.x = (Number(duplicate.x) || 0) + 16;
      duplicate.y = (Number(duplicate.y) || 0) + 16;
      duplicate.name = `${element.name || element.type} copy`;
      return duplicate;
    });

    for (const element of newElements) {
      this.commands.execute( new CreateElementCommand(this.state, element) );
    }

    this.selection.selectMany( newElements.map((element) => element.id) );
    this.setStatus(`Pasted ${newElements.length} element(s)`);
  }

  groupSelected() {
    if (this.selection.selectedIds.length < 2) return;
    this.commands.execute( new GroupCommand( this.state, [...this.selection.selectedIds] ) );
  }

  ungroupSelected() {
    if (!this.selection.selectedIds.length) return;
    this.commands.execute( new UngroupCommand( this.state, [...this.selection.selectedIds] ) );
  }

  editSelectedText() {
    const elements = this.selection.getSelectedElements();
    if (elements.length !== 1) return;
    if (elements[0].type !== 'text') return;
    this.editText(elements[0].id);
  }

  editText(id) {
    const element = this.state.getElementById(id);
    if (!element || element.type !== 'text') return;
    if (this._editingTextId && this._editingTextId !== id) {
      this._finishTextEdit();
    }

    const screenPosition = this.renderer.canvasToScreen( element.x, element.y );
    const zoom = this.state.data.viewport.zoom;
    const fontSize = (element.fontSize || 24) * zoom;
    this.textInput.style.position = 'absolute';
    this.textInput.style.left = `${screenPosition.x + window.scrollX}px`;
    this.textInput.style.top = `${screenPosition.y - 2 + window.scrollY}px`;

    this.textInput.style.fontSize = `${fontSize}px`;
    this.textInput.style.fontWeight = element.fontWeight || 400;
    this.textInput.style.color = element.fill && element.fill !== 'none' ? element.fill : '#000000';

    this.textInput.style.width = `${Math.max(100, (element.width || 100) * zoom)}px`;
    this.textInput.style.height = `${Math.max(fontSize * 1.4, (element.height || 0) * zoom)}px`;
    this.textInput.value = element.text || '';
    this.textInput.hidden = false;
    this._editingTextId = id;
    this.textInput.focus();
    this.textInput.select();
  }

  _finishTextEdit() {
    const id = this._editingTextId;
    if (!id) return;
    this._editingTextId = null;
    this.textInput.hidden = true;
    const element = this.state.getElementById(id);
    if (!element) return;
    const newText = this.textInput.value;
    if (newText === (element.text || '')) return;
    this.commands.execute( new UpdatePropertyCommand( this.state, id, { text: newText }, { text: element.text || '' } ) );
  }

  _cancelTextEdit() {
    this._editingTextId = null;
    this.textInput.hidden = true;
  }

  updateProperty(id, props) {
    const element = this.state.getElementById(id);
    if (!element) return;
    const oldProps = {};
    for (const key of Object.keys(props)) {
      oldProps[key] = element[key];
    }
    this.commands.execute( new UpdatePropertyCommand( this.state, id, props, oldProps ) );
  }

  saveProject() {
    try {
      localStorage.setItem( STORAGE_KEY, this.state.serialize() );
      this.setStatus('Project saved');
    } catch (error) {
      this.setStatus(`Save failed: ${error.message}`);
    }
  }

  loadProject() {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        this.setStatus('No saved project found');
        return;
      }
      const parsed = JSON.parse(serialized);
      this._validateProject(parsed);
      this.commands.clear();
      this.state.load(parsed);
      this.selection.clear();
      this.fitToScreen();
      this.setStatus('Project loaded');
    } catch (error) {
      this.setStatus(`Load failed: ${error.message}`);
    }
  }

  _validateProject(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid project file.');
    }

    if (!Array.isArray(data.elements)) {
      throw new Error('Project elements are missing or invalid.');
    }
  }

  _loadFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = this.exporter.importJSON(reader.result);
        if (imported) this.setStatus('Project imported');
      } catch (error) {
        this.setStatus(`Import failed: ${error.message}`);
      }
    };

    reader.onerror = () => {
      this.setStatus('Failed to read file');
    };

    reader.readAsText(file);
    input.value = '';
  }

  _loadAutosave() {
    try {
      const serialized = localStorage.getItem(AUTOSAVE_KEY);
      if (!serialized) return;
      const parsed = JSON.parse(serialized);
      if ( parsed && Array.isArray(parsed.elements) && parsed.elements.length > 0 ) {
        this.state.load(parsed);
      }
    } catch {
    }
  }

  _startAutosave() {
    this._autosave = debounce(() => {
      try {
        localStorage.setItem( AUTOSAVE_KEY, this.state.serialize() );
      } catch {
      }
    }, 1000);

    this.state.subscribe(() => {
      this._autosave();
    });
  }

  _showExportDialog() {
    const dialog = this._getElement('export-dialog');
    if (dialog) dialog.hidden = false;
  }

  _hideExportDialog() {
    const dialog = this._getElement('export-dialog');
    if (dialog) dialog.hidden = true;
  }

  async _doExport() {
    const format = this._getElement('export-format')?.value;
    const scale = Number.parseInt(this._getElement('export-scale')?.value || '1', 10);
    const quality = Number.parseFloat(this._getElement('export-quality')?.value || '0.9');
    const confirmButton = this._getElement('export-confirm-btn');

    if (!['svg', 'png', 'jpeg'].includes(format)) {
      this.setStatus('Please select a valid export format.');
      return;
    }
    if (!Number.isFinite(scale) || scale < 1) {
      this.setStatus('Export scale must be at least 1.');
      return;
    }
    if (format === 'jpeg' && (!Number.isFinite(quality) || quality < 0 || quality > 1)) {
      this.setStatus('Image quality must be between 0 and 1.');
      return;
    }
    if (confirmButton?.disabled) return;

    const previousLabel = confirmButton?.textContent;
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = 'Exporting…';
    }

    try {
      let succeeded = false;
      if (format === 'svg') succeeded = this.exporter.exportSVG();
      if (format === 'png') succeeded = await this.exporter.exportPNG(scale);
      if (format === 'jpeg') succeeded = await this.exporter.exportJPEG(scale, quality);

      if (succeeded) {
        this._hideExportDialog();
        this.setStatus(`Exported as ${format.toUpperCase()}`);
      }
    } catch (error) {
      this.setStatus(`Export failed: ${error.message}`);
    } finally {
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = previousLabel || 'Export';
      }
    }
  }

  _renderSelection() {
    if (!this.selection || !this.renderer) return;
    const elements = this.selection.getSelectedElements();
    this.renderer.renderSelection(elements, this.currentTool);
    this._renderProperties();
    this._updateLayerButtons();
    this._syncLayerSelection();
  }

  _syncLayerSelection() {
    const container = this._getElement('layers-list');
    if (!container) return;
    container.querySelectorAll('.layer-item').forEach((item) => {
      item.classList.toggle( 'selected', this.selection.isSelected(item.dataset.id) );
    });
  }

  _renderLayers() {
    const container = this._getElement('layers-list');
    if (!container) return;
    const elements = this.state.data.elements;
    const signature = elements.map( (element) => `${element.id}:${element.name || element.type}:` + `${element.visible === false ? 0 : 1}:` + `${element.locked ? 1 : 0}` ).join('|');
    if (signature === this._layersSignature) {
      this._syncLayerSelection();
      return;
    }

    this._layersSignature = signature;
    container.replaceChildren();
    if (!elements.length) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'panel-empty';
      emptyMessage.textContent = 'No layers';
      container.appendChild(emptyMessage);
      return;
    }

    for (let index = elements.length - 1; index >= 0; index--) {
      const element = elements[index];
      const item = document.createElement('div');
      item.className = 'layer-item';
      item.dataset.id = element.id;
      if (this.selection.isSelected(element.id)) {
        item.classList.add('selected');
      }

      if (element.visible === false) {
        item.classList.add('hidden');
      }

      if (element.locked) {
        item.classList.add('locked');
      }

      const icon = document.createElement('div');
      icon.className = 'layer-type-icon';
      icon.innerHTML = this._layerIcon(element.type);
      icon.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = element.name || element.type;

      const visibilityButton = document.createElement('button');
      visibilityButton.type = 'button';
      visibilityButton.className = 'layer-toggle';
      visibilityButton.title = element.visible === false ? 'Show layer' : 'Hide layer';
      visibilityButton.setAttribute( 'aria-label', visibilityButton.title );
      visibilityButton.textContent = element.visible === false ? '◉' : '◌';
      visibilityButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.layers.toggleVisible(element.id);
      });

      const lockButton = document.createElement('button');
      lockButton.type = 'button';
      lockButton.className = 'layer-toggle';
      lockButton.title = element.locked ? 'Unlock layer' : 'Lock layer';
      lockButton.setAttribute('aria-label', lockButton.title);
      lockButton.textContent = element.locked ? '🔒' : '🔓';
      lockButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.layers.toggleLock(element.id);
      });

      item.append(icon, name, visibilityButton, lockButton);
      item.addEventListener('click', (event) => {
        if (event.shiftKey) {
          this.selection.toggle(element.id);
        } else {
          this.selection.select(element.id);
        }
      });

      item.addEventListener('dblclick', () => {
        this._renameLayer(element, name);
      });
      container.appendChild(item);
    }
  }

  _renameLayer(element, nameElement) {
    const input = document.createElement('input');
    input.className = 'layer-name-input';
    input.value = element.name || element.type;
    input.setAttribute('aria-label', 'Layer name');
    nameElement.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;

      const newName = input.value.trim() || element.type;
      if (save && newName !== (element.name || element.type)) {
        this.layers.rename(element.id, newName);
      }
      this._layersSignature = null;
      this._renderLayers();
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
  }

  _layerIcon(type) {
    const icons = {
      rectangle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>',
      ellipse: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>',
      line: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
      freeform: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-9 5 5 8-3s5-8 10-7"/></svg>',
      text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16M4 4v3M20 4v3M12 4v16M9 20h6"/></svg>',
      frame: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 8h18"/></svg>',
      group: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h6a2 2 0 012 2v4"/></svg>',
    };
    return icons[type] || icons.rectangle;
  }

  _updateLayerButtons() {
    const hasSelection = this.selection.selectedIds.length > 0;
    [
      'bring-front-btn',
      'send-back-btn',
      'duplicate-layer-btn',
      'delete-layer-btn',
    ].forEach((id) => {
      const button = this._getElement(id);

      if (button) button.disabled = !hasSelection;
    });
  }

  _renderProperties() {
    const container = this._getElement('properties-content');
    if (!container) return;
    const elements = this.selection.getSelectedElements();
    const signature = elements.map((element) => element.id).join('|');
    if ( signature === this._propsSignature && container.childElementCount ) {
      if (elements.length === 1) {
        this._syncPropertyValues(elements[0]);
      }
      return;
    }

    this._propsSignature = signature;
    container.replaceChildren();
    if (!elements.length) {
      const message = document.createElement('p');
      message.className = 'panel-empty';
      message.textContent = 'No selection';
      container.appendChild(message);
      return;
    }

    if (elements.length > 1) {
      const message = document.createElement('p');
      message.className = 'panel-empty';
      message.textContent = `${elements.length} elements selected`;
      container.appendChild(message);
      return;
    }

    const element = elements[0];
    const createGroup = (title) => {
      const group = document.createElement('div');
      group.className = 'prop-group';
      const heading = document.createElement('div');
      heading.className = 'prop-group-title';
      heading.textContent = title;
      group.appendChild(heading);
      container.appendChild(group);
      return group;
    };

    const addInput = ( group, labelText, property, value, type = 'number', options = {} ) => {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const label = document.createElement('label');
      label.textContent = labelText;
      const field = document.createElement('div');
      field.className = 'prop-field';

      let input;
      if (options.options) {
        input = document.createElement('select');
        for (const option of options.options) {
          const optionElement = document.createElement('option');
          optionElement.value = String(option.value);
          optionElement.textContent = option.label;
          input.appendChild(optionElement);
        }
      } else {
        input = document.createElement('input');
        input.type = type;
      }

      input.dataset.prop = property;
      if (value !== undefined && value !== null) {
        input.value = input.type === 'color' ? this._normalizeColorInputValue(value) : String(value);
      }

      if (options.min !== undefined) input.min = options.min;
      if (options.max !== undefined) input.max = options.max;
      if (options.step !== undefined) input.step = options.step;
      field.appendChild(input);
      row.append(label, field);
      group.appendChild(row);
      this._bindSinglePropertyInput(input, element);
      return input;
    };

    const position = createGroup('Position');
    addInput(position, 'X', 'x', round(element.x, 1));
    addInput(position, 'Y', 'y', round(element.y, 1));
    const size = createGroup('Size');
    addInput(size, 'W', 'width', round(element.width, 1), 'number', { min: 1, step: 1, });
    addInput(size, 'H', 'height', round(element.height, 1), 'number', { min: 0, step: 1, });

    const rotation = createGroup('Rotation');
    addInput( rotation, 'R', 'rotation', round(element.rotation || 0, 1) );
    const appearance = createGroup('Appearance');
    addInput( appearance, 'Fill', 'fill', element.fill || '#000000', 'color' );
    addInput( appearance, 'Stroke', 'stroke', element.stroke || '#000000', 'color' );
    addInput( appearance, 'Stroke W', 'strokeWidth', element.strokeWidth ?? 1, 'number', { min: 0, step: 0.5 } );
    addInput( appearance, 'Opacity %', 'opacityPercent', round((element.opacity ?? 1) * 100, 0), 'number', { min: 0, max: 100, step: 1 } );

    if (element.type === 'text') {
      const typography = createGroup('Typography');
      addInput( typography, 'Text', 'text', element.text || '', 'text' );
      addInput( typography, 'Size', 'fontSize', element.fontSize ?? 24, 'number', { min: 1, step: 1 } );
      addInput( typography, 'Weight', 'fontWeight', element.fontWeight ?? 400, 'number', { min: 100, max: 900, step: 100 } );
      addInput( typography, 'Align', 'textAlign', element.textAlign || 'left', 'text', {
          options: [
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ],
        }
      );
      addInput( typography, 'Line Height', 'lineHeight', element.lineHeight ?? 1.2, 'number', { min: 0.5, step: 0.05 } );
      addInput( typography, 'Letter Spacing', 'letterSpacing', element.letterSpacing ?? 0, 'number', { step: 0.5 } );
    }
  }

  _bindSinglePropertyInput(input, element) {
    const property = input.dataset.prop;
    const update = () => {
      let value = input.value;
      if (property === 'opacityPercent') {
        value = Number.parseFloat(value);
        if (!Number.isFinite(value)) return;
        value = Math.max(0, Math.min(100, value)) / 100;
        this.updateProperty(element.id, { opacity: value });
        return;
      }

      const numericProperties = [ 'x', 'y', 'width', 'height', 'rotation', 'strokeWidth', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', ];
      if (numericProperties.includes(property)) {
        value = Number.parseFloat(value);
        if (!Number.isFinite(value)) return;
        if ( ['width', 'fontSize'].includes(property) && value < 1 ) {
          return;
        }

        if ( ['height', 'strokeWidth'].includes(property) && value < 0 ) {
          return;
        }
      }
      this.updateProperty(element.id, { [property]: value });
    };

    input.addEventListener( input.type === 'color' || input.tagName === 'SELECT' ? 'change' : 'change', update );
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        update();
        input.blur();
      }
      event.stopPropagation();
    });
  }

  _normalizeColorInputValue(value) {
    const color = String(value ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      return color;
    }

    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    return '#000000';
  }

  _syncPropertyValues(element) {
    const container = this._getElement('properties-content');
    if (!container) return;
    const activeElement = document.activeElement;
    container.querySelectorAll('[data-prop]').forEach((input) => {
      if (input === activeElement) return;
      const property = input.dataset.prop;
      let value;
      if (property === 'opacityPercent') {
        value = round((element.opacity ?? 1) * 100, 0);
      } else {
        value = element[property] ?? '';
      }

      if (input.type === 'color') {
        value = this._normalizeColorInputValue(value);
      }

      if (input.value !== String(value)) {
        input.value = value;
      }
    });
  }

  _updateEmptyState() {
    const empty = this._getElement('empty-state');
    if (!empty) return;
    empty.classList.toggle( 'hidden', this.state.data.elements.length > 0 );
  }

  _updateUI() {
    this._syncToggleButton( 'grid-btn', Boolean(this.state.data.settings.grid) );
    this._syncToggleButton( 'snap-btn', Boolean(this.state.data.settings.snap) );
    this._updateZoomDisplay();
    this._updateEmptyState();
    this._renderLayers();
    this._renderSelection();
    this._updateLayerButtons();
  }

  setStatus(message) {
    const status = this._getElement('status-info');
    if (status) {
      status.textContent = message;
    }
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      if (status) status.textContent = 'Ready';
    }, 3000);
  }
}