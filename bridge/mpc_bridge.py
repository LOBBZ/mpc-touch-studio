#!/usr/bin/env python3
"""
MPC Touch Studio — netwerk-bridge (Mac, Windows, Linux)

Laat je iPhone/iPad (of een andere computer) via wifi MIDI naar je DAW sturen.
- Serveert de app op http://<ip-van-deze-computer>:8765/
- Ontvangt noten/CC/clock via WebSocket (/ws) en stuurt ze naar een MIDI-poort.
- Mac/Linux: maakt zelf een virtuele poort "MPC Touch Studio" (geen IAC nodig).
- Windows: gebruik een loopMIDI-poort (https://www.tobias-erichsen.de/software/loopmidi.html).

Alleen standaard-Python + python-rtmidi.  Starten:  python mpc_bridge.py
Opties: --port 8765  --pin 123456  --www ../www  --dry-run (zonder MIDI, voor testen)
"""
import argparse, asyncio, base64, hashlib, json, mimetypes, os, platform, random, socket, struct, sys, threading, time

VERSION = 2
FEATURES = ["clock", "virtual", "raw"]
VIRTUAL_NAME = "MPC Touch Studio"
IS_WINDOWS = platform.system() == "Windows"

# ---------------------------------------------------------------- MIDI ----
class MidiOut:
    """Dunne laag om python-rtmidi, thread-safe. In --dry-run worden berichten alleen gelogd."""
    def __init__(self, dry=False):
        self.dry = dry
        self.lock = threading.Lock()
        self.port = None
        self.name = ""
        self.virtual_label = f"{VIRTUAL_NAME} (virtuele poort)"
        self.rtmidi = None
        self.log = []
        if not dry:
            try:
                import rtmidi  # python-rtmidi
                self.rtmidi = rtmidi
            except ImportError:
                print("\n[!] python-rtmidi ontbreekt. Installeer met:  pip install python-rtmidi\n    De bridge draait nu zonder MIDI (dry-run).\n")
                self.dry = True

    def list_ports(self):
        if self.dry:
            return [self.virtual_label, "Test-poort (dry-run)"]
        out = self.rtmidi.MidiOut()
        names = out.get_ports()
        del out
        ports = [] if IS_WINDOWS else [self.virtual_label]
        return ports + [n for n in names if VIRTUAL_NAME not in n or IS_WINDOWS]

    def open(self, name):
        with self.lock:
            self._close()
            if self.dry:
                self.name = name
                return name
            out = self.rtmidi.MidiOut()
            if name == self.virtual_label:
                out.open_virtual_port(VIRTUAL_NAME)
            else:
                names = out.get_ports()
                if name not in names:
                    raise ValueError(f"Poort niet gevonden: {name}")
                out.open_port(names.index(name))
            self.port, self.name = out, name
            return name

    def _close(self):
        if self.port is not None:
            try:
                self.port.close_port()
            except Exception:
                pass
        self.port, self.name = None, ""

    def send(self, data):
        data = [int(b) & 0xFF for b in data]
        with self.lock:
            if self.dry:
                self.log.append(data)
                if len(self.log) > 2000:
                    del self.log[:1000]
                if data[0] != 0xF8:
                    print("  MIDI ->", " ".join(f"{b:02X}" for b in data))
                return
            if self.port is not None:
                self.port.send_message(data)

    def all_off(self):
        for ch in range(16):
            self.send([0xB0 | ch, 123, 0])
            self.send([0xB0 | ch, 120, 0])


# --------------------------------------------------------------- CLOCK ----
class Clock(threading.Thread):
    """MIDI Clock (24 ppq) met eigen thread voor strakke timing, ook op Windows."""
    def __init__(self, midi):
        super().__init__(daemon=True)
        self.midi, self.cv = midi, threading.Condition()
        self.running, self.bpm, self.next = False, 120.0, 0.0
        self.pending = []  # (tijd, bytes) — start/continue op exact moment

    def start_at(self, delay, bpm, action, spp):
        with self.cv:
            at = time.perf_counter() + max(0.0, delay)
            self.bpm = min(300.0, max(20.0, float(bpm)))
            if action == "continue" and spp > 0:
                self.pending = [(at, [0xF2, spp & 0x7F, (spp >> 7) & 0x7F]), (at, [0xFB])]
            else:
                self.pending = [(at, [0xFA])]
            self.next, self.running = at, True
            self.cv.notify()

    def tempo(self, bpm):
        with self.cv:
            self.bpm = min(300.0, max(20.0, float(bpm)))

    def stop(self):
        with self.cv:
            was = self.running
            self.running, self.pending = False, []
        if was:
            self.midi.send([0xFC])

    def run(self):
        while True:
            with self.cv:
                while not self.running:
                    self.cv.wait()
                target = self.next
            wait = target - time.perf_counter()
            if wait > 0.003:
                time.sleep(wait - 0.002)
            while time.perf_counter() < target:
                pass
            with self.cv:
                if not self.running or target != self.next:
                    continue
                for _, msg in self.pending:
                    self.midi.send(msg)
                self.pending = []
                self.midi.send([0xF8])
                self.next = target + 60.0 / (self.bpm * 24.0)


