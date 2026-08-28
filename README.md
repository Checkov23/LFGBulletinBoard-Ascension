# LFG Bulletin Board for WoW 3.3.5a (Project Ascension)

A port of **LFG Bulletin Board 2.64** to the old **WotLK 3.3.5a client (Interface 30300)**,
with extra content categories for Project Ascension's **Conquest of Azeroth** game mode.

The addon watches your chat channels for group requests, sorts them by instance and shows
them in its own window. Left click whispers the poster, Shift + left click runs `/who`,
Ctrl + left click invites.

## Why this port exists

The upstream 2.64 release declares `## Interface: 30400`. That is WotLK **Classic**, the 2022
re-release, not the 3.3.5a client that private servers run. Both are called "WotLK" but their
APIs differ, and the old client aborts loading an addon as soon as it touches a function or
event it does not know.

Versions run as a simple increasing number: 1.02 is current. Release files carry the
version in the name, for example `LFGBulletinBoard-Ascension-1.02.zip`. The first two
releases went out as `2.64-ascension1` and `2.64-ascension2` and were renumbered to 1.00
and 1.01 so the release list sorts correctly. Both are kept, and the `.toc` inside those
two archives still shows the old name.

## Install

1. Right click your Ascension shortcut, **Open file location**, then go to `Interface\AddOns`.
   The full path usually looks like
   `...\Ascension\Launcher\resources\ascension-live\Interface\AddOns\`
   (older installs use `resources\client` instead of `resources\ascension-live`).
2. Copy the **`LFGBulletinBoard`** folder there, not the repository folder around it.
   The folder name has to match the `.toc` file name exactly, otherwise the addon never shows
   up in the list. Grabbing "Code > Download ZIP" is fine here, just copy the inner folder.
3. Restart the game completely. A `/reload` does not re-read the TOC.
4. On the character screen, check **AddOns**. If it is flagged as out of date, tick
   **Load out of date AddOns**.
5. In game: `/gbb` opens the window, `/gbb config` opens the settings.

The Ascension launcher overwrites addons it installed itself but leaves manually copied ones
alone. The PTR branch has its own separate `Interface\AddOns` tree.

## What was fixed

**Would have stopped the addon from loading:**

| Call | Problem on 3.3.5a |
|---|---|
| `## Interface: 30400` | client expects 30300 |
| `GROUP_JOINED`, `GROUP_ROSTER_UPDATE`, `GROUP_LEFT`, `LOADING_SCREEN_DISABLED` | these events do not exist. `RegisterEvent` throws on them and aborts loading |
| `C_FriendList.*` | added in BfA |
| `C_Map.GetBestMapForUnit` | added in Legion |
| `IsGuildMember(guid)` | does not exist |
| `IsInRaid`, `IsInGroup`, `GetNumGroupMembers`, `UnitFullName` | added in MoP |
| `UnitDistanceSquared` | added in WoD |
| `Texture:SetColorTexture` | added in Legion |
| `PlaySound(1210)` | 3.3.5a takes sound names, not SoundKit IDs |
| `INSTANCE_CHAT` chat group | added in MoP |
| `RAID_CLASS_COLORS[x].colorStr` | `colorStr` does not exist in 3.3.5a |
| `GuildNameToIndex` | expected `Name-Realm`; 3.3.5a returns bare `Name`, which produced a nil error |
| `Region:SetSize` | replaced with `SetWidth`/`SetHeight` |

**Would have loaded but broken in play:**

| Call | Effect in game |
|---|---|
| `ScrollFrame.ScrollBar` | on 3.3.5a the slider is `$parentScrollBar` and is not attached to the frame. **The window stayed empty**, with a Lua error every 0.5 seconds |
| `GetChecked()` | returns `1`/`nil` instead of `true`/`false`. Any option defaulting to on came back after the next login, including all channel and dungeon filters |
| `OnHyperlinkEnter` / `OnHyperlinkLeave` on plain frames | only exists on `ScrollingMessageFrame` here. Error while drawing the first entry |
| `GetScrollOffset()` | called `GetCurrentScroll` on 3.3.5a. Mouse wheel over the group list threw an error |
| `GetChannelName` returning `0`, not `nil` | the post button silently sent nowhere when the channel was not joined. It now says so |
| FileDataIDs `136477`/`136430`/`136467` as textures | file IDs arrived in Legion. Minimap button had no border or background |
| `enableMouseWheel` / `enableMouseClicks` in XML | not valid attributes in 3.3.5a, now set from Lua |
| heroic filter hardwired to `UserLevel == 70` | on a level 60 server every heroic request disappeared once the level filter was on. It now uses the instance's own upper level |
| `FCF_OpenNewWindow(name, true)` | the second parameter does not exist here, so the LFG tab also showed whispers |
| `FontString:SetScale()` | `SetScale` is a Frame method on 3.3.5a. Regions do not have it, so scaling a FontString threw. **This aborted `Init()` before the minimap button was created**, which is why the button was missing as well. Found in game on Rexxar |
| `FontString:SetMaxLines()` | same class of bug. It aborted `OptionsInit` at the channel checkboxes, so the TBC and Classic filter panels were never built and only the WotLK one showed. It also aborted `UpdateList`, so the window stayed empty. Found in game on Rexxar |
| a nil name for the CoA categories | self inflicted, in 1.02. The localisation panel reads the English fallback name table behind `GBB.dungeonNames` and concatenates it without a nil check, and the new keys were only in the front table. Same three symptoms again, because it aborted `Init`. Fixed in 1.03 |

