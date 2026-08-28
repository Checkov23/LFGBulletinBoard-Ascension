// Loads the addon in a Lua VM against a stubbed WoW 3.3.5a API and runs the
// startup path. The stubs deliberately expose only the methods the 3.3.5a
// client actually has, so calling a newer one fails here the same way it fails
// in game. Every crash this port hit live (FontString:SetScale,
// FontString:SetMaxLines, a nil concat in the options panel) is that shape.
//
//   npm i fengari@0.1.4 && node tools/loadtest.mjs ./LFGBulletinBoard
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { lua, lauxlib, lualib, to_luastring } from 'fengari'

const dir = process.argv[2]
if (!dir) { console.error('usage: node loadtest.mjs <addonDir>'); process.exit(2) }

// ---------------------------------------------------------------- XML frames
// The addon gets a chunk of its frames from XML, which the VM does not parse.
// Pull the named elements out so the globals exist with the right type.
const WIDGET = 'Frame|Button|ScrollFrame|EditBox|ScrollingMessageFrame|Slider|CheckButton|FontString|Texture|MessageFrame|StatusBar|SimpleHTML'

// Walks the tags keeping a real element stack, so $parent resolves against the
// actual ancestor and virtual templates only collect their own children.
function scanXml(text) {
  const created = []
  const templates = {}
  const stack = []
  const tagRe = new RegExp(`<(/?)(${WIDGET})\\b([^>]*?)(/?)>`, 'g')
  let m
  while ((m = tagRe.exec(text)) !== null) {
    const [, closing, type, attrs, selfClosing] = m
    if (closing) { stack.pop(); continue }

    const rawName = /name="([^"]+)"/.exec(attrs)?.[1] || null
    const virtual = /virtual="true"/.test(attrs)
    const parent = stack[stack.length - 1] || null
    const tplOwner = parent && parent.template ? parent.template : (virtual ? rawName : null)

    let resolved = rawName
    let suffix = null
    if (rawName && rawName.startsWith('$parent')) {
      suffix = rawName.slice('$parent'.length)
      resolved = parent && parent.resolved ? parent.resolved + suffix : null
    }

    if (rawName) {
      if (virtual) {
        templates[rawName] = templates[rawName] || { type, children: [] }
      } else if (tplOwner && suffix !== null) {
        // child of a virtual template: recorded relative to the template root
        const root = templates[tplOwner]
        if (root) root.children.push({ type, suffix })
      } else if (resolved && !tplOwner) {
        created.push({ type, name: resolved })
      }
    }

    if (!selfClosing) {
      stack.push({ type, resolved: virtual ? null : resolved, template: tplOwner })
    }
  }
  return { created, templates }
}

let xmlCreated = []
let xmlTemplates = {}
for (const f of readdirSync(dir).filter(f => f.toLowerCase().endsWith('.xml'))) {
  const r = scanXml(readFileSync(join(dir, f), 'utf8'))
  xmlCreated = xmlCreated.concat(r.created)
  Object.assign(xmlTemplates, r.templates)
}

