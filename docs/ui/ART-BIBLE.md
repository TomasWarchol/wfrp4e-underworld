# Art bible: "The Company Ledger" UI assets

Brief for every asset maker. Read all of section 1, then only your group in section 3.

## 1. Style

**Look:** early-modern German woodcut / linocut, as in 16th-century chronicles, broadsheets and Landsknecht prints. Bold black silhouettes, carved negative-space cuts, slightly irregular hand-cut edges, no smooth vector gloss. Grim and practical, never cute or cartoonish.

**Originality (hard rule):** every asset is original work. Do not reproduce or imitate any Games Workshop / Warhammer logo, emblem or insignia: no twin-tailed comet, no eight-pointed Chaos star, no named god symbols, no Imperial eagles or griffons from the books, no skull-with-wings logos, no text or lettering. Use generic historical motifs (tools, weapons, animals, plants, everyday objects).

### Technical rules for icons (sections 3.1–3.4)

- File: `<id>.svg`, exactly the ids listed in your group.
- Root: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`. No `width`/`height`, no `<style>`, no `class`, no `id`, no `<defs>` unless needed for a single clipPath/mask, no external references, no `<text>`, no raster images, no comments.
- Colour: only `fill="currentColor"` (on the root or the paths). No other colours, no gradients, no opacity except `fill-opacity="0.35"` for at most one secondary shape.
- Shape: filled silhouettes; use `fill-rule="evenodd"` to carve interior detail (2–4 cuts). Avoid hairlines: no visible feature thinner than 2.5 units. Strokes only if unavoidable, then `stroke="currentColor"`, `stroke-width` 3–4, `stroke-linecap="round"`, `fill="none"` on that element.
- Composition: subject centred, about 4 units padding, optical weight similar across the set. Readable at 20 px and at 64 px.
- Size: under 3 KB per file. Round coordinates to 1 decimal.
- Write paths by hand with care; check each icon by reasoning about its shape before writing. Prefer a clear simple silhouette over a detailed but muddy one.

### Technical rules for ornaments, crests and skylines (sections 3.5–3.6)

- Same root rules, but `viewBox` as given per asset. `fill="currentColor"`; you may use `fill-opacity` 0.25–0.6 for depth (at most two levels). No `<text>`, no external references.
- Ornaments must tile or scale cleanly as described per asset.
- Under 8 KB per file (skylines under 12 KB).

## 2. Delivery

- Write only into your output folder: `assets/ui/<group>/`.
- Also write `assets/ui/<group>/manifest.json`: an array of `{ "id", "file", "subject" }` in the listed order.
- Do not edit any other file in the repository. Do not download anything, do not use the network.
- When finished, report: the list of files, any ids you found hard and how you resolved them.

## 3. Asset lists

### 3.1 Roles — `assets/ui/roles/` (31 icons)

| id | subject |
|---|---|
| bodyguard | heavy cleaver crossed over a small round buckler |
| shadow | hooded head in profile with a dagger held point-down beside it |
| marksman | longbow drawn with a nocked arrow |
| provocateur | two dice and a fanned playing card |
| scavenger | stuffed sack with a bone saw leaning on it |
| smuggler | wagon wheel with a coiled whip |
| saboteur | burning torch above a small powder keg |
| scout | two boot prints under a small spyglass |
| fixer | hanging balance scales with a seal stamp |
| charlatan | stoppered potion bottle with a sprig of herb |
| duelist | rapier with a swept hilt, point up, and a feather |
| sergeant | short sword with two chevrons beneath |
| halberdier | halberd head (axe blade, hook, spike) on a pole |
| crossbowman | crossbow seen from above, loaded bolt |
| standard_bearer | swallow-tailed banner on a pole |
| surgeon | bone saw crossed with a rolled bandage |
| quartermaster | barrel with an open ledger leaning on it |
| helmsman | ship's steering wheel with eight handled spokes |
| boatman | oar crossed with a boathook |
| lookout | lantern held up beside an open eye |
| forger | quill pen crossed with a wax seal stamp |
| purser | tied coin purse with a notched tally stick |
| eavesdropper | ear next to a tankard |
| courier | sealed folded letter with a running boot behind it |
| enforcer | clenched fist wearing a studded knuckle band |
| acolyte | lit candle standing on a closed book |
| zealot | flail (wooden handle, chained spiked ball) with a small flame |
| spy | half-face mask with one eye hole |
| assassin | slim stiletto with a drop falling from the tip |
| orator | raised open hand above an unrolled scroll |
| alchemist | alembic / round-bottomed flask with a curved spout and bubbles |

### 3.2 Jobs — `assets/ui/jobs/` (42 icons). Split: agent A takes the first 21, agent B the last 21.

| id | subject |
|---|---|
| scout | spyglass extended diagonally |
| shadow | hooded walking figure with footprints behind |
| tavern | foaming tankard |
| procure | basket with a loaf and a bottle |
| pickpocket | purse hanging from a belt, a knife cutting its cords |
| burglary | large key beside a padlock |
| farm_theft | hen in profile |
| poaching | hare caught in a wire snare |
| highway_robbery | coach wheel with an axe across it |
| mine_raid | pickaxe over a lump of ore |
| fence | balance scales with a coin on one pan |
| intimidate | raised clenched fist |
| racket | hanging shop sign on a bracket with a coin |
| rumor_spread | mouth in profile with three whisper lines |
| bribe | open hand passing a coin to another hand |
| theman | folded letter sealed with a mask-shaped seal |
| distract | firecracker bursting with sparks |
| sabotage | broken cart wheel with cracked spokes |
| smuggle | crate with its false bottom slid open |
| forge | quill above a document with a seal |
| cover_tracks | besom broom sweeping over footprints |
| tend_wounded | needle and thread over a rolled bandage |
| patrol | pair of marching boots with a pike behind |
| garrison | gate tower with a portcullis |
| requisition | wheat sheaf with a receipt slip pinned to it |
| escort | kite shield in front of a covered wagon |
| contract | unrolled contract with a hanging seal, a sword behind it |
| drill | military side drum with two sticks |
| ambush | bush with an arrow flying out of it |
| ransom | tied sack with a short chain and a coin |
| toll | small arched bridge with a barrier pole |
| river_run | flat river barge with a single lantern |
| cache | chest half sunk in water among reeds |
| contraband | corked bottle in front of a small crate |
| buy_secret | large coin with a keyhole cut through it, a small coin beside |
| intercept | horseshoe with a sealed letter |
| letter_swap | two letters with curved swap arrows |
| report | open ledger with a quill |
| ritual | three candles in a circle on the ground |
| infiltrate | full-face theatre mask with a ribbon |
| abduction | sack hood with a cord |
| stone_circle | ring of four standing stones under a crescent moon |

### 3.3 Combat orders — `assets/ui/orders/` (39 icons). Split: agent A takes the first 20, agent B the last 19.

Subjects must stay generic, because each company type renames the orders.

| id | subject |
|---|---|
| meatshield | figure stepping in front of a falling blade |
| trip | boathook catching a boot at the ankle |
| bullrush | shoulder and shield driving forward with motion lines |
| flank | curved arrow going around a shield to its back |
| volley | three arrows flying in parallel |
| kidneystrike | dagger striking upward with a drop |
| cover | shield behind which arrows stop |
| disarm | sword spinning away from an open hand |
| distract | open shouting mouth with sound marks |
| smoke | billowing smoke cloud from a small pot |
| sand | hand throwing a spray of grit |
| resupply | bottle beside a bundle of three crossbow bolts |
| retreat | overturned barrel and planks forming a barricade |
| draught | hip flask tilted with a drop |
| rally | horn blowing with sound marks |
| coordinate | pointing hand above three small figures in line |
| retaliation | two curved arrows striking back |
| bodyblock | broad figure with arms spread as a shield |
| grapple | two arms locked together |
| circle | ring of five spear points facing outward |
| parry | two crossed blades meeting at a spark |
| riposte | blade deflecting then thrusting (bent arrow on a sword) |
| challenge | thrown gauntlet on the ground |
| pindown | arrows stuck in the ground around a helmet |
| fireoil | small barrel with flames |
| caltrops | three four-pointed caltrops |
| collapse | falling beam and stones |
| wagonwall | plank palisade with arrows stuck in it |
| spooked | rearing horse |
| getaway | running boot with speed lines |
| spot | eye with a target ring |
| lure | lantern on a hook swinging, with footprints leading off |
| snare | rope noose pegged to a stake |
| forgedorder | sealed order with a crossed-out seal |
| payoff | purse being tossed with coins falling |
| salve | small open pot of balm with a spatula |
| fumes | cracked flask releasing wavy vapour |
| evileye | eye with radiating jagged lines |
| regroup | three arrows converging to a point |

### 3.4 Interface — `assets/ui/interface/` (60 icons). Split: agent A takes the first 30, agent B the last 30.

| id | subject |
|---|---|
| morale | small pennant flag on a short staff |
| supplies | grain sack with a loaf |
| treasury | stack of coins with one standing |
| coin_gc | single large coin with a crown-like stepped rim (no lettering) |
| coin_ss | single coin with a simple star rosette |
| coin_d | single small coin with a square hole |
| pressure_underworld | nailed wanted poster with a face outline |
| pressure_outlaws | hunting horn |
| pressure_mercenaries | cracked heater shield |
| pressure_smugglers | round customs seal with a crossed anchor and key |
| pressure_investigators | wide open eye |
| pressure_cult | stake with bundled firewood at its foot |
| status_ready | carved tick mark in a circle |
| status_busy | hourglass |
| status_resting | crescent moon over a bedroll |
| status_wounded | blood drop with a bandage cross |
| status_arrested | open shackles |
| status_dead | skull |
| rank_rookie | single small dot |
| rank_seasoned | one chevron |
| rank_veteran | two chevrons |
| rank_lieutenant | two chevrons under a small crown of three points |
| risk_low | feather |
| risk_stealth | domino mask |
| risk_violent | skull above two crossed blades |
| terrain_city | three tall half-timbered gables |
| terrain_village | cottage with a thatched roof and a well |
| terrain_forest | two pine trees and an oak |
| terrain_mountains | two jagged peaks with snow caps |
| category_intel | eye over an open scroll |
| category_resources | sack with a coin |
| category_influence | marionette control cross with strings to a puppet |
| category_operations | two crossed swords |
| category_camp | campfire with three logs |
| token_recon | folded map with a cross mark |
| token_commotion | ringing bell |
| token_lead | pointing hand (manicule) as in old prints |
| loot_valuables | ring with a gem |
| loot_goods | bale tied with rope |
| loot_weapons | bundle of three swords tied together |
| loot_documents | written sheet with a folded corner and a ribboned wax seal |
| loot_contraband | small vial with a skull drop on its label area (shape only) |
| loot_metal | two stacked ingots |
| shelter_makeshift | rolled bedroll under a lean-to branch |
| shelter_basic | A-frame tent |
| shelter_comfortable | small cottage with smoke from the chimney |
| tab_chronicle | open book with a ribbon |
| tab_camp | tent beside a campfire |
| tab_roster | three hooded heads in a row |
| tab_plan | pinned note with a cross mark |
| tab_chest | iron-banded chest |
| tab_orders | three overlapping cards |
| retinue | heater shield with three dots |
| xp | laurel wreath (open at the top) |
| hot | flame |
| patron | signet ring seen from the front |
| watch | lantern |
| day | sun with short rays |
| night | crescent moon with two stars |
| week | stack of seven tally marks crossed |

### 3.5 Ornaments — `assets/ui/ornaments/`

| id | viewBox | subject and use |
|---|---|---|
| frame_corner | 0 0 96 96 | iron corner bracket with three rivets and a small leaf flourish, drawn for the top-left corner; CSS rotates it for the other corners |
| divider | 0 0 480 24 | horizontal engraved flourish: thin rule with a central lozenge and curled ends; symmetric |
| ribbon | 0 0 400 72 | banner ribbon for a motto: flat centre band (empty), folded swallow-tail ends; use fill-opacity for the folds |
| seal | 0 0 96 96 | wax seal: irregular round blob with drips and an inner raised ring; empty centre for an emblem |
| seal_success | 0 0 96 96 | the seal with a carved tick in the centre |
| seal_failure | 0 0 96 96 | the seal with a carved cross in the centre |
| bookmark | 0 0 48 128 | vertical ribbon bookmark with a notched (forked) bottom and a slight wave |
| shield | 0 0 100 120 | heater shield with a raised rim (rim as a separate darker layer via fill-opacity) |
| card_corner | 0 0 48 48 | small engraved corner flourish for parchment cards (top-left) |
| deckle_edge | 0 0 400 12 | torn/deckled paper edge as a filled strip, irregular; tiles horizontally edge to edge |
| hatch | 0 0 64 64 | tileable woodcut hatching pattern (diagonal cut lines), seamless when repeated |
| pip_flag | 0 0 24 32 | tiny pennant for the morale meter |
| pip_seal | 0 0 32 32 | tiny round seal for the pressure meter |

### 3.6 Heraldry and skylines — `assets/ui/heraldry/`

Crest charges sit inside the `shield` ornament (same artist style), viewBox `0 0 64 64`:

| id | subject |
|---|---|
| crest_underworld | dagger and key crossed in saltire |
| crest_outlaws | longbow behind an oak leaf |
| crest_mercenaries | two halberds in saltire under a small swallow-tailed banner |
| crest_smugglers | anchor with a rope wound around the shank |
| crest_investigators | open eye above a quill |
| crest_cult | hooded candle: a candle whose flame is wrapped by a hood shape |

Terrain skylines for the sheet header, viewBox `0 0 1000 140`, silhouettes rising from the bottom edge (bottom fully filled, top transparent), two depth layers (far layer `fill-opacity="0.35"`, near layer solid):

| id | subject |
|---|---|
| skyline_city | half-timbered gables, a church spire, a city wall with a gate |
| skyline_village | thatched cottages, a windmill, fences, a lone tree |
| skyline_forest | dense pines and oaks, a woodcutter's hut |
| skyline_mountains | jagged peaks, a pass road, a small watchtower |
