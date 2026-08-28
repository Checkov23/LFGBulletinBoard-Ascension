-- LFG Bulletin Board: compatibility layer for the WotLK 3.3.5a client (Interface 30300)
-- Upstream is built for WotLK Classic (30400) and calls APIs the old client
-- does not have. This file loads first and only fills gaps: whatever the
-- client brings along itself is left untouched.
-- A GBBCOMPAT_OK marker on a line tells the check script that the line is
-- meant to look the way it does.
local TOCNAME,GBB=...

GBB.Compat={}
local C=GBB.Compat

local _,_,_,tocversion=GetBuildInfo()
C.TocVersion=tonumber(tocversion) or 30300
C.IsLegacyClient=(C.TocVersion<30400)

local function has(name) return type(_G[name])=="function" end
local function lower(s) return s and string.lower(s) or "" end
local function stripRealm(n)
	if type(n)~="string" then return nil end
	return string.match(n,"^([^%-]+)") or n
end
C.StripRealm=stripRealm

----------------------------------------------------------------------
-- Time
----------------------------------------------------------------------
if not has("GetServerTime") then                      -- GBBCOMPAT_OK
	GetServerTime=time                                -- GBBCOMPAT_OK
end

----------------------------------------------------------------------
-- Table helpers from FrameXML
----------------------------------------------------------------------
if not has("tContains") then                          -- GBBCOMPAT_OK
	function tContains(table,item)                    -- GBBCOMPAT_OK
		for _,v in pairs(table) do
			if v==item then return true end
		end
		return false
	end
end

----------------------------------------------------------------------
-- Group queries (IsInRaid/IsInGroup arrived with 5.0)
----------------------------------------------------------------------
if not has("IsInRaid") then                           -- GBBCOMPAT_OK
	function IsInRaid()                               -- GBBCOMPAT_OK
		return (GetNumRaidMembers and GetNumRaidMembers() or 0)>0
	end
end
if not has("IsInGroup") then                          -- GBBCOMPAT_OK
	function IsInGroup()                              -- GBBCOMPAT_OK
		return (GetNumRaidMembers and GetNumRaidMembers() or 0)>0
			or (GetNumPartyMembers and GetNumPartyMembers() or 0)>0
	end
end
if not has("GetNumGroupMembers") then                 -- GBBCOMPAT_OK
	function GetNumGroupMembers()                     -- GBBCOMPAT_OK
		local r=GetNumRaidMembers and GetNumRaidMembers() or 0
		if r>0 then return r end
		local p=GetNumPartyMembers and GetNumPartyMembers() or 0
		if p>0 then return p+1 end
		return 0
	end
end

----------------------------------------------------------------------
-- UnitFullName arrived with MoP
----------------------------------------------------------------------
if not has("UnitFullName") then                       -- GBBCOMPAT_OK
	function UnitFullName(unit)                       -- GBBCOMPAT_OK
		local n,r=UnitName(unit)
		if r=="" then r=nil end
		return n,r
	end
end

----------------------------------------------------------------------
-- Friends list: C_FriendList arrived with BfA
----------------------------------------------------------------------
local friendRefresh=0
local function refreshFriends()
	if ShowFriends and GetTime()-friendRefresh>10 then
		friendRefresh=GetTime()
		ShowFriends()
	end
end

if type(C_FriendList)~="table" then C_FriendList={} end   -- GBBCOMPAT_OK
if type(C_FriendList.GetFriendInfo)~="function" then      -- GBBCOMPAT_OK
	function C_FriendList.GetFriendInfo(name)             -- GBBCOMPAT_OK
		if type(name)~="string" or name=="" then return nil end
		refreshFriends()
		local want=lower(stripRealm(name))
		for i=1,(GetNumFriends and GetNumFriends() or 0) do
			local fname,level,class,area,connected,status,note=GetFriendInfo(i)
			if fname and lower(stripRealm(fname))==want then
				return {
					name=fname,
					level=level,
					className=class,
					area=area,
					connected=connected,
					notes=note,
				}
			end
		end
		return nil
	end
