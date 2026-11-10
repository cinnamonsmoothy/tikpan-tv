const CHANNEL = 'https://www.youtube.com/@TikpanTV';
const videos = [...window.TIKPAN_VIDEO_CATALOG];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.7v16.6c0 .9 1 1.4 1.8.9L21 12.9a1 1 0 0 0 0-1.8L7.8 2.8c-.8-.5-1.8 0-1.8.9Z"/></svg>';
const escapeHTML = str => str.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function card(video, className = '') {
  const article = document.createElement('article');
  article.className = `feature-card ${className}`;
  article.innerHTML = `<button class="video-trigger" type="button" aria-label="Play ${escapeHTML(video.title)}"><div class="video-image"><img src="${escapeHTML(video.thumbnail)}" alt="" loading="lazy" decoding="async"><span class="video-play">${playIcon}</span><span class="video-duration">${escapeHTML(video.duration)}</span></div></button><div class="video-info"><div class="video-meta">Tikpan TV</div><h3>${escapeHTML(video.title)}</h3></div>`;
  article.querySelector('button').addEventListener('click', () => openVideo(video));
  return article;
}

const featured = document.getElementById('featured-grid');
if (featured) videos.slice(0, 3).forEach((video, index) => featured.append(card(video, index === 0 ? 'primary' : '')));
const popular = document.getElementById('popular-grid');
if (popular) {
  [...videos].sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
    .slice(0, 3).forEach((video, index) => popular.append(card(video, index === 0 ? 'primary' : '')));
}
const featuredMore = document.getElementById('featured-more-grid');
const featuredLoadButton = document.getElementById('featured-load-button');
const featuredBatchSize = 6;
let featuredShown = Math.min(3, videos.length);
function updateLoadButton() {
  if (featuredLoadButton) featuredLoadButton.hidden = featuredShown >= videos.length;
}

const scrollCopyObserver = !reducedMotion.matches && 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-in-view', entry.isIntersecting);
      });
    }, { threshold: 0, rootMargin: '-10% 0px -10% 0px' })
  : null;
const scrollCopySelectors = [
  '.featured-heading', '.feature-card .video-info', '.featured-load',
  '.about-section .about-content', '.about-section .image-caption',
  '.radio-copy', '.radio-art', '.closing-inner > *',
  '.about-intro-copy', '.about-intro-description', '.about-story-copy',
  '.coverage-globe-copy', '.about-radio-inner > div:first-child', '.about-radio .about-prose > p',
  '.popular-section .section-heading > *', '.site-footer .footer-top > *'
].join(',');
if (scrollCopyObserver) document.querySelectorAll(scrollCopySelectors).forEach(element => element.classList.add('scroll-copy-reveal'));
function watchScrollCopy(root = document) {
  if (!scrollCopyObserver) return;
  root.querySelectorAll?.('.scroll-copy-reveal:not([data-scroll-copy-bound])').forEach(element => {
    element.dataset.scrollCopyBound = 'true';
    element.classList.add('scroll-copy-reveal');
    scrollCopyObserver.observe(element);
  });
}
watchScrollCopy();
featuredLoadButton?.addEventListener('click', () => {
  const next = videos.slice(featuredShown, featuredShown + featuredBatchSize);
  const fragment = document.createDocumentFragment();
  next.forEach((video, index) => {
    const item = card(video, 'catalog-card');
    item.style.setProperty('--reveal-order', index);
    item.querySelector('.video-info')?.classList.add('scroll-copy-reveal');
    fragment.append(item);
  });
  featuredMore.append(fragment);
  watchScrollCopy(featuredMore);
  featuredShown += next.length;
  updateLoadButton();
});
updateLoadButton();

