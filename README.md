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

## 2. Windows-app
Download de nieuwste versie: **https://github.com/LOBBZ/mpc-touch-studio/releases/latest**
- `MPC-Touch-Studio-Setup-x.y.z.exe`: installer, maakt een snelkoppeling op je bureaublad en in het Startmenu.
- `MPC-Touch-Studio-Portable-x.y.z.exe`: zonder installeren direct starten (bijv. vanaf een USB-stick).
- `MPC-Touch-Studio-x.y.z-x64.zip`: uitpakken en `MPC Touch Studio.exe` starten.

Windows SmartScreen kan de eerste keer zeggen "Windows heeft uw pc beschermd" (de app is niet betaald-gesigneerd): klik **Meer info → Toch uitvoeren**.
MIDI werkt direct in de app (MPC/keyboard via USB; naar FL Studio via loopMIDI). Elke push naar `main` bouwt automatisch een nieuwe Windows-versie (GitHub Actions).

Zelf bouwen: Node.js 20 installeren, dan `npm install` en `npm run build:win` → bestanden in `dist/`.

## 3. Android-APK
Download de nieuwste APK: **https://github.com/LOBBZ/mpc-touch-studio/releases** (de release "voor Android").
1. Open het `.apk`-bestand op je telefoon en tik **Installeren**. De eerste keer vraagt Android om "Installeren van onbekende apps" toe te staan.
2. Updates installeren gewoon over de vorige versie heen.

Opslaan: WAV, MIDI en projecten komen in **Documenten › MPC Touch Studio**, en via **Delen…** stuur je ze naar Drive, WhatsApp of FL Studio Mobile.
Elke push naar `main` bouwt automatisch een nieuwe APK (GitHub Actions → `.github/workflows/android.yml`). Ondertekening: zie `android-signing/README.md`.

