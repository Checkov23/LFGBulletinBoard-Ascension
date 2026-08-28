# LFG Bulletin Board for WoW 3.3.5a (Project Ascension)

A port of **LFG Bulletin Board 2.64** to the old **WotLK 3.3.5a client (Interface 30300)**,
with extra content categories for Project Ascension's **Conquest of Azeroth** game mode.

The addon watches your chat channels for group requests, sorts them by instance and shows
them in its own window. Left click whispers the poster, Shift + left click runs `/who`,
Ctrl + left click invites.

German notes: see [LIESMICH.md](LIESMICH.md).

## Why this port exists

The upstream 2.64 release declares `## Interface: 30400`. That is WotLK **Classic**, the 2022
re-release, not the 3.3.5a client that private servers run. Both are called "WotLK" but their
APIs differ, and the old client aborts loading an addon as soon as it touches a function or
event it does not know.

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

**`AscensionContent.lua`** adds the Conquest of Azeroth group content as four categories:

| Category | Recognises among others |
|---|---|
| Manastorm | `manastorm`, `mstorm` |
| Mythic+ (Keystone) | `mythic`, `mplus`, `keystone`, `key`, `keys` |
| CoA Custom Dungeons | `torwatha`, `inquisition`, `voti`, `bardid`, `otherside`, `rtdos`, `embers`, `shadowbone`, `brc`, `frozenreach`, `forgottenmine`, `korrim` |
| World Bosses | `worldboss`, `wbtour`, `azuregos`, `kazzak`, `emeriss`, `lethon`, `taerar`, `ysondre`, `setis`, `atalzul`, `snowgrave` |

The file only appends, it does not modify any existing table. To drop the categories again,
remove the `AscensionContent.lua` line from the `.toc`.

`key` and `keys` are included on purpose because "LF2M +8 key" is the common phrasing. If that
is too noisy for you, remove the words under *Settings > Search patterns* for that category.

Channel selection works on **channel numbers**, not names, so it works on any server. All slots
are enabled by default.

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

Current state: 16 files, 0 syntax errors, 0 hard violations.

`tools/` also holds the three patch scripts that produced this port from the upstream sources.
Every replacement in them carries an expected hit count and aborts if it does not match
exactly, so the port can be repeated against a newer upstream release.

## Known limits

* The load path is verified statically and by review, **not in a running game**. Do the first
  launch somewhere an error popup does not bother you.
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
