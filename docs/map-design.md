# Map Design — "Hermel" (Phase 3)

> Design document for the v1 map. Read this together with CLAUDE.md §6 and §7.
> This describes intent and layout. Implementation decisions stay with the phase plan.

---

## 1. Setting

A neighbourhood on the edge of **Hermel**, Baalbek-Hermel governorate, northeast Lebanon.

This is **not** the green, red-tiled South Lebanon look. Hermel sits on the dry northern Bekaa steppe. Getting this distinction right is most of what will make the map feel real:

| | South Lebanon | **Hermel (this map)** |
|---|---|---|
| Ground | green terraces, olive groves | dry ochre earth, sparse scrub, rock outcrops |
| Roofs | red clay tile | flat concrete, black water tanks, satellite dishes |
| Trees | dense olive, cypress, oak | scattered poplar, walnut, mulberry, some olive; thin canopy |
| Feel | enclosed, layered, humid green | open, wide, sun-bleached, high contrast |

The reference is the area around **Hermel Public School**, taken from satellite imagery of the player's own neighbourhood.

### Palette

Sun-bleached and warm. Ochre and tan ground, grey-white concrete, dusty olive-green foliage, rust and burnt black on wrecked vehicles, occasional saturated accents (a blue door, a red pickup, a green water tank). Avoid the saturated green of a Mediterranean coastal village — the ground here reads brown and pale, not green.

---

## 2. Terrain

- Playable area **200 × 200 m**. Do not exceed it — the map is built for 4v4, and a bigger arena means walking instead of fighting.
- Beyond the playable edge, a **non-playable visual backdrop** extending 1.5–2 km: bare hills, a distant town silhouette, haze. Very low poly, no collision, aggressive LOD. This sells the scale for near-zero cost.
- Real elevation as the base: pull terrain and road/building footprints for Hermel from **OpenStreetMap + SRTM** (BlenderGIS or Blosm) as a reference blockout, then **redesign the layout for gameplay**. Real geography plays badly as a competitive map — dead ends, dead space, no balance. Use the real place for character and silhouette, not for the layout.
- Total relief across the map: roughly **12–18 m**. Enough for meaningful high ground, not so much that half the map is a climb.
- Natural boundaries, never invisible walls: a steep wadi bank on one side, a rubble berm and concrete barriers on another, a fenced field on the third, the hillside on the fourth.

---

## 3. Layout — three lanes

Mirrored-ish rather than perfectly symmetrical. Rotational balance: each team gets the same *kinds* of positions, not the same shapes.

### Lane A — The Road (open, long sightlines)
The paved road running diagonally across the map, with the **junction** at its midpoint. Wrecked and burnt cars, concrete Jersey barriers, a broken guardrail, a bus shelter. Long engagements, but no unbroken sightline longer than ~70 m — break every lane with something.

### Lane B — The Village Core (close quarters)
Dense cluster of flat-roofed houses, narrow alleys, low garden walls, an unfinished two-storey shell with exposed rebar. **Connected rooftops** with ladders and external stairs, so the roofs form a second layer of the lane. This is where most kills happen.

### Lane C — The Orchard and Plots (flanking, mid-range)
Walled garden plots, low stone walls, poplars along an irrigation channel, a dirt track. Partial cover and broken sightlines. Slower, quieter route that opens onto both spawns' flanks.

### Centre — The School
The **school building and its yard** is the map's anchor: a large open courtyard that is dangerous to cross, overlooked from three sides. Entering the building is safer but funnels you into known doorways. Every lane touches it.

### Spawns
Two spawns at opposite corners, each with **three exits** feeding different lanes. Neither spawn is visible from the other's exits. No spawn overlooks the centre directly.

### Callout landmarks
Distinct, nameable, visible from a distance: **the School**, **the Junction**, **the Burnt Mercedes**, **the Water Tower**, **the Rebar House**, **the Orchard**, **the Culvert**.

---

## 4. Interiors

**Five to six** enterable buildings only. Everything else is sealed geometry. Interiors are expensive — in draw calls, in occlusion complexity, and in level design time.

Suggested set:
1. The school — largest, two entrances, one internal staircase, roof access
2. Two houses in the core, connected by an internal doorway
3. The unfinished rebar shell — no doors, open floors, high risk high reward
4. A small shop with a back room
5. One partially collapsed house — rubble-filled ground floor, exposed upper floor

