"""
VST3-host voor MPC Touch Studio (Windows / macOS).

Laadt je eigen VST3-plugins (FabFilter Pro-Q 4, Valhalla VintageVerb, sonible smart:comp,
iZotope Ozone/Neutron, Waves, ...) met Spotify's open-source 'pedalboard' (JUCE eronder):
- zoeken in de standaard VST3-mappen
- laden, het eigen venster van de plugin openen (op deze pc)
- parameters lezen en zetten (ook vanuit de AI in de app)
- presets/instellingen bewaren (raw_state)
- audio uit de app door een keten van plugins renderen ("freeze"/master-render)

Installeren:  pip install pedalboard numpy
"""
import base64, os, platform, queue, sys, threading, uuid

try:
    import numpy as np
    import pedalboard
    from pedalboard import Pedalboard, load_plugin
    HAVE = True
    ERR = None
    PB_VERSION = getattr(pedalboard, "__version__", "?")
except Exception as e:  # pragma: no cover - afhankelijk van de pc
    HAVE = False
    ERR = f"{type(e).__name__}: {e}"
    PB_VERSION = None

SYSTEM = platform.system()
MAX_PARAMS = 800


def search_dirs():
    d = []
    if SYSTEM == "Windows":
        for env, fb in (("COMMONPROGRAMFILES", r"C:\Program Files\Common Files"),
                        ("COMMONPROGRAMFILES(X86)", r"C:\Program Files (x86)\Common Files")):
            d.append(os.path.join(os.environ.get(env, fb), "VST3"))
        la = os.environ.get("LOCALAPPDATA")
        if la:
            d.append(os.path.join(la, "Programs", "Common", "VST3"))
    elif SYSTEM == "Darwin":
        d += ["/Library/Audio/Plug-Ins/VST3", os.path.expanduser("~/Library/Audio/Plug-Ins/VST3"),
              "/Library/Audio/Plug-Ins/Components", os.path.expanduser("~/Library/Audio/Plug-Ins/Components")]
    else:
        d += [os.path.expanduser("~/.vst3"), "/usr/lib/vst3", "/usr/local/lib/vst3"]
    extra = os.environ.get("MPC_VST3_PATH")
    if extra:
        d += [p for p in extra.split(os.pathsep) if p]
    seen, out = set(), []
    for p in d:
        k = os.path.normcase(os.path.abspath(p))
        if k not in seen and os.path.isdir(p):
            seen.add(k)
            out.append(p)
    return out


def scan():
    found = []
    for root in search_dirs():
        for dirpath, dirnames, filenames in os.walk(root):
            keep = []
            for dn in dirnames:
                if dn.lower().endswith((".vst3", ".component")):
                    found.append(_entry(os.path.join(dirpath, dn), root))
                else:
                    keep.append(dn)
            dirnames[:] = keep  # niet in een plugin-bundel duiken
            for fn in filenames:
                if fn.lower().endswith(".vst3"):
                    found.append(_entry(os.path.join(dirpath, fn), root))
    found.sort(key=lambda x: (x["vendor"].lower(), x["name"].lower()))
    return found


def _entry(path, root):
    rel = os.path.relpath(path, root)
    parts = rel.replace("\\", "/").split("/")
    name = os.path.splitext(parts[-1])[0]
    vendor = parts[0] if len(parts) > 1 else ""
    kind = "AU" if path.lower().endswith(".component") else "VST3"
    return {"path": path, "name": name, "vendor": vendor, "kind": kind}


