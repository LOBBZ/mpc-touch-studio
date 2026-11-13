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

## Playlist (zoals in FL Studio)

Tabblad **Playlist**. Zet de transportknop op **SONG** (PAT = alleen het patroon loopen, net als in FL).

**Clips op sporen**
- **Patternclip:** je sequencer-patroon A–D. Pas je het patroon aan, dan veranderen alle clips van dat patroon mee.
- **Notenclip:** opgenomen of getekende noten (pads of klavier).
- **Audioclip:** zang of instrument met golfvorm.

**Gereedschap**
- ⬚ **Selecteer:** tik = selecteren, sleep = verplaatsen (ook naar een ander spoor), sleep de rand = langer of korter. Patronen en notenclips loopen door als je ze langer maakt. **Dubbeltik** opent de clip: noten in de piano roll, een pattern in de sequencer.
- ✏️ **Teken:** tik op een lege plek om de gekozen bron te plaatsen (Pattern A–D of een lege notenclip).
- ✂️ **Knip:** tik op een clip om hem te splitsen.
- 🧽 **Wis:** tik of **veeg met je vinger** over clips om ze uit te vegen. Rechtsklik werkt ook.
- 🔇 **Demp:** clip aan of uit.
- **Snap** (maat/tel/1/16/uit), **Dupliceer** (Ctrl/⌘+B), **Verwijder** (Delete), **Ongedaan/Opnieuw** (60 stappen).

**Opnemen:** arm een spoor met **R**, druk op ● Rec en ▶ Play. Elke opname wordt een nieuwe clip; een tweede opname is een overdub. Er is geen lengtelimiet.
- Met *Patroon meespelen* komt het meespelende patroon als patternclip in de playlist.

**Sporen:** de playlist heeft standaard **50 sporen** (Drums, Keys, Zang, Track 4–50), en je kunt er meer bijmaken. Zoals in FL mag elke clip op elk spoor. Het soort spoor bepaalt alleen wat je erop **opneemt**: tik op het label **PADS / INST / AUDIO** om het te wisselen. Per spoor heb je R, M, S, volume, instrument en FX. De playlist scrollt verticaal en de liniaal blijft bovenaan staan.

**Exporteren:** *Song als MIDI* (één MIDI-spoor per spoor) of *Song als WAV* (mixdown met audio en effecten).

### Piano roll / drumgrid (onder de playlist)
Dubbeltik een notenclip om hem te openen.
- ✏️ Tik om een noot te plaatsen of te verwijderen. Sleep om te verplaatsen; sleep de rechterrand om de lengte te veranderen.
- Je hebt hier ook kopiëren/plakken, dupliceren, quantize, transponeren (▲▼) en velocity.

### Effecten per spoor
- **Per spoor:** EQ (laag/mid/hoog), compressor, reverb- en delay-send en pan.
- **Master:** reverb en een delay die meeloopt met de BPM.

## Zoals FL Studio: Channel Rack, Mixer, Automation en Browser

- **Channel Rack + 999 patronen** — tab *Channel Rack*. Kies het patroon met ◀ ▶ bovenin (1–999), ✎ = hernoemen. Elke rij heeft mute-LED, pan en volume. In de Playlist kies je *Pattern N* en tekent het als clip.
- **Mixer met 32 inserts** — tab *Mixer*. Elk spoor kiest zijn insert (FX-knop op het spoor). Per insert: fader, pan, EQ, compressor, sends naar Reverb/Delay, meters, mute/solo.
- **Automation-clips** — in de Playlist bij de bron *📈 Automation-clip* kiezen en tekenen. Dubbeltik opent de curve: tik = punt erbij, tik op punt = weg, slepen = verplaatsen. Bestuurt master-volume, insert-volume/pan of Touch FX (X/Y).
  Opnemen kan ook: druk **Rec + Play** en beweeg een mixer-fader of veeg over de Touch FX — dat wordt vanzelf een automation-clip.
- **Browser** (📁 links, of Alt+F8 zoals in FL) — al je pads, instrumenten, opnames en eigen bestanden/mappen. ▶ = beluisteren, *→ Pad* = op de geselecteerde pad, *→ Playlist* = audioclip bij de gele startmarkering. Op Windows kun je ook slepen naar de playlist of een pad.
- **FL-look** — grafiet panelen met oranje/groene accenten.

## Touch FX (effecten met je vinger)

Druk op **XY** in de transportbalk (of ⇧X). Sleep met je vinger of muis over het vlak: zolang je het aanraakt staat het effect aan. **HOLD** laat het effect aan na loslaten.

| Effect | X (links → rechts) | Y (onder → boven) |
|---|---|---|
| Filter | low-pass ◂ · ▸ high-pass | resonantie |
| Stutter | herhaal 1/4 → 1/64 | hoe lang het doorklinkt |
| Delay | tijd (1/16 … 1/4.) | feedback |
| Space | hoeveelheid reverb | helderheid |
| Gate | snelheid | diepte |
| Lo-Fi | toon | bits (minder = ruwer) |
| Flanger | snelheid | diepte |

Het werkt met touch (telefoon, tablet, touch-laptop), met muis/trackpad en met een **MPC of andere controller**:
1. Zet de MPC in controller-modus en sluit hem via USB aan.
2. Kies hem bij *DAW / MIDI → MIDI-ingang*.
3. Tik in Touch FX op **X leren** en draai aan een Q-Link-knop. Doe hetzelfde voor **Y leren**.

De MPC zelf kan de app niet draaien.

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