// ---------------------------------------------------------------- Lua prelude
const PRELUDE = `
unpack = table.unpack

-- fengari walks the array part of a table in REVERSE, the 5.1 client walks it
-- ascending. The addon derives its whole dungeon sort order from pairs() over
-- an array of lists, so without this the harness reports order-dependent
-- nonsense that never happens in game. Array keys first and ascending, then
-- the rest, snapshotted so deletions during iteration stay safe.
local _rawpairs = pairs
function pairs(t)
  local keys, seen = {}, {}
  local i = 1
  while rawget(t, i) ~= nil do keys[#keys+1] = i seen[i] = true i = i + 1 end
  for k in _rawpairs(t) do if not seen[k] then keys[#keys+1] = k end end
  local idx = 0
  return function()
    while true do
      idx = idx + 1
      local k = keys[idx]
      if k == nil then return nil end
      local v = t[k]
      if v ~= nil then return k, v end
    end
  end, t, nil
end

-- Lua 5.1 emits the character after a % in a replacement string when it is not
-- a digit. 5.2 onwards makes that an error. The addon relies on the 5.1
-- behaviour when it builds the /who patterns, so restore it.
local _gsub = string.gsub
string.gsub = function(s, pat, repl, n)
  if type(repl) == "string" then
    -- scan %X pairs left to right so %% stays one unit
    repl = (_gsub(repl, "%%(.)", function(c)
      if string.find(c, "%d") or c == "%" then return "%" .. c end
      return c
    end))
  end
  local ok, a, b = pcall(_gsub, s, pat, repl, n)
  if not ok then error(a .. "  |pattern=" .. tostring(pat) .. "| repl=" .. tostring(repl) .. "|", 2) end
  return a, b
end
gsub = string.gsub

local function noop() end
local function num() return 0 end
local function str() return "" end

-- method surface of WoW 3.3.5a, by object type
local REGION = {
 "GetName","GetObjectType","IsObjectType","GetParent","SetParent","Show","Hide",
 "IsShown","IsVisible","SetAlpha","GetAlpha","SetPoint","GetPoint","GetNumPoints",
 "ClearAllPoints","SetAllPoints","SetWidth","GetWidth","SetHeight","GetHeight",
 "GetLeft","GetRight","GetTop","GetBottom","GetCenter","SetDrawLayer","GetDrawLayer",
}
local FONTINSTANCE = {
 "SetFont","GetFont","SetFontObject","GetFontObject","SetTextColor","GetTextColor",
 "SetShadowColor","SetShadowOffset","SetSpacing","GetSpacing",
 "SetJustifyH","GetJustifyH","SetJustifyV","GetJustifyV",
}
-- NOTE: no SetScale, no SetMaxLines, no IsTruncated. That is the whole point.
local FONTSTRING = {
 "SetText","GetText","SetFormattedText","GetStringWidth","GetStringHeight",
 "SetNonSpaceWrap","CanNonSpaceWrap","SetTextHeight","SetAlphaGradient","SetVertexColor",
}
local TEXTURE = { "SetTexture","GetTexture","SetTexCoord","SetVertexColor","SetBlendMode" }
local FRAME = {
 "SetScale","GetScale","GetEffectiveScale","EnableMouse","EnableMouseWheel","EnableKeyboard",
 "RegisterEvent","UnregisterEvent","UnregisterAllEvents","IsEventRegistered",
 "RegisterForDrag","SetScript","GetScript","HasScript","HookScript",
 "CreateTexture","CreateFontString","SetFrameStrata","GetFrameStrata","SetFrameLevel",
 "GetFrameLevel","SetMovable","SetResizable","SetMinResize","SetMaxResize","StartMoving",
 "StopMovingOrSizing","StartSizing","SetID","GetID","SetHitRectInsets","SetBackdrop",
 "SetBackdropColor","SetClampedToScreen","SetUserPlaced","IsProtected","Raise","SetToplevel",
}
local BUTTON = {
 "SetText","GetText","GetFontString","SetNormalTexture","GetNormalTexture",
 "SetHighlightTexture","GetHighlightTexture","SetPushedTexture","SetDisabledTexture",
 "RegisterForClicks","Enable","Disable","LockHighlight","UnlockHighlight",
 "SetNormalFontObject","SetHighlightFontObject","SetDisabledFontObject","GetTextWidth","Click",
}
local CHECKBUTTON = { "SetChecked","GetChecked" }
local EDITBOX = {
 "SetText","GetText","SetAutoFocus","SetNumeric","SetNumber","GetNumber","SetCursorPosition",
 "HighlightText","ClearFocus","SetFocus","SetMaxLetters","SetMultiLine","SetTextInsets","Insert",
}
local SCROLLFRAME = { "SetScrollChild","GetScrollChild","SetVerticalScroll","GetVerticalScroll","UpdateScrollChildRect" }
-- 3.3.5a has GetCurrentScroll, NOT GetScrollOffset
local SMF = {
 "AddMessage","Clear","SetMaxLines","GetMaxLines","SetFading","SetFadeDuration",
 "SetInsertMode","SetScrollOffset","GetCurrentScroll","ResetAllFadeTimes",
 "ScrollUp","ScrollDown","SetTimeVisible",
}
local SLIDER = { "SetValue","GetValue","SetMinMaxValues","SetValueStep","SetOrientation" }

local function build(sets)
  local t={}
  for _,set in ipairs(sets) do
    for _,name in ipairs(set) do t[name]=noop end
  end
  return t
end

local METHODS = {
  FontString = build{REGION,FONTINSTANCE,FONTSTRING},
  Texture    = build{REGION,TEXTURE},
  Frame      = build{REGION,FRAME},
  Button     = build{REGION,FRAME,FONTINSTANCE,BUTTON},
  CheckButton= build{REGION,FRAME,FONTINSTANCE,BUTTON,CHECKBUTTON},
  EditBox    = build{REGION,FRAME,FONTINSTANCE,EDITBOX},
  ScrollFrame= build{REGION,FRAME,SCROLLFRAME},
  ScrollingMessageFrame = build{REGION,FRAME,FONTINSTANCE,SMF},
  Slider     = build{REGION,FRAME,SLIDER},
  GameTooltip= build{REGION,FRAME},
}
-- getters that must return something usable
local RETURNS = {
  GetWidth=num, GetHeight=num, GetScale=function() return 1 end,
  GetEffectiveScale=function() return 1 end, GetStringWidth=num, GetStringHeight=num,
  GetLeft=num, GetRight=num, GetTop=num, GetBottom=num,
  GetCenter=function() return 0,0 end, GetNumPoints=num,
  SetID=function(self,id) rawset(self,"__id",id) end,
  GetID=function(self) return self.__id or 0 end,
  GetText=str, GetNumber=num, GetValue=num, GetCurrentScroll=num, GetMaxLines=num,
  GetTextWidth=num, GetTextHeight=num, GetSpacing=num, GetAlpha=function() return 1 end,
  GetFont=function() return "Fonts\\\\FRIZQT__.TTF", 12, "" end,
  GetFontObject=function() return "GameFontNormal" end,
  GetTextColor=function() return 1,1,1,1 end,
  IsShown=function() return true end, IsVisible=function() return true end,
  GetObjectType=function(self) return self.__type end,
  IsObjectType=function(self,t) return self.__type==t end,
  GetName=function(self) return self.__name end,
  GetParent=function(self) return self.__parent end,
  HasScript=function(self,s) return self.__type~="FontString" and self.__type~="Texture" end,
  GetScript=function() return nil end,
  GetChecked=function(self) return self.__checked end,
  SetChecked=function(self,v) self.__checked=v end,
  GetNormalTexture=function(self) return _G.__mk("Texture",nil,self) end,
  GetFontString=function(self) return _G.__mk("FontString",nil,self) end,
  CreateTexture=function(self,name) return _G.__mk("Texture",name,self) end,
  CreateFontString=function(self,name) return _G.__mk("FontString",name,self) end,
  SetScript=function(self,k,fn) self.__scripts=self.__scripts or {} self.__scripts[k]=fn end,
  -- WoW reparents the child, and addons rely on GetParent afterwards
  SetScrollChild=function(self,child) if child then rawset(child,"__parent",self) end end,
  RegisterEvent=function(self,e)
    if type(e)~="string" or e=="" then error("RegisterEvent with a bad event name") end
    __events[e]=__events[e] or {}
    table.insert(__events[e],self)
  end,
}

__events={}

function _G.__mk(otype,name,parent)
  local o=setmetatable({},{__index=function(t,k)
    local r=RETURNS[k]
    if r~=nil then
      local m=METHODS[otype]
      if m and m[k]~=nil then return r end
      return nil                 -- type does not have this method: fail like the client
    end
    local m=METHODS[otype]
    if m and m[k]~=nil then return noop end
    return nil
  end})
  rawset(o,"__type",otype)
  rawset(o,"__name",name)
  rawset(o,"__parent",parent)
  if name then _G[name]=o end
  return o
end

local TEMPLATE_CHILDREN={}
function _G.__template(name,children) TEMPLATE_CHILDREN[name]=children end

function CreateFrame(ftype,name,parent,template)
  local o=_G.__mk(ftype,name,parent)
  if template then
    for tpl in string.gmatch(template,"[^,%s]+") do
      local kids=TEMPLATE_CHILDREN[tpl]
      if kids then
        for _,kid in ipairs(kids) do
          if name then _G.__mk(kid.type,name..kid.suffix,o) end
        end
      end
      -- Blizzard templates the addon leans on
      if tpl=="ChatConfigCheckButtonTemplate" or tpl=="UICheckButtonTemplate" then
        if name then _G.__mk("FontString",name.."Text",o) end
      end
      if tpl=="UIPanelScrollFrameTemplate" then
        if name then _G.__mk("Slider",name.."ScrollBar",o) end
      end
    end
  end
  return o
end
`

