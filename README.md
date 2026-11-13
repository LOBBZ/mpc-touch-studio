# MPC Touch Studio

Touch sampler, step sequencer en multitrack-recorder in MPC-stijl, met MIDI naar FL Studio, Ableton Live en Logic Pro.
Eén codebase (`www/`) die draait als web-app (MacBook, iPad, iPhone), als Windows/Mac-desktopapp (Electron) en als Android-APK (Capacitor).

## Mappen

```
mpc-touch-studio/
├── www/                    ← de app zelf (dit is alles wat de browser nodig heeft)
│   ├── index.html
│   ├── css/app.css
│   ├── js/app.js           ← pads, sequencer, klavier, mixer, MIDI, export
│   ├── js/sampler.js       ← eigen instrumenten, trim & fade, kit laden
│   ├── js/connect.js       ← MIDI Clock, kanalen, testnoot
│   ├── js/fx.js            ← effecten: EQ, compressor, reverb, delay
│   ├── js/song.js          ← Song-modus: multitrack-tijdlijn zonder lengtelimiet
│   ├── js/audio.js         ← audiosporen: zang/instrument opnemen, clips
│   ├── js/editor.js        ← piano roll, drumgrid, clip-editor, undo/redo
│   ├── js/main.js          ← opstarten + offline-modus (PWA)
│   ├── manifest.webmanifest, sw.js, icons/
├── bridge/                 ← wifi-bridge voor iPhone/iPad → Mac/Windows/Linux
├── electron/main.js        ← desktop-app (Windows .zip / portable .exe, macOS)
├── capacitor.config.json   ← Android-APK
└── package.json            ← build-scripts
```

## 1. Direct gebruiken (geen installatie)

- **MacBook / Windows:** open `www/index.html` in **Chrome of Edge**. Alles werkt, inclusief Web MIDI naar je DAW.
- **iPhone / iPad:** zet de map `www/` op een https-adres, bijvoorbeeld GitHub Pages, Netlify of Cloudflare Pages. Open dat adres in Safari en kies Deel → **Zet op beginscherm**. De app werkt daarna ook offline.
- Lokaal testen als PWA: `npx http-server www -p 8080`, daarna http://localhost:8080.

## 2. Windows-app (zip + portable .exe)

