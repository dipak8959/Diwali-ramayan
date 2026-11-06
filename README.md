# Diwali Ramayan

Diwali animations to cast to a TV or projector. Each one is a single HTML file with no dependencies.

| Animation | Path | Status |
|---|---|---|
| Sky lanterns, diyas and fireworks | `lanterns/index.html` | Done |
| Ramayan (Ram's arrow, Ravan effigy) | `ramayan/` | Planned |

## Play it
Turn on GitHub Pages (Settings, Pages, deploy from `main`, `/ (root)`), then open
`https://dipak8959.github.io/diwali-ramayan/lanterns/` in Safari or Chrome and press **Fullscreen**.

## Cast to a TV or projector
- **Chromecast / Google TV:** open in Chrome, then use the menu, **Cast…**, **Cast tab**, and press Fullscreen.
- **iPad / iPhone / Mac:** use Screen Mirroring or AirPlay, then press Fullscreen.
- **HDMI:** plug the laptop in and press `F`.

Controls: tap the sky for fireworks, tap near the bottom for a lantern. `Space` pauses, `Enter` fires a firework.

## Make a video file
`node tools/render-video.js lanterns/index.html lanterns.mp4 120` renders a 2-minute 2048x1536 MP4 for the iPad.
For a 1080p TV version, use `node tools/render-video.js lanterns/index.html lanterns.mp4 120 30 960 540`.
Needs `ffmpeg` and `playwright`.
