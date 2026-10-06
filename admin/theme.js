// Applies the saved theme before first paint (shared with the public site via localStorage).
(() => {
  let theme;
  try { theme = localStorage.getItem('theme'); } catch { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
})();
