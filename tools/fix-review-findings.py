# -*- coding: utf-8 -*-
"""Fixes the 11 findings from the review of the 3.3.5a port."""
import sys, io, os

ADDON = sys.argv[1]

PATCHES = [

    # --- BLOCKER 1: ScrollFrame.ScrollBar does not exist on 3.3.5a -------------
    ("RequestList.lua",
     "GroupBulletinBoardFrame_ScrollFrame.ScrollBar.scrollStep=itemHight*2",
     "local scrollBar=GroupBulletinBoardFrame_ScrollFrame.ScrollBar\n"
     '\t\tor _G["GroupBulletinBoardFrame_ScrollFrameScrollBar"]\n'
     "\tif scrollBar then scrollBar.scrollStep=itemHight*2 end", 1),

    # --- BLOCKER 2: GetChecked returns 1/nil instead of true/false -------------
    ("LibGPIOptions.lua",
     'Options.Vars[name .. "_db"] [Options.Vars[name]] = cbox:GetChecked()',
     'Options.Vars[name .. "_db"] [Options.Vars[name]] = cbox:GetChecked() and true or false', 1),

    # --- BLOCKER 3: OnHyperlinkEnter/-Leave is absent on plain frames ----------
    ("LibGPIToolBox.lua",
     'frame:SetScript("OnHyperlinkEnter",EnterHyperlink)',
     '-- 3.3.5a only has these scripts on ScrollingMessageFrame/SimpleHTML\n'
     '\tif frame.HasScript and frame:HasScript("OnHyperlinkEnter") then\n'
     '\t\tframe:SetScript("OnHyperlinkEnter",EnterHyperlink)', 1),
    ("LibGPIToolBox.lua",
     'frame:SetScript("OnHyperlinkLeave",LeaveHyperlink)',
     'frame:SetScript("OnHyperlinkLeave",LeaveHyperlink)\n\tend', 1),

    # --- MAJOR: GetScrollOffset is called GetCurrentScroll on 3.3.5a ----------
    ("GroupList.lua",
     "self:SetScrollOffset(self:GetScrollOffset() + delta*5);",
     "local getOffset=self.GetScrollOffset or self.GetCurrentScroll\n"
     "\tif not getOffset then return end\n"
     "\tself:SetScrollOffset(getOffset(self) + delta*5);", 1),

    # --- MAJOR: post button, GetChannelName returns 0 instead of nil ----------
    ("Chat.lua",
     "local index = GetChannelName(ChannelName) -- It finds General is a channel at index 1",
     "local index = GetChannelName(ChannelName) -- 3.3.5a returns 0 when the channel has not been joined", 1),
    ("Chat.lua",
     "if (index~=nil) then",
     "if index~=nil and index>0 then", 1),
    ("Chat.lua",
     'SendChatMessage(Msg , "CHANNEL", nil, index);',
     'SendChatMessage(Msg , "CHANNEL", nil, index);\n'
     "\telse\n"
     '\t\tDEFAULT_CHAT_FRAME:AddMessage(GBB.MSGPREFIX.."channel not joined: "..tostring(ChannelName))', 1),

    # --- MAJOR: FileDataIDs instead of texture paths --------------------------
    ("LibGPIMinimapButton.lua",
     r'button:SetHighlightTexture(136477) --"Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight"',
     r'button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")', 1),
    ("LibGPIMinimapButton.lua",
     r'overlay:SetTexture(136430) --"Interface\\Minimap\\MiniMap-TrackingBorder"',
     r'overlay:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")', 1),
    ("LibGPIMinimapButton.lua",
     r'background:SetTexture(136467) --"Interface\\Minimap\\UI-Minimap-Background"',
     r'background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")', 1),

    # --- MINOR: XML attributes 3.3.5a does not know ---------------------------
    ("GroupBulletinBoard.xml",
     '<ScrollingMessageFrame enableMouseWheel="true" name="GroupBulletinBoardFrame_GroupFrame"  parentKey="MessageFrame" enableMouseClicks="true" >',
     '<ScrollingMessageFrame name="GroupBulletinBoardFrame_GroupFrame"  parentKey="MessageFrame" enableMouse="true" >', 1),
    ("GroupList.lua",
     "GroupBulletinBoardFrame_GroupFrame:SetFading(false);",
     "GroupBulletinBoardFrame_GroupFrame:SetFading(false);\n"
     "\t-- enableMouseWheel is not an XML attribute on 3.3.5a, so set it here\n"
     "\tGroupBulletinBoardFrame_GroupFrame:EnableMouseWheel(true)", 1),

    # --- MINOR: do not cache negative lookups forever -------------------------
    ("GroupList.lua", "if guildcache[entry.name]==nil then", "if not guildcache[entry.name] then", 1),
    ("GroupList.lua", "if friendcache[entry.name]==nil then", "if not friendcache[entry.name] then", 1),

    # --- MINOR: heroic filter was hardwired to level 70 -----------------------
    ("GroupBulletinBoard.lua",
     "local inLevelRange = (not isHeroic and GBB.dungeonLevel[dungeon][1] <= GBB.UserLevel and GBB.UserLevel <= GBB.dungeonLevel[dungeon][2]) or (isHeroic and GBB.UserLevel == 70)",
     "-- Private servers have their own level caps (Ascension CoA: 60), so use the\n"
     "\t-- instance's own upper level instead of the hardcoded 70 from upstream.\n"
     "\tlocal levelRange = GBB.dungeonLevel[dungeon] or {0,100}\n"
     "\tlocal inLevelRange = (levelRange[1] <= GBB.UserLevel and GBB.UserLevel <= levelRange[2])\n"
     "\t\tor (isHeroic and GBB.UserLevel >= levelRange[2])", 1),

    # --- MINOR: FCF_OpenNewWindow ignores the second parameter on 3.3.5a ------
    ("Chat.lua",
     "local Frame = name and FCF_OpenNewWindow(name, true) or ChatFrame1",
     "local Frame = name and FCF_OpenNewWindow(name, true) or ChatFrame1\n"
     "\tif name and Frame then\n"
     "\t\t-- 3.3.5a ignores the second parameter and attaches the default groups\n"
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
            fails.append("%s: %d/%d hits for %r" % (fname, found, expect, old[:70]))
            continue
        cache[fname] = cache[fname].replace(old, new)
        print("  ok  %-26s %s" % (fname, old[:66].replace("\n", " ")))
    if fails:
        print("\nFAILED:")
        for f in fails:
            print("  " + f)
        return 1
    for fname, text in cache.items():
        out = text.replace("\n", eols[fname]) if eols[fname] == "\r\n" else text
        with io.open(os.path.join(ADDON, fname), "w", encoding="utf-8",
                     errors="surrogateescape", newline="") as fh:
            fh.write(out)
    print("\n%d fixes written across %d files." % (len(PATCHES), len(cache)))
    return 0


sys.exit(run())
