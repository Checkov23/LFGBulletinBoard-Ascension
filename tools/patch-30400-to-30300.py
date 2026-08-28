# -*- coding: utf-8 -*-
"""Portiert LFG Bulletin Board 2.64 (WotLK Classic, Interface 30400)
auf den WotLK-Client 3.3.5a (Interface 30300).
Jede Ersetzung hat eine erwartete Trefferzahl. Weicht sie ab, bricht das Skript ab."""
import sys, io, os

ADDON = sys.argv[1]

# (Datei, alt, neu, erwartete Treffer)
PATCHES = [

    # ---------------- TOC ----------------
    ("LFGBulletinBoard.toc", "## Interface: 30400", "## Interface: 30300", 1),
    ("LFGBulletinBoard.toc", "## Version: 2.64", "## Version: 2.64-ascension1", 1),
    ("LFGBulletinBoard.toc",
     "## Notes: Sort LFG/LFM Messages",
     "## Notes: Sort LFG/LFM Messages - portiert auf 3.3.5a (Ascension)", 1),
    ("LFGBulletinBoard.toc", "LibGPIOptions.lua", "Compat335.lua\nLibGPIOptions.lua", 1),
    ("LFGBulletinBoard.toc", "GroupList.Lua", "GroupList.lua", 1),

    # ---------------- Chat.lua ----------------
    # Nachrichtengruppen wie INSTANCE_CHAT gibt es in 3.3.5a nicht -> vorher aussieben
    ("Chat.lua",
     "for index = 1, select('#', ...) do",
     "local groups={GBB.Compat.FilterChatGroups(...)}\n\t\tfor index = 1, #groups do", 1),
    ("Chat.lua",
     "ChatFrame_AddMessageGroup(Frame, select(index, ...))",
     "ChatFrame_AddMessageGroup(Frame, groups[index])", 1),
    # GetChannelList liefert je nach Build Paare statt Tripel
    ("Chat.lua",
     "local channelList = {GetChannelList()}",
     "local channelList = GBB.Compat.ParseChannelList(GetChannelList())", 1),
    ("Chat.lua", "for i = 1, #channelList, 3 do", "for id, info in pairs(channelList) do", 1),
    ("Chat.lua", "id = channelList[i],", "id = id,", 1),
    ("Chat.lua", "name = channelList[i+1],", "name = info.name,", 1),
    ("Chat.lua", "isDisabled = channelList[i+2]", "isDisabled = info.hidden", 1),

    # ---------------- GroupBulletinBoard.lua ----------------
    # GROUP_* Ereignisse existieren erst ab 5.0; unbekannte Namen werfen im alten Client einen Fehler
    ("GroupBulletinBoard.lua",
     'local PartyChangeEvent={ "GROUP_JOINED", "GROUP_ROSTER_UPDATE", "RAID_ROSTER_UPDATE","GROUP_LEFT","LOADING_SCREEN_DISABLED","PLAYER_ENTERING_WORLD", "PLAYER_REGEN_DISABLED", "PLAYER_ENTERING_WORLD"}',
     'local PartyChangeEvent={ "PARTY_MEMBERS_CHANGED", "RAID_ROSTER_UPDATE", "PLAYER_ENTERING_WORLD", "PLAYER_REGEN_DISABLED"}', 1),
    # 3.3.5a kennt nur Ton-Namen, keine SoundKit-IDs
    ("GroupBulletinBoard.lua", "GBB.NotifySound=1210", 'GBB.NotifySound="TellMessage"', 1),
    ("GroupBulletinBoard.lua",
     'for i=1,select("#", ...),3 do',
     "for id,info in pairs(GBB.Compat.ParseChannelList(...)) do", 1),
    ("GroupBulletinBoard.lua",
     't[select(i, ...)]= {name=select(i+1, ...),hidden=select(i+2, ...) }',
     "t[id]={name=info.name,hidden=info.hidden}", 1),

    # ---------------- LibGPIToolBox.lua ----------------
    ("LibGPIToolBox.lua",
     "Tool.ClassColor=RAID_CLASS_COLORS",
     "Tool.ClassColor=Addon.Compat and Addon.Compat.ClassColor or RAID_CLASS_COLORS\n"
     "if Addon.Compat then\n"
     "\tTool.IconClass=Addon.Compat.SafeIconTable(Tool.IconClass)\n"
     "\tTool.IconClassBig=Addon.Compat.SafeIconTable(Tool.IconClassBig)\n"
     "end", 1),
    ("LibGPIToolBox.lua",
     "eventFrame:RegisterEvent(event)",
     "pcall(eventFrame.RegisterEvent,eventFrame,event)", 1),
    ("LibGPIToolBox.lua",
     "local distanceSquared, checkedDistance = UnitDistanceSquared(uId)",
     "local distanceSquared, checkedDistance\n"
     '\t\tif type(UnitDistanceSquared)=="function" then distanceSquared, checkedDistance = UnitDistanceSquared(uId) end', 1),
    ("LibGPIToolBox.lua",
     'elseif  C_Map.GetBestMapForUnit(uId)~= C_Map.GetBestMapForUnit("player") then',
     "elseif UnitIsVisible and not UnitIsVisible(uId) then", 1),
    ("LibGPIToolBox.lua",
     "frame:SetHyperlinksEnabled(true);",
     "if frame.SetHyperlinksEnabled then frame:SetHyperlinksEnabled(true) end", 1),
    ("LibGPIToolBox.lua",
     "ResizeCursor.Texture:SetRotation(math.rad(self.GPI_Rotation),0.5,0.5)",
     "if ResizeCursor.Texture.SetRotation then ResizeCursor.Texture:SetRotation(math.rad(self.GPI_Rotation),0.5,0.5) end", 1),
    # In 3.3.5a haben Gildennamen kein "-Realm"; string.match liefert dann nil
    ("LibGPIToolBox.lua",
     'if string.lower( string.match((GetGuildRosterInfo(i)),"(.-)-")) == name then',
     "local rosterName=GetGuildRosterInfo(i)\n"
     '\t\tif rosterName and string.lower(string.match(rosterName,"^([^%-]+)") or rosterName) == name then', 1),

    # ---------------- LibGPIOptions.lua ----------------
    ("LibGPIOptions.lua",
     "but.ColTex:SetColorTexture(1,1,1,1)",
     "if but.ColTex.SetColorTexture then but.ColTex:SetColorTexture(1,1,1,1) else but.ColTex:SetTexture(1,1,1,1) end", 1),

    # ---------------- LibGPIMinimapButton.lua ----------------
    ("LibGPIMinimapButton.lua", "MinimapButton.icon:SetSize(17, 17)",
     "MinimapButton.icon:SetWidth(17) MinimapButton.icon:SetHeight(17)", 1),
    ("LibGPIMinimapButton.lua", "button:SetSize(31, 31)", "button:SetWidth(31) button:SetHeight(31)", 1),
    ("LibGPIMinimapButton.lua", "overlay:SetSize(53, 53)", "overlay:SetWidth(53) overlay:SetHeight(53)", 1),
    ("LibGPIMinimapButton.lua", "background:SetSize(20, 20)", "background:SetWidth(20) background:SetHeight(20)", 1),
    ("LibGPIMinimapButton.lua", "icon:SetSize(17, 17)", "icon:SetWidth(17) icon:SetHeight(17)", 1),

    # ---------------- GroupList.lua ----------------
    ("GroupList.lua",
     "guildcache[entry.name]=entry.guid and IsInGuild() and IsGuildMember(entry.guid)",
     "guildcache[entry.name]=GBB.Compat.IsGuildMemberName(entry.name)", 1),
    ("GroupList.lua",
     "friendcache[entry.name]=entry.guid and C_FriendList.IsFriend(entry.guid)",
     "friendcache[entry.name]=GBB.Compat.IsFriendName(entry.name)", 1),
    ("GroupList.lua",
     "GroupBulletinBoardFrame_GroupFrame:SetHyperlinksEnabled(true);",
     "if GroupBulletinBoardFrame_GroupFrame.SetHyperlinksEnabled then GroupBulletinBoardFrame_GroupFrame:SetHyperlinksEnabled(true) end", 1),
    ("GroupList.lua",
     "GroupBulletinBoardFrame_GroupFrame:SetTextCopyable(true);",
     "if GroupBulletinBoardFrame_GroupFrame.SetTextCopyable then GroupBulletinBoardFrame_GroupFrame:SetTextCopyable(true) end", 1),

    # ---------------- RequestList.lua ----------------
    # GetPlayerInfoByGUID gibt es erst ab Cataclysm, und 3.3.5a liefert im Chat keine GUID
    ("RequestList.lua",
     "local locClass,engClass,locRace,engRace,Gender,gName,gRealm = GetPlayerInfoByGUID(guid)",
     "local locClass,engClass,locRace,engRace,Gender,gName,gRealm\n"
     '\tif guid and type(GetPlayerInfoByGUID)=="function" then\n'
     "\t\tlocClass,engClass,locRace,engRace,Gender,gName,gRealm = GetPlayerInfoByGUID(guid)\n"
     "\tend", 1),
    ("RequestList.lua",
     'name=GBB.Tool.Split(name, "-")[1] -- remove GBB.ServerName',
     'name=GBB.Tool.Split(name, "-")[1] -- remove GBB.ServerName\n'
     '\tif engClass==nil or engClass=="" then engClass=GBB.Compat.GetClassByName(name) end', 1),
    ("RequestList.lua",
     "GBB.RequestList[index].IsGuildMember=IsInGuild() and IsGuildMember(guid)",
     "GBB.RequestList[index].IsGuildMember=GBB.Compat.IsGuildMemberName(name)", 1),
    ("RequestList.lua",
     "GBB.RequestList[index].IsFriend=C_FriendList.IsFriend(guid)",
     "GBB.RequestList[index].IsFriend=GBB.Compat.IsFriendName(name)", 1),
    ("RequestList.lua",
     "local FriendIcon=(C_FriendList.IsFriend(guid) and",
     "local FriendIcon=(GBB.Compat.IsFriendName(name) and", 1),
    ("RequestList.lua",
     "((IsInGuild() and IsGuildMember(guid)) and",
     "(GBB.Compat.IsGuildMemberName(name) and", 1),
    ("RequestList.lua",
     "RAID_CLASS_COLORS[engClass].colorStr",
     "GBB.Tool.ClassColor[engClass].colorStr", 1),
    ("RequestList.lua",
     "RAID_CLASS_COLORS[req.class].colorStr",
     "GBB.Tool.ClassColor[req.class].colorStr", 2),
    ("RequestList.lua", "PlaySound(GBB.NotifySound)", "GBB.Compat.PlayNotifySound(GBB.NotifySound)", 1),
    ("RequestList.lua", "if n:IsTruncated() then", "if n.IsTruncated and n:IsTruncated() then", 1),
]


def run():
    cache = {}
    eols = {}
    fails = []
    for fname, old, new, expect in PATCHES:
        path = os.path.join(ADDON, fname)
        if fname not in cache:
            with io.open(path, "r", encoding="utf-8", errors="surrogateescape", newline="") as fh:
                raw = fh.read()
            eols[fname] = "\r\n" if "\r\n" in raw else "\n"
            cache[fname] = raw.replace("\r\n", "\n")
        text = cache[fname]
        found = text.count(old)
        if found != expect:
            fails.append("%s: %d/%d Treffer fuer %r" % (fname, found, expect, old[:70]))
            continue
        cache[fname] = text.replace(old, new)
        print("  ok  %-28s %s" % (fname, old[:70].replace("\n", " ")))

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
    print("\n%d Ersetzungen in %d Dateien geschrieben." % (len(PATCHES), len(cache)))
    return 0


sys.exit(run())
