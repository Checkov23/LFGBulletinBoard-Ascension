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

GBB.CoADungeonLevels={
	["MANA"]   = {10,60},
	["MPLUS"]  = {60,60},
	["COADUN"] = {1,60},
	["WB"]     = {60,60},
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
local GetDungeons_orig=GBB.GetDungeons
function GBB.GetDungeons(msg,name)
	local dungeons,isGood,isBad,wordcount,isHeroic=GetDungeons_orig(msg,name)
	if type(dungeons)=="table" and type(msg)=="string"
		and string.find(string.lower(msg),"keystone",1,true) then
		dungeons["TRADE"]=nil
		dungeons["MPLUS"]=true
		isGood=true
	end
	return dungeons,isGood,isBad,wordcount,isHeroic
end