class Host:
    def __init__(self):
        self.plugins = {}
        self.lock = threading.RLock()
        self.editor_q = queue.Queue()

    # ---------- laden ----------
    def names_in(self, path):
        try:
            if path.lower().endswith(".vst3"):
                return list(pedalboard.VST3Plugin.get_plugin_names_for_file(path))
            if path.lower().endswith(".component") and hasattr(pedalboard, "AudioUnitPlugin"):
                return list(pedalboard.AudioUnitPlugin.get_plugin_names_for_file(path))
        except Exception:
            pass
        return []

    def load(self, path, name=None, state=None):
        if not HAVE:
            raise RuntimeError("pedalboard is niet geïnstalleerd: " + str(ERR))
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        names = self.names_in(path)
        if len(names) > 1 and not name:
            return {"choose": names}
        plug = load_plugin(path, plugin_name=name) if name else load_plugin(path)
        pid = uuid.uuid4().hex[:10]
        with self.lock:
            self.plugins[pid] = {"plugin": plug, "path": path, "name": name or getattr(plug, "name", os.path.basename(path))}
        if state:
            self.set_state(pid, state)
        return self.info(pid)

    def unload(self, pid):
        with self.lock:
            self.plugins.pop(pid, None)
        return {"ok": True}

    def get(self, pid):
        p = self.plugins.get(pid)
        if not p:
            raise KeyError("plugin niet geladen (bridge opnieuw gestart?)")
        return p

    # ---------- parameters ----------
    def params(self, pid):
        p = self.get(pid)["plugin"]
        out = []
        for key, par in list(p.parameters.items())[:MAX_PARAMS]:
            d = {"key": key, "name": getattr(par, "name", key)}
            for attr, k in (("raw_value", "raw"), ("label", "units"), ("min_value", "min"), ("max_value", "max")):
                try:
                    v = getattr(par, attr)
                    d[k] = float(v) if k in ("raw", "min", "max") else str(v)
                except Exception:
                    pass
            try:
                d["text"] = str(getattr(p, key))
            except Exception:
                pass
            try:
                vv = getattr(par, "valid_values", None)
                if vv is not None and 1 < len(vv) <= 64:
                    d["valid"] = [str(x) for x in vv]
            except Exception:
                pass
            try:
                d["bool"] = getattr(par, "type", None) is bool
            except Exception:
                pass
            out.append(d)
        return out

    def info(self, pid):
        e = self.get(pid)
        p = e["plugin"]
        lat = 0
        try:
            lat = int(getattr(p, "reported_latency_samples", 0) or 0)
        except Exception:
            pass
        return {"id": pid, "name": e["name"], "path": e["path"], "instrument": bool(getattr(p, "is_instrument", False)),
                "latency": lat, "params": self.params(pid), "editor": hasattr(p, "show_editor")}

    def set_params(self, pid, changes):
        p = self.get(pid)["plugin"]
        errors = []
        with self.lock:
            for c in changes or []:
                key = c.get("key")
                try:
                    if "raw" in c:
                        p.parameters[key].raw_value = max(0.0, min(1.0, float(c["raw"])))
                    else:
                        setattr(p, key, c.get("value"))
                except Exception as ex:
                    errors.append(f"{key}: {ex}")
        return {"params": self.params(pid), "errors": errors}

    def get_state(self, pid):
        p = self.get(pid)["plugin"]
        try:
            return {"state": base64.b64encode(bytes(p.raw_state)).decode()}
        except Exception as ex:
            return {"state": None, "error": str(ex)}

    def set_state(self, pid, b64):
        p = self.get(pid)["plugin"]
        try:
            p.raw_state = base64.b64decode(b64)
            return {"ok": True}
        except Exception as ex:
            return {"ok": False, "error": str(ex)}

    # ---------- venster van de plugin ----------
    def request_editor(self, pid):
        self.get(pid)
        self.editor_q.put(pid)
        return {"ok": True}

    def editor_loop(self, stop_event):
        """Moet op de hoofdthread draaien (vereist door plugin-vensters)."""
        while not stop_event.is_set():
            try:
                pid = self.editor_q.get(timeout=0.25)
            except queue.Empty:
                continue
            try:
                p = self.get(pid)["plugin"]
                print(f"[vst] Venster open: {self.plugins[pid]['name']} (sluit het venster om verder te gaan)", flush=True)
                p.show_editor()
            except Exception as ex:
                print(f"[vst] Venster openen mislukt: {ex}", flush=True)

    # ---------- audio renderen ----------
    def process(self, ids, planar, channels, sr, tail_sec=0.0):
        if not HAVE:
            raise RuntimeError("pedalboard is niet geïnstalleerd")
        audio = np.frombuffer(planar, dtype="<f4").reshape(channels, -1).astype(np.float32)
        if tail_sec > 0:
            audio = np.concatenate([audio, np.zeros((channels, int(sr * tail_sec)), dtype=np.float32)], axis=1)
        chain = [self.get(i)["plugin"] for i in ids]
        for i in ids:
            if getattr(self.get(i)["plugin"], "is_instrument", False):
                raise RuntimeError(f"{self.get(i)['name']} is een instrument; instrumenten kunnen (nog) niet in een effectketen")
        with self.lock:
            out = Pedalboard(chain)(audio, float(sr), reset=True)
        out = np.asarray(out, dtype=np.float32)
        if out.ndim == 1:
            out = out[None, :]
        if out.shape[0] == 1 and channels == 2:
            out = np.vstack([out, out])
        return out[:channels].astype("<f4").tobytes(), out.shape[1]


def status():
    return {"available": HAVE, "error": ERR, "pedalboard": PB_VERSION, "system": SYSTEM, "dirs": search_dirs() if HAVE or True else [],
            "python": sys.version.split()[0]}
