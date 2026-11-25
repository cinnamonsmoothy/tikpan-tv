/* Home uses a mobile still; the About globe loads as it approaches the viewport. */
(() => {
  const mobile = matchMedia('(max-width:700px)');
  const stage = document.getElementById('globe-stage');
  const coverage = stage?.dataset.globeMode === 'coverage';
  let loading = false;
  let nearby = !coverage;
  function loadDesktop() {
    if ((!coverage && mobile.matches) || !nearby || loading) return;
    loading = true;
    stage.classList.add('is-loading');
    const maps = document.createElement('script');
    maps.src = 'assets/globe/globe-data.js?v=africa-only-1';
    maps.onload = () => {
      const renderer = document.createElement('script');
      renderer.src = 'globe-software.js?v=performance-1';
      document.head.append(renderer);
    };
    document.head.append(maps);
  }
  function update() {
    if (!stage) return;
    if (coverage) { loadDesktop(); return; }
    stage.tabIndex = mobile.matches ? -1 : 0;
    stage.setAttribute('aria-label', mobile.matches ? 'Earth with Africa highlighted in gold.' : 'Interactive Earth globe. Use a pointer or arrow keys to rotate it; scroll to zoom into Africa.');
    loadDesktop();
  }
  if (coverage && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      nearby = true;
      observer.disconnect();
      loadDesktop();
    }, { rootMargin: '300px' });
    observer.observe(stage);
  } else {
    nearby = true;
  }
  mobile.addEventListener('change', update);
  update();
})();
