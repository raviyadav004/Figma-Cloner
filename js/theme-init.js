(() => {
  let theme = 'dark';

  try {
    const saved = localStorage.getItem('figma-lite-theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    }
  } catch (_) {

  }

  document.documentElement.dataset.theme = theme;
})();