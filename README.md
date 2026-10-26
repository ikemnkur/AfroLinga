# AfroLinga

An offline-first Progressive Web App (PWA) for learning **Igbo** and **Yorùbá** through games.
Pure HTML/CSS/JavaScript — no build step, no dependencies.

## Run it

```bash
npm start            # http://localhost:8080 – works offline on this computer
```

### Testing on a phone (offline + install)

Phones only let a web app work offline and install from a **secure** link: `https://…` or
`http://localhost`. Opening `http://192.168.x.x:8080` from a phone loads the app, but it can't save
itself, so it breaks in airplane mode (the app now shows a warning when this happens).

| Option | Command | On the phone |
|---|---|---|
| **Android, USB cable** (easiest) | `npm run phone:usb` | Enable USB debugging, plug in, open `http://localhost:8080` in Chrome |
| **Any phone, same Wi-Fi** | `npm run serve:phone` | First time: open the printed `http://<ip>:8081` setup page and install the certificate. Then open `https://<ip>:8443` |
| **Real users** | deploy (below) | Open your `https://` site |

Then install: Android/Chrome shows an **Install AfroLinga** prompt (or use the 📲 button on the home
screen). iPhone: Safari → Share → **Add to Home Screen**. Open the installed app once while online so
it saves itself; after that it works in airplane mode. **Settings → Offline & install** shows a
checklist of what's ready.

`serve:phone` creates a private certificate authority in `.certs/` (once). It is restricted to
local addresses (192.168.x.x, 10.x.x.x, localhost) so it can't be abused for real websites, but keep
`.certs/` private, never deploy it, and remove the certificate from the phone when you're done.

### Deploying

Upload the project folder (everything except `.certs/`, `tools/` and `node_modules/`) to any static
https host – GitHub Pages, Netlify (drag & drop), Cloudflare Pages. Run `npm run stamp` first: it
updates the version in [sw.js](sw.js) from the app files, so installed apps download the update and
show "A new version is ready". (`npm start` / `serve:phone` stamp automatically.)

### How offline works