## What was added

**`Compat335.lua`** loads first and only fills gaps. Anything the client provides itself is
left untouched. It supplies:

* replacements for `GetServerTime`, `tContains`, `IsInRaid`, `IsInGroup`,
  `GetNumGroupMembers`, `UnitFullName`, `C_FriendList`
* friend and guild lookups **by name** instead of by GUID, with a cache that refreshes on
  `GUILD_ROSTER_UPDATE`
* class lookup through the guild roster, the friends list and your group, for when
  `GetPlayerInfoByGUID` returns nothing
* class colours and class icons with a fallback value. Conquest of Azeroth has 21 custom
  classes that need not appear in `RAID_CLASS_COLORS`, and without a fallback that is an error
* a tolerant reader for `GetChannelList`. **Ascension returns pairs `(id, name)`, not triples
  `(id, name, disabled)`** like newer clients, which would have shifted every second channel
  mapping
* `RegisterEvent` wrapped in `pcall`, so an unknown event name cannot kill the addon
* `ScaleRegion`, a stand-in for `SetScale`. Frames are scaled normally, FontStrings are
  scaled through their font height instead, remembering the unscaled height so repeated
  calls do not compound
* `TryCall`, for methods that may be absent. `SetMaxLines` on a FontString is the case
  that matters: losing the effect is cosmetic, calling it is fatal

**`AscensionContent.lua`** adds the Conquest of Azeroth group content as four categories:

| Category | Recognises among others |
|---|---|
| Manastorm | `manastorm`, `mstorm` |
| Mythic+ (Keystone) | `mythic`, `mplus`, `keystone`, `key`, `keys` |
| CoA Custom Dungeons | `torwatha`, `inquisition`, `voti`, `bardid`, `otherside`, `rtdos`, `embers`, `shadowbone`, `brc`, `frozenreach`, `forgottenmine`, `korrim` |
| World Bosses | `worldboss`, `wbtour`, `azuregos`, `kazzak`, `emeriss`, `lethon`, `taerar`, `ysondre`, `setis`, `atalzul`, `snowgrave` |

The file only appends, it does not modify any existing table. To drop the categories again,
remove the `AscensionContent.lua` line from the `.toc`. The categories sit in the Classic
block of the filter list, since CoA runs vanilla content.

The Classic dungeon filters default to **on** here. Upstream ships them off, which leaves the
board empty on a server whose content is vanilla.

`key` and `keys` are included on purpose because "LF2M +8 key" is the common phrasing. If that
is too noisy for you, remove the words under *Settings > Search patterns* for that category.

**Keystones get special handling.** On CoA a keystone is posted as an item link:

```
[Keystone: Scarlet Monastery - Library (11)] 1 slot heal /W ivl class
```

The tokeniser turns the link prefix into the word `hitem`, which upstream lists as a Trade
keyword, so every keystone request would otherwise land under Trade. A line carrying a
keystone link now drops Trade, is pinned to Mythic+, and counts as a request even when the
poster writes no role word at all. The dungeon in the link still matches normally, so the
example above shows up under both Mythic+ and Scarlet Monastery: Library.

Channel selection works on **channel numbers**, not names, so it works on any server. All slots
are enabled by default.

## Addon traffic

3.3.5a cannot send addon messages over a chat channel, so addons that want a server wide bus
post serialized payloads as ordinary chat lines into a hidden channel:

```
LC1:CONF:dd2cba74:DW4Uoimmmu0ViIssZZzKqILWGz(kL2eK6aLhjQc4Rh3UzF8XhOWvq
```

You never see those, but a channel scanner does, and random letters reliably hit two and three
letter dungeon abbreviations. One such packet showed up as Stratholme, Zul'Aman and all four
Scarlet Monastery wings at once, the last because `sm` expands to every wing.

Those lines are dropped: a message counts as machine traffic when it contains a 20 character
unbroken alphanumeric run, or starts with two colon separated uppercase tokens. No human LFG
line does either, which is checked against real requests in the load test.

## When a line is not picked up

`/gbbraw` prints the next 8 channel lines exactly as the addon receives them, with the
categories each one matched:

```
/gbbraw          the next 8 lines
/gbbraw 20       the next 20
```