// ------------------------------------------------------------ global stubs
const GLOBAL_FUNCS = [
  'GetLocale:enUS', 'GetRealmName:Rexxar - Conquest of Azeroth', 'UnitName:Clericov',
  'GetAddOnMetadata:1.02', 'UnitClass:Warrior', 'GetTime:0', 'time:0', 'date:08/28',
  'IsInGuild:false', 'GetNumGuildMembers:0', 'GetGuildRosterInfo:nil',
  'GetNumFriends:0', 'GetFriendInfo:nil', 'ShowFriends:nil', 'GuildRoster:nil',
  'GetNumPartyMembers:0', 'GetNumRaidMembers:0', 'UnitExists:false', 'UnitIsUnit:false',
  'UnitGUID:0x0', 'GetUnitName:nil', 'GetInstanceInfo:none',
  'GetChannelList:list', 'GetChannelName:0', 'JoinChannelByName:nil', 'SendChatMessage:nil',
  'PlaySound:nil', 'InCombatLockdown:false', 'IsShiftKeyDown:false', 'IsControlKeyDown:false',
  'GetCursorPosition:0', 'GetCVar:0', 'SetCVar:nil', 'GetBuildInfo:build',
  'InterfaceOptions_AddCategory:nil', 'InterfaceOptionsFrame_OpenToCategory:nil',
  'StaticPopup_Show:nil', 'StaticPopup_Hide:nil', 'PanelTemplates_SetTab:nil',
  'UIDropDownMenu_CreateInfo:table', 'UIDropDownMenu_AddButton:nil',
  'UIDropDownMenu_Initialize:nil', 'UIDropDownMenu_SetText:nil', 'UIDropDownMenu_SetWidth:nil',
  'ToggleDropDownMenu:nil', 'GameTooltip_SetDefaultAnchor:nil', 'SecondsToTime:0s',
  'ChatFrame_AddMessageGroup:nil', 'ChatFrame_RemoveChannel:nil', 'ChatFrame_AddChannel:nil',
  'ChatFrame_RemoveAllMessageGroups:nil', 'ChatFrame_RemoveAllChannels:nil',
  'FCF_OpenNewWindow:frame', 'FCF_SelectDockFrame:nil', 'ChatEdit_SendText:nil',
  'SendWho:nil', 'InviteUnit:nil', 'AddIgnore:nil', 'GetGuildInfo:nil',
  'IsItemInRange:false', 'CheckInteractDistance:false', 'UnitInRange:false',
  'UnitIsPlayer:true', 'UnitIsVisible:true', 'GetRealZoneText:Orgrimmar',
  'GetPlayerInfoByGUID:nil', 'GetMinimapShape:ROUND', 'ChatFrame_OpenChat:nil',
  'ChatEdit_FocusActiveWindow:nil', 'GetCursorInfo:nil', 'RGBPercToHex:ffffff',
]