Rules: every interior has **at least two ways in**, none is a pure dead end, and each has a distinct silhouette so it's identifiable from outside.

---

## 5. Underground

Three short connectors, not a maze:
- A **culvert** under the road, linking the school yard to the orchard
- A **basement passage** joining two houses in the core
- A **drainage channel** along the wadi edge, partly open to the sky

Each is short (under 20 m), lit enough to be readable, and has an exit visible from its entrance. Long dark tunnels are unfun and expensive to light.

---

## 6. Lighting and time of day

- **Fixed bright afternoon** at match start: high sun, hard shadows, strong contrast.
- **Shifts toward late afternoon / golden hour** over the course of the match — warmer light, longer shadows, lower sun angle.
- Real directional lighting, not just baked. One shadow-casting sun.
- The shift must be **purely visual** — no gameplay-relevant visibility change, and no per-frame cost that grows over the match. Interpolate the sun angle, colour, and fog over the match timer.
- This makes a 10-minute match feel like it has an arc, which is worth a lot for very little work.

---

## 7. Teams

- **Team A — irregulars/civilian militia**: mixed civilian clothing, mismatched gear, plate carriers over street clothes, headscarves, tracksuits, work boots.
- **Team B — regulars/army**: matching uniform, helmets, unified webbing.

Both must be readable at a glance from 60 m and from behind. Silhouette and value contrast do more work than colour — keep an accent colour per team on top of that, and check both against the ochre background, which will eat warm tones.

Source outfits from the Quaternius **Modular Character Outfits** pack (CC0, same skeleton).

---

## 8. Props and detail set

Small, repeated, instanced. These are what make it read as Lebanon:

- Black plastic water tanks and satellite dishes on every roof
- Exposed rebar on unfinished floors, breeze-block stacks, cement bags
- Electricity poles with tangled overhead cables, a leaning transformer
- Rough limestone garden walls, wire fencing, a metal gate
- Burnt and stripped cars — an old Mercedes sedan, a pickup, a minibus
- Concrete barriers, sandbags, oil drums, tyres
- A water well / spring, a metal water trough
- A small shop front with a roll-down shutter and a faded sign
- Roadside shrine or memorial stone
- Dry scrub, thistle, a few poplars, walnut and mulberry trees, cactus hedge

### On signage and graffiti
Wall text and signs are good for atmosphere: the village name, a shop sign, a football club, a memorial, generic slogans. **Do not include slogans naming a real country, army, group, or people.** That turns an environment into a political statement, narrows the audience, and risks the game being pulled from any platform it's hosted on. The atmosphere reads the same without it.

Also: no real people's names, faces, or portraits anywhere in the map.

---

## 9. Technical requirements

These are not optional — they're the constraints that let the map exist at all.

- **Modular kit first.** Build a small set of wall, roof, stair, wall-cap and floor pieces, then assemble. Do not model unique buildings.
- **InstancedMesh** for every repeated prop. Target: props contribute under 20 draw calls total.
- **One texture atlas per material group.** Trim sheets for architecture.
- **KTX2** for every texture, per CLAUDE.md §5.1.
- **Baked lighting** where the geometry is static; one real-time sun for dynamic shadows.
- **Occlusion strategy** designed with the layout, not after it. The lanes should occlude each other naturally.
- **Aerial LOD (CLAUDE.md §5.1).** From 40 m up, ground-level occlusion stops working and everything is visible at once. The map's LOD and distance culling must be authored with an aerial camera in mind from the start — separate cull distances for the aerial view, aggressive LOD past 60 m, and a simplified far-field representation. Retrofitting this after the drone phase means rebuilding the map's rendering strategy.
- Blockout and playtest **before** any art passes. Grey boxes first, then detail. Layout problems found after the art pass are expensive.

---

## 10. Build order

1. **Grey blockout** — terrain, lanes, building volumes, spawns, cover. No textures. Playtest it.
2. **Adjust for gameplay** — sightlines, timings to centre, cover density.
3. **Modular kit** — build the architectural pieces.
4. **Assemble** — replace grey boxes with kit pieces.
5. **Interiors** — the five to six buildings.
6. **Props and vegetation** — instanced.
7. **Lighting** — bake, then the time-of-day shift.
8. **Performance pass** — against the desktop budget, and against the aerial camera.
