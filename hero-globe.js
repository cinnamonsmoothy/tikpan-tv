/* Phones use a still of the same globe: no map parsing, canvas or render loop. */
(() => {
  const mobile = matchMedia('(max-width:700px)');
  const stage = document.getElementById('globe-stage');
  let loading = false;
  function loadDesktop() {
    if (mobile.matches || loading) return;
    loading = true;
    const maps = document.createElement('script');
    maps.src = 'assets/globe/globe-data.js?v=globe-journey-10';
    maps.onload = () => {
      const renderer = document.createElement('script');
      renderer.src = 'globe-software.js?v=mobile-static-7';
      document.head.append(renderer);
    };
    document.head.append(maps);
  }
  function update() {
    if (!stage) return;
    stage.tabIndex = mobile.matches ? -1 : 0;
    stage.setAttribute('aria-label', mobile.matches ? 'Earth with Africa highlighted in gold.' : 'Interactive Earth globe. Use a pointer or arrow keys to rotate it; scroll to zoom into Africa.');
    loadDesktop();
  }
  mobile.addEventListener('change', update);
  update();
})();
