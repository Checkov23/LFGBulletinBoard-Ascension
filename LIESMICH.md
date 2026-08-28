# LFG Bulletin Board für Ascension (WoW 3.3.5a)

Portierung von **LFG Bulletin Board 2.64** auf den WotLK-Client **3.3.5a, Interface 30300**,
plus die Gruppeninhalte von **Conquest of Azeroth**.

Das Addon durchsucht die Chatkanäle im Hintergrund nach Gruppengesuchen, sortiert sie nach
Instanz und zeigt sie in einem eigenen Fenster. Linksklick flüstert die Person an,
Shift + Linksklick macht ein `/who`, Strg + Linksklick lädt ein.

## Warum die Vorlage nicht lief

Die mitgelieferte Version deklariert `## Interface: 30400`. Das ist WotLK **Classic**,
Blizzards Neuauflage von 2022, nicht der alte 3.3.5a-Client. Beide heißen „WotLK", haben
aber unterschiedliche APIs. Der alte Client bricht das Laden eines Addons ab, sobald es eine
Funktion oder ein Ereignis anspricht, das er nicht kennt.

## Was CoA ist

`CoA` = **Conquest of Azeroth**, ein Spielmodus von Project Ascension auf den Realms
**Vol'jin** und **Rexxar**. Gleicher Launcher, gleicher Client: WoW 3.3.5a, Build 12340,
Interface **30300**. Stufengrenze **60**, Inhalt ist Vanilla-Azeroth mit 21 eigenen Klassen,
eigenen Dungeons, Mythic+ und Manastorm. Deine Einschätzung „das ist der WotLK-Client" war
richtig.

## Einbauen

1. Rechtsklick auf die Ascension-Verknüpfung, **Dateipfad öffnen**. Von dort in
   `Interface\AddOns`. Der volle Pfad sieht je nach Installation so aus:
   `…\Ascension\Launcher\resources\ascension-live\Interface\AddOns\`
   (ältere Installationen heißen `resources\client` statt `resources\ascension-live`).
2. Den Ordner **`LFGBulletinBoard`** dort hineinkopieren, nicht diesen Elternordner.
   Der Ordnername muss exakt so heißen wie die `.toc`-Datei, sonst taucht das Addon
   in der Liste gar nicht erst auf.
3. WoW komplett neu starten, kein `/reload`.
4. Im Charakterbildschirm unter **AddOns** prüfen, dass es aktiv ist. Falls es als veraltet
   markiert ist, den Haken **„Load out of date AddOns"** setzen.
5. Im Spiel: `/gbb` öffnet das Fenster, `/gbb config` die Einstellungen.

Zwei Launcher-Eigenheiten: Der Launcher überschreibt Addons, die er selbst installiert hat,
aber lässt von Hand kopierte in Ruhe. Und der PTR-Zweig hat einen komplett eigenen
`Interface\AddOns`-Baum, dort müsstest du es ein zweites Mal ablegen.

## Was am Original kaputt war

**Ließ das Addon gar nicht erst laden oder starten:**

| Stelle | Problem im 3.3.5a-Client |
|---|---|
| `## Interface: 30400` | Client erwartet 30300 |
| `GROUP_JOINED`, `GROUP_ROSTER_UPDATE`, `GROUP_LEFT`, `LOADING_SCREEN_DISABLED` | Diese Ereignisse gibt es nicht. `RegisterEvent` wirft dafür einen Fehler und bricht das Laden ab |
| `C_FriendList.*` | kam erst mit BfA |
| `C_Map.GetBestMapForUnit` | kam erst mit Legion |
| `IsGuildMember(guid)` | gibt es nicht |
| `IsInRaid`, `IsInGroup`, `GetNumGroupMembers`, `UnitFullName` | kamen erst mit MoP |
| `UnitDistanceSquared` | kam erst mit WoD |
| `Texture:SetColorTexture` | kam erst mit Legion |
| `PlaySound(1210)` | 3.3.5a kennt nur Ton-Namen, keine SoundKit-IDs |
| `INSTANCE_CHAT` als Chatgruppe | kam erst mit MoP |
| `RAID_CLASS_COLORS[x].colorStr` | `colorStr` fehlt in 3.3.5a |
| `GuildNameToIndex` | erwartete Namen als `Name-Realm`; 3.3.5a liefert nur `Name` → `nil`-Fehler |
| `Region:SetSize` | durch `SetWidth`/`SetHeight` ersetzt |