const LUA_GLOBALS = `
local function noop() end
${GLOBAL_FUNCS.map(spec => {
  const [name, kind] = spec.split(':')
  if (kind === 'nil') return `function ${name}() end`
  if (kind === 'false') return `function ${name}() return false end`
  if (kind === 'true') return `function ${name}() return true end`
  if (kind === '0') return `function ${name}() return 0 end`
  if (kind === 'table') return `function ${name}() return {} end`
  if (kind === 'frame') return `function ${name}(n) return CreateFrame("Frame", n or "ChatFrameX") end`
  if (kind === 'build') return `function ${name}() return "3.3.5",12340,"2010","30300" end`
  if (kind === 'list') return `function ${name}() return 1,"General",2,"Trade",5,"LookingForGroup" end`
  if (kind === 'none') return `function ${name}() return "none","none",1,"","","","",0,0,0 end`
  return `function ${name}() return "${kind}" end`
}).join('\n')}

-- WoW ships these Lua aliases as globals
tinsert=table.insert tremove=table.remove tsort=table.sort wipe=function(t) for k in pairs(t) do t[k]=nil end return t end
strfind=string.find strmatch=string.match strsub=string.sub strlower=string.lower
strupper=string.upper strrep=string.rep strlen=string.len format=string.format
gsub=string.gsub gmatch=string.gmatch strtrim=function(s) return (s:gsub("^%s*(.-)%s*$","%1")) end
strsplit=function(sep,s) local out={} for w in s:gmatch("([^"..sep.."]+)") do out[#out+1]=w end return unpack(out) end
strjoin=function(sep,...) return table.concat({...},sep) end
abs=math.abs ceil=math.ceil floor=math.floor max=math.max min=math.min
random=math.random sqrt=math.sqrt mod=math.fmod

UISpecialFrames={}
StaticPopupDialogs={}
function UnitLevel() return 60 end
function IsInInstance() return false,"none" end
-- FrameXML string constants the addon builds /who patterns from
WHO_LIST_FORMAT="%s: %s, Level: %d, %s, %s, Zone: %s"
WHO_LIST_GUILD_FORMAT="%s: %s, Level: %d, %s, %s, Guild: %s, Zone: %s"
ERR_FRIEND_ONLINE_SS="|Hplayer:%s|h[%s]|h has come online."
CHAT_FLAG_AFK="<Away>" CHAT_FLAG_DND="<Busy>" CHAT_FLAG_GM="<GM>"
InterfaceOptionsFrame=CreateFrame("Frame","InterfaceOptionsFrame")
NUM_CHAT_WINDOWS=10
MAX_PARTY_MEMBERS=4
MAX_RAID_MEMBERS=40
UIParent=CreateFrame("Frame","UIParent")
Minimap=CreateFrame("Frame","Minimap")
WorldFrame=CreateFrame("Frame","WorldFrame")
GameTooltip=CreateFrame("GameTooltip","GameTooltip")
GameTooltip.SetOwner=noop GameTooltip.AddLine=noop GameTooltip.ClearLines=noop
GameTooltip.SetMinimumWidth=noop GameTooltip.SetHyperlink=noop GameTooltip.GetUnit=noop
DEFAULT_CHAT_FRAME=CreateFrame("ScrollingMessageFrame","ChatFrame1")
DEFAULT_CHAT_FRAME.editBox=CreateFrame("EditBox","ChatFrame1EditBox")
ChatFrame1=DEFAULT_CHAT_FRAME
InterfaceOptionsFramePanelContainer=CreateFrame("Frame","InterfaceOptionsFramePanelContainer")
ColorPickerFrame=CreateFrame("Frame","ColorPickerFrame")
ChatTypeGroup={SAY={},EMOTE={},YELL={},GUILD={},OFFICER={},PARTY={},RAID={},SYSTEM={},
  PARTY_LEADER={},RAID_LEADER={},RAID_WARNING={},BATTLEGROUND={},BATTLEGROUND_LEADER={},
  MONSTER_WHISPER={},MONSTER_BOSS_WHISPER={}}
RAID_CLASS_COLORS={WARRIOR={r=.78,g=.61,b=.43},MAGE={r=.41,g=.8,b=.94},ROGUE={r=1,g=.96,b=.41},
  DRUID={r=1,g=.49,b=.04},HUNTER={r=.67,g=.83,b=.45},SHAMAN={r=0,g=.44,b=.87},
  PRIEST={r=1,g=1,b=1},WARLOCK={r=.58,g=.51,b=.79},PALADIN={r=.96,g=.55,b=.73}}
CLASS_SORT_ORDER={"WARRIOR","MAGE","ROGUE","DRUID","HUNTER","SHAMAN","PRIEST","WARLOCK","PALADIN"}
LOCALIZED_CLASS_NAMES_MALE={WARRIOR="Warrior",MAGE="Mage",ROGUE="Rogue",DRUID="Druid",
  HUNTER="Hunter",SHAMAN="Shaman",PRIEST="Priest",WARLOCK="Warlock",PALADIN="Paladin"}
LOCALIZED_CLASS_NAMES_FEMALE=LOCALIZED_CLASS_NAMES_MALE
CLASS_ICON_TCOORDS={}
ICON_TAG_LIST={}
SLASH_X1=nil
SlashCmdList={}
LibStub=nil
`

