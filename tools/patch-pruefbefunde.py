# -*- coding: utf-8 -*-
"""Behebt die 11 Befunde aus der Gegenpruefung des 3.3.5a-Ports."""
import sys, io, os

ADDON = sys.argv[1]

PATCHES = [

    # --- BLOCKER 1: ScrollFrame.ScrollBar gibt es in 3.3.5a nicht ---------------
    ("RequestList.lua",
     "GroupBulletinBoardFrame_ScrollFrame.ScrollBar.scrollStep=itemHight*2",
     "local scrollBar=GroupBulletinBoardFrame_ScrollFrame.ScrollBar\n"
     '\t\tor _G["GroupBulletinBoardFrame_ScrollFrameScrollBar"]\n'
     "\tif scrollBar then scrollBar.scrollStep=itemHight*2 end", 1),

    # --- BLOCKER 2: GetChecked liefert in 3.3.5a 1/nil statt true/false --------
    ("LibGPIOptions.lua",
     'Options.Vars[name .. "_db"] [Options.Vars[name]] = cbox:GetChecked()',
     'Options.Vars[name .. "_db"] [Options.Vars[name]] = cbox:GetChecked() and true or false', 1),

    # --- BLOCKER 3: OnHyperlinkEnter/-Leave gibt es auf einfachen Frames nicht --
    ("LibGPIToolBox.lua",
     'frame:SetScript("OnHyperlinkEnter",EnterHyperlink)',
     '-- 3.3.5a kennt diese Skripte nur auf ScrollingMessageFrame/SimpleHTML\n'
     '\tif frame.HasScript and frame:HasScript("OnHyperlinkEnter") then\n'
     '\t\tframe:SetScript("OnHyperlinkEnter",EnterHyperlink)', 1),
    ("LibGPIToolBox.lua",
     'frame:SetScript("OnHyperlinkLeave",LeaveHyperlink)',
     'frame:SetScript("OnHyperlinkLeave",LeaveHyperlink)\n\tend', 1),

    # --- MAJOR: GetScrollOffset heisst in 3.3.5a GetCurrentScroll --------------
    ("GroupList.lua",
     "self:SetScrollOffset(self:GetScrollOffset() + delta*5);",
     "local getOffset=self.GetScrollOffset or self.GetCurrentScroll\n"
     "\tif not getOffset then return end\n"
     "\tself:SetScrollOffset(getOffset(self) + delta*5);", 1),

    # --- MAJOR: Post-Knopf, GetChannelName liefert 0 statt nil -----------------
    ("Chat.lua",
     "local index = GetChannelName(ChannelName) -- It finds General is a channel at index 1",
     "local index = GetChannelName(ChannelName) -- 3.3.5a liefert 0, wenn der Kanal nicht betreten ist", 1),
    ("Chat.lua",
     "if (index~=nil) then",
     "if index~=nil and index>0 then", 1),
    ("Chat.lua",
     'SendChatMessage(Msg , "CHANNEL", nil, index);',
     'SendChatMessage(Msg , "CHANNEL", nil, index);\n'
     "\telse\n"
     '\t\tDEFAULT_CHAT_FRAME:AddMessage(GBB.MSGPREFIX.."Kanal nicht betreten: "..tostring(ChannelName))', 1),

    # --- MAJOR: FileDataIDs statt Texturpfaden --------------------------------
    ("LibGPIMinimapButton.lua",
     r'button:SetHighlightTexture(136477) --"Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight"',
     r'button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")', 1),
    ("LibGPIMinimapButton.lua",
     r'overlay:SetTexture(136430) --"Interface\\Minimap\\MiniMap-TrackingBorder"',
     r'overlay:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")', 1),
    ("LibGPIMinimapButton.lua",
     r'background:SetTexture(136467) --"Interface\\Minimap\\UI-Minimap-Background"',
     r'background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")', 1),

    # --- MINOR: XML-Attribute, die 3.3.5a nicht kennt --------------------------
    ("GroupBulletinBoard.xml",
     '<ScrollingMessageFrame enableMouseWheel="true" name="GroupBulletinBoardFrame_GroupFrame"  parentKey="MessageFrame" enableMouseClicks="true" >',
     '<ScrollingMessageFrame name="GroupBulletinBoardFrame_GroupFrame"  parentKey="MessageFrame" enableMouse="true" >', 1),
    ("GroupList.lua",
     "GroupBulletinBoardFrame_GroupFrame:SetFading(false);",
     "GroupBulletinBoardFrame_GroupFrame:SetFading(false);\n"
     "\t-- enableMouseWheel ist in 3.3.5a kein XML-Attribut, darum hier\n"
     "\tGroupBulletinBoardFrame_GroupFrame:EnableMouseWheel(true)", 1),

    # --- MINOR: Fehlschlaege nicht dauerhaft zwischenspeichern -----------------
    ("GroupList.lua", "if guildcache[entry.name]==nil then", "if not guildcache[entry.name] then", 1),
    ("GroupList.lua", "if friendcache[entry.name]==nil then", "if not friendcache[entry.name] then", 1),

    # --- MINOR: Heroic-Filter war auf Stufe 70 verdrahtet ----------------------
    ("GroupBulletinBoard.lua",
     "local inLevelRange = (not isHeroic and GBB.dungeonLevel[dungeon][1] <= GBB.UserLevel and GBB.UserLevel <= GBB.dungeonLevel[dungeon][2]) or (isHeroic and GBB.UserLevel == 70)",
     "-- Privatserver haben eigene Stufengrenzen (Ascension CoA: 60), darum die\n"
     "\t-- Obergrenze der Instanz nehmen statt die 70 aus dem Original.\n"
     "\tlocal levelRange = GBB.dungeonLevel[dungeon] or {0,100}\n"
     "\tlocal inLevelRange = (levelRange[1] <= GBB.UserLevel and GBB.UserLevel <= levelRange[2])\n"
     "\t\tor (isHeroic and GBB.UserLevel >= levelRange[2])", 1),

    # --- MINOR: FCF_OpenNewWindow ignoriert in 3.3.5a den zweiten Parameter ----
    ("Chat.lua",
     "local Frame = name and FCF_OpenNewWindow(name, true) or ChatFrame1",
     "local Frame = name and FCF_OpenNewWindow(name, true) or ChatFrame1\n"
     "\tif name and Frame then\n"
     "\t\t-- 3.3.5a kennt den zweiten Parameter nicht und haengt Standardgruppen an\n"
     "\t\tif ChatFrame_RemoveAllMessageGroups then ChatFrame_RemoveAllMessageGroups(Frame) end\n"
     "\t\tif ChatFrame_RemoveAllChannels then ChatFrame_RemoveAllChannels(Frame) end\n"
     "\tend", 1),
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
            fails.append("%s: %d/%d fuer %r" % (fname, found, expect, old[:70]))
            continue
        cache[fname] = cache[fname].replace(old, new)
        print("  ok  %-26s %s" % (fname, old[:66].replace("\n", " ")))
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
    print("\n%d Korrekturen in %d Dateien geschrieben." % (len(PATCHES), len(cache)))
    return 0


sys.exit(run())