**Hätte das Addon zwar geladen, wäre aber im Spiel kaputt gewesen.** Diese Fehler kamen aus
einer Gegenprüfung heraus, bei der jeder Befund noch einmal einzeln widerlegt werden musste:

| Stelle | Auswirkung im Spiel |
|---|---|
| `ScrollFrame.ScrollBar` (RequestList) | In 3.3.5a heißt der Scrollbalken `$parentScrollBar` und hängt nicht am Frame. **Das Fenster wäre dauerhaft leer geblieben**, mit einem Lua-Fehler alle 0,5 Sekunden |
| `GetChecked()` (LibGPIOptions) | Liefert in 3.3.5a `1`/`nil` statt `true`/`false`. Jede abgehakte Option mit Vorgabe „an" wäre nach dem nächsten Login wieder angesprungen, inklusive aller Kanal- und Instanzfilter |
| `OnHyperlinkEnter`/`-Leave` auf einfachen Frames | Gibt es in 3.3.5a nur auf `ScrollingMessageFrame`. Fehler beim ersten Zeichnen eines Eintrags |
| `GetScrollOffset()` | Heißt in 3.3.5a `GetCurrentScroll`. Mausrad über der Gruppenliste hätte einen Fehler geworfen |
| `GetChannelName` liefert `0`, nicht `nil` | Der Post-Knopf hätte still ins Leere gesendet, wenn der Kanal nicht betreten ist. Jetzt kommt eine Meldung |
| FileDataIDs `136477`/`136430`/`136467` als Texturen | Gibt es erst ab Legion. Minimap-Knopf ohne Rahmen und Hintergrund |
| `enableMouseWheel`/`enableMouseClicks` im XML | Keine gültigen Attribute in 3.3.5a. Wird jetzt in Lua gesetzt |
| Heroic-Filter auf `UserLevel == 70` verdrahtet | Auf CoA (Grenze 60) wären mit aktivem Stufenfilter **alle** Heroic-Anfragen verschwunden. Jetzt zählt die Obergrenze der jeweiligen Instanz |
| `FCF_OpenNewWindow(name, true)` | Der zweite Parameter existiert in 3.3.5a nicht, der LFG-Tab hätte Flüstern mit angezeigt |

## Was neu dazugekommen ist

**`Compat335.lua`** wird als erste Datei geladen und füllt ausschließlich Lücken. Was der
Client selbst mitbringt, bleibt unangetastet. Enthalten sind:

* Ersatz für `GetServerTime`, `tContains`, `IsInRaid`, `IsInGroup`, `GetNumGroupMembers`,
  `UnitFullName`, `C_FriendList`
* Freund- und Gildenprüfung **über den Namen** statt über die GUID, mit Zwischenspeicher,
  der sich bei `GUILD_ROSTER_UPDATE` erneuert
* Klassenermittlung über Gildenliste, Freundesliste und Gruppe, falls `GetPlayerInfoByGUID`
  nichts liefert
* Klassenfarben und Klassensymbole mit Rückfallwert. CoA hat 21 eigene Klassen, die in
  `RAID_CLASS_COLORS` nicht stehen müssen, und ohne Rückfallwert gäbe das einen Fehler
* `GetChannelList` wird tolerant eingelesen. **Ascension liefert Paare `(id, name)`, nicht
  Tripel `(id, name, disabled)`** wie neuere Clients. Das Original hätte hier jede zweite
  Kanalzuordnung verschoben
* `RegisterEvent` läuft über `pcall`, damit ein unbekannter Ereignisname nichts mehr abschießt

**`AscensionContent.lua`** ergänzt die CoA-eigenen Gruppeninhalte als vier Kategorien:

