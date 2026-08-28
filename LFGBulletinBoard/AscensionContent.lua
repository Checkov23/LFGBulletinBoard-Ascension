-- Conquest of Azeroth (Project Ascension): its own group content
--
-- CoA runs on vanilla Azeroth with a level cap of 60. The base game instances
-- are already covered by the addon, but the CoA specific things (Manastorm,
-- Mythic+, the new dungeons, world bosses) would otherwise land unrecognised
-- in the misc bucket.
--
-- This file touches nothing that already exists, it only appends. To get rid
-- of the categories again, remove this file from the TOC.
local TOCNAME,GBB=...

local SPLIT=GBB.Tool.Split

GBB.CoADungeonNames={"MANA","MPLUS","COADUN","WB"}

-- Deliberately wide. CoA scales its content, and a narrow range only creates a
-- way for the level filter to hide these categories from the very people who
-- want them.
GBB.CoADungeonLevels={
	["MANA"]   = {1,60},
	["MPLUS"]  = {1,60},
	["COADUN"] = {1,60},
	["WB"]     = {1,60},
}

GBB.CoADungeonDisplay={
	["MANA"]   = "Manastorm",
	["MPLUS"]  = "Mythic+ (Keystone)",
	["COADUN"] = "CoA Custom Dungeons",
	["WB"]     = "World Bosses",
}

-- Lowercase only, and no spaces inside a single term: the tokeniser splits
-- the message on whitespace and punctuation, so a term containing a space can
-- never match. Apostrophes are dropped, "Tor'Watha" becomes "torwatha".
local COA_TAGS={
	["MANA"]   = "manastorm mstorm manastorms",
	["MPLUS"]  = "mythic mythics mythicplus mplus keystone keystones key keys",
	["COADUN"] = "torwatha watha inquisition voti bardid bardidhold otherside rtdos "..
	             "embers templeofembers shadowbone shadowbonedepths sbd "..
	             "blackrockcaverns brc karazhancrypts kzcrypts frozenreach "..
	             "forgottenmine korrim",
	["WB"]     = "worldboss worldbosses wbtour azuregos kazzak emeriss lethon "..
	             "taerar ysondre setis atalzul snowgrave kaldros depthbreaker soggoth",
}

-- Sort order and options list: appended to the Classic block, because CoA is
-- vanilla content and that is the panel a CoA player looks at. GetDungeonSort
-- derives MAXDUNGEON and the panel bounds from the list sizes, so appending
-- here keeps the index arithmetic consistent.
for _,key in ipairs(GBB.CoADungeonNames) do
	table.insert(GBB.VanillDungeonNames,key)
end

for key,range in pairs(GBB.CoADungeonLevels) do
	GBB.dungeonLevel[key]=range
end

-- Manastorm, Mythic+ and world bosses count as raids so the heroic only and
-- normal only toggles do not filter them away.
table.insert(GBB.Raids,"MANA")
table.insert(GBB.Raids,"MPLUS")
table.insert(GBB.Raids,"WB")

for key,tags in pairs(COA_TAGS) do
	local list=SPLIT(tags," ")
	for _,loc in ipairs({"enGB","deDE"}) do
		if GBB.dungeonTagsLoc[loc] then
			GBB.dungeonTagsLoc[loc][key]=list
		end
	end
end

-- Supply the display names. GetDungeonNames builds its table at startup, so
-- wrap it rather than replace it.
--
-- The names have to land in TWO places. The returned table is what the board
-- draws, but the localisation panel reads the English fallback behind it
-- (getmetatable(GBB.dungeonNames).__index) and concatenates the value without
-- a nil check. A key that exists in the dungeon list but not in that fallback
-- takes the whole options panel down with it.
local GetDungeonNames_orig=GBB.GetDungeonNames
function GBB.GetDungeonNames()
	local names=GetDungeonNames_orig()
	local mt=getmetatable(names)
	local fallback=mt and mt.__index
	for key,label in pairs(GBB.CoADungeonDisplay) do
		if type(fallback)=="table" and rawget(fallback,key)==nil then
			fallback[key]=label
		end
		if rawget(names,key)==nil then names[key]=label end
	end
	return names
end

-- Keystones are posted as an item link, for example
--   [Keystone: Scarlet Monastery - Library (11)] 1 slot heal
-- The tokeniser turns the link prefix into the word "hitem", which upstream
-- lists as a Trade keyword, so every keystone request would also show up under
-- Trade. On CoA a keystone link is a group request, not a sale. Drop Trade for
-- those, pin them to the Mythic+ category, and treat the link itself as enough
-- to count as a request even when the poster writes no role word at all.
-- A keystone link is unambiguous: it is a group request, never a sale.
local function hasKeystoneLink(low)
	return string.find(low,"keystone",1,true)~=nil
end

-- Looser phrasings. The tokeniser destroys punctuation, so "+11", "m+" and
-- "11 key" can never match through the normal word list and need patterns.
-- These only ADD the category, they do not touch Trade, because "wts +15" is a
-- real thing.
local function looksLikeMythicPlus(low)
	return string.find(low,"mythic",1,true)~=nil
		or string.find(low,"%+%s*%d+")~=nil          -- +11, + 11
		or string.find(low,"%f[%w]m%s*%+")~=nil      -- m+, M +
		or string.find(low,"%f[%w]%d+%s*keys?%f[%W]")~=nil  -- 11 key, 8 keys
end

local GetDungeons_orig=GBB.GetDungeons
function GBB.GetDungeons(msg,name)
	local dungeons,isGood,isBad,wordcount,isHeroic=GetDungeons_orig(msg,name)
	if type(dungeons)=="table" and type(msg)=="string" then
		local low=string.lower(msg)
		if hasKeystoneLink(low) then
			dungeons["TRADE"]=nil
			dungeons["MPLUS"]=true
			isGood=true
		elseif looksLikeMythicPlus(low) then
			dungeons["MPLUS"]=true
			isGood=true
		end
	end
	return dungeons,isGood,isBad,wordcount,isHeroic
end

----------------------------------------------------------------------
-- /gbbraw : print the next few channel lines exactly as the addon receives
-- them, together with the categories they matched. Chat hyperlinks do not
-- survive a screenshot in readable form, so the pipes are doubled, which the
-- client renders as a single literal pipe.
----------------------------------------------------------------------
local rawLeft=0
local rawFrame=CreateFrame("Frame")
rawFrame:SetScript("OnEvent",function(self,event,msg,sender,_3,_4,_5,_6,_7,channelID,channelName)
	if rawLeft<=0 or type(msg)~="string" then return end
	rawLeft=rawLeft-1
	local dungeons=GBB.GetDungeons(msg,sender)
	local names={}
	for key,hit in pairs(dungeons or {}) do
		if hit then names[#names+1]=key end
	end
	table.sort(names)
	print(GBB.MSGPREFIX.."raw ["..tostring(channelID).." "..tostring(channelName).."] "
		..tostring(sender)..": "..string.gsub(msg,"|","||"))
	print(GBB.MSGPREFIX.."    -> "..(#names>0 and table.concat(names,", ") or "no category"))
	if rawLeft==0 then print(GBB.MSGPREFIX.."raw capture finished.") end
end)
GBB.Compat.SafeRegisterEvent(rawFrame,"CHAT_MSG_CHANNEL")

SLASH_GBBRAW1="/gbbraw"
SlashCmdList["GBBRAW"]=function(arg)
	rawLeft=tonumber(arg) or 8
	print(GBB.MSGPREFIX.."capturing the next "..rawLeft.." channel lines, unparsed.")
end
