# Diwali Ramayan

Diwali animations to cast to a TV or projector. Each one is a single HTML file with no dependencies.

| Animation | Path | Status |
|---|---|---|
| Sky lanterns, diyas and fireworks | `lanterns/index.html` | Done |
| Wall mapper: the same story as one journey across doors and wall | `wall/index.html` | First draft, needs fitting to the real wall |
| Ramayan frieze: birth, Shiva's bow, forest exile, Ravan, Diwali homecoming | `ramayan/index.html` | First draft, 5 scenes, about 67 s loop |

## Live pages
The site is served by GitHub Pages from the `main` branch (root):

| Animation | Link |
|---|---|
| Wall mapper and the 3D Ramayan story (the main one) | https://dipak8959.github.io/diwali-ramayan/wall/ |
| Sky lanterns, diyas and fireworks | https://dipak8959.github.io/diwali-ramayan/lanterns/ |
| Ramayan frieze (older 2D draft) | https://dipak8959.github.io/diwali-ramayan/ramayan/ |

Open a link in Safari or Chrome and press **Fullscreen**. Add `?play` to the wall link (`.../wall/?play`) to start the story straight away.

If a link shows a 404, Pages is not switched on yet: open the repository, then **Settings, Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save. It goes live in a minute or two.

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
**Look: 3D** (the default) is a real 3D walk built with Three.js: the whole Ramayan plays as one walk along a ledge across the wall with no scene cuts (about 6 1/3 minutes): the birth of Ram, Shiva's bow and the wedding, exile, the golden deer, Sita's abduction and Jatayu, Hanuman's leap and burning Lanka, the sea bridge, the battle, Ravan's fall, the flying chariot home and Diwali, with teal and orange rim lighting, glow and a film colour grade. Only the part of the wall around the walkers is lit, and the light moves with them. **Look: Night** is the flat 2D version that draws no sky at all: figures are lit gold shapes on black, so only light reaches the wall. **Look: Day** paints a sky with dark silhouettes, for a screen.
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

**Story text:** the default layout has a pink **Story text** area (on the blank wall between the doors). It writes what is happening, in English and Hindi, and changes with each chapter. Drag its corners anywhere, or use **+ Text** to add another one.

### Building the single file
`wall/src/` holds the page and the 3D story (`r3.js`); `wall/vendor/` holds Three.js (MIT licence) and its glow effects.
Run `python3 tools/bundle-wall.py` to rebuild `wall/index.html`, which is one self-contained file that works offline.

### More scenes and details (3D look)
Five extra scenes pause the main walk so nothing is rushed: Vishwamitra and Tataka, Kaikeyi's boons, Bharata and the sandals, Sugriva and Vali, and Indrajit's serpent arrows with Garuda.
Smaller details: a squirrel at the sea bridge, fireflies and falling leaves in the forest, sparkles on the sea, grass and flowers on the ledge, dust at each footstep, blinking eyes and talking mouths, and a cinematic light streak on bright flashes.

### Round three
Six more scenes: Surpanakha and Lakshman, Lakshman's protective line and the hermit who is Ravan in disguise, Sabari's berries, Vibhishana joining Ram, Sita's trial by fire with Agni, and the coronation tableau (Ram Darbar) on a golden throne.
New looks: real flames that change colour as they rise, soft ground mist, a light colour that follows the story (warm in Ayodhya, green in the forest, red at Lanka, gold at the homecoming), angry and sad brows, characters looking at each other, folded hands and sitting.

### Round four
- Everyone now turns to face the way they walk or fly, including Ram walking back to the hut, Hanuman leaping back, the riders on the flying chariot, and Ravan and Kumbhakarna, who face Ram.
- Every caption now says what is happening and why Ram goes where he goes and with whom. Key moments also show a cyan **Lesson:** line, the moral of the story.
- New scenes: Ahalya freed from stone, and Angada's foot in Ravan's court. Hanuman shows Ram and Sita in his heart at the coronation. Soft divine auras behind the heroes.

### Following Valmiki's Ramayana
The story was checked against Valmiki's Ramayana (from memory of the text, not line by line, so please check it against a translation):
the birth comes from Dasharatha's fire ritual (not a lotus); Ahalya lives unseen in penance (not turned to stone); Janaka gives Sita to Ram (no garland contest);
Ram, Lakshman and Sita wear bark robes in exile; there is no protective line round the hut; Lakshman wounds Surpanakha; Ravan comes as a hermit;
the bridge is built by Nala (no squirrel, no Ram-name stones); Angada leaps to the palace roof with four demons (no planted foot);
Ram is crowned by Vasishtha. The Diwali lamps are marked in the captions as a later tradition.