const dialog = document.getElementById('video-dialog');
const player = document.getElementById('player-wrap');
const closeButton = document.getElementById('dialog-close');
function openVideo(video) {
  document.getElementById('dialog-title').textContent = video.title;
  document.getElementById('dialog-youtube').href = `https://www.youtube.com/watch?v=${video.id}`;
  player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0" referrerpolicy="strict-origin-when-cross-origin" title="${escapeHTML(video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  dialog.showModal();
  document.body.classList.add('dialog-open');
  closeButton.focus();
}
function closeVideo() { dialog.close(); }
closeButton.addEventListener('click', closeVideo);
dialog.addEventListener('close', () => {
  player.innerHTML = '';
  document.body.classList.remove('dialog-open');
});
dialog.addEventListener('click', event => { if (event.target === dialog) closeVideo(); });

const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.getElementById('mobile-nav');
const mobileHeader = menuToggle.closest('.site-header');
const menuBackground = [...document.querySelectorAll('main, .site-footer, .skip-link')];
let menuCloseTimer = 0, menuOpenFrame = 0;
function setMobileMenu(open, restoreFocus = true) {
  clearTimeout(menuCloseTimer);
  cancelAnimationFrame(menuOpenFrame);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) {
    mobileNav.hidden = false;
    mobileHeader.classList.add('has-mobile-menu');
    document.body.classList.add('menu-open');
    document.documentElement.classList.add('menu-open');
    menuBackground.forEach(element => { element.inert = true; });
    menuOpenFrame = requestAnimationFrame(() => {
      menuOpenFrame = requestAnimationFrame(() => mobileNav.classList.add('is-open'));
    });
    menuToggle.focus({preventScroll:true});
  } else {
    mobileNav.classList.remove('is-open');
    menuBackground.forEach(element => { element.inert = false; });
    if (restoreFocus) menuToggle.focus({preventScroll:true});
    menuCloseTimer = setTimeout(() => {
      mobileNav.hidden = true;
      mobileHeader.classList.remove('has-mobile-menu');
      document.body.classList.remove('menu-open');
      document.documentElement.classList.remove('menu-open');
    }, reducedMotion.matches ? 0 : 500);
  }
}
menuToggle.addEventListener('click', () => setMobileMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMobileMenu(false, false)));
mobileHeader.querySelector('.brand').addEventListener('click', () => {
  if (menuToggle.getAttribute('aria-expanded') === 'true') setMobileMenu(false, false);
});
document.addEventListener('keydown', event => {
  if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
  if (event.key === 'Escape') { event.preventDefault(); setMobileMenu(false); }
  if (event.key !== 'Tab') return;
  const controls = [...mobileHeader.querySelectorAll('a,button')].filter(element => element.getClientRects().length);
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
window.matchMedia('(min-width:701px)').addEventListener('change', event => {
  if (event.matches && !mobileNav.hidden) setMobileMenu(false, false);
});
const header = document.getElementById('site-header');
const heroJourney = document.getElementById('hero');
const heroScene = heroJourney?.querySelector('.hero-globe');
const smooth = (start, end, value) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};
let heroScrollFrame = 0;
function updateHeroScroll() {
  heroScrollFrame = 0;
  header.classList.toggle('is-scrolled', window.scrollY > 60);
  if (!heroJourney || !heroScene) return;
  const bounds = heroJourney.getBoundingClientRect();
  // Reserve one hero viewport after the globe finishes for the intertitle.
  const travel = Math.max(1, heroJourney.offsetHeight - window.innerHeight - heroScene.offsetHeight);
  const progress = reducedMotion.matches ? 0 : clamp(-bounds.top / travel);
  const exit = reducedMotion.matches ? 0 : clamp((window.innerHeight - bounds.bottom) / (window.innerHeight * .68));
  window.tikpanHeroProgress = progress;
  heroScene.classList.toggle('is-journeying', progress > .015);
  const reveal = smooth(.78, .94, progress);
  const starDrift = reducedMotion.matches ? 0 : smooth(.66, .98, progress) * window.innerHeight * -.3;
  heroScene.style.setProperty('--title-star-drift', `${starDrift.toFixed(1)}px`);
  heroScene.style.setProperty('--copy-opacity', String(1 - smooth(.08, .37, progress)));
  heroScene.style.setProperty('--copy-rise', `${Math.round(smooth(.08, .37, progress) * -32)}px`);
  heroScene.style.setProperty('--scene-opacity', String(1 - smooth(.65, .84, progress)));
  heroScene.style.setProperty('--curtain-opacity', String(smooth(.67, .84, progress)));
  heroScene.style.setProperty('--title-opacity', String(reveal * (1 - smooth(0, .82, exit))));
  heroScene.style.setProperty('--title-rise', `${Math.round((1 - reveal) * 45 - exit * 70)}px`);
  heroScene.style.setProperty('--line-scale', String(reveal));
  heroScene.style.setProperty('--fallback-scale', String(1 + smooth(.31, .76, progress) * 3.4));
  header.classList.toggle('is-scrolled', window.scrollY > 60);
  header.classList.toggle('is-hidden', !reducedMotion.matches && progress > .08 && featured.getBoundingClientRect().top > 150);
}
const scheduleHeroScroll = () => {
  if (!heroScrollFrame) heroScrollFrame = requestAnimationFrame(updateHeroScroll);
};
window.addEventListener('scroll', scheduleHeroScroll, {passive: true});
window.addEventListener('resize', scheduleHeroScroll);
reducedMotion.addEventListener('change', scheduleHeroScroll);
updateHeroScroll();

const aboutStoryPhoto = document.querySelector('.about-story');
const aboutCoverage = document.querySelector('.about-coverage');
const mobileAboutQuery = window.matchMedia('(max-width:700px)');
let aboutPhotoFrame = 0;
function updateAboutPhotoTransition() {
  aboutPhotoFrame = 0;
  if (!aboutStoryPhoto) return;
  if (!mobileAboutQuery.matches || reducedMotion.matches) {
    aboutStoryPhoto.style.removeProperty('--building-reveal');
    aboutStoryPhoto.style.removeProperty('--building-brightness');
    aboutStoryPhoto.style.removeProperty('--building-scale');
    aboutCoverage?.style.removeProperty('--coverage-star-reveal');
    return;
  }
  const height = window.innerHeight;
  const storyBounds = aboutStoryPhoto.getBoundingClientRect();
  const enter = clamp((height * .96 - storyBounds.top) / (height * .78));
  const leave = clamp((storyBounds.bottom - height * .05) / (height * .5));
  const reveal = Math.min(enter * enter * (3 - 2 * enter), leave * leave * (3 - 2 * leave));
  aboutStoryPhoto.style.setProperty('--building-reveal', reveal.toFixed(3));
  aboutStoryPhoto.style.setProperty('--building-brightness', (.24 + reveal * .38).toFixed(3));
  aboutStoryPhoto.style.setProperty('--building-scale', (1.055 - reveal * .055).toFixed(3));
  if (aboutCoverage) {
    const coverageTop = aboutCoverage.getBoundingClientRect().top;
    const coverageRaw = clamp((height * .96 - coverageTop) / (height * .78));
    const coverageReveal = coverageRaw * coverageRaw * (3 - 2 * coverageRaw);
    aboutCoverage.style.setProperty('--coverage-star-reveal', coverageReveal.toFixed(3));
  }
}
function scheduleAboutPhotoTransition() {
  if (!aboutPhotoFrame) aboutPhotoFrame = requestAnimationFrame(updateAboutPhotoTransition);
}
window.addEventListener('scroll', scheduleAboutPhotoTransition, {passive: true});
window.addEventListener('resize', scheduleAboutPhotoTransition);
mobileAboutQuery.addEventListener('change', scheduleAboutPhotoTransition);
reducedMotion.addEventListener('change', scheduleAboutPhotoTransition);
scheduleAboutPhotoTransition();

// Small, fixed star field that remains visible while the 3D scene is loading.
const starFields = [...document.querySelectorAll('.hero-stars')];
let starSeed = 2166136261;
const random = () => {
  starSeed ^= starSeed << 13;
  starSeed ^= starSeed >>> 17;
  starSeed ^= starSeed << 5;
  return (starSeed >>> 0) / 4294967295;
};
starFields.forEach(starField => {
  const stars = document.createDocumentFragment();
  const count = starField.classList.contains('about-stories-stars') ? 160 : starField.classList.contains('intertitle-stars') ? 110 : 76;
  for (let index = 0; index < count; index++) {
    const star = document.createElement('i');
    star.style.setProperty('--x', `${(random() * 100).toFixed(2)}%`);
    star.style.setProperty('--y', `${(random() * 100).toFixed(2)}%`);
    star.style.setProperty('--s', `${(random() * 1.6 + .55).toFixed(2)}px`);
    star.style.setProperty('--a', (random() * .52 + .15).toFixed(2));
    star.style.setProperty('--delay', `${(random() * -7).toFixed(2)}s`);
    stars.append(star);
  }
  starField.append(stars);
});

const radioArt = document.querySelector('.radio-art');
const radioPieces = radioArt ? [...radioArt.querySelectorAll('[data-parallax]')] : [];
if (radioArt && radioPieces.length) {
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0, frame = 0;
  const drawRadioParallax = () => {
    frame = 0;
    currentX += (targetX - currentX) * .18;
    currentY += (targetY - currentY) * .18;
    radioPieces.forEach(piece => {
      const depth = Number(piece.dataset.parallax);
      piece.style.transform = `perspective(650px) rotateX(${(-currentY * 16 * depth).toFixed(2)}deg) rotateY(${(currentX * 18 * depth).toFixed(2)}deg)`;
    });
    if (Math.abs(targetX - currentX) > .001 || Math.abs(targetY - currentY) > .001) {
      frame = requestAnimationFrame(drawRadioParallax);
    }
  };
  const scheduleRadioParallax = () => {
    if (!frame && !reducedMotion.matches) frame = requestAnimationFrame(drawRadioParallax);
  };
  radioArt.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reducedMotion.matches) return;
    const rect = radioArt.getBoundingClientRect();
    targetX = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    targetY = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    scheduleRadioParallax();
  });
  radioArt.addEventListener('pointerleave', () => {
    targetX = targetY = 0;
    scheduleRadioParallax();
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    targetX = targetY = currentX = currentY = 0;
    radioPieces.forEach(piece => piece.style.removeProperty('transform'));
  });
}

