import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import luaparse from 'luaparse'

const dir = process.argv[2]
if (!dir) { console.error('usage: node check335.mjs <addonDir>'); process.exit(2) }

// Muss vollstaendig verschwunden sein: existiert in 3.3.5a nicht
const HARD = [
  [/\bC_Timer\b/, 'C_Timer fehlt in 3.3.5a'],
  [/\bC_Map\b/, 'C_Map fehlt in 3.3.5a'],
  [/\bC_ChatInfo\b/, 'C_ChatInfo fehlt'],
  [/\bC_Container\b/, 'C_Container fehlt'],
  [/\bC_AddOns\b/, 'C_AddOns fehlt'],
  [/\bC_CVar\b/, 'C_CVar fehlt'],
  [/\bEnum\./, 'Enum fehlt'],
  [/\bGetNumGroupMembers\s*\(/, 'GetNumGroupMembers fehlt'],
  [/\bGetNumSubgroupMembers\s*\(/, 'GetNumSubgroupMembers fehlt'],
  [/\bCreateFromMixins\s*\(|\bMixin\s*\(/, 'Mixins fehlen (7.0+)'],
  [/BackdropTemplate/, 'BackdropTemplate fehlt (9.0+)'],
  [/\bSettings\./, 'Settings-API fehlt (10.0+)'],
  [/\bGetPhysicalScreenSize\s*\(/, 'GetPhysicalScreenSize fehlt'],
  [/\bIsGuildMember\s*\(/, 'IsGuildMember(guid) gibt es in 3.3.5a nicht'],
  [/["']GROUP_ROSTER_UPDATE["']|["']GROUP_JOINED["']|["']GROUP_LEFT["']|["']LOADING_SCREEN_DISABLED["']/,
    'Ereignis existiert in 3.3.5a nicht -> Fehler beim RegisterEvent'],
  [/\bPlaySound\s*\(\s*\d/, 'PlaySound braucht in 3.3.5a einen Namens-String'],
  [/\bSetColorTexture\s*\(/, 'Texture:SetColorTexture gibt es erst ab 7.0'],
  [/:SetSize\s*\(/, 'Region:SetSize vermeiden -> SetWidth/SetHeight'],
  [/\bRAID_CLASS_COLORS\s*\[/, 'RAID_CLASS_COLORS direkt indiziert -> GBB.Tool.ClassColor benutzen'],
  // aus der Gegenpruefung des Ports gelernt
  [/SetTexture\s*\(\s*\d|SetHighlightTexture\s*\(\s*\d|SetNormalTexture\s*\(\s*\d/,
    'FileDataID als Textur: 3.3.5a braucht einen Pfad-String'],
  [/\.ScrollBar\b(?!\s*or)/, 'ScrollFrame.ScrollBar ist in 3.3.5a nil -> _G[name.."ScrollBar"]'],
  [/:GetScrollOffset\s*\(/, 'GetScrollOffset heisst in 3.3.5a GetCurrentScroll'],
  [/enableMouseWheel\s*=|enableMouseClicks\s*=/, 'XML-Attribut gibt es in 3.3.5a nicht -> EnableMouseWheel() in Lua'],
  [/\bGetChecked\(\)(?!\s*and)/, 'GetChecked liefert in 3.3.5a 1/nil -> "and true or false"'],
]

// Erlaubt, weil Compat335.lua es abfaengt oder die Aufrufstelle abgesichert ist
const SHIMMED = [
  [/\bGetServerTime\s*\(/, 'GetServerTime (Shim: faellt auf time zurueck)'],
  [/\btContains\s*\(/, 'tContains (Shim)'],
  [/\bC_FriendList\b/, 'C_FriendList (Shim ueber GetNumFriends/GetFriendInfo)'],
  [/\bIsInRaid\s*\(/, 'IsInRaid (Shim ueber GetNumRaidMembers)'],
  [/\bIsInGroup\s*\(/, 'IsInGroup (Shim)'],
  [/\bUnitFullName\s*\(/, 'UnitFullName (Shim ueber UnitName)'],
  [/\bUnitDistanceSquared\s*\(/, 'UnitDistanceSquared (Aufruf ist typgeprueft)'],
  [/\bGetPlayerInfoByGUID\s*\(/, 'GetPlayerInfoByGUID (typgeprueft, Fallback ueber Namen)'],
  [/["']INSTANCE_CHAT(_LEADER)?["']/, 'INSTANCE_CHAT (wird zur Laufzeit gegen ChatTypeGroup gefiltert)'],
  [/\bSetHyperlinksEnabled\s*\(/, 'SetHyperlinksEnabled (Aufruf ist abgesichert)'],
  [/\bSetTextCopyable\s*\(/, 'SetTextCopyable (Aufruf ist abgesichert)'],
  [/\bIsTruncated\s*\(/, 'IsTruncated (Aufruf ist abgesichert)'],
  [/\bSetRotation\s*\(/, 'SetRotation (Aufruf ist abgesichert)'],
]

const ALLOW = /GBBCOMPAT_OK/

if (!existsSync(join(dir, 'Compat335.lua'))) console.log('WARNUNG: Compat335.lua fehlt.')

const files = readdirSync(dir)
  .filter(f => /\.(lua|xml|toc)$/i.test(f))
  .sort()
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
      console.log(`  SYNTAXFEHLER ${f}: ${e.message}`)
    }
  } else if (f.toLowerCase().endsWith('.toc')) {
    // jede gelistete Datei muss es geben
    for (const line of src.split(/\r?\n/)) {
      const name = line.trim()
      if (!name || name.startsWith('#')) continue
      if (!existsSync(join(dir, name))) {
        hard++
        console.log(`  VERSTOSS ${f}  TOC listet fehlende Datei: ${name}`)
      }
    }
    const iface = /##\s*Interface:\s*(\d+)/.exec(src)
    if (!iface || iface[1] !== '30300') {
      hard++
      console.log(`  VERSTOSS ${f}  Interface ist ${iface ? iface[1] : 'nicht gesetzt'}, erwartet 30300`)
    } else {
      console.log(`  TOC OK       ${f} (Interface 30300)`)
    }
  }
  src.split(/\r?\n/).forEach((line, i) => {
    if (ALLOW.test(line)) return
    for (const [re, hint] of HARD) {
      if (re.test(line)) { hard++; console.log(`  VERSTOSS ${f}:${i + 1}  ${hint}\n           ${line.trim().slice(0, 130)}`) }
    }
    for (const [re, hint] of SHIMMED) {
      if (re.test(line)) shimHits.push(`${f}:${i + 1}  ${hint}`)
    }
  })
}

console.log(`\nAbgesicherte Stellen (erwartet, kein Fehler): ${shimHits.length}`)
for (const s of shimHits) console.log('  - ' + s)
console.log(`\nDateien: ${files.length} | Syntaxfehler: ${syntaxErrors} | harte 3.3.5a-Verstoesse: ${hard}`)
process.exit(syntaxErrors + hard > 0 ? 1 : 0)