| Kategorie | Erkennt unter anderem |
|---|---|
| Manastorm | `manastorm`, `mstorm` |
| Mythic+ (Keystone) | `mythic`, `mplus`, `keystone`, `key`, `keys` |
| CoA Custom Dungeons | `torwatha`, `inquisition`, `voti`, `bardid`, `otherside`, `rtdos`, `embers`, `shadowbone`, `brc`, `frozenreach`, `forgottenmine`, `korrim` |
| World Bosses | `worldboss`, `wbtour`, `azuregos`, `kazzak`, `emeriss`, `lethon`, `taerar`, `ysondre`, `setis`, `atalzul`, `snowgrave` |

Die Datei hängt nur an, sie ändert keine bestehende Tabelle. Wenn dir eine Kategorie nicht
passt, nimm die Zeile `AscensionContent.lua` aus der `.toc`.

`key` und `keys` sind bewusst dabei, weil „LF2M +8 key" die übliche Schreibweise ist. Sollte
das zu viel Rauschen erzeugen, lassen sich die Begriffe unter *Einstellungen → Suchmuster*
bei der Kategorie herausnehmen.

Die Kanalauswahl läuft über **Kanalnummern**, nicht über Namen, und funktioniert damit auf
jedem Server. Ab Werk sind alle Plätze aktiv. Auf Ascension existieren unter anderem
`Ascension`, `LookingForGroup`, `Trade`, `GuildRecruitment` und `Newcomers`; der Client
erlaubt höchstens 10 gleichzeitig betretene Kanäle.

## Zum Posten

Der Post-Knopf sendet einmal pro Klick, es gibt keine automatische Wiederholung. Das ist gut
so: Ascensions Regeln zählen „dieselbe Information wiederholt" ausdrücklich als Spam, und
darauf steht eine Stummschaltung nach Ermessen des GMs. Gildenwerbung gehört dort in den
Kanal `GuildRecruitment`, nicht in `LookingForGroup` oder `Ascension`.

## Prüfen

`tools/check335.mjs` prüft alle Lua-Dateien gegen die Lua-5.1-Grammatik, die `.toc` gegen die
tatsächlich vorhandenen Dateien und den ganzen Ordner gegen eine Liste von APIs, XML-Attributen
und Aufrufmustern, die es in 3.3.5a nicht gibt.

```bash
npm i luaparse@0.3.1 && node tools/check335.mjs ./LFGBulletinBoard
```

Letzter Stand: 16 Dateien, 0 Syntaxfehler, 0 harte Verstöße.

In `tools/` liegen außerdem die drei Patch-Skripte, mit denen der Port aus dem Original
entstanden ist. Jede Ersetzung darin hat eine erwartete Trefferzahl und bricht ab, wenn sie
nicht genau passt. Damit lässt sich der Port auf eine neuere Fassung des Originals wiederholen.

## Grenzen

* Geprüft ist der Ladepfad statisch und durch Gegenlesen, **nicht im laufenden Spiel**. Den
  ersten Start machst du am besten dort, wo ein Fehlerfenster nicht stört.
* Hyperlink-Vorschau beim Überfahren eines Eintrags gibt es in 3.3.5a nicht, dieser Aufruf ist
  jetzt abgesichert statt aktiv. Klick, Flüstern, Einladen und `/who` sind davon nicht betroffen.
* Die aufgeteilten CoA-Dungeonflügel (Gnomeregan Engineering Labs, Uldaman Map Chamber und so
  weiter) haben keine eigenen Begriffe. Sie landen beim Hauptdungeon, sofern dessen Kürzel
  mit in der Nachricht steht.
* Alternative, falls du lieber etwas nimmst, das nativ für 3.3.5a gepflegt wird:
  `github.com/fondlez/GroupBulletinBoard` (BSD-3, Interface 30300). Das ist ein älterer Stand
  des Addons ohne die 2.6x-Neuerungen wie Raidkategorien, Heroic-Filter und Post-Feld, dafür
  ohne Portierungsaufwand.

Lizenz und Urheberschaft des Originals bleiben unberührt, siehe `LICENSE.txt`.
Original: LFG Bulletin Board von Vyscî-Whitemane.