end
if type(C_FriendList.IsFriend)~="function" then           -- GBBCOMPAT_OK
	function C_FriendList.IsFriend(nameOrGuid)            -- GBBCOMPAT_OK
		return C_FriendList.GetFriendInfo(nameOrGuid)~=nil
	end
end
if type(C_FriendList.AddIgnore)~="function" then          -- GBBCOMPAT_OK
	function C_FriendList.AddIgnore(name)                 -- GBBCOMPAT_OK
		if AddIgnore then AddIgnore(name) end
	end
end

-- By name, because a usable GUID is not always available in chat events
function C.IsFriendName(name)
	if not name then return false end
	return C_FriendList.GetFriendInfo(stripRealm(name))~=nil
end

----------------------------------------------------------------------
-- Guild membership: the GUID based variant does not exist here
----------------------------------------------------------------------
local guildNames,guildDirty,guildRequest={},true,0
local function refreshGuild()
	if not IsInGuild() then return end
	if not guildDirty then return end
	local n=GetNumGuildMembers and GetNumGuildMembers() or 0
	if n==0 then
		if GuildRoster and GetTime()-guildRequest>10 then
			guildRequest=GetTime()
			GuildRoster()
		end
		return
	end
	for k in pairs(guildNames) do guildNames[k]=nil end
	for i=1,n do
		local gname=GetGuildRosterInfo(i)
		if gname then guildNames[lower(stripRealm(gname))]=true end
	end
	guildDirty=false
end

function C.IsGuildMemberName(name)
	if not name or not IsInGuild() then return false end
	refreshGuild()
	return guildNames[lower(stripRealm(name))]==true
end

----------------------------------------------------------------------
-- Class colours: colorStr is missing on 3.3.5a, and unknown or empty
-- classes must not throw. Ascension ships custom classes, so that case is
-- the norm rather than the exception.
----------------------------------------------------------------------
C.DefaultClassColor={r=1,g=0.82,b=0,colorStr="ffffd100"}

local function makeColor(c)
	if type(c)~="table" then return nil end
	local r,g,b=c.r or 1,c.g or 1,c.b or 1
	return {
		r=r,g=g,b=b,
		colorStr=c.colorStr or string.format("ff%02x%02x%02x",r*255,g*255,b*255),
	}
end

C.ClassColor=setmetatable({},{__index=function(t,k)
	if k==nil then return C.DefaultClassColor end
	local src=RAID_CLASS_COLORS and RAID_CLASS_COLORS[k]   -- GBBCOMPAT_OK
	local e=makeColor(src) or C.DefaultClassColor
	rawset(t,k,e)
	return e
end})

-- Class icons must not run into nil either
function C.SafeIconTable(t)
	return setmetatable({},{__index=function(_,k)
		if k==nil then return "" end
		return rawget(t,k) or ""
	end})
end

----------------------------------------------------------------------
-- Scaling: on 3.3.5a SetScale is a Frame method. FontStrings and other
-- regions do not have it, so scaling one throws. Emulate it through the
-- font height instead, and remember the unscaled height so repeated calls
-- do not compound. If something else changes the font in between, the
-- height no longer matches what we applied and the base is taken again.
----------------------------------------------------------------------
function C.ScaleRegion(region,scale)
	if region==nil or scale==nil then return end
	if region.SetScale then
		region:SetScale(scale)                            -- GBBCOMPAT_OK
		return
	end
	if not region.GetFont then return end
	local font,height,flags=region:GetFont()
	if not font or not height then return end
	if region.gbbBaseFontHeight==nil or region.gbbAppliedFontHeight~=height then
		region.gbbBaseFontHeight=height
	end
	region.gbbAppliedFontHeight=region.gbbBaseFontHeight*scale
	region:SetFont(font,region.gbbAppliedFontHeight,flags)
end

----------------------------------------------------------------------
-- Find the class for a name (stand-in for GetPlayerInfoByGUID)
----------------------------------------------------------------------
local classCache={}

function C.RememberClass(name,engClass)
	if not name or not engClass or engClass=="" then return end
	classCache[lower(stripRealm(name))]=engClass
end

