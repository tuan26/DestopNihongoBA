#!/usr/bin/env python3
"""
Cross-check every seed entry (japanese headword + reading) against JMdict (EDRDG, CC BY-SA 4.0),
using the SQLite build shipped in the PyPI package `jamdict-data`.

Only *existence of the headword and its reading* is verified. Vietnamese meanings and example sentences are
NOT verified by this script and stay AI-generated.

Usage:
  python3 scripts/verify-jmdict.py                 # downloads jamdict-data into data/vocabulary/.verify-cache if needed
  JMDICT_DB=/path/jamdict.db python3 scripts/verify-jmdict.py
Writes data/vocabulary/verification.json; re-run `npm run vocab:generate` afterwards.
"""
import json, lzma, os, shutil, sqlite3, subprocess, sys, tarfile, unicodedata, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, "data", "vocabulary")
CACHE = os.path.join(VOCAB, ".verify-cache")


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def norm_reading(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    return kata_to_hira("".join(ch for ch in s if ch not in " 　・"))


def locate_db() -> str:
    env = os.environ.get("JMDICT_DB")
    if env and os.path.exists(env):
        return env
    os.makedirs(CACHE, exist_ok=True)
    found = glob.glob(os.path.join(CACHE, "**", "jamdict.db"), recursive=True)
    if found:
        return found[0]
    print("Downloading jamdict-data from PyPI …", file=sys.stderr)
    subprocess.check_call([sys.executable, "-m", "pip", "download", "--no-deps", "jamdict-data", "-d", CACHE])
    tgz = glob.glob(os.path.join(CACHE, "jamdict_data-*.tar.gz"))[0]
    with tarfile.open(tgz) as t:
        t.extractall(CACHE, filter="data")
    xz = glob.glob(os.path.join(CACHE, "**", "jamdict.db.xz"), recursive=True)[0]
    out = xz[:-3]
    with lzma.open(xz) as src, open(out, "wb") as dst:
        shutil.copyfileobj(src, dst)
    return out


def is_kana(s: str) -> bool:
    return all("\u3040" <= c <= "\u30ff" for c in s)


def make_component_checker(db):
    cache = {}

    def readings_of(sub: str):
        if sub in cache:
            return cache[sub]
        out = set()
        if is_kana(sub):
            out.add(norm_reading(sub))
        else:
            ids = [r[0] for r in db.execute("SELECT idseq FROM Kanji WHERE text = ?", (sub,))]
            if ids:
                q = "SELECT text FROM Kana WHERE idseq IN (%s)" % ",".join("?" * len(ids))
                out = {norm_reading(r[0]) for r in db.execute(q, ids)}
        cache[sub] = out
        return out

    def check(jp: str, reading: str) -> bool:
        """True when jp can be segmented into JMdict headwords (or kana) whose readings concatenate to `reading`."""
        jp = unicodedata.normalize("NFKC", jp)
        memo = {}

        def go(i: int, k: int) -> bool:
            if i == len(jp):
                return k == len(reading)
            key = (i, k)
            if key in memo:
                return memo[key]
            ok = False
            for j in range(min(len(jp), i + 8), i, -1):
                sub = jp[i:j]
                if j - i == len(jp):  # whole-word match is handled elsewhere
                    continue
                for r in readings_of(sub):
                    if r and reading.startswith(r, k) and go(j, k + len(r)):
                        ok = True
                        break
                if ok:
                    break
            memo[key] = ok
            return ok

        return go(0, 0)

    return check


def main() -> int:
    db = sqlite3.connect(locate_db())
    version = dict(db.execute("SELECT key, value FROM meta").fetchall()).get("jmdict.version", "?")
    seed = json.load(open(os.path.join(VOCAB, "seed-v1.json"), encoding="utf-8"))
    results, counts, mismatches = {}, {}, []
    components_ok = make_component_checker(db)
    for e in seed["entries"]:
        jp, reading = e["japanese"], norm_reading(e["reading"])
        ids = [r[0] for r in db.execute("SELECT idseq FROM Kanji WHERE text = ?", (jp,))]
        kana_head = False
        if not ids:  # kana-only headword (e.g. katakana loanwords)
            ids = [r[0] for r in db.execute("SELECT idseq FROM Kana WHERE text = ?", (jp,))]
            kana_head = bool(ids)
        if not ids:
            match = "components" if components_ok(jp, reading) else "not-found"
        else:
            q = "SELECT text FROM Kana WHERE idseq IN (%s)" % ",".join("?" * len(ids))
            readings = {norm_reading(r[0]) for r in db.execute(q, ids)}
            if kana_head:
                readings.add(norm_reading(jp))
            if reading in readings:
                match = "headword+reading"
            else:
                match = "reading-mismatch"
                mismatches.append((e["id"], jp, e["reading"], sorted(readings)[:4]))
        counts[match] = counts.get(match, 0) + 1
        results[jp] = {"match": match, "source": f"JMdict (EDRDG) v{version}"}
    out = {
        "generated_at": datetime.date.today().isoformat(),
        "source": f"JMdict (Electronic Dictionary Research and Development Group, CC BY-SA 4.0) via jamdict-data, JMdict v{version}",
        "scope": "headword+reading = exact JMdict entry with this reading; components = compound split into JMdict headwords whose readings concatenate exactly to the given reading (compound itself not a JMdict entry); Vietnamese meaning and examples not verified",
        "counts": counts,
        "results": results,
    }
    with open(os.path.join(VOCAB, "verification.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(json.dumps(counts, ensure_ascii=False))
    for m in mismatches:
        print("READING MISMATCH", *m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