```
GBB: raw [1 Ascension] Magicnovitch: |cffa335ee|Hitem:137642:...|h[Keystone: ...]|h|r 1 slot heal
GBB:     -> MPLUS, SML
```

`-> no category` means the line reached the addon but matched nothing, so the keywords need
extending under *Settings > Search patterns*. No output at all means the line never arrived,
which is a channel problem.

`/gbbraw` also prints a status line first:

```
GBB: v1.05  english tags=true  keywords=418  keystone->MPLUS
GBB: channels on: 1,2,3,...   dungeon filters on/off: 93/0   level filter=false   entries held: 0
```

`channels on: NONE` or a large `filters off` count explains an empty board on its own.

One case worth knowing about, because it produced a completely empty board with no error at
all: this client ships a newer FrameXML `tContains` that returns `true` or **nothing**, where
stock 3.3.5a returns `true` or `false`. The bundled `Tool.Split` only added a word when
`tContains(...) == false`, so against Ascension it added nothing and every keyword list came
out empty. `/gbbraw` showed it as `keywords=1  keystone->nil`. Fixed in 1.06.

**`/gbbfix`** puts those back: all 20 channels on, every dungeon filter on, level filter off,
english keywords on, all headers unfolded, keyword table rebuilt. Window position and colours
are kept. Worth running once if the addon was installed while one of the pre-1.03 builds was
crashing during startup, because a crash part way through the options panel can leave half
written settings behind.

## Posting

The post button sends once per click. There is no auto repeat, deliberately: Ascension's rules
count "relaying the same information in a repeated fashion" as spam, and that is a mute at GM
discretion. Guild recruitment belongs in the `GuildRecruitment` channel there.

## Verifying a change

`tools/check335.mjs` parses every Lua file against the Lua 5.1 grammar, checks the `.toc`
against the files that actually exist, and greps the whole folder for APIs, XML attributes and
call patterns that do not exist on 3.3.5a.

```bash
npm i luaparse@0.3.1 && node tools/check335.mjs ./LFGBulletinBoard
```

It also rejects any method sent to a FontString that is not part of the 3.3.5a FontString
API. That single rule covers two of the crashes this port hit in game, `SetScale` and
`SetMaxLines`, and it was checked by reintroducing the bug and confirming the rule fires.

`tools/loadtest.mjs` goes further and actually **runs** the addon. It loads every file in TOC
order into a Lua VM against a stubbed 3.3.5a API, where each widget type exposes only the
methods that client really has, then drives the startup path and asserts:

* `Init` completes, which is what the three reported symptoms all depended on
* the minimap button was created
* the Classic filter panel exists and Mythic+ is enabled
* a real keystone line from the server parses into the Mythic+ category

```bash
npm i luaparse@0.3.1 fengari@0.1.4
node tools/check335.mjs ./LFGBulletinBoard
node tools/loadtest.mjs ./LFGBulletinBoard
```

The VM is Lua 5.3, so the harness restores the 5.1 behaviour the client has where it matters:
ascending `pairs` order over array tables, and `%` followed by a non-digit in a `gsub`
replacement. Without those two the harness reports failures that never happen in game.

Current state: 16 files, 0 syntax errors, 0 hard violations, load test passing.

`tools/` also holds the two scripts that produced this port from the upstream sources,
`port-30400-to-30300.py` and `fix-review-findings.py`. Every replacement in them carries an
expected hit count and aborts if it does not match exactly, so the port can be repeated
against a newer upstream release.

## Known limits

* Verified statically and by review, plus two rounds of real in game feedback from Rexxar
  (Conquest of Azeroth). Those produced the `SetScale` and `SetMaxLines` fixes. The 1.02
  fixes themselves are not confirmed in game yet. If something throws, the error text with
  the file and line is enough to work from.
* `SetMaxLines` has no equivalent on 3.3.5a, so the "do not truncate" option cannot expand a
  request to several lines. Messages stay on one line.
* Hyperlink tooltips on hover do not exist on 3.3.5a, so that call is now guarded rather than
  active. Click, whisper, invite and `/who` are unaffected.
* The split CoA dungeon wings (Gnomeregan Engineering Labs, Uldaman Map Chamber and so on) have
  no keywords of their own. They land under the parent dungeon if its abbreviation is in the
  message.
* If you would rather use something maintained natively for 3.3.5a, look at
  [fondlez/GroupBulletinBoard](https://github.com/fondlez/GroupBulletinBoard). That is an older
  state of the addon without the 2.6x additions such as raid categories, heroic filters and the
  post box, but it needs no porting work.

## Credits and licence

Original addon: **LFG Bulletin Board** by Vyscî-Whitemane, building on Group Bulletin Board.
Copyright (c) 2019 GPI, BSD 3-Clause. The original [LICENSE.txt](LFGBulletinBoard/LICENSE.txt)
is kept unchanged and applies to this port as well.

This repository is an independent port and is not endorsed by or affiliated with the original
authors or with Project Ascension.
