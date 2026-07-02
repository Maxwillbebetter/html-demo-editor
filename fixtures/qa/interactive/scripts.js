document.getElementById('toggleTheme')?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

document.body.dataset.qaScriptLoaded = 'true';
