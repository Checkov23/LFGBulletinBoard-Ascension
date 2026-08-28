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

-- Sort order and options list: appended to the WotLK block, which keeps the
-- index arithmetic in GBB.GetDungeonSort consistent.
for _,key in ipairs(GBB.CoADungeonNames) do
	table.insert(GBB.WotlkDungeonNames,key)
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
local GetDungeonNames_orig=GBB.GetDungeonNames
function GBB.GetDungeonNames()
	local names=GetDungeonNames_orig()
	for key,label in pairs(GBB.CoADungeonDisplay) do
		if rawget(names,key)==nil then names[key]=label end
	end
	return names
end