- The app shell (HTML, JS, CSS, data, icons) is saved when the app first loads.
- Audio and images are saved in the background once a day while online (and as they're used).
  **Settings → Save all audio & images now** does it immediately. Empty placeholder files are skipped.
- Visitors on the website get an install prompt after a few seconds (not during lessons;
  "Not now" hides it for a week).

## Games

| Game | Modes |
|---|---|
| 🖼️ Picture Match | type the word · word bank · fill the phrase |
| 🎧 Listen & Match | type what you hear · word bank · fill the phrase · spoken English → native · pick the picture |
| 🔗 Match Pairs | words · phrases (native on the left, English on the right) |
| 🔢 Schulte Table | classic · shuffle (grid size 3×3 / 4×4 / 5×5 in Settings, best times saved) |
| 🃏 Memory Flip | word ↔ English · word ↔ picture |
| 🎨 Picturnary | build the phrase for a picture from a word bank |
| 👀 I Spy | read the word · hear the word · "something beginning with…" (tap it in a scene of pictures) |
| ✏️ Crossword | generated fresh each time from the dictionary · English clues · picture clues · 💡 letter hints |
| 🔍 Word Search | easy (listed words, → ↓) · English clues (→ ↓ ↘) · hard (all 8 directions); drag or tap first + last letter |
| 🪢 Hangman | words · picture only · phrases (guessing a letter reveals it with any tone mark, e.g. ẹ → ẹ̀) |
| 🔀 Unscramble | letters of a word · words of a sentence |
| ➗ Number Fun | adding · subtracting · comparing · multiply & divide · mixed (all in native number words) |

Every lesson has a **Skip** button (replaces the current question/board with a new one) and a
**timer**. Lesson time, accuracy, skips and day streaks are saved on the device and shown under
**Progress**. Time pauses automatically when the app is in the background; quitting early still
records the time spent.

## Content files (`data/`)

All content is keyed by **id**; every link file refers to those ids.

| File | Purpose |
|---|---|
| [languages.json](data/languages.json) | Languages taught, speech codes, special-character keyboard, alphabet for letter games |
| [dictionary.json](data/dictionary.json) | **Dictionary** – words (`w_…`) with translations, categories, alternate spellings and example sentences (`x_…`) |
| [phrases.json](data/phrases.json) | **Common phrases** (`p_…`) and their translations |
| [numbers.json](data/numbers.json) | Numbers (`n_…`) for the math game and dictionary |
| [audio-map.json](data/audio-map.json) | **Sounds ↔ text** – recording per language for each id, plus game SFX |
| [image-map.json](data/image-map.json) | **Images ↔ text** – which image illustrates which ids (with emoji placeholder) |
| [image-audio-map.json](data/image-audio-map.json) | **Images ↔ sounds** – used by "Listen → pick the picture" |

Example word:

```json
{ "id": "w_cat", "en": "cat", "ig": "nwamba", "yo": "ológbò", "category": "animals", "emoji": "🐈",
  "alt": { "ig": ["pusi"] },
  "examples": [ { "id": "x_cat_1", "en": "The cat is sleeping.", "ig": "…", "yo": "…" } ] }
```

Phrases can override how they are split into word-bank tiles with `"tokens": { "yo": ["…", "…"] }`.

Other optional fields:

- `"image": false` – the item is excluded from picture games (abstract words such as pronouns,
  "here", "it is not ready"), including listening-picture questions. Dictionary words still get
  image and image-audio map entries as future-artwork placeholders; excluded phrases are not
  automatically scaffolded. Remove the flag when artwork is ready to enable the item in picture games.
- Leave out a language (e.g. no `"yo"`) if you only have one translation – the item then only appears
  when learning the other language.
- `"needsReview": true` – a translation still needs native-speaker review of its meaning, spelling
  and tone marks. Remove the flag after review; it does not exclude the item from lessons.

The **Actions** category includes the verbs from [English Verbs](data/English%20Verbs), with
English labels written as "to …". Existing verbs are reused, and ambiguous meanings are qualified
(for example, "to lie down" and "to charge (money for a service)"). The original source list is
unchanged; newly added entries are marked for review. Abstract actions use `"image": false`;
illustrated actions have asset links and emoji placeholders until artwork is supplied.

### Adding content

1. Add words/phrases/numbers to the content files – by hand, or import a list (below).
2. Run `npm run scaffold` – adds matching entries to the three link files using the naming
   convention below (existing entries and custom paths are never changed).
3. Run `npm run check` – validates ids/links and shows which asset files still need creating
   (`node tools/check-content.mjs --missing` lists them all).

### Importing a list

Lists written as `english ---> igbo ---> yoruba` (one per line, with optional `section:` headings)
can be imported directly:

```bash
npm run import -- my-list.txt --type=phrase --section="commands" --category=commands --dry-run
npm run import -- my-list.txt --type=word --section="Location - Prepositionals" --category=location
```

- `a / b` (slash with spaces) → `a` is the answer, `b` is also accepted.
- Notes in `(brackets)` are moved to a `notes` field; combined lines like `me/them` are imported
  as-is and listed for review (better split into two entries).
- English that already exists is skipped, so re-importing an updated list only adds new lines.
- Use `--dry-run` first, then run `npm run scaffold && npm run check`.

## Assets (`assets/`)

Files are named after the id (without its prefix), so they never contain accents:

```
assets/audio/<lang>/words/<name>.mp3       w_water      → assets/audio/yo/words/water.mp3
assets/audio/<lang>/phrases/<name>.mp3     p_thank_you  → assets/audio/ig/phrases/thank_you.mp3
assets/audio/<lang>/examples/<name>.mp3    x_water_1    → assets/audio/en/examples/water_1.mp3
assets/audio/<lang>/numbers/<value>.mp3    n_12         → assets/audio/yo/numbers/12.mp3
assets/audio/sfx/{correct,incorrect,complete,match,flip,tap,skip}.mp3
assets/images/words/<name>.webp            w_water      → assets/images/words/water.webp
assets/images/phrases/<name>.webp          p_dog_is_eating → assets/images/phrases/dog_is_eating.webp
```

`<lang>` is `ig`, `yo` or `en` (English recordings power "spoken English → native").
Prefer other formats? Run `node tools/scaffold-links.mjs --audio-ext=m4a --image-ext=png`
before entries exist, or edit the paths in the link files.

**Nothing is required up front** – missing assets fall back gracefully:

- missing image → the emoji placeholder
- missing recording → the device's text-to-speech voice if it has one for that language, otherwise the text is shown
- missing SFX → built-in synthesized game sounds

Tips: keep images square (~512×512 WebP) and recordings short, mono, ~64 kbps, so the offline
download stays small.

## Project layout

```
index.html, manifest.webmanifest, sw.js   PWA shell + offline caching
css/styles.css                            all styles (light + dark)
js/app.js                                 router + home/dictionary/progress/settings screens
js/pwa.js                                 install prompt, offline status, update notice, media saving
js/lesson.js                              lesson runner: timer, skip, check, feedback, results
js/letters.js                             letter handling for word games (ẹ̀ = one letter, tones ignored when guessing)
js/data.js  js/audio.js  js/store.js      content loading, audio/TTS/SFX, settings + history
js/components.js                          shared widgets (tiles, typing box, word bank…)
js/games/*.js                             one module per game
tools/                                    dev server (serve.mjs), import, scaffold, check, stamp scripts
```

Adding a game: create `js/games/<name>.js` following the contract documented at the top of
[js/lesson.js](js/lesson.js), add it to `GAMES` in [js/app.js](js/app.js) and to `SHELL` in
[sw.js](sw.js) (`npm run check` warns if you forget).

## Note on the seed content

The starter words, phrases and numbers were written to get the app running. Please have native
Igbo and Yorùbá speakers review spellings, tone marks and dialect choices before release.
