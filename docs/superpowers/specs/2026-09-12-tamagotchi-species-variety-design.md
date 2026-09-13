# Tamagotchi Species Variety Design

## Context

The tamagotchi has one pet: a `blob` placeholder in `lib/tamagotchi/creatures.js`.
The 2026-09-05 game-design spec listed "no multiple pet species" as an explicit
non-goal, and its three units (Evolution, Sickness, Minigame) have since landed.
Species variety is the remaining unbuilt mechanic from that pass.

Half the plumbing already exists and is not this design's work:

- `createDefaultPet` writes `petType: DEFAULT_PET` and it persists like any
  other field (`lib/tamagotchi/simulation.js`).
- `getPetType(key)` already falls back to the default pet on an unknown key
  (`lib/tamagotchi/creatures.js`).
- `petKeys()` already enumerates the roster.

What is missing is more entries in `PETS`, a way for the player to choose one,
and per-species evolution branches.

## Goals

- Three species, each with its own adult-form branch set, chosen by the player
  when a pet is created and fixed for that pet's life.
- Keep the care-tally evolution math species-independent and single-owned in
  `simulation.js`; species stay data in `creatures.js`.
- No migration: every existing save keeps working untouched, and
  `SCHEMA_VERSION` stays `1`.

## Non-goals

- No per-species need-decay tuning. Every species drains and recovers at the
  same rates; species is cosmetics plus branch naming, not balance.
- No collection or album of previously raised pets.
- No mid-life species switching.
- No real pixel art. Sprites stay emoji placeholders.
- No death and no permanent loss, carried forward from the 2026-09-05 spec.
  The one destructive action introduced here is player-initiated and confirmed.

## Verdict vs form

The central distinction, and the reason the tally math does not fork per
species:

- A **verdict** is what the care tally concludes: one of `balanced`,
  `fedHeavy`, `playHeavy`, `sleepHeavy`, `efficient`. Species-independent,
  computed in `simulation.js`, unchanged from today's logic.
- A **form** is what a given species calls that outcome: `bloom`, `forge`,
  `wildfire`. Declared per species in `creatures.js`.

`pet.adultForm` stores the **form**, not the verdict. Blob's form keys are
deliberately identical to today's five verdict names, which is what makes
existing adult saves resolve correctly with no migration code.

A species may map several verdicts onto one form. That is how a three-form
species covers all five verdicts.

## Data model

No new persisted fields. `pet.petType` already exists and is written by
`createDefaultPet`; keep that field name rather than renaming it to `species`,
since a rename would orphan every save for no gain.

`createDefaultPet(now, petType)` gains a second parameter, defaulting to
`DEFAULT_PET` so existing call sites and tests are unaffected.

## `creatures.js`

Each `PETS` entry gains `defaultForm` and `forms`, and `sprite.adult` is keyed
by that species' own form keys:

```js
sprout: {
  key: 'sprout',
  name: 'Sprout',
  defaultForm: 'bloom',
  forms: {
    balanced: 'bloom',
    fedHeavy: 'fruit',
    playHeavy: 'vine',
    sleepHeavy: 'evergreen',
    efficient: 'evergreen',
  },
  sprite: {
    baby: { normal: '🌰', hungry: '🌰', sad: '🌰', asleep: '🌰', sick: '🌰' },
    child: { /* five moods */ },
    adult: {
      bloom: { /* five moods */ },
      fruit: { /* five moods */ },
      vine: { /* five moods */ },
      evergreen: { /* five moods */ },
    },
  },
}
```

Every species must declare all five verdicts in `forms`, and every form key in
`forms` must exist in `sprite.adult`.

Roster:

| Species | Baby | Child | Forms | Verdict mapping |
| --- | --- | --- | --- | --- |
| Blob | 🥚 | 🐣 | 5: `balanced`, `fedHeavy`, `playHeavy`, `sleepHeavy`, `efficient` | identity, unchanged from today |
| Sprout | 🌰 | 🌱 | 4: `bloom` 🌸, `fruit` 🍑, `vine` 🍃, `evergreen` 🌲 | `sleepHeavy` and `efficient` both map to `evergreen` |
| Ember | 🕯️ | 🔥 | 3: `hearth` 🏮, `forge` ⚒️, `wildfire` 🌋 | `balanced` and `efficient` map to `hearth`; `playHeavy` and `sleepHeavy` map to `wildfire` |

Emoji are placeholders on the same terms as the existing set: the data shape
must allow swapping in image files later without touching game logic.

New export:

```js
export const resolveForm = (petType, verdict) =>
  petType.forms[verdict] || petType.defaultForm;
```

`getSprite`'s adult fallback changes from the literal `petType.sprite.adult.balanced`
to `petType.sprite.adult[petType.defaultForm]`. The current hardcode resolves to
`undefined` for any species without a `balanced` form, which both new species
lack.

## `simulation.js`

