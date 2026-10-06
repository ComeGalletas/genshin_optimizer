/**
 * The app's help (TODO 9.6, ADR-0054): what each section does and the steps
 * to use it, opened from a "?" beside its title. Written for someone who
 * plays the game but has never used the app.
 * @packageDocumentation
 */

export interface HelpTopic {
  title: string;
  /** What it is for, in a sentence or two. */
  intro: string;
  /** The steps to follow, in order. */
  steps?: string[];
  /** Things worth knowing once it works. */
  tips?: string[];
}

export const HELP = {
  start: {
    title: 'Loading data',
    intro:
      'Everything in the app works from one inventory: your artifacts and, for the Roster, Teams and Plan views, your roster (characters, their weapons and levels). Load it once; the bar at the top then shows what is loaded, and its Change button brings you back here.',
    steps: [
      'Pick one of the three cards: the demo data to look around, your account from the local server, or a new source (a GOOD file, a UID, or pieces by hand).',
      'Follow the card’s own “?” for its steps.',
      'Once loaded, the app opens the Roster (or Optimise, when there is no roster). Use the menu to move between views.',
    ],
    tips: [
      'Loading your own data replaces the demo data; replacing your own gear asks first.',
      'What you load stays in this browser until you clear it.',
    ],
  },
  'start-demo': {
    title: 'Demo data',
    intro:
      'A made-up account to see what the app does without loading your own: eight characters in two classic teams (Neuvillette and Raiden National), each wearing a build, and a small bag of spare artifacts.',
    steps: [
      'Press Load Demo Data.',
      'Explore the Roster, Teams, Plan and Optimise views.',
      'Load your own data from here whenever you are ready; it replaces the demo.',
    ],
  },
  'start-server': {
    title: 'Your account from the local server',
    intro:
      'The local server keeps your full account: it imports the exports you drop in its inbox (Irminsul, OCR scanners) and merges them, keeping the most reliable reading of each piece.',
    steps: [
      'Export your account as a GOOD .json file: Irminsul is the most complete source; an OCR scanner such as Inventory Kamera also works.',
      'Put the file in the project’s imports/inbox/ folder.',
      'Import it from the project folder: npm run inbox (or npm run inbox -- --watch to keep importing new files).',
      'Start the server: npm run server. With it running, the Imports view’s Scan the Inbox does the same import.',
      'Come back here and press Load Account.',
    ],
    tips: [
      'The Imports view (while the server runs) shows every import, what each changed and how they were merged.',
      'After a new export, press Load Account again to bring it into this page.',
    ],
  },
  'start-new': {
    title: 'A new source',
    intro:
      'Load data straight into this page, without the server: a GOOD file, the characters you showcase on your UID, or pieces by hand.',
    steps: [
      'GOOD file: export from Irminsul, Genshin Optimizer or Inventory Kamera as a GOOD .json, then use Upload GOOD Export. Your whole inventory and roster come in.',
      'UID: in the game, turn on Character Showcase and add characters to it; type your UID and press Fetch. Only the showcased characters’ artifacts come in.',
      'By hand: open Add Pieces by Hand and enter each artifact’s set, slot, level, main stat and substats.',
    ],
    tips: [
      'Importing the same file again adds nothing: pieces already loaded are recognised.',
    ],
  },
  roster: {
    title: 'Your roster',
    intro:
      'How built each of your characters is, scored 0–100 from their level, talents, weapon and the artifacts they wear, best first.',
    steps: [
      'Read each row: the character, their element and weapon, their score and its band (Built, Partly built or Unbuilt).',
      'Press a row to open the character’s window. Overview: their score, the teams they fit and their curated build. Stats: their stats now (base + artifacts = total), their talents (press one for its description and values) and their constellations. Gear: their weapon, and each artifact with its rolls and the set effects it activates.',
      'Press Optimise This Character to search for their best build in the Optimise view.',
    ],
    tips: [
      'A character with no equipped artifacts scores low on gear: equip something in the game and re-import.',
      'Any character the app shows (a team member, a Plan row, a rotation’s portraits) opens the same window.',
    ],
  },
  teams: {
    title: 'Endgame teams',
    intro:
      'Two teams for the two halves of the Spiral Abyss, sharing no character, matched from curated team archetypes and how built your characters are.',
    steps: [
      'Read each team: its archetype, each member’s role and build score.',
      'Look at the gaps below: roles your roster can’t fill well, and what to build or pull next.',
      'Open the Plan view to build all eight members at once.',
    ],
  },
  plan: {
    title: 'Your plan',
    intro:
      'An optimised build for all eight members of the two teams, from one shared inventory, plus one list of what to farm.',
    steps: [
      'Press Build My Abyss Plan. The carries pick first, then each member gets the best build from what is left.',
      'Read the rows: each member’s objective value and their current against their planned grade; press a row for the full build.',
      'Read What to Farm for the gaps (missing sets, main stats, stat targets).',
    ],
    tips: [
      'With the local server running, Share the Pieces Jointly below plans the same eight together, which can give a better split.',
    ],
  },
  'plan-joint': {
    title: 'Sharing the pieces jointly',
    intro:
      'The local server plans the eight members together instead of one after another, so a carry isn’t handed a piece a teammate needs more. It uses the server’s account.',
    steps: [
      'Choose how: Best plan (exact) is proven best within each member’s top builds; Local search improves the greedy plan by swaps; Greedy is the fastest.',
      'Press Allocate on the Server and wait a minute or two.',
      'Read each member’s share: their build against their best build alone (100% = nobody took their pieces). Carries count twice in the plan’s score.',
      'Follow Moves in the Game in order, ticking each one: equipping a piece someone wears swaps it with yours.',
    ],
  },
  optimise: {
    title: 'Optimising a build',
    intro:
      'An exact search over your artifacts for the best builds for one character: the top results are proven best for what you ask, not estimates.',
    steps: [
      'Choose the character and the weapon they use, and the build level.',
      'Choose what to maximise: crit value (the default), average damage (estimated from the character’s damage profile), or a stat.',
      'Set conditions if you want them: a minimum Energy Recharge, or Use Meta Build for the curated set and main stats.',
      'Press Optimise. The best builds appear below in Results.',
    ],
    tips: [
      'If no build meets the conditions, Results says which one to relax and can relax it for you.',
      'With the local server running, Rank by Team DPS below simulates the top builds in a team rotation.',
    ],
  },
  'optimise-constraints': {
    title: 'Conditions',
    intro: 'Conditions narrow the search to builds you would actually use.',
    steps: [
      'Minimum Energy Recharge: builds below it are left out. Leave it blank for none.',
      'Use Meta Build: applies the character’s curated set and main stats (sands, goblet, circlet), as shown in the card below it.',
    ],
    tips: ['Too many conditions can leave no build: relax one at a time.'],
  },
  results: {
    title: 'Reading the results',
    intro:
      'The best builds for your search, best first, each with its pieces, its totals and where its score comes from.',
    steps: [
      'Rank 1 is the best build; a chip on the others shows how far behind rank 1 they are.',
      'Builds that tie exactly are folded into one card, with what separates them.',
      'Open What’s Driving This Build for each piece’s share of the score.',
      'Copy Share Link gives a link that shows this build to anyone, without their account.',
    ],
    tips: [
      'The gap analysis above compares your best build with the curated target for the character.',
    ],
  },
  'sim-rank': {
    title: 'Rank by team DPS',
    intro:
      'Stat scores don’t capture everything: this simulates your top builds in a real team rotation with gcsim, with your teammates as equipped, and ranks them by team DPS. It needs the local server and uses its account.',
    steps: [
      'Set up the search in the Optimise panel above (character, weapon, conditions).',
      'Choose the rotation (the library’s rotations with this character), how many builds and iterations.',
      'Press Simulate the Top Builds and wait for the ranking.',
      'Read team DPS with its 95% interval; “tied” means the noise can’t separate a build from the best. Stat rank shows where it was by the stat objective.',
    ],
    tips: [
      'Share This Build and Its Result makes a link that carries the simulation too.',
    ],
  },
  'compare-teams': {
    title: 'Comparing teams',
    intro:
      'Simulate a team from the rotation library with your characters as equipped, against up to five variants, and see what each change is worth in team DPS. It needs the local server.',
    steps: [
      'Choose the base team’s rotation and how many iterations per run.',
      'Add variants: a weapon, an artifact set, a teammate swap, the enemy (targets, resistance, level) or another rotation.',
      'Press the simulate button and read each variant against the base: “+7.4% ± 1.2%”; one within the noise is no difference.',
      'Below: the teams as run, the DPS spread, each character’s damage share and field time, reactions and energy warnings.',
    ],
    tips: [
      'Share This Comparison makes a link anyone can open, even without a server.',
    ],
  },
  'compare-variants': {
    title: 'Variants',
    intro:
      'Each variant changes one thing about the base team, so the difference it makes is clear.',
    steps: [
      'Weapon: give a character another weapon (and refinement).',
      'Artifact set: rebuild a character with a set, from your artifacts.',
      'Teammate: swap a member for another character the rotation allows.',
      'Enemy: more targets, other resistance or level.',
      'Rotation: run the same team in another rotation from the library.',
    ],
  },
  'rotation-library': {
    title: 'The rotation library',
    intro:
      'The gcsim rotations the server can simulate: a team and the action list it plays, most adapted from the KQM Sim Database (credited on each).',
    steps: [
      'Read each rotation: its team, its status, where it came from, and its DPS on its reference builds against the published one.',
      'Press Details for its slots, fight settings, validation and the action list.',
      'Press Compare this team to open it in Compare Teams with your characters.',
    ],
    tips: [
      'A draft (for example one drafted with the chat) counts only after you review it: npm run rotations -- review <id>.',
    ],
  },
  imports: {
    title: 'The import center',
    intro:
      'Everything the local server imported: each source, each snapshot (one imported file), what each changed, and how they were merged into your account.',
    steps: [
      'Bring in a file: Upload a GOOD File, or drop it in imports/inbox/ and press Scan the Inbox.',
      'Check the snapshots: faulty scans are marked and kept out; What changed lists new, gone, levelled and moved pieces.',
      'Check the reconciliation when you use more than one source.',
      'Go to Load Data (Change, at the top) and press Load Account to use the new account here.',
    ],
  },
  'import-sources': {
    title: 'Sources',
    intro:
      'Where your data comes from, best first: Irminsul (exact), OCR scanners, other GOOD files, Enka showcases. When two sources disagree about a piece, the better source wins.',
  },
  'import-snapshots': {
    title: 'Snapshots',
    intro:
      'Each imported file is a snapshot, kept as it was. The account is the merge of the newest usable snapshot from each source.',
    steps: [
      'Press What changed on a snapshot to compare it with the previous one from the same source.',
      'A faulty scan (pieces read many times over) is kept but left out of the account.',
    ],
  },
  'import-reconciliation': {
    title: 'Reconciliation',
    intro:
      'How each snapshot’s pieces were matched with the account merged before it: exact matches, near matches (one rounding step apart) and pieces levelled since.',
    steps: [
      'Misread or different pieces are shown side by side with the stat that differs: usually an OCR misread.',
      'Pieces only in one source are listed separately.',
      'Pick an older merge from the list to see its reconciliation.',
    ],
  },
} satisfies Record<string, HelpTopic>;

export type HelpId = keyof typeof HELP;