// --------------------------------------------------------------------- run
const L = lauxlib.luaL_newstate()
lualib.luaL_openlibs(L)

function run(chunk, name, varargs) {
  const src = varargs
    ? `local __chunk = ...; return __chunk("LFGBulletinBoard", __ADDON)`
    : null
  if (lauxlib.luaL_loadbuffer(L, to_luastring(chunk), null, to_luastring('@' + name)) !== lua.LUA_OK) {
    throw new Error(`${name}: ${lua.lua_tojsstring(L, -1)}`)
  }
  const nargs = varargs ? 2 : 0
  if (varargs) {
    lua.lua_pushstring(L, to_luastring('LFGBulletinBoard'))
    lua.lua_getglobal(L, to_luastring('__ADDON'))
  }
  if (lua.lua_pcall(L, nargs, 0, 0) !== lua.LUA_OK) {
    throw new Error(`${name}: ${lua.lua_tojsstring(L, -1)}`)
  }
}

let failed = 0
const fail = (where, e) => { failed++; console.log(`  FAIL  ${where}\n        ${e.message.replace(/^.*?:\s*/, '')}`) }

try {
  run(PRELUDE, 'prelude')
  run(LUA_GLOBALS, 'globals')

  // XML derived objects and templates
  const tpl = Object.entries(xmlTemplates)
    .map(([n, t]) => `__template("${n}",{${t.children.map(c => `{type="${c.type}",suffix="${c.suffix}"}`).join(',')}})`)
    .join('\n')
  const objs = xmlCreated.map(o => `__mk("${o.type}","${o.name}")`).join('\n')
  run(`${tpl}\n${objs}\n__ADDON={}`, 'xml-frames')
  console.log(`  ok    XML: ${xmlCreated.length} frames, ${Object.keys(xmlTemplates).length} templates`)
} catch (e) { fail('setup', e); process.exit(1) }