# ----------------------------------------------------------- WEBSOCKET ----
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

async def ws_send(writer, text):
    data = text.encode()
    n = len(data)
    head = bytes([0x81]) + (bytes([n]) if n < 126 else bytes([126]) + struct.pack(">H", n) if n < 65536 else bytes([127]) + struct.pack(">Q", n))
    writer.write(head + data)
    await writer.drain()

async def ws_frames(reader, writer):
    """Geeft tekstberichten terug; handelt ping/close af."""
    buf = b""
    while True:
        h = await reader.readexactly(2)
        fin, op, masked, n = h[0] & 0x80, h[0] & 0x0F, h[1] & 0x80, h[1] & 0x7F
        if n == 126:
            n = struct.unpack(">H", await reader.readexactly(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", await reader.readexactly(8))[0]
        if n > 1 << 20:
            raise ValueError("bericht te groot")
        mask = await reader.readexactly(4) if masked else b"\0\0\0\0"
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(await reader.readexactly(n)))
        if op == 8:
            writer.write(b"\x88\x00")
            await writer.drain()
            return
        if op == 9:
            writer.write(bytes([0x8A, len(payload)]) + payload)
            await writer.drain()
            continue
        if op in (0, 1):
            buf += payload
            if fin:
                yield buf.decode("utf-8", "replace")
                buf = b""


# -------------------------------------------------------------- SERVER ----
class Bridge:
    def __init__(self, args):
        self.args = args
        self.pin = args.pin or f"{random.randint(0, 999999):06d}"
        self.midi = MidiOut(args.dry_run)
        self.clock = Clock(self.midi)
        self.clock.start()
        self.www = os.path.abspath(args.www)
        self.loop = None

    # ---- MIDI-berichten uit de app
    def later(self, delay_ms, data):
        d = max(0, min(5000, int(delay_ms or 0))) / 1000.0
        if d <= 0.0005:
            self.midi.send(data)
        else:
            self.loop.call_later(d, self.midi.send, data)

    async def handle(self, msg, session, writer):
        t = msg.get("type")
        if t == "pair":
            if str(msg.get("pin", "")).strip() == self.pin:
                session["paired"] = True
                ports = self.midi.list_ports()
                await ws_send(writer, json.dumps({"type": "paired", "ports": ports, "selected": self.midi.name or None, "version": VERSION, "features": FEATURES}))
                print(f"[+] Gekoppeld: {session['peer']}")
            else:
                session["fails"] += 1
                await ws_send(writer, json.dumps({"type": "error", "message": "Onjuiste koppelcode"}))
                if session["fails"] >= 5:
                    raise ConnectionError("te veel foute pogingen")
            return
        if not session["paired"]:
            await ws_send(writer, json.dumps({"type": "error", "message": "Eerst koppelen met de PIN"}))
            return
        ch = lambda: max(0, min(15, int(msg.get("channel", 0))))
        b7 = lambda k, d=0: max(0, min(127, int(msg.get(k, d))))
        if t == "ports":
            await ws_send(writer, json.dumps({"type": "ports", "ports": self.midi.list_ports(), "selected": self.midi.name or None}))
        elif t == "select_port":
            try:
                name = self.midi.open(str(msg.get("name", "")))
                await ws_send(writer, json.dumps({"type": "port_selected", "name": name}))
                print(f"[MIDI] Uitgang: {name}")
            except Exception as e:
                await ws_send(writer, json.dumps({"type": "error", "message": f"Kan poort niet openen: {e}"}))
        elif t == "note":
            n, v, c = b7("note"), max(1, b7("velocity", 100)), ch()
            delay = int(msg.get("delay_ms", 0) or 0)
            self.later(delay, [0x90 | c, n, v])
            self.later(delay + max(5, min(60000, int(msg.get("duration_ms", 100) or 100))), [0x80 | c, n, 0])
        elif t == "noteon":
            self.midi.send([0x90 | ch(), b7("note"), max(1, b7("velocity", 100))])
        elif t == "noteoff":
            self.midi.send([0x80 | ch(), b7("note"), 0])
        elif t == "cc":
            self.midi.send([0xB0 | ch(), b7("cc"), b7("value")])
        elif t == "alloff":
            self.clock.stop()
            self.midi.all_off()
        elif t == "raw":
            data = [int(x) & 0xFF for x in (msg.get("bytes") or [])][:64]
            if data and data[0] >= 0x80:
                self.later(msg.get("delay_ms", 0), data)
        elif t == "clock":
            a = msg.get("action")
            if a in ("start", "continue"):
                self.clock.start_at(int(msg.get("delay_ms", 0) or 0) / 1000.0, msg.get("bpm", 120), a, max(0, min(16383, int(msg.get("spp", 0) or 0))))
            elif a == "stop":
                self.clock.stop()
            elif a == "tempo":
                self.clock.tempo(msg.get("bpm", 120))

    async def websocket(self, reader, writer, headers, peer):
        key = headers.get("sec-websocket-key", "")
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
        await writer.drain()
        session = {"paired": False, "fails": 0, "peer": peer}
        try:
            async for text in ws_frames(reader, writer):
                try:
                    msg = json.loads(text)
                    if isinstance(msg, dict):
                        await self.handle(msg, session, writer)
                except (ValueError, TypeError) as e:
                    await ws_send(writer, json.dumps({"type": "error", "message": f"Ongeldig bericht: {e}"}))
        except (asyncio.IncompleteReadError, ConnectionError, OSError):
            pass
        finally:
            if session["paired"]:
                print(f"[-] Verbinding gesloten: {peer}")
                self.clock.stop()
                self.midi.all_off()

    async def static(self, writer, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        full = os.path.abspath(os.path.join(self.www, rel))
        if not full.startswith(self.www + os.sep) or not os.path.isfile(full):
            body = b"Niet gevonden"
            writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % len(body) + body)
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".webmanifest"):
            ctype = "application/manifest+json"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            body = f.read()
        writer.write((f"HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
                      "Cache-Control: no-cache\r\nConnection: close\r\n\r\n").encode() + body)

    async def client(self, reader, writer):
        peer = writer.get_extra_info("peername")
        peer = f"{peer[0]}" if peer else "?"
        try:
            line = (await asyncio.wait_for(reader.readline(), 10)).decode("latin-1").strip()
            parts = line.split(" ")
            if len(parts) < 2:
                return
            method, path = parts[0], parts[1]
            headers = {}
            while True:
                h = (await asyncio.wait_for(reader.readline(), 10)).decode("latin-1").strip()
                if not h:
                    break
                k, _, v = h.partition(":")
                headers[k.strip().lower()] = v.strip()
            if path.startswith("/ws") and headers.get("upgrade", "").lower() == "websocket":
                await self.websocket(reader, writer, headers, peer)
            elif method in ("GET", "HEAD"):
                await self.static(writer, path)
        except (asyncio.TimeoutError, asyncio.IncompleteReadError, ConnectionError, OSError):
            pass
        finally:
            try:
                await writer.drain()
                writer.close()
            except Exception:
                pass

    async def main(self):
        self.loop = asyncio.get_running_loop()
        server = await asyncio.start_server(self.client, "0.0.0.0", self.args.port)
        ip = lan_ip()
        print("=" * 62)
        print("  MPC Touch Studio — bridge v%d %s" % (VERSION, "(dry-run, zonder MIDI)" if self.midi.dry else ""))
        print("=" * 62)
        print(f"  1. Zet je iPhone/iPad op hetzelfde wifi-netwerk.")
        print(f"  2. Open in Safari:   http://{ip}:{self.args.port}/")
        print(f"  3. Tab DAW / MIDI → adres: ws://{ip}:{self.args.port}/ws")
        print(f"  4. Koppelcode (PIN):  {self.pin}")
        print(f"  MIDI-poorten: {', '.join(self.midi.list_ports()) or '(geen)'}")
        if IS_WINDOWS:
            print("  Windows: maak eerst met loopMIDI een poort 'MPC Touch Studio'.")
        else:
            print(f"  Mac/Linux: kies '{self.midi.virtual_label}' — die verschijnt vanzelf in je DAW.")
        print("  Stoppen: Ctrl+C")
        print("=" * 62, flush=True)
        async with server:
            await server.serve_forever()


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser(description="MPC Touch Studio netwerk-bridge")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--pin", default=os.environ.get("MPC_PIN"))
    p.add_argument("--www", default=os.path.join(here, "..", "www"))
    p.add_argument("--dry-run", action="store_true", help="zonder MIDI, berichten alleen tonen")
    args = p.parse_args()
    if args.pin and not (len(args.pin) == 6 and args.pin.isdigit()):
        sys.exit("--pin moet 6 cijfers zijn")
    try:
        asyncio.run(Bridge(args).main())
    except KeyboardInterrupt:
        print("\nBridge gestopt.")


if __name__ == "__main__":
    main()
