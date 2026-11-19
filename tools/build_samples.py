#!/usr/bin/env python3
"""
Bouwt de ingebouwde geluidsbibliotheek van MPC Touch Studio (www/samples/).

Bronnen (alles commercieel bruikbaar):
  - VCSL  – Versilian Community Sample Library (CC0)   https://github.com/sgossner/VCSL
  - VSCO 2 CE – Versilian Studios Chamber Orchestra 2 Community Edition (CC0)  https://github.com/sgossner/VSCO-2-CE
  - Eigen ontworpen synthese-drums (808, kicks, hats …) – © Digital Ground / MPC Touch Studio

Gebruik:  python3 tools/build_samples.py <pad-naar-VCSL-clone> <pad-naar-VSCO-2-CE-clone>
(clones mogen 'git clone --filter=blob:none --no-checkout' zijn; bestanden worden per stuk opgehaald)
"""
import io, json, warnings
warnings.filterwarnings('ignore')
import io as _io, math, os, re, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly, butter, sosfilt

VCSL, VSCO = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "www", "samples")
SR = 44100
NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
FILES = {r: subprocess.run(["git", "-C", r, "ls-tree", "-r", "--name-only", "HEAD"], capture_output=True, text=True).stdout.splitlines() for r in (VCSL, VSCO)}


def midi(n):  # "C4" = 60
    m = re.match(r"([A-G]#?)(-?\d)$", n)
    return (int(m.group(2)) + 1) * 12 + NOTE[m.group(1)]


def pick(repo, pattern):
    rx = re.compile(pattern)
    hits = sorted(f for f in FILES[repo] if rx.search(f))
    if not hits:
        raise SystemExit(f"Niet gevonden: {pattern}")
    return hits[0]


def load(repo, path):
    data = subprocess.run(["git", "-C", repo, "cat-file", "-p", f"HEAD:{path}"], capture_output=True, check=True).stdout
    sr, x = wavfile.read(io.BytesIO(data))
    if x.dtype == np.int16:
        x = x / 32768.0
    elif x.dtype == np.int32:
        x = x / 2147483648.0
    elif x.dtype == np.uint8:
        x = (x - 128) / 128.0
    x = x.astype(np.float64)
    if x.ndim == 1:
        x = x[:, None]
    if sr != SR:
        g = math.gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    return x