// load the files in TOC order
const toc = readdirSync(dir).find(f => f.toLowerCase().endsWith('.toc'))
const files = readFileSync(join(dir, toc), 'utf8').split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.toLowerCase().endsWith('.lua'))

for (const f of files) {
  try {
    run(readFileSync(join(dir, f), 'utf8'), f, true)
    console.log(`  ok    load ${f}`)
  } catch (e) { fail(`load ${f}`, e) }
}

// startup path: OnLoad, then ADDON_LOADED, which is what runs Init/OptionsInit
const STEPS = [
  ['GBB.OnLoad()', 'local GBB=__ADDON GBB.OnLoad()'],
  ['ADDON_LOADED -> Init + OptionsInit', `
    for _,frame in ipairs(__events["ADDON_LOADED"] or {}) do
      local h=frame.__scripts and frame.__scripts.OnEvent
      if h then h(frame,"ADDON_LOADED","LFGBulletinBoard") end
    end
    if not __ADDON.Initalized then error("Init did not complete: GBB.Initalized is not set",0) end`],
  ['dungeon tables complete', `
    -- Every key the options panel walks needs a level range AND an English
    -- fallback name. A key without either takes the whole panel down, which is
    -- exactly how the 1.02 options crash happened.
    local GBB=__ADDON
    local sort=GBB.dungeonSort or {}
    local noLevel,noName={},{}
    for i=1,(GBB.WOTLKMAXDUNGEON or 0) do
      local key=sort[i]
      if key then
        if GBB.dungeonLevel[key]==nil then noLevel[#noLevel+1]=i..":"..key end
        local mt=getmetatable(GBB.dungeonNames or {})
        local fb=mt and mt.__index
        if type(fb)=="table" and fb[key]==nil then noName[#noName+1]=i..":"..key end
      end
    end
    if #noLevel>0 then error("no dungeonLevel entry for: "..table.concat(noLevel,", "),0) end
    if #noName>0 then error("no English fallback name for: "..table.concat(noName,", "),0) end`],
  ['minimap button created', `
    -- Init creates the button only after OptionsInit returns. Every crash in
    -- the options panel so far showed up to the user as "the icon is missing",
    -- so assert it directly instead of inferring it.
    local GBB=__ADDON
    if not (GBB.MinimapButton and GBB.MinimapButton.icon) then
      error("minimap button was never created: Init did not reach it",0)
    end`],
  ['classic filter panel built', `
    local GBB=__ADDON
    if GBB.DBChar["FilterDungeonRFC"]==nil then
      error("Classic dungeon filters were never created: OptionsInit stopped early",0)
    end
    if GBB.DBChar["FilterDungeonMPLUS"]~=true then
      error("Mythic+ filter is not enabled by default",0)
    end`],
  ['GBB.UpdateList()', 'local GBB=__ADDON GroupBulletinBoardFrame.IsVisible=function() return true end GBB.UpdateList()'],
  ['CHAT_MSG_CHANNEL on channel 1', `
    -- The real path: the addon gates on GBB.DBChar.channel[arg8] before it ever
    -- parses. On CoA nearly everything is posted in channel 1 ("Ascension").
    local GBB=__ADDON
    local raw="|cffa335ee|Hitem:137642::::::::60:::::|h[Keystone: Scarlet Monastery - Library (11)]|h|r 1 slot heal /W ivl class"
    local d,isGood,isBad,wc = GBB.GetDungeons(raw,"Magicnovitch")
    local names={}
    for k,v in pairs(d or {}) do if v then names[#names+1]=k end end
    table.sort(names)
    __DIAG=("channel[1]="..tostring(GBB.DBChar.channel[1])
      .."  isGood="..tostring(isGood).."  isBad="..tostring(isBad)
      .."  words="..tostring(wc).."  dungeons={"..table.concat(names,",").."}"
      .."  tag_keystone="..tostring(GBB.tagList and GBB.tagList["keystone"])
      .."  filterMPLUS="..tostring(GBB.FilterDungeon("MPLUS",false,true)))
    for _,frame in ipairs(__events["CHAT_MSG_CHANNEL"] or {}) do
      local h=frame.__scripts and frame.__scripts.OnEvent
      if h then h(frame,"CHAT_MSG_CHANNEL",raw,"Magicnovitch","","1. Ascension","","",0,1,"Ascension","",7,"") end
    end
    local hit=nil
    for _,r in pairs(GBB.RequestList) do
      if type(r)=="table" and r.name=="Magicnovitch" and r.dungeon then hit=(hit and hit..", " or "")..r.dungeon end
    end
    __RESULT0=hit or "(nothing reached the board)"`],
  ['parse a keystone request', `
    local GBB=__ADDON
    GBB.DBChar.channel[1]=true
    GBB.ParseMessage("|cffa335ee|Hitem:137642::::::::60:::::|h[Keystone: Scarlet Monastery - Library (11)]|h|r 1 slot heal /W ivl class","Magicnovitch",nil,"Ascension")
    local hit=nil
    for _,r in pairs(GBB.RequestList) do
      if type(r)=="table" and r.dungeon then hit=(hit and hit..", " or "")..r.dungeon end
    end
    __RESULT=hit or "(nothing matched)"`],
  ['keystone with no role word', `
    local GBB=__ADDON
    GBB.ParseMessage("|Hitem:1::::::::60:::::|h[Keystone: Gnomeregan (14)]|h anyone?","Keyguy",nil,"Ascension")
    local hit=nil
    for _,r in pairs(GBB.RequestList) do
      if type(r)=="table" and r.name=="Keyguy" and r.dungeon then hit=(hit and hit..", " or "")..r.dungeon end
    end
    __RESULT3=hit or "(nothing matched)"`],
  ['mythic plus phrasings', `
    -- The tokeniser destroys punctuation, so these can only match by pattern.
    local GBB=__ADDON
    local cases={
      "LF3M +11 SM Library need heal",
      "M+ 8 lfm dps",
      "lf2m 14 key tank",
      "mythic scarlet monastery lf1m",
      "[Keystone: Gnomeregan (14)] lf3m",
    }
    local bad={}
    for _,line in ipairs(cases) do
      local d=GBB.GetDungeons(line,"Tester")
      if not (d and d["MPLUS"]) then bad[#bad+1]=line end
    end
    if #bad>0 then error("not recognised as Mythic+: "..table.concat(bad," | "),0) end`],
  ['a real sale must stay in Trade', `
    local GBB=__ADDON
    local d=GBB.GetDungeons("WTS |Hitem:1::::::::60:::::|h[Arcanite Reaper]|h 500g","Seller")
    if not (d and d["TRADE"]) then error("a plain item sale no longer counts as Trade",0) end
    if d["MPLUS"] then error("a plain item sale was filed as Mythic+",0) end`],
  ['parse a plain LFM line', `
    local GBB=__ADDON
    GBB.ParseMessage("LF2M SM Library, need tank and heal","Someone",nil,"Ascension")
    local hit=nil
    for _,r in pairs(GBB.RequestList) do
      if type(r)=="table" and r.name=="Someone" and r.dungeon then hit=(hit and hit..", " or "")..r.dungeon end
    end
    __RESULT2=hit or "(nothing matched)"`],
]
console.log('')
for (const [label, code] of STEPS) {
  try {
    run(`local ok,err=pcall(function() ${code} end) if not ok then error(err,0) end`, label)
    console.log(`  ok    ${label}`)
  } catch (e) { fail(label, e) }
}

try {
  run(`if __DIAG then print("        "..__DIAG) end if __RESULT0 then print("        via CHAT_MSG_CHANNEL -> ".. __RESULT0) end if __RESULT then print("        direct parse -> ".. __RESULT) end if __RESULT2 then print("        plain LFM -> ".. __RESULT2) end if __RESULT3 then print("        bare keystone -> ".. __RESULT3) end`, 'result')
} catch { /* ignore */ }

console.log(`\nLoad test: ${failed === 0 ? 'passed' : failed + ' failure(s)'}`)
process.exit(failed ? 1 : 0)