`determineAdultForm` is renamed `careVerdict`, with its body unchanged. The name
now matches what it returns: a verdict, not a form.

`grow()` composes the two halves at the child-to-adult transition:

```js
const adultForm = nextStage === 'adult'
  ? resolveForm(getPetType(pet.petType), careVerdict(pet))
  : pet.adultForm;
```

This adds no new dependency direction: `simulation.js` already imports
`DEFAULT_PET` from `creatures.js`.

## `storage.js` and the no-pet state

`loadPet` currently fabricates a default pet when storage is empty, so the page
cannot distinguish "no save yet" from "has a pet". Its contract changes:
**`loadPet` returns `null` when there is no valid save.**

This also means a corrupt or version-mismatched save returns `null` and sends
the player to the chooser, rather than silently spawning a blob. That is the
better behavior — the player picks again instead of being handed a pet they did
not choose — but it is a deliberate behavior change, and `storage.test.js`
asserts the old contract today.

New export `clearPet()` removes `STORAGE_KEY` from localStorage.

## Page states

`pages/tamagotchi/index.jsx` currently overloads `pet === null` to mean "still
loading" and renders an empty shell. It gets three explicit states:

| State | Render |
| --- | --- |
| `loading` | the current empty shell |
| `choosing` | `SpeciesChooser` |
| `playing` | the current pet UI |

The mount effect keeps doing offline catch-up (`applyElapsed`) but only when
`loadPet` returned a pet; a `null` result goes straight to `choosing`.

## `SpeciesChooser`

Lives at `components/tamagotchi/SpeciesChooser.jsx`, following the existing
`components/doodle/` pattern. It cannot live under `pages/`, where every file
becomes a route.

It maps `petKeys()` to one tap target per species showing that species' baby
sprite and name. Picking a species calls `createDefaultPet(Date.now(), key)`,
saves it, transitions to `playing`, rebuilds the sound engine from the new
pet's `soundOn`, and plays the existing `evolve` tone as the hatch cue. No new
tone, so `sound.js` is untouched.

Rebuilding rather than reusing the engine matters after a restart: the existing
instance still carries the previous pet's `setEnabled(false)`, so a reused one
would leave a new pet silent while the UI reports Sound on.

## New pet

A restart control in the palette with an **inline two-step confirm**. The first
tap turns that button into a cancel, and adds a visually distinct confirm
button beside it; the confirm calls `clearPet()` and returns to `choosing`.

The confirm never occupies the arming button's position, so a double tap in one
spot cancels rather than destroys. Any other interaction also cancels, and an
armed confirm expires on its own after a few seconds, since the 2s tick is not
an interaction and would otherwise leave it armed indefinitely.

Not `window.confirm`: it is blocked in some installed-PWA contexts, and it is a
native modal in a UI that otherwise has none.

This is the only destructive action in the app. It stays player-initiated and
confirmed, so the no-punishment goal holds.

## Testing

- `creatures.test.js`
  - `resolveForm` returns the right form per species per verdict, and falls
    back to `defaultForm` on an unrecognized verdict.
  - `getSprite` falls back to each species' own `defaultForm`, not to
    `balanced`.
  - A table-completeness test over every species: all five moods present at
    `baby`, at `child`, and at every declared adult form; all five verdicts
    present in `forms`; every form key in `forms` present in `sprite.adult`.
    This is the real defense against a typo in a deeply nested literal, and it
    covers future species for free.
- `simulation.test.js`
  - `careVerdict` keeps its existing assertions verbatim under the new name.
  - `grow()` produces species-correct form keys: a blob and an ember with the
    same care tally reach different `adultForm` values.
- `storage.test.js`
  - `loadPet` returns `null` on empty storage and on corrupt data.
  - `clearPet` removes the key.
- `__tests__/pages/tamagotchi/index.test.jsx`
  - The chooser renders when storage is empty.
  - Picking a species hatches that species and shows its baby sprite.
  - The restart control requires two taps, and the second returns to the
    chooser.
  - Existing tests seed a `petType` in their fixture and are otherwise
    unchanged.

## Documentation cleanup

`.claude/rules/tamagotchi.md` still describes evolution, minigames, and
sickness as "deliberately unbuilt pending brainstorming", which stopped being
true when units A, B, and C merged. It describes exactly the files this work
touches, so correcting it is in scope: update the mechanics paragraph, and note
the verdict-vs-form split under Conventions so a later change does not put
species logic back into `simulation.js`.

## Risk

The riskiest part is the `loadPet` contract change. It ripples into every test
that assumed a pet always comes back, and the loading/choosing/playing split
touches the mount effect that also performs offline catch-up. Sequence that
change and its tests before the chooser UI depends on it.

Unlike the 2026-09-05 spec, this is a single sequential unit, not three
parallel ones: the pieces share `creatures.js` and the page's state machine
too tightly to split without manufactured conflicts.
