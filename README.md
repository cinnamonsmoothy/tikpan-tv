# Tikpan TV site

Open `index.html` directly to view the site. The globe texture and geography are packaged as a regular local script so the interactive hero also works from a `file://` page. You can still serve the folder over HTTP when developing or publishing it.

The hero uses a sphere projection in `globe-software.js` that maps the Earth image onto a rotating globe. WebGL renders the texture on the graphics card when available, with a lower resolution canvas fallback. The globe turns slowly on its own; drag it or use the arrow keys to spin it, with no automatic return after interaction. Africa's gold overlay follows Natural Earth country geometry, and small signals continually travel from Ghana to four destinations. Scrolling turns Africa toward the viewer, enlarges the sphere until it fills the viewport, fades to black, and reveals the featured-stories title. Animation pauses when the hero is out of view and respects reduced motion preferences. The former hero video files remain in `assets/` as source material but are no longer loaded by the page.

Both logo PNGs in `assets/` have transparent backgrounds and retain their supplied resolution. The initial brand loading screen runs for 1.4 seconds and no longer waits for video buffering.

The homepage featured section and the About page use the shared `video-catalog.js` catalogue. The homepage keeps its newest-first order and Load More behavior. The About page (`about.html`) ends with Popular Stories after the closing section, ranking the catalogue by numeric `viewCount` and showing the top three in the same featured layout. Updating the catalogue updates that ranking. View counts are from the saved catalogue snapshot, not live YouTube statistics. Clicking a thumbnail opens the shared YouTube player.

Tikpan Radio opens the bottom-right player on both pages, with play/pause, volume, connection status and a Zeno listening link. Closing the panel keeps audio playing. Pause closes the connection; Play starts a fresh live stream. Switching between the separate Home and About documents restarts the player.

Opening `index.html` directly requires no localhost server: the player tries the public HTTPS Zeno stream. Internet access is required, and direct playback depends on Zeno accepting the browser connection (the old site documented failures with direct playback). If blocked, use the Zeno link or the hosted relay.

For relay playback without running anything locally, set `data-radio-relay="api/radio"` on `#radio-widget` in both HTML pages and deploy the `tikpan-tv` folder as a Cloudflare Pages project, with no build command and `.` as the output directory. Include `functions/api/radio.js`, which provides the same `/api/radio` streaming relay as the old site. No admin storage, secrets or local Python server are needed for radio. Static-only hosting will not run this endpoint; it needs a compatible streaming backend. A deployed relay and audible playback still need verification on the target host/browser.

Globe dependencies and maps are stored locally: the Earth texture from the Three.js examples and Natural Earth country boundaries (public domain). `assets/globe/globe-data.js` contains the texture and country data for direct-file use. The previous Three.js files remain in `assets/vendor/` but are not loaded by the page.


## GitHub Pages and automatic YouTube sync

The repository root should contain `index.html`, `scripts/` and `.github/`. Set **Settings ? Pages ? Source** to **GitHub Actions**. Add the Google Cloud YouTube key as the repository Actions secret `YOUTUBE_API_KEY` (never in source files).

`.github/workflows/pages.yml` syncs the channel at minutes 17 and 47 each hour, on pushes to `main`/`master`, or manually from Actions. Use `main` or `master` as the default branch. It retrieves all uploads with pagination, refreshes titles, YouTube-hosted thumbnails, durations and view counts, then deploys a static catalogue with the site. The existing cards, Load More and Popular Stories use this generated catalogue without frontend changes. Videos themselves still play through YouTube embeds.

API calls happen during deployment only; visitor traffic uses no YouTube Data API quota. Each sync costs roughly two requests per 50 uploads (the first verified sync returned 110 public videos using six requests, approximately 288 units per day at 48 refreshes). A failure stops deployment, leaving the last successful published site online. Generated catalogues live in the deployment artifact; the repository snapshot stays available for direct-file previews. Run `node scripts/sync-youtube.mjs` with `YOUTUBE_API_KEY` supplied through the environment to update that snapshot locally.

The build publishes public root assets plus `assets/`. It excludes the old website, local configuration folders, credentials, workflow scripts and Cloudflare functions. Radio now uses direct Zeno playback by default on static hosting. GitHub Pages cannot run `/api/radio`; a separately hosted relay is needed if direct Zeno playback fails. Set `data-radio-relay` on `#radio-widget` in both HTML files to opt into that relay.

GitHub scheduled runs can be delayed, and public-repository schedules may be disabled after 60 days without repository activity. Check the Actions tab if updates stop. See https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.

Validation: `node --test scripts/sync-youtube.test.mjs`.