Let op: de Android-WebView heeft geen Web MIDI. Voor een MPC/keyboard via USB gebruik je de app in **Chrome** (https://lobbz.github.io/mpc-touch-studio/, "Toevoegen aan startscherm"). VST3 via de bridge op je pc werkt wel vanuit de APK (zelfde wifi).

Zelf bouwen: Node.js 20 + Android Studio (JDK 17), dan `npm install`, `npx cap add android`, `npx cap sync android`, `npx cap open android`.

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

## 🎛️ Echte MPC2000XL (VMPC2000XL)
De open-source MPC2000XL-emulator **VMPC2000XL** (Izmar, GPL-3.0, https://github.com/izzyreal/vmpc-juce) wordt uit de broncode gebouwd (`.github/workflows/vmpc.yml`, versie in `vmpc/VMPC_REF`) en per platform meegeleverd. Knop **🎛️ MPC2000XL** in de app:
- **Windows / Mac-app**: zit erin → ▶ Start MPC2000XL. De VST3 (en AU op Mac) staat ook in de app-map, voor FL Studio. Spelen vanuit de app via loopMIDI (Windows) of IAC (Mac).
- **Android**: eigen app `VMPC2000XL-android-arm64.apk` (in de Android-release); daarna start je hem vanuit MPC Touch Studio.
- **iPhone/iPad**: `VMPC2000XL-ios-unsigned.ipa` installeren met Sideloadly/AltStore en je Apple ID (gratis Apple ID: elke 7 dagen opnieuw ondertekenen).
- Losse bestanden: release `vmpc-0.9.21`. Geen officiële Akai-software.

## Mac-app
Release "voor Mac": `MPC-Touch-Studio-…-mac-arm64.dmg` (Apple-chip, M1 en nieuwer). Sleep naar Programma's; eerste keer rechtsklik › Open. VST3/AU-bridge en VMPC2000XL zitten erin.

## 💬 AI-assistent (praat met de app)
Tik op de paarse **💬**-knop. Zeg in gewone taal wat je wilt (typen of 🎤 inspreken waar de browser dat kan):
- "Maak een trap-beat op 140 BPM met 808 en hi-hat rolls", "zet er jazzy akkoorden onder (Cm9 – Abmaj7 – Fm9 – G7alt)"
- "Zet Pro-Q op de zang en haal 300 Hz eruit", "open Valhalla op de master", "AI Mix en master voor Spotify"
- "Hoe klinkt mijn mix vergeleken met de referentie?" → meet LUFS, true peak, dynamiek, stereo en klankbalans per band en geeft genre-advies met frequenties, dB en ratio's
- **📎 Referentietrack**: laad een nummer dat je goed vindt klinken; de AI vergelijkt je mix ermee en AI Master kan het klankbeeld en de luidheid ervan volgen (doel "Zoals de referentietrack", genre "📎 Referentietrack").

De assistent draait op **Claude** met je eigen Anthropic API-sleutel (⚙️; maak er een op console.anthropic.com; je betaalt per gebruik). De sleutel blijft op je apparaat. Alles wat hij doet is met ↶ Ongedaan terug te draaien.

## Effecten, AI Mix & Master en VST3
**Effect-slots** (Mixer → FX bij een insert of de master, tot 10 per insert): Pro EQ (8 banden, sleep de punten in de curve, analyzer, low/high cut tot 48 dB/oct), Compressor (met parallel-mix), Multiband, Saturator (tape/buis/hard/fuzz), De-esser, Gate, Transient shaper, Reverb (room/chamber/hall/plate/vintage/kathedraal/spring), Delay (ping-pong, tempo-sync), Chorus/Flanger, Stereo Imager (met bas mono), Utility en een Limiter met lookahead en true-peak plafond. Alles klinkt ook in de WAV-export.

**🤖 AI Mix**: meet elk spoor (LUFS, pieken, crest factor, spectrum per terts), herkent de rol (drums, bas, zang, keys, pad, lead) en zet gain staging, EQ (low cut, modder, resonanties, presence, ruimte tussen kick/bas en zang/keys), compressie, de-esser, saturatie, panning en reverb/delay. Alles komt als gewone **AI**-slots in de inserts; ↶ Ongedaan zet alles terug.
**🎛️ AI Master**: kies een doel (Streaming −14, Apple −16, Pop −10, Hip-hop −9, Club −8, Dynamisch −16 LUFS) en een genre. De AI vergelijkt je mix met een doelcurve en bouwt EQ → multiband → glue → tape → stereo → limiter; de luidheid wordt gemeten tot het doel is gehaald (true peak ≤ −1 dBTP). Met **A/B** vergelijk je op gelijk volume.

**🔌 VST3** (Windows/Mac): je eigen plugins (FabFilter Pro-Q 4, Valhalla, sonible, iZotope, Waves …) via de bridge met Spotify's *pedalboard*.
- Windows-app: de bridge zit erin en start vanzelf. Mixer → insert → *VST3-plugins* → zoeken → **+ Toevoegen**.
- **🪟 Venster** opent het echte venster van de plugin op je pc; **↻ Ophalen** bewaart de instellingen in je project.
- **Parameters**: alle parameters als schuifjes. **🤖 AI → plugin**: zet de AI-EQ in Pro-Q (banden, frequentie, gain, Q, vorm) of de AI-compressie in een compressor-plugin.
- **🧊 Freeze**: rendert de sporen van een insert door de plugin-keten naar een nieuw audiospoor. **🎚️ Master door VST3 → WAV**: je mix door bijv. Ozone en direct als WAV.
- Plugins renderen *offline* (zoals freeze in FL); live meespelen door een VST3 kan een browser-app niet.
- Telefoon/browser + pc: start **MPC-Touch-Bridge.exe** (uit de release) of `bridge\start_windows.bat`, en open de app via het http-adres dat de bridge toont.

## Telefoon: FL-weergave van de playlist
Op een telefoon of tablet opent de Playlist automatisch in **FL-weergave**: de playlist vult het scherm, één scrollbare werkbalk, compacte sporen. Knijp met **twee vingers** om in te zoomen. Dubbeltik een clip: de piano roll schuift van onderen in beeld (in liggende stand op volledig scherm). Knop ⛶/⤡ wisselt tussen FL-weergave en normaal.

## Piano: 88 toetsen, 15 instrumenten, akkoorden en toonladders
- **Instrumenten**: Piano, E-piano (Rhodes), Orgel, Klokjes, Bass, 808 Sub, Gitaar, Pluck, Strijkers, Pad, Koor, Brass, Fluit, Synth, Lead + je eigen sampler-instrumenten. Wisselen in de Piano-tab of in de piano roll (geldt voor het gearmde spoor).
- **Klavier** A0–C8, scrollen met de strook erboven of ◀ ▶, toetsbreedte − / +. *Toonladder tonen*, *Alleen toonladder* (nooit een verkeerde noot) en *Akkoordmodus* (elke toets = akkoord).
- **Akkoorden**: 17 standaard en 31 jazz (maj9, m11, 13♯11, 7alt, So What …), op elke grondtoon, met voicings (omkeringen, drop 2/3, shell, rootless A/B, gespreid). *In toonsoort* = diatonische drie- en vierklanken; *Progressies* = ii–V–I, turnaround, neo-soul, 12-bar blues …
- **Toonladders**: 42, waaronder alle modi, melodisch mineur-modi (altered, lydisch dominant), bebop, blues, pentatonisch, symmetrisch en wereldtoonladders.
- **Duur** 1/32 tot 4 maten. Met **Stap-invoer** gaat elk akkoord, elke progressie of toonladder achter elkaar de piano roll in.

## Piano roll (FL-tools)
Tools: ✏️ Teken (P) · 🖌️ Penseel (B) · ⬚ Selecteer (E) · 🧽 Wis (D) · 🔇 Demp (T) · ✂️ Knip (C) · 🎹 Stempel (S, akkoord of toonladder) · 🔊 Speel (Y).
Tools-menu: Quantize (sterkte + eindes, Q), Legato (Ctrl+L), Humanize, Arpeggio (↑ ↓ ↕ 🎲), Strum, Chop, Glue, Flip horizontaal/verticaal, Naar toonladder, Octaaf erbij, Lengte = raster / ½ / ×2, Velocity willekeurig / crescendo / decrescendo / 100, Dubbele noten weg, Selectie omkeren.
Velocity-strook onderin (sleep om te tekenen), toonladder-markering, verticale zoom en knijp-zoom; nieuwe noten krijgen de laatst gebruikte lengte (zoals in FL).

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

## High-end geluiden
13 echte opgenomen instrumenten (⭐ in de instrumentkeuze: Steinway-vleugel, FM E-piano, tenorsax, vibrafoon, marimba, harp, kalimba, strijkersensemble, pizzicato, contrabas, trompet, hoorn, fluit) en 3 drumkits (Studio Akoestisch, Trap / Hip-hop, Afro & Latin) in `www/samples/`.
Bronnen: VCSL en VSCO-2-CE (beide CC0, ook commercieel vrij te gebruiken) plus eigen ontworpen synth-drums. Zie `www/samples/CREDITS.txt`. Opnieuw bouwen: `python3 tools/build_samples.py <VCSL> <VSCO-2-CE>`.
