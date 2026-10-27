import { Editor } from './src/core/Editor.js';

const welcomeScreen = document.getElementById('welcome-screen');
const editorApp = document.getElementById('editor-app');
const statusInfo = document.getElementById('status-info');
const startButtons = [
  document.getElementById('start-designing-btn'),
  document.getElementById('nav-start-btn'),
  document.getElementById('workflow-start-btn'),
];

const homeButton = document.getElementById('editor-home-btn');
const inspectorToggle = document.getElementById('inspector-toggle-btn');
const rightPanel = document.getElementById('right-panel');
const workspace = document.getElementById('workspace');

let editor = null;
let editorInitializing = false;
function setStatus(message) {
  if (statusInfo) {
    statusInfo.textContent = message;
  }
}


const themeButtons = [...document.querySelectorAll('[data-theme-toggle]')];
const themeMeta = document.getElementById('theme-color-meta');
const THEME_STORAGE_KEY = 'figma-lite-theme';

function applyTheme(theme, persist = true) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  if (themeMeta) themeMeta.setAttribute('content', nextTheme === 'light' ? '#f7f7fb' : '#101014');
  themeButtons.forEach((button) => {
    const nextLabel = nextTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    button.setAttribute('aria-label', nextLabel);
    button.setAttribute('title', nextLabel);
    button.setAttribute('aria-pressed', String(nextTheme === 'light'));
  });
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); }
    catch (_) { setStatus('Theme changed for this session; browser storage is unavailable.'); }
  }
}

applyTheme(document.documentElement.dataset.theme || 'dark', false);
themeButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
});

function openEditor() {
  if (!welcomeScreen || !editorApp) {
    console.error( '[Figma-Lite] Missing #welcome-screen or #editor-app.' );
    setStatus( 'Unable to open the editor. Required HTML elements are missing.' );
    return;
  }

  if (editorInitializing) {
    return;
  }

  welcomeScreen.hidden = true;
  editorApp.hidden = false;
  requestAnimationFrame(() => {
    if (editor) {
      window.dispatchEvent(new Event('resize'));
      return;
    }

    editorInitializing = true;
    setStatus('Initializing editor...');
    try {
      editor = new Editor();
      window.dispatchEvent(new Event('resize'));
      setStatus('Editor ready');
      console.info( '[Figma-Lite] Editor initialized successfully.' );
    } catch (error) {
      editor = null;
      console.error( '[Figma-Lite] Editor initialization failed:', error );
      setStatus( 'Editor initialization failed. Check the browser console.' );
    } finally {
      editorInitializing = false;
    }
  });
}

function openWelcomeScreen(event) {
  event?.preventDefault();
  if (!welcomeScreen || !editorApp) {
    return;
  }
  editorApp.hidden = true;
  welcomeScreen.hidden = false;
}

startButtons.forEach((button) => {
  button?.addEventListener('click', openEditor);
});

homeButton?.addEventListener( 'click', openWelcomeScreen );
function setInspectorOpen(isOpen) {
  if (!rightPanel || !inspectorToggle) return;
  rightPanel.classList.toggle('is-open', isOpen);
  rightPanel.setAttribute('aria-hidden', String(!isOpen));
  inspectorToggle.setAttribute('aria-expanded', String(isOpen));
  inspectorToggle.setAttribute( 'aria-label', isOpen ? 'Hide properties and layers' : 'Show properties and layers' );
  inspectorToggle.title = isOpen ? 'Hide properties and layers' : 'Show properties and layers';
}

inspectorToggle?.addEventListener('click', () => {
  const isOpen = rightPanel?.classList.contains('is-open') ?? false;
  setInspectorOpen(!isOpen);
});

workspace?.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(max-width: 800px)').matches &&
      rightPanel?.classList.contains('is-open') &&
      event.target instanceof Element &&
      !rightPanel.contains(event.target) &&
      !inspectorToggle?.contains(event.target)) {
    setInspectorOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && rightPanel?.classList.contains('is-open')) {
    setInspectorOpen(false);
  }
});

Object.defineProperty(window, 'editor', {
  configurable: true,
  enumerable: false,
  get() {
    return editor;
  },
});

console.info('[Figma-Lite] Application loaded.');