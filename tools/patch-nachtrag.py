# -*- coding: utf-8 -*-
import sys, io, os

ADDON = sys.argv[1]

PATCHES = [
    ("Compat335.lua",
     "-- Gildenmitgliedschaft: IsGuildMember(guid) gibt es hier nicht",
     "-- Gildenmitgliedschaft: die GUID-Variante gibt es hier nicht", 1),
    ("Compat335.lua",
     "local src=RAID_CLASS_COLORS and RAID_CLASS_COLORS[k]",
     "local src=RAID_CLASS_COLORS and RAID_CLASS_COLORS[k]   -- GBBCOMPAT_OK", 1),
    ("LibGPIOptions.lua",
     'Options.Panel["scrollChild"..c]:SetSize(Options.CurrentPanel:GetWidth()-1,100)',
     'Options.Panel["scrollChild"..c]:SetWidth(Options.CurrentPanel:GetWidth()-1)\n'
     '\tOptions.Panel["scrollChild"..c]:SetHeight(100)', 1),
    ("LibGPIOptions.lua",
     "if but.ColTex.SetColorTexture then but.ColTex:SetColorTexture(1,1,1,1) else but.ColTex:SetTexture(1,1,1,1) end",
     "if but.ColTex.SetColorTexture then but.ColTex:SetColorTexture(1,1,1,1) else but.ColTex:SetTexture(1,1,1,1) end -- GBBCOMPAT_OK", 1),
]


def run():
    cache, eols, fails = {}, {}, []
    for fname, old, new, expect in PATCHES:
        path = os.path.join(ADDON, fname)
        if fname not in cache:
            with io.open(path, "r", encoding="utf-8", errors="surrogateescape", newline="") as fh:
                raw = fh.read()
            eols[fname] = "\r\n" if "\r\n" in raw else "\n"
            cache[fname] = raw.replace("\r\n", "\n")
        found = cache[fname].count(old)
        if found != expect:
            fails.append("%s: %d/%d fuer %r" % (fname, found, expect, old[:60]))
            continue
        cache[fname] = cache[fname].replace(old, new)
        print("  ok  %-22s %s" % (fname, old[:70]))
    if fails:
        print("\nFEHLGESCHLAGEN:")
        for f in fails:
            print("  " + f)
        return 1
    for fname, text in cache.items():
        out = text.replace("\n", eols[fname]) if eols[fname] == "\r\n" else text
        with io.open(os.path.join(ADDON, fname), "w", encoding="utf-8",
                     errors="surrogateescape", newline="") as fh:
            fh.write(out)
    print("\n%d Ersetzungen geschrieben." % len(PATCHES))
    return 0


sys.exit(run())