def trim(x, seconds, fade=0.25, thresh_db=-45):
    pk = np.max(np.abs(x)) + 1e-12
    idx = np.where(np.max(np.abs(x), axis=1) > pk * 10 ** (thresh_db / 20))[0]
    start = max(0, (idx[0] if len(idx) else 0) - int(0.002 * SR))
    x = x[start:start + int(seconds * SR)].copy()
    n = min(len(x), int(fade * SR))
    if n > 0:
        x[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
    return x


def write_mp3(x, path, channels):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if channels == 1 and x.shape[1] > 1:
        x = x.mean(axis=1, keepdims=True)
    if channels == 2 and x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    x = np.clip(x, -1, 1)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t:
        wavfile.write(t.name, SR, (x * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", t.name, "-codec:a", "libmp3lame", "-q:a", "4", "-ac", str(channels), path], check=True)
        os.unlink(t.name)


def f0(x, fmin=25, fmax=2500):  # YIN-toonhoogte (robuust tegen octaaffouten)
    s = x.mean(axis=1)[int(0.04 * SR):int(0.04 * SR) + 4096]
    if len(s) < 4096:
        return None
    s = s - s.mean()
    W = 2048; tmax = min(int(SR / fmin), len(s) - W)
    d = np.array([np.sum((s[:W] - s[t:t + W]) ** 2) for t in range(1, tmax)])
    cmnd = d * np.arange(1, tmax) / np.maximum(np.cumsum(d), 1e-12)
    lo = int(SR / fmax)
    idx = np.where(cmnd[lo:] < 0.15)[0]
    if len(idx):
        k = lo + idx[0]
        while k + 1 < len(cmnd) and cmnd[k + 1] < cmnd[k]:
            k += 1
    else:
        k = lo + int(np.argmin(cmnd[lo:]))
    return SR / (k + 1)


# ------------------------------------------------------------------ instrumenten
# id: (naam, repo, map, bestandspatroon met {n} (noot) en {v} (laag), noten, lagen [(waarde, max-velocity)], duur(s), kanalen, release, modus)
def every(names, step):
    return names[::step]


STEINWAY = ['A#0', 'C1', 'D1', 'E1', 'F#1', 'G#1', 'A#1', 'C2', 'D2', 'E2', 'F#2', 'G#2', 'A#2', 'C3', 'D3', 'E3', 'F#3', 'G#3', 'A#3', 'C4', 'D4', 'E4', 'F#4', 'G#4', 'A#4', 'C5', 'D5', 'E5', 'F#5', 'G#5', 'A#5', 'C6', 'D6', 'E6', 'F#6', 'G#6', 'A#6', 'C7', 'D7', 'E7', 'F#7', 'G#7']


def notes_in(repo, folder, rx):
    out = set()
    for f in FILES[repo]:
        if f.startswith(folder):
            m = re.search(rx, f.split("/")[-1])
            if m:
                g = next((x for x in m.groups() if x), None)
                if g:
                    out.add(g)
    return sorted(out, key=midi)


INSTRUMENTS = {}


def inst(id, name, repo, folder, fname, notes, layers, dur, ch, release, mode="hold", dur_hi=None, gain_db=0):
    INSTRUMENTS[id] = dict(name=name, repo=repo, folder=folder, fname=fname, notes=notes, layers=layers, dur=dur, dur_hi=dur_hi or dur, ch=ch, release=release, mode=mode, gain_db=gain_db)


inst("grand", "🎹 Steinway-vleugel", VCSL, "Chordophones/Zithers/Grand Piano, Steinway B/NoSus/", r"JHPiano_NoSus_Close_{n}_{v}_rr1\.wav",
     every(STEINWAY, 2), [("vl2", 84), ("vl4", 127)], 7, 2, 0.35, dur_hi=3)
inst("fmep", "🎹 FM E-piano (DX)", VCSL, "Electrophones/TX81Z/FM Piano/", r"FMPiano_{n}_{v}\.wav",
     None, [("vl2", 90), ("vl3", 127)], 4, 1, 0.3, dur_hi=2.5)
inst("tsax", "🎷 Tenorsax", VCSL, "Aerophones/Reed Aerophones/Tenor Saxophone/", r"BrettTenor_NV_Main_{n}_{v}_rr1\.wav",
     None, [("vl3", 127)], 3.5, 1, 0.15)
inst("vibes", "🔔 Vibrafoon", VCSL, "Idiophones/Struck Idiophones/Vibraphone/", r"Vibes_hard_{n}_{v}_rr1_Main\.wav",
     None, [("v2", 90), ("v3", 127)], 4, 1, 0.6, mode="oneshot")
inst("marimba", "🪵 Marimba", VCSL, "Idiophones/Struck Idiophones/Marimba/", r"Marimba_hit_Outrigger_{n}_{v}_01\.wav",
     None, [("med", 90), ("loud", 127)], 2.5, 1, 0.3, mode="oneshot")
inst("harp", "🪕 Concertharp", VCSL, "Chordophones/Composite Chordophones/Concert Harp/", r"KSHarp_{n}_{v}\.wav",
     None, [("mf1", 90), ("f1", 127)], 3.5, 2, 0.5, mode="oneshot")
inst("kalimba", "🎐 Kalimba", VCSL, "Idiophones/Plucked Idiophones/Kalimba, Kenya/", r"Mbira6_Normal_MainSpirit_{n}_k\d+_{v}_rr2\.wav",
     None, [("vl3", 127)], 2.5, 1, 0.3, mode="oneshot")
inst("ensemble", "🎻 Strijkersensemble", VSCO, "Strings/", r"(?:VlnEns_susVib_{n}_{v}|susvib_{n}_{v}_1)\.wav",
     None, [("v2|v3", 127)], 6, 2, 0.6)
inst("pizz", "🎻 Strijkers pizzicato", VSCO, "Strings/", r"(?:VlnEns_Pizz_{n}_{v}_rr1|pizzT_{n}_{v}_RR1)\.wav",
     None, [("v2", 127)], 1.6, 2, 0.15, mode="oneshot")
inst("upbass", "🎸 Contrabas (jazz)", VSCO, "Strings/Solo Contrabass/Pizz/", r"BKCtbss_Pizz_{n}_{v}_rr1\.wav",
     None, [("v1", 84), ("v3", 127)], 2.5, 1, 0.12, mode="oneshot")
inst("trumpet", "🎺 Trompet", VSCO, "Brass/Trumpet/sus/", r"_sus_{n}_{v}_rr1\.wav",
     None, [("v1", 84), ("v3", 127)], 3, 1, 0.15)
inst("horn", "📯 Hoorn", VSCO, "Brass/F Horn/sus/", r"_sus_{n}_{v}_1\.wav",
     None, [("v1", 84), ("v2", 127)], 3.5, 1, 0.25)
inst("flute", "🪈 Fluit", VSCO, "Woodwinds/Flute/susNV/", r"_susNV_{n}_{v}_1\.wav",
     None, [("v1", 84), ("v2", 127)], 3, 1, 0.15)


def build_instruments(manifest):
    for id, d in INSTRUMENTS.items():
        repo = d["repo"]
        lay_names = [l[0] for l in d["layers"]]
        frx = d["fname"].replace("{n}", r"([A-G]#?\d)").replace("{v}", "(?:%s)" % "|".join(lay_names))
        notes = d["notes"] or notes_in(repo, d["folder"], frx)
        if d["notes"] is None and len(notes) > 16:
            notes = notes[::max(1, round(len(notes) / 16))]
        raw, zones = [], []
        for li, (lv, maxv) in enumerate(d["layers"]):
            for n in notes:
                rx = d["fname"].replace("{n}", re.escape(n)).replace("{v}", "(?:%s)" % lv)
                try:
                    path = pick(repo, "^" + re.escape(d["folder"]) + ".*" + rx + "$")
                except SystemExit:
                    continue
                m = midi(n)
                frac = (m - 21) / 87
                x = trim(load(repo, path), d["dur"] + (d["dur_hi"] - d["dur"]) * max(0, min(1, frac)))
                raw.append((x, n, m, li, maxv))
        if not raw:
            print("!!", id, "geen samples"); continue
        offs = []
        for x, n, m, li, maxv in raw:
            if li != len(d["layers"]) - 1 or not (26 <= m <= 96):
                continue
            f = f0(x)
            if f:
                offs.append(12 * math.log2(f / (440 * 2 ** ((m - 69) / 12))))
        shift = int(round(np.median(offs) / 12) * 12) if offs else 0
        spread = float(np.median([abs(o - shift) for o in offs])) if offs else 0
        if shift:
            raw = [(x, n, m + shift, li, maxv) for x, n, m, li, maxv in raw]
        peak = max(np.max(np.abs(x)) for x, *_ in raw)
        scale = 10 ** ((-1 + d["gain_db"]) / 20) / peak
        for x, n, m, li, maxv in raw:
            fn = f"{n.replace('#', 's')}_{li}.mp3"
            write_mp3(x * scale, os.path.join(OUT, "inst", id, fn), d["ch"])
            zones.append({"f": fn, "root": m, "v": maxv})
        print(f"{id:9s} {len(zones):3d} zones  octaafcorrectie {shift:+d} halve tonen  (afwijking na correctie ~{spread:.2f} halve toon, {len(offs)} metingen)")
        manifest["instruments"][id] = {"name": d["name"], "release": d["release"], "mode": d["mode"], "zones": sorted(zones, key=lambda z: (z["v"], z["root"]))}


# ------------------------------------------------------------------ synthese-drums (eigen ontwerp)
def t(sec): return np.arange(int(sec * SR)) / SR
def env(sec, decay, attack=0.001):
    tt = t(sec); a = np.minimum(1, tt / max(attack, 1e-4)); return a * np.exp(-tt / decay)
def sat(x, drive): return np.tanh(x * drive) / np.tanh(drive)
def hp(x, f, order=2): return sosfilt(butter(order, f, "hp", fs=SR, output="sos"), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, "lp", fs=SR, output="sos"), x)
def bp(x, f1, f2, order=2): return sosfilt(butter(order, [f1, f2], "bp", fs=SR, output="sos"), x)
def noise(sec, seed=1): return np.random.default_rng(seed).uniform(-1, 1, int(sec * SR))
def sweep_sine(sec, f_start, f_end, k):
    tt = t(sec); f = f_end + (f_start - f_end) * np.exp(-tt * k); return np.sin(2 * np.pi * np.cumsum(f) / SR)
def mono(x): return x[:, None] if x.ndim == 1 else x


def s_808(long=True, f=41.2):
    sec = 3.2 if long else 0.9
    body = sweep_sine(sec, f * 3.2, f, 38) * env(sec, 1.15 if long else 0.32, 0.002)
    click = lp(noise(0.02, 3), 4000) * env(0.02, 0.004)
    x = sat(body * 1.9, 2.4); x[:len(click)] += click * 0.35
    return x


def s_kick(punch=True):
    sec = 0.55
    body = sweep_sine(sec, 230 if punch else 180, 52 if punch else 46, 55 if punch else 40) * env(sec, 0.16 if punch else 0.22, 0.0008)
    click = hp(noise(0.012, 5), 1500) * env(0.012, 0.0025)
    x = body.copy(); x[:len(click)] += click * (0.6 if punch else 0.3)
    return sat(x * (1.6 if punch else 2.6), 2.0 if punch else 3.5)


def s_snare_trap():
    sec = 0.45
    tone = (np.sin(2 * np.pi * 185 * t(sec)) + 0.5 * np.sin(2 * np.pi * 330 * t(sec))) * env(sec, 0.06)
    n = bp(noise(sec, 7), 1800, 9000) * env(sec, 0.13)
    return sat(tone * 0.7 + n * 0.9, 1.8)


def s_clap_synth():
    sec = 0.6; x = np.zeros(int(sec * SR)); n = bp(noise(sec, 9), 900, 6000)
    for i, d in enumerate([0, 0.011, 0.022, 0.034]):
        s = int(d * SR); L = len(x) - s; e = np.exp(-np.arange(L) / SR / (0.009 if i < 3 else 0.14)); x[s:] += n[:L] * e
    return x


def s_hat(open_=False):
    sec = 0.6 if open_ else 0.09
    tt = t(sec); m = np.zeros_like(tt)
    for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        m += np.sign(np.sin(2 * np.pi * f * 1.7 * tt))
    m = hp(bp(m / 6 + noise(sec, 11) * 0.5, 6000, 16000), 7000)
    return m * env(sec, 0.22 if open_ else 0.022, 0.0005)


def s_rim():
    sec = 0.12; tt = t(sec)
    return sat((np.sin(2 * np.pi * 1700 * tt) * 0.6 + bp(noise(sec, 13), 2000, 6000)) * env(sec, 0.012), 2)


def s_snap():
    sec = 0.25; n = bp(noise(sec, 17), 1200, 5000)
    x = n * env(sec, 0.035, 0.0006); x[:int(0.004 * SR)] *= 3
    return x


def s_perc():
    sec = 0.18; return sweep_sine(sec, 1600, 700, 60) * env(sec, 0.03)


def s_tom808(f=110):
    sec = 0.9; return sat(sweep_sine(sec, f * 1.6, f, 18) * env(sec, 0.28), 1.4)


def s_cow808():
    sec = 0.5; tt = t(sec)
    x = np.sign(np.sin(2 * np.pi * 540 * tt)) + np.sign(np.sin(2 * np.pi * 800 * tt))
    return bp(x * 0.4, 500, 3000) * (env(sec, 0.06) * 0.7 + env(sec, 0.25) * 0.3)


def s_logdrum():
    sec = 1.2; body = sweep_sine(sec, 140, 70, 25) * env(sec, 0.35, 0.002)
    return sat(body * 2.2 + 0.15 * np.sin(2 * np.pi * 140 * t(sec)) * env(sec, 0.08), 2.2)


def s_kick_round():
    sec = 0.6; return sat(sweep_sine(sec, 150, 55, 30) * env(sec, 0.2, 0.002), 1.5)


def norm(x, db=-1.0):
    x = mono(np.asarray(x, dtype=np.float64)); return x / (np.max(np.abs(x)) + 1e-12) * 10 ** (db / 20)


def layer(*parts):
    n = max(len(p) for p, _ in parts); out = np.zeros((n, 1))
    for p, g in parts:
        p = norm(p, 0)
        if p.shape[1] > 1:
            p = p.mean(axis=1, keepdims=True)
        out[:len(p)] += p * g
    return out


def real(repo, rx, sec, thresh=-50):
    return trim(load(repo, pick(repo, rx)), sec, fade=min(0.15, sec / 4), thresh_db=thresh)


def build_kits(manifest):
    V, S = VCSL, VSCO
    pinfo = lambda p: "Idiophones/Struck Idiophones/" + p
    pmem = lambda p: "Membranophones/Struck Membranophones/" + p
    kits = {
        "studio": ("🥁 Studio Akoestisch", [
            ("Kick", lambda: layer((real(S, r"VSCO 1 Percussion/drums/.*bdrum_muted_fff", 0.7)[:, :1], 1.0), (s_kick(True), 0.55))),
            ("Snare", lambda: real(V, pmem(r"Snare Drum, Modern 1/.*_v5_rr1"), 0.7)),
            ("Snare zacht", lambda: real(V, pmem(r"Snare Drum, Modern 1/.*_v2_rr1"), 0.6)),
            ("Rimshot", lambda: real(S, r"VSCO 1 Percussion/drums/.*snare1_rimshot_f", 0.6)),
            ("Hi-hat dicht", lambda: real(V, pinfo(r"Hi-Hat Cymbal/HiHat_HitC_v3_rr1"), 0.35)),
            ("Hi-hat open", lambda: real(V, pinfo(r"Hi-Hat Cymbal/HiHat_HitO_rr1"), 1.4)),
            ("Hi-hat pedaal", lambda: real(V, pinfo(r"Hi-Hat Cymbal/HiHat_Close_rr1"), 0.3)),
            ("Clap", lambda: real(V, pinfo(r"Claps/Clap_rr1"), 0.6)),
            ("Tom hoog", lambda: real(V, pmem(r"Tom 1/.*_v4_rr1"), 1.0)),
            ("Tom laag", lambda: real(V, pmem(r"Tom 2/.*_v4_rr1"), 1.2)),
            ("Crash", lambda: real(V, pinfo(r"Suspended Cymbal 2/susCymb2_hit_f1"), 3.0)),
            ("Ride", lambda: real(V, pinfo(r"Suspended Cymbal 2/susCymb2_hit_stick_mf1"), 2.0)),
            ("Tamboerijn", lambda: real(V, pinfo(r"Tambourine 1/Tamb1_Hit_v2"), 0.6)),
            ("Shaker", lambda: real(V, pinfo(r"Shaker, Small/Mid_ShakerDouble_Down_rr1"), 0.5)),
            ("Cowbell", lambda: real(V, pinfo(r"Cowbells/Cowbell1_Hit_v3"), 0.6)),
            ("Sidestick", lambda: real(S, r"VSCO 1 Percussion/drums/.*snare1_click", 0.4)),
        ]),
        "trap": ("🔥 Trap / Hip-hop", [
            ("808 Boom", lambda: s_808(True)), ("808 Kort", lambda: s_808(False)), ("Kick Punch", lambda: s_kick(True)), ("Kick Hard", lambda: s_kick(False)),
            ("Snare Trap", lambda: layer((s_snare_trap(), 0.8), (real(V, pmem(r"Snare Drum, Modern 1/.*_v5_rr1"), 0.45), 0.5))),
            ("Clap", lambda: layer((real(V, pinfo(r"Claps/Clap_rr2"), 0.6), 0.8), (s_clap_synth(), 0.7))),
            ("Hi-hat", lambda: s_hat(False)), ("Hi-hat open", lambda: s_hat(True)), ("Rim", s_rim), ("Snap", s_snap), ("Perc", s_perc),
            ("Shaker", lambda: real(V, pinfo(r"Shaker, Small/Mid_ShakerHighFaster_Down_rr1"), 0.4)),
            ("Crash", lambda: real(V, pinfo(r"Suspended Cymbal 2/susCymb2_hit_fff1"), 3.0)),
            ("Tom 808", lambda: s_tom808(110)), ("Cowbell 808", s_cow808),
            ("Reverse crash", lambda: real(V, pinfo(r"Suspended Cymbal 2/susCymb2_hit_f1"), 2.0)[::-1]),
        ]),
        "afro": ("🌍 Afro & Latin", [
            ("Kick", s_kick_round),
            ("Conga open", lambda: real(V, pmem(r"Conga/Conga_HitN_v2_rr1"), 0.8)),
            ("Conga slap", lambda: real(V, pmem(r"Conga/Conga_HitFM_v2_rr1"), 0.6)),
            ("Bongo hoog", lambda: real(V, pmem(r"Bongos/BongoH_Hit1_v3_rr1"), 0.5)),
            ("Bongo laag", lambda: real(V, pmem(r"Bongos/BongoL_.*_v3_rr1"), 0.6)),
            ("Cajon bas", lambda: real(V, pinfo(r"Cajon/Cajon_hit1_fff_rr1"), 0.6)),
            ("Cajon slap", lambda: real(V, pinfo(r"Cajon/Cajon_hit[2-9]_f+_rr1"), 0.5)),
            ("Shaker", lambda: real(V, pinfo(r"Shaker, Small/Mid_ShakerDouble_Up_rr1"), 0.5)),
            ("Agogo hoog", lambda: real(V, pinfo(r"Agogo Bells/Agogo_High_v2_rr1"), 0.8)),
            ("Agogo laag", lambda: real(V, pinfo(r"Agogo Bells/Agogo_Low_v2_rr1"), 0.8)),
            ("Cowbell", lambda: real(V, pinfo(r"Cowbells/Cowbell1_Normal_v2"), 0.6)),
            ("Claves", lambda: real(V, pinfo(r"Claves/"), 0.4)),
            ("Guiro", lambda: real(V, pinfo(r"Guiro/"), 0.8)),
            ("Tamboerijn", lambda: real(V, pinfo(r"Tambourine 1/Tamb1_Hit_v1"), 0.6)),
            ("Djembe", lambda: real(S, r"VSCO 1 Percussion/drums/.*EthnicLargeHand_hit_f", 0.8)),
            ("Log drum", s_logdrum),
        ]),
    }
    for kid, (kname, pads) in kits.items():
        out = []
        for i, (nm, fn) in enumerate(pads):
            x = norm(fn(), -1.0)
            f = f"{i + 1:02d}.mp3"
            write_mp3(x, os.path.join(OUT, "kits", kid, f), 1)
            out.append({"f": f, "name": nm})
        manifest["kits"][kid] = {"name": kname, "pads": out}
        print(f"kit {kid}: {len(out)} pads")


if __name__ == "__main__":
    manifest = {"version": 1, "instruments": {}, "kits": {}}
    build_kits(manifest)
    build_instruments(manifest)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "CREDITS.txt"), "w") as f:
        f.write("""MPC Touch Studio — ingebouwde klanken

Opnames uit:
- VCSL – Versilian Community Sample Library, Versilian Studios — CC0 1.0 (publiek domein)
  https://github.com/sgossner/VCSL
- VSCO 2 CE – Versilian Studios Chamber Orchestra 2 Community Edition — CC0 1.0 (publiek domein)
  https://github.com/sgossner/VSCO-2-CE
Bewerkt (ingekort, genormaliseerd, gelaagd) voor MPC Touch Studio.
Synthese-drums (808, kicks, hats, rim, snap, perc, log drum): eigen ontwerp, Digital Ground.
""")
    total = sum(os.path.getsize(os.path.join(d, x)) for d, _, fs in os.walk(OUT) for x in fs)
    print(f"Klaar: {total / 1048576:.1f} MB in {OUT}")
