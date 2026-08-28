-- Conquest of Azeroth (Project Ascension): eigene Gruppeninhalte
--
-- CoA laeuft auf Vanilla-Azeroth mit Stufengrenze 60. Die Instanzen aus dem
-- Grundspiel deckt das Addon bereits ab, aber die CoA-eigenen Sachen (Manastorm,
-- Mythic+, die neuen Dungeons, Weltbosse) landen sonst unerkannt im Sammelposten.
--
-- Diese Datei fasst nichts an, was schon da ist: sie haengt nur an. Wer die
-- Kategorien wieder loswerden will, nimmt die Datei aus der TOC.
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

-- Nur Kleinbuchstaben, keine Leerzeichen im einzelnen Begriff: der Zerleger
-- zerhackt die Nachricht an Leer- und Satzzeichen, ein Begriff mit Leerzeichen
-- kann darum nie treffen. Apostrophe fallen weg, "Tor'Watha" wird "torwatha".
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

-- Sortierung und Optionsliste: hinten an den WotLK-Block. Die Indexrechnung in
-- GBB.GetDungeonSort bleibt dadurch stimmig.
for _,key in ipairs(GBB.CoADungeonNames) do
	table.insert(GBB.WotlkDungeonNames,key)
end

for key,range in pairs(GBB.CoADungeonLevels) do
	GBB.dungeonLevel[key]=range
end

-- Manastorm, Mythic+ und Weltbosse laufen als Raid, damit die
-- Nur-heroisch/Nur-normal-Umschalter sie nicht wegfiltern.
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

-- Anzeigenamen nachreichen. GetDungeonNames baut die Tabelle erst beim Start,
-- darum wird sie hier umschlossen statt ersetzt.
local GetDungeonNames_orig=GBB.GetDungeonNames
function GBB.GetDungeonNames()
	local names=GetDungeonNames_orig()
	for key,label in pairs(GBB.CoADungeonDisplay) do
		if rawget(names,key)==nil then names[key]=label end
	end
	return names
end
