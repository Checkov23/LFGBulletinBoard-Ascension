// Checks the addon folder against the WoW 3.3.5a (Interface 30300) API surface.
//   npm i luaparse@0.3.1 && node tools/check335.mjs ./LFGBulletinBoard
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import luaparse from 'luaparse'

const dir = process.argv[2]
if (!dir) { console.error('usage: node check335.mjs <addonDir>'); process.exit(2) }

// Must be gone entirely: does not exist on 3.3.5a
const HARD = [
  [/\bC_Timer\b/, 'C_Timer does not exist on 3.3.5a'],
  [/\bC_Map\b/, 'C_Map does not exist on 3.3.5a'],
  [/\bC_ChatInfo\b/, 'C_ChatInfo does not exist'],
  [/\bC_Container\b/, 'C_Container does not exist'],
  [/\bC_AddOns\b/, 'C_AddOns does not exist'],
  [/\bC_CVar\b/, 'C_CVar does not exist'],
  [/\bEnum\./, 'Enum does not exist'],
  [/\bGetNumGroupMembers\s*\(/, 'GetNumGroupMembers does not exist'],
  [/\bGetNumSubgroupMembers\s*\(/, 'GetNumSubgroupMembers does not exist'],
  [/\bCreateFromMixins\s*\(|\bMixin\s*\(/, 'mixins do not exist (7.0+)'],
  [/BackdropTemplate/, 'BackdropTemplate does not exist (9.0+)'],
  [/\bSettings\./, 'Settings API does not exist (10.0+)'],
  [/\bGetPhysicalScreenSize\s*\(/, 'GetPhysicalScreenSize does not exist'],
  [/\bIsGuildMember\s*\(/, 'IsGuildMember(guid) does not exist on 3.3.5a'],
  [/["']GROUP_ROSTER_UPDATE["']|["']GROUP_JOINED["']|["']GROUP_LEFT["']|["']LOADING_SCREEN_DISABLED["']/,
    'event does not exist on 3.3.5a, RegisterEvent throws on it'],
  [/\bPlaySound\s*\(\s*\d/, 'PlaySound needs a name string on 3.3.5a, not a SoundKit ID'],
  [/\bSetColorTexture\s*\(/, 'Texture:SetColorTexture arrived with 7.0'],
  [/:SetSize\s*\(/, 'avoid Region:SetSize, use SetWidth/SetHeight'],
  [/\bRAID_CLASS_COLORS\s*\[/, 'do not index RAID_CLASS_COLORS directly, use GBB.Tool.ClassColor'],
  [/SetTexture\s*\(\s*\d|SetHighlightTexture\s*\(\s*\d|SetNormalTexture\s*\(\s*\d/,
    'FileDataID as a texture: 3.3.5a needs a path string'],
  [/\.ScrollBar\b(?!\s*or)/, 'ScrollFrame.ScrollBar is nil on 3.3.5a, use _G[name.."ScrollBar"]'],
  [/:GetScrollOffset\s*\(/, 'GetScrollOffset is called GetCurrentScroll on 3.3.5a'],
  [/enableMouseWheel\s*=|enableMouseClicks\s*=/, 'not an XML attribute on 3.3.5a, call EnableMouseWheel() from Lua'],
  [/\bGetChecked\(\)(?!\s*and)/, 'GetChecked returns 1/nil on 3.3.5a, normalise with "and true or false"'],
  [/:SetScale\s*\(/, 'SetScale is Frame only on 3.3.5a, route through GBB.Compat.ScaleRegion'],
]

// Allowed, because Compat335.lua catches it or the call site is guarded
const SHIMMED = [
  [/\bGetServerTime\s*\(/, 'GetServerTime (shim falls back to time)'],
  [/\btContains\s*\(/, 'tContains (shim)'],
  [/\bC_FriendList\b/, 'C_FriendList (shim over GetNumFriends/GetFriendInfo)'],
  [/\bIsInRaid\s*\(/, 'IsInRaid (shim over GetNumRaidMembers)'],
  [/\bIsInGroup\s*\(/, 'IsInGroup (shim)'],
  [/\bUnitFullName\s*\(/, 'UnitFullName (shim over UnitName)'],
  [/\bUnitDistanceSquared\s*\(/, 'UnitDistanceSquared (call is type checked)'],
  [/\bGetPlayerInfoByGUID\s*\(/, 'GetPlayerInfoByGUID (type checked, falls back to a name lookup)'],
  [/["']INSTANCE_CHAT(_LEADER)?["']/, 'INSTANCE_CHAT (filtered against ChatTypeGroup at runtime)'],
  [/\bSetHyperlinksEnabled\s*\(/, 'SetHyperlinksEnabled (call is guarded)'],
  [/\bSetTextCopyable\s*\(/, 'SetTextCopyable (call is guarded)'],
  [/\bIsTruncated\s*\(/, 'IsTruncated (call is guarded)'],
  [/\bSetRotation\s*\(/, 'SetRotation (call is guarded)'],
  [/\bScaleRegion\s*\(/, 'ScaleRegion (compat helper for SetScale)'],
]

// FontStrings are Regions, not Frames. Several methods that exist on a modern
// FontString are simply absent on 3.3.5a, and calling one aborts whatever is
// running: that is what broke Init twice during this port (SetScale, then
// SetMaxLines). So the receivers below may only be sent methods on this list.
const FONTSTRING_RECEIVER = /(_G\[[^\]]*"Text"\]|_G\[[^\]]*"_(?:name|message|time)"\]|Options\.Frames\[[^\]]*\]|\btextbox\b|GroupBulletinBoardFrameTitle|GroupBulletinBoardFrameStatusText):([A-Za-z_]\w*)\s*\(/g
const FONTSTRING_OK = new Set([
  // Region
  'GetName', 'GetObjectType', 'IsObjectType', 'GetParent', 'SetParent',
  'Show', 'Hide', 'IsShown', 'IsVisible', 'SetAlpha', 'GetAlpha',
  'SetPoint', 'GetPoint', 'GetNumPoints', 'ClearAllPoints', 'SetAllPoints',
  'SetWidth', 'GetWidth', 'SetHeight', 'GetHeight',
  'GetLeft', 'GetRight', 'GetTop', 'GetBottom', 'GetCenter',
  'SetDrawLayer', 'GetDrawLayer', 'SetVertexColor',
  // FontInstance
  'SetFont', 'GetFont', 'SetFontObject', 'GetFontObject',
  'SetTextColor', 'GetTextColor', 'SetShadowColor', 'SetShadowOffset',
  'SetSpacing', 'GetSpacing', 'SetJustifyH', 'GetJustifyH', 'SetJustifyV', 'GetJustifyV',
  // FontString
  'SetText', 'GetText', 'SetFormattedText', 'GetStringWidth', 'GetStringHeight',
  'SetNonSpaceWrap', 'CanNonSpaceWrap', 'SetTextHeight', 'SetAlphaGradient',
])

const ALLOW = /GBBCOMPAT_OK/

if (!existsSync(join(dir, 'Compat335.lua'))) console.log('WARNING: Compat335.lua is missing.')

const files = readdirSync(dir).filter(f => /\.(lua|xml|toc)$/i.test(f)).sort()
let syntaxErrors = 0, hard = 0
const shimHits = []

for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8')

  if (f.toLowerCase().endsWith('.lua')) {
    try {
      luaparse.parse(src, { luaVersion: '5.1', comments: false, scope: false })
      console.log(`  Lua 5.1 OK   ${f}`)
    } catch (e) {
      syntaxErrors++
      console.log(`  SYNTAX ERROR ${f}: ${e.message}`)
    }
  } else if (f.toLowerCase().endsWith('.toc')) {
    for (const line of src.split(/\r?\n/)) {
      const name = line.trim()
      if (!name || name.startsWith('#')) continue
      if (!existsSync(join(dir, name))) {
        hard++
        console.log(`  VIOLATION ${f}  TOC lists a missing file: ${name}`)
      }
    }
    const iface = /##\s*Interface:\s*(\d+)/.exec(src)
    if (!iface || iface[1] !== '30300') {
      hard++
      console.log(`  VIOLATION ${f}  Interface is ${iface ? iface[1] : 'not set'}, expected 30300`)
    } else {
      console.log(`  TOC OK       ${f} (Interface 30300)`)
    }
  }

  src.split(/\r?\n/).forEach((line, i) => {
    if (ALLOW.test(line)) return
    for (const [re, hint] of HARD) {
      if (re.test(line)) { hard++; console.log(`  VIOLATION ${f}:${i + 1}  ${hint}\n            ${line.trim().slice(0, 130)}`) }
    }
    for (const [re, hint] of SHIMMED) {
      if (re.test(line)) shimHits.push(`${f}:${i + 1}  ${hint}`)
    }

    FONTSTRING_RECEIVER.lastIndex = 0
    let m
    while ((m = FONTSTRING_RECEIVER.exec(line)) !== null) {
      if (!FONTSTRING_OK.has(m[2])) {
        hard++
        console.log(`  VIOLATION ${f}:${i + 1}  FontString has no ${m[2]} on 3.3.5a, use GBB.Compat.TryCall\n            ${line.trim().slice(0, 130)}`)
      }
    }
  })
}

console.log(`\nGuarded call sites (expected, not errors): ${shimHits.length}`)
for (const s of shimHits) console.log('  - ' + s)
console.log(`\nFiles: ${files.length} | syntax errors: ${syntaxErrors} | hard 3.3.5a violations: ${hard}`)
process.exit(syntaxErrors + hard > 0 ? 1 : 0)