### Round five: slower, connected, with the story before Ram's birth
- **Slower:** everything now plays 1.6 times slower (walking pace, scene lengths and captions), so people can read and enjoy. The full loop is about 15 minutes.
- **Before Ram was born (five new scenes):** Ravan's boon from Brahma (he cuts his ten heads one by one into the fire and Brahma restores them), the gods and Vishnu's promise to be born as a man, young Dasharatha and the boy Shravana with the blind parents' curse, Kaikeyi saving the wounded king (the two boons), and the fire ritual led by Rishyasringa that brings the four sons.
- **Connected:** captions now link each scene to the next: the curse comes back at Dasharatha's death, the boons return at Ram's exile, Maricha survives to become the golden deer, and so on.
- **New scenes:** Vishwamitra asks for Ram, the hermitage guard against Subahu and Maricha, Parashurama and Vishnu's bow, Ram breaking Ravan's crown and sending him home to rest, Kumbhakarna being woken, Lakshman killing Indrajit at his fire ritual, the long duel where Ram cuts Ravan's heads and arms and they grow back (Matali reminds Ram of the Brahma weapon), and Mandodari and the funeral.
- **Ravan:** ten heads and twenty arms (two legs), as Valmiki calls him dashagriva. If you have a source for another count, it is one number to change in `makeRavan`.

### Round six: cinematic quality
- **Story text:** new typefaces (Cinzel for headings, Cormorant Garamond for the story, both SIL Open Font License, embedded so it works offline). A running heading names the book of Valmiki's Ramayana: Prologue, then Bala, Ayodhya, Aranya, Kishkindha, Sundara and Yuddha Kanda, then the Epilogue. Words appear one by one at a reading pace, and the lesson appears between two stars.
- **Scenery:** Ayodhya is a cream sandstone palace with arcades, onion domes, pavilions and waving flags; Mithila is a hall of carved red sandstone pillars, scalloped arches, lamps and marigold garlands; the forest has leafy banyan and sal trees, palms by the sea and the rocks of Rishyamukha hill; Lanka is a golden city of towers and spires on the three-peaked mountain Trikuta, behind a wall with gates. A starry sky, far hills and a glowing moon.
- **Characters:** bigger eyes with a coloured iris and a catch-light, curved brows, lashes, a soft blush, long hair under the crowns, and a flowing shawl on the men. Ravan's twenty arms are fanned behind his shoulders, each holding a weapon (sword, mace, trident, discus, shield, spear, axe).
- **Ten new scenes:** Guha ferries the exiles across the Ganga; Dasharatha dies remembering Shravana's curse; Agastya gives Ram the bow of Vishnu and Brahma's arrow; Surasa tests Hanuman over the ocean; the Ashoka grove (Ravan's threat, the blade of grass, Ram's ring and Sita's hair jewel); Hanuman gives the jewel to Ram; Ram and the Ocean god; Agastya teaches Ram the Aditya Hridayam as the Sun rises; Dasharatha appears from heaven and forgives Kaikeyi and Bharata; Bharata puts the sandals back on Ram's feet.
- **Order fixed:** Vibhishana now joins Ram at the seashore after Hanuman's return (he flies across the sea), and the bridge is built after the Ocean god speaks, as in Valmiki.
- **Film touches:** god rays for divine moments, a dip to black when the story moves to another place. The full loop is now about 18 minutes.

### Voice narration
The narrated video adds a spoken narrator to the wall video: each caption is read as it appears, then its lesson, and each book heading ("Book Two. Ayodhya Kanda. The Exile.") is announced.
The voice is synthetic, made with the open Kokoro text-to-speech model (Apache-2.0): a deep blend of its Hindi male and American male voices, with a little warmth and room echo. It is not, and does not imitate, any real person.
Sanskrit names are respelled for the voice (Raam, Seeta, Raavan, Hunoomaan…) in `tools/narrate.py`; edit the `SAY` table to change a pronunciation.

To remake it after changing the story or the video:
```
pip install kokoro-onnx soundfile        # and download kokoro-v1.0.onnx and voices-v1.0.bin (links in tools/narrate.py)
node tools/caption-schedule.js schedule.json
python3 tools/narrate.py schedule.json wall-video.mp4 wall-video-narrated.mp4 --models <model folder> [--voice am_onyx]
```
To use a real narrator instead, record one audio file per caption and replace the generated clips, or send the recording and it can be lined up with the captions.

### Round seven: a clear Sanjivani sequence and the Vishnu opening titles
- **Sanjivani, step by step (Yuddha Kanda 100–101):** Ravan's spear, the Shakti, strikes Lakshman; Ram pulls it out and weeps over his brother; the monkey physician Sushena sends Hanuman to the Himalayas; Hanuman cannot tell the herbs apart and lifts the whole peak; he flies back, Sushena gives Lakshman the herb, and he rises. Before that, Indrajit attacks from a storm cloud, which leads into his secret fire ritual. Hanuman no longer leaves before anyone is hurt.
- **Opening titles (`wall/src/intro.js`, an original title sequence):** a fast flip-book of Vishnu's ten avatars (Matsya, Kurma, Varaha, Narasimha, Vamana, Parashurama, Rama, Krishna, Balarama, Kalki), each a lit 3D render made in code (`avatarStills` in `r3.js`), turning like pages across the whole wall strip; a crimson title panel framed in gold with VISHNU, a spinning Sudarshana discus and DASHAVATARA; the ten avatars in a row with Rama lit; then "Vishnu presents The Ramayana". The narrated video adds page-flip sounds, a rising whoosh, a deep boom and a chord, all made in code, and the narrator's first line.
