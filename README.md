# Diwali Ramayan

Diwali animations to cast to a TV or projector. Each one is a single HTML file with no dependencies.

| Animation | Path | Status |
|---|---|---|
| Sky lanterns, diyas and fireworks | `lanterns/index.html` | Done |
| Wall mapper: the same story as one journey across doors and wall | `wall/index.html` | First draft, needs fitting to the real wall |
| Ramayan frieze: birth, Shiva's bow, forest exile, Ravan, Diwali homecoming | `ramayan/index.html` | First draft, 5 scenes, about 67 s loop |

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

## Ramayan frieze (wide strip for the top of a wall)
`ramayan/index.html` draws a 3:1 strip at the top of the screen and leaves the rest black, so it lands near the ceiling.
Aim the projector high, then fit the strip to the wall: arrow keys move it, `[` and `]` resize it, `G` shows an outline and grid.
The fit is remembered in the browser. `1` to `5` jump to a scene, `Space` pauses, `F` is fullscreen.
Video for a projector or USB stick: `node tools/render-video.js ramayan/index.html ramayan.mp4 68 30 960 540` (1920x1080, strip at the top).

## Wall mapper (the frieze above the doors, or the doors and wall)
`wall/index.html` lights only the shapes you outline and keeps everything else dark.
The default **View: Frieze** is one long band in the gap between the ceiling and the tops of the doors: the five scenes sit side by side from left to right, and only the scene in progress is lit. The others stay dark, so the light moves along the wall as the story moves on.
**Look: Night** (the default) draws no sky at all: figures are lit gold shapes on black, so only light reaches the wall. **Look: Day** paints a sky with dark silhouettes, for a screen.
**View: Doors** switches to separate windows on the left door, the wall and the right door.
The story is one continuous world, so a character or an arrow leaves one surface, crosses the dark gap and arrives on the next.

1. Open the page on a laptop and send it to the projector (HDMI, or cast the tab). Press **Fullscreen**.
2. Place the projector so its picture covers the left door to the right door. Let the projector's auto keystone square the picture.
3. **Test** mode shows bright panels. Drag the corner dots until each panel sits on its door or wall.
   **+ Surface** / **− Surface** add or remove shapes. **Edge +** pulls the edges inward to avoid light spill.
4. **Art ▲ ▼** moves the ground line the characters stand on. **Art − +** changes the size of the picture.
   **Tall − +** stretches the story vertically. The default (2.0) is set for a picture about 3.6 times wider than it is tall. Adjust until the circle in Test mode looks round on the wall.
5. **Play** shows the journey. **Record video** saves one full loop. Or open **Layout…**, copy the text, and render a clean MP4 with
   `node tools/render-video.js "wall/index.html?play#layout=<BASE64>" wall.mp4 68 30 960 540`
   (the base64 is the layout text, base64-encoded and URL-encoded). Play the MP4 from a USB stick. Do not move the projector afterwards.

Character close-up: open `wall/index.html?sheet` to see Ram, Sita, Lakshman and Ravan large.