Vereist: [Node.js LTS](https://nodejs.org).

```bash
npm install
npm run build:win        # → dist/MPC Touch Studio-1.0.0-win.zip en een portable .exe
```

Testen zonder te bouwen: `npm run electron`.
In de desktop-app werkt **Web MIDI direct**: maak met loopMIDI een poort en kies die in het tabblad *DAW / MIDI*. De netwerk-bridge is dan niet nodig.

macOS-app: `npm run build:mac`. De app is niet gesigneerd: open hem de eerste keer met rechtsklik → Open.

## 3. Android-APK

Vereist: Node.js LTS, [Android Studio](https://developer.android.com/studio) en JDK 17.

```bash
npm install
npx cap add android      # eenmalig: maakt de map android/
npx cap sync android     # na elke wijziging in www/
npx cap open android     # opent Android Studio → Build → Build APK(s)
```

Zonder Android Studio-scherm: `cd android && ./gradlew assembleDebug`. De APK staat dan in `android/app/build/outputs/apk/debug/app-debug.apk`.

**Microfoon (audiosporen):** voeg na `npx cap add android` deze twee regels toe aan `android/app/src/main/AndroidManifest.xml`, boven `<application`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Let op: de Android-WebView heeft **geen Web MIDI**. Pads, sequencer, Song-modus en export werken wel. MIDI naar je DAW gaat op Android via de MIDI/WAV-export.

## Song-modus (multitrack, onbeperkte lengte)

1. Klik in de transportbalk op **LOOP** zodat er **SONG** staat (of tabblad *Song* → *Song (onbeperkt)*; sneltoets ⇧S).
2. Arm een spoor met **R**. Pads gaan naar het eerste gearmde drumspoor; het klavier en je MIDI-keyboard naar het eerste gearmde instrumentspoor.
3. Druk op **● Rec** en **▶ Play**. Er is geen lengtelimiet: neem 7 minuten of langer op.
4. Nogmaals opnemen is een **overdub**. *↶ Laatste take ongedaan* draait de laatste opname terug.
5. *Sequencer-patroon meespelen* neemt je beat op het drumspoor op. Na de eerste take gaat dit vinkje automatisch uit.
6. Exporteren: **Song als MIDI** (type 1, één MIDI-spoor per drum-/instrumentspoor) of **Song als WAV** (stereo mixdown met audio en effecten, 44,1 kHz).

Per spoor: naam, instrument, opname-arm (R), mute (M), solo (S), volume en **FX**. Tik op de liniaal om de startpositie te kiezen. Zoom met − en +.

### Sporen
- **Drumspoor**: pads, Note Repeat, 16 Levels en het sequencer-patroon.
- **Instrumentspoor**: klavier, akkoorden en MIDI-keyboard; kies piano, bas, gitaar of synth.
- **Audiospoor 🎤**: zang of instrument via microfoon/audio-interface. Arm met R (de browser vraagt om toegang), daarna ● Rec + ▶ Play. Gebruik een koptelefoon. *Opname-latentie* staat op auto; schuif hem bij als je opname te laat of te vroeg valt.
  Werkt in Chrome/Edge (ook via `file://`), Safari op iPhone/iPad via https, en in de Windows-, Mac- en Android-app. Niet in de online claude.ai-weergave.

### Editor (onder de tijdlijn)
Tik op een spoor om het te bewerken: piano roll voor instrumenten, drumgrid voor drums (16 pads van de actieve bank) en clips voor audio.
- ✏️ **Teken**: tik op een leeg vak voor een noot, tik op een noot om hem te verwijderen. Sleep een noot om hem te verplaatsen, of sleep de rechterrand voor de lengte.
- ⬚ **Selecteer**: tik om te selecteren (⇧ voegt toe). Met de muis sleep je een kader.
- Raster 1/4 tot 1/32, triolen of vrij. Bewerken: **Alles**, **Kopieer**, **Plak** (op de gele startpositie), **Dupliceer**, **Verwijder**, **Quantize**, ▲▼ transponeren (⇧ = octaaf) en **Vel** (velocity, of volume bij audioclips).
- **Ongedaan/Opnieuw**: tot 60 stappen.
- Sneltoetsen: ⌘/Ctrl + Z, ⇧⌘Z / Ctrl+Y, ⌘C, ⌘V, ⌘D, ⌘A, Delete, ↑/↓.

### Effecten
- **Per spoor:** pan, 3-bands EQ (laag 180 Hz, mid met instelbare frequentie, hoog 6 kHz), compressor (drempel en ratio), reverb-send en delay-send.
- **Master:** reverb-lengte en -niveau, delay-tijd (gesynchroniseerd op de BPM), feedback en niveau. Daarna volgt een limiter.
- De effecten zitten ook in de WAV-export.

## Eigen geluiden

- **Hele kit laden:** tabblad Pads → *📁 Hele kit laden*. Kies tot 64 bestanden. Ze worden op naam gesorteerd (01, 02 … 10) en vullen pad 1–16, en lopen door naar bank B–D. Op de Mac kun je bestanden ook op een pad slepen.
- **Trim & fade:** kies een pad met een eigen sample. Sleep de gele lijnen voor start en eind, stel fade-in/-out in, of gebruik *✂ Stilte weghalen*.
- **Eigen instrument:** tabblad Piano → *＋ Nieuw uit samples*. Neem een of meer noten op van je bas, keys of gitaar. Met de noot in de bestandsnaam (`Bas_E1.wav`, `Rhodes C3.wav`, C4 = noot 60) wordt alles automatisch ingedeeld, anders kies je de grondnoot zelf. Kies *Vasthouden* of *One-shot* en stel de release in. Het instrument staat ook bij instrumentsporen in de Song-modus (★).
- **WAV-export:** 24-bit 44,1 kHz (standaard), 24-bit 48 kHz of 16-bit 44,1 kHz.

## Verbinden

| Situatie | Hoe |
|---|---|
| MacBook → DAW | Chrome/Edge of de desktop-app → Web MIDI → IAC-driver |
| Windows → DAW | Desktop-app of Chrome/Edge → Web MIDI → loopMIDI |
| iPhone/iPad → Mac/Windows/Linux | Wifi-bridge (map `bridge/`), zie hieronder |
| USB-/Bluetooth-controller | Web MIDI → MIDI-ingang (*Ingang speelt*: pads, klavier of automatisch) |
| Android | In Chrome: Web MIDI met USB-controllers. Naar de computer: wifi-bridge |
| Overal | Song als MIDI/WAV exporteren |

**Sync** (tabblad DAW / MIDI → *Sync, kanalen & test*):
- **DAW volgt app:** de app stuurt MIDI Clock, Start/Stop/Continue en Song Position. Dat werkt via Web MIDI en via bridge v2.
- **App volgt DAW:** de app neemt tempo en start/stop over van een sync-ingang. Gebruik daarvoor een tweede IAC-bus.
- Je kunt **kanalen** voor pads en klavier instellen, en de **startnoot** van de pads. Met **♪ Testnoot** en de lampjes OUT/IN controleer je of de verbinding werkt.

### Wifi-bridge (iPhone/iPad → computer)

1. Installeer Python 3 ([python.org](https://www.python.org)).
2. Start de bridge:
   - Mac: dubbelklik `bridge/start_mac.command`. Lukt dat niet: rechtsklik → Open.
   - Windows: dubbelklik `bridge/start_windows.bat` en sta de firewall-melding toe.
   - Linux: `bridge/start_linux.sh`.
3. De eerste keer installeert de bridge `python-rtmidi`. Daarna toont hij het adres en de PIN.
4. Open op je iPhone of iPad het getoonde `http://…:8765/` in Safari. Vul in *DAW / MIDI* het adres en de PIN in.
5. Kies de MIDI-poort:
   - Mac/Linux: **MPC Touch Studio (virtuele poort)**. Die verschijnt vanzelf in je DAW, zonder IAC.
   - Windows: je loopMIDI-poort.

De bridge serveert de app zelf, dus hij werkt ook zonder internet. Testen zonder MIDI kan met `python mpc_bridge.py --dry-run`.
Let op: via het http-adres van de bridge werkt de microfoon op iPhone niet (Safari vereist https). Neem zang op via een https-hosting van de app of op de computer.

## MIDI-indeling

| Wat | Kanaal | Noten / CC |
|---|---|---|
| Pads (bank A–D) | 10 (instelbaar) | 36–99 (startnoot instelbaar; pad A01 = 36 = C1 in Ableton/Logic) |
| Klavier (loop-modus) | 1 (instelbaar) | gespeelde noot |
| Instrumentsporen (song) | klavier-kanaal, daarna de volgende (pads-kanaal overgeslagen) | gespeelde noot |
| Sync | — | MIDI Clock (24 ppq), Start/Stop/Continue, Song Position |
| Mixer volume / pan | 1 | CC 20–35 / CC 40–55 |

## Opslag

Instellingen, patronen en de song worden in de browser bewaard (localStorage en IndexedDB), per apparaat en per browser.
Wil je een project naar een ander apparaat meenemen? Gebruik *↓ Bewaar project* en *↑ Open project*. Eigen samples en audio-opnames zitten niet in het projectbestand: exporteer de song als WAV om je zang mee te nemen.