local locToEng={}
if LOCALIZED_CLASS_NAMES_MALE then
	for eng,loc in pairs(LOCALIZED_CLASS_NAMES_MALE) do locToEng[loc]=eng locToEng[eng]=eng end
end
if LOCALIZED_CLASS_NAMES_FEMALE then
	for eng,loc in pairs(LOCALIZED_CLASS_NAMES_FEMALE) do locToEng[loc]=eng end
end

local function scanGroup()
	local prefix,count
	if IsInRaid() then prefix,count="raid",(MAX_RAID_MEMBERS or 40)
	else prefix,count="party",(MAX_PARTY_MEMBERS or 4) end
	for i=1,count do
		local unit=prefix..i
		if UnitExists(unit) then
			local _,eng=UnitClass(unit)
			C.RememberClass(UnitName(unit),eng)
		end
	end
	local _,eng=UnitClass("player")
	C.RememberClass(UnitName("player"),eng)
end

function C.GetClassByName(name)
	if not name then return nil end
	local key=lower(stripRealm(name))
	if classCache[key] then return classCache[key] end

	if IsInGuild() then
		refreshGuild()
		local n=GetNumGuildMembers and GetNumGuildMembers() or 0
		for i=1,n do
			local gname,_,_,_,_,_,_,_,_,_,gclass=GetGuildRosterInfo(i)
			if gname and lower(stripRealm(gname))==key then
				if gclass and gclass~="" then classCache[key]=gclass end
				return classCache[key]
			end
		end
	end

	local f=C_FriendList.GetFriendInfo(name)
	if f and f.className and locToEng[f.className] then
		classCache[key]=locToEng[f.className]
		return classCache[key]
	end
	return nil
end

----------------------------------------------------------------------
-- Events: the old client throws on unknown event names
----------------------------------------------------------------------
function C.SafeRegisterEvent(frame,event)
	local ok=pcall(frame.RegisterEvent,frame,event)
	return ok
end

----------------------------------------------------------------------
-- Channel list: depending on the build GetChannelList returns pairs
-- (id,name) or triples (id,name,disabled). Read both cleanly.
----------------------------------------------------------------------
function C.ParseChannelList(...)
	local t={}
	local n=select("#",...)
	local i=1
	while i<=n do
		local id=select(i,...)
		local name=select(i+1,...)
		if type(id)~="number" or type(name)~="string" then break end
		local nxt=select(i+2,...)
		local nxt2=select(i+3,...)
		local step=3
		if type(nxt)=="number" and (type(nxt2)=="string" or i+2>=n) then step=2 end
		t[id]={name=name,hidden=(step==3 and nxt and true or false)}
		i=i+step
	end
	return t
end

----------------------------------------------------------------------
-- Sound: 3.3.5a takes sound names, not SoundKit IDs
----------------------------------------------------------------------
function C.PlayNotifySound(sound)
	if sound==nil then return end
	if not pcall(PlaySound,sound) then
		pcall(PlaySound,"TellMessage")
	end
end

----------------------------------------------------------------------
-- Drop chat message groups that do not exist on 3.3.5a
----------------------------------------------------------------------
function C.FilterChatGroups(...)
	local out={}
	for i=1,select("#",...) do
		local g=select(i,...)
		if type(ChatTypeGroup)~="table" or type(ChatTypeGroup[g])=="table" then
			table.insert(out,g)
		end
	end
	return unpack(out)
end

----------------------------------------------------------------------
local ev=CreateFrame("Frame")
C.SafeRegisterEvent(ev,"GUILD_ROSTER_UPDATE")
C.SafeRegisterEvent(ev,"PLAYER_GUILD_UPDATE")
C.SafeRegisterEvent(ev,"PARTY_MEMBERS_CHANGED")
C.SafeRegisterEvent(ev,"RAID_ROSTER_UPDATE")
C.SafeRegisterEvent(ev,"PLAYER_ENTERING_WORLD")
ev:SetScript("OnEvent",function(self,event)
	if event=="GUILD_ROSTER_UPDATE" or event=="PLAYER_GUILD_UPDATE" then
		guildDirty=true
	else
		scanGroup()
	end
end)
