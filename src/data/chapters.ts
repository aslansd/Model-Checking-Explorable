/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chapter, TemporalProperty } from '../types';

/* ------------------------------------------------------------------ */
/* Sandbox properties the learner can switch between                   */
/* ------------------------------------------------------------------ */

const SANDBOX_PROPERTIES: TemporalProperty[] = [
  {
    id: 'sandbox_mutex_ab',
    name: 'Mutual exclusion (A, B)',
    description: 'Signals A and B are never on at the same time.',
    formula: 'G ¬(A ∧ B)',
    plainEnglish: 'At every moment, A and B are not both true.',
    type: 'safety',
    spec: { kind: 'invariant', bad: s => s.innerOpen && s.outerOpen },
    explanation: 'Two signals that must never be on together are on together.'
  },
  {
    id: 'sandbox_mutex_ac',
    name: 'Mutual exclusion (A, C)',
    description: 'Signals A and C are never on at the same time.',
    formula: 'G ¬(A ∧ C)',
    plainEnglish: 'At every moment, A and C are not both true.',
    type: 'safety',
    spec: { kind: 'invariant', bad: s => s.innerOpen && s.pressurized },
    explanation: 'Two signals that must never be on together are on together.'
  },
  {
    id: 'sandbox_response_bc',
    name: 'Response: B leads to C',
    description: 'Every time B turns on, C must follow.',
    formula: 'G (B ⇒ F C)',
    plainEnglish: 'Whenever B becomes true, C becomes true at some later point.',
    type: 'liveness',
    spec: { kind: 'response', p: s => s.outerOpen, q: s => s.pressurized },
    explanation: 'B happens but the system can avoid C forever.'
  },
  {
    id: 'sandbox_no_starvation',
    name: 'No starvation: C leads back to A',
    description: 'Once C is on, A must get its turn again.',
    formula: 'G (C ⇒ F A)',
    plainEnglish: 'Whenever C becomes true, A becomes true again at some later point.',
    type: 'liveness',
    spec: { kind: 'response', p: s => s.pressurized, q: s => s.innerOpen },
    explanation: 'One part of the system can be starved: it waits forever for its turn.'
  },
  {
    id: 'sandbox_no_deadlock',
    name: 'No dead ends',
    description: 'The machine can never freeze with nowhere to go.',
    formula: 'G ¬deadlock',
    plainEnglish: 'Every reachable state has at least one outgoing transition.',
    type: 'safety',
    spec: { kind: 'no_deadlock' },
    explanation: 'A reachable state has no outgoing transitions, so the system stops forever.'
  }
];

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    title: '1. The Decompression Catastrophe',
    subtitle: 'Safety: what must NEVER happen.',
    metaphor: 'Space station airlock',
    narrative: `Welcome to the space station airlock. If the **inner cabin door** and the **outer space door** are ever open at the same moment, the cabin empties into vacuum and our astronaut has a very bad day.

A **safety property** says: *something bad never happens*. Here the bad thing is one single state — both doors open at once:

\`G ¬(InnerOpen ∧ OuterOpen)\`

**G** is the temporal operator *globally*, also read as *always*. The formula says: at every moment, along every run the machine can take, the two doors are not both open.

A model checker does not test a few runs. It walks the **entire reachable state space** and either proves the formula for all of it, or hands you a **counterexample**: a concrete sequence of steps that reaches the bad state. Because this search is breadth-first, the counterexample you get is the *shortest* one — the smallest possible bug report.`,
    task: 'Run the verifier. It will hand you a counterexample trail ending in DECOMPRESSION. Two "vent" transitions can reach that state — delete both, then verify again. Deleting the ordinary door controls also makes the checker pass, but a welded-shut airlock is not a fix, so the level will tell you if you took that shortcut.',
    initialStates: [
      { id: 'off', label: 'Sealed & Safe', innerOpen: false, outerOpen: false, pressurized: true, isInitial: true, x: 150, y: 200 },
      { id: 'inner', label: 'Inner Open', innerOpen: true, outerOpen: false, pressurized: true, x: 390, y: 90 },
      { id: 'outer', label: 'Outer Open', innerOpen: false, outerOpen: true, pressurized: false, x: 390, y: 320 },
      { id: 'danger', label: 'DECOMPRESSION', innerOpen: true, outerOpen: true, pressurized: false, x: 640, y: 200 }
    ],
    initialTransitions: [
      { id: 't1', from: 'off', to: 'inner', action: 'Open inner' },
      { id: 't2', from: 'inner', to: 'off', action: 'Close inner' },
      { id: 't3', from: 'off', to: 'outer', action: 'Open outer' },
      { id: 't4', from: 'outer', to: 'off', action: 'Close outer' },
      { id: 't_bug', from: 'inner', to: 'danger', action: 'Manual vent' },
      { id: 't_bug2', from: 'outer', to: 'danger', action: 'Manual vent' },
      { id: 't_escape', from: 'danger', to: 'off', action: 'Emergency seal' }
    ],
    targetProperty: {
      id: 'airlock_safety',
      name: 'Airlock safety',
      description: 'The two doors are never open at the same time.',
      formula: 'G ¬(InnerOpen ∧ OuterOpen)',
      plainEnglish: 'At every moment, the inner and outer doors are not both open.',
      type: 'safety',
      spec: { kind: 'invariant', bad: s => s.innerOpen && s.outerOpen },
      explanation: 'Both doors are open at the same time, which vents the cabin to vacuum.'
    },
    sanityChecks: [
      {
        message: 'The airlock still has to work: the crew must be able to open the inner door.',
        test: ({ reachable }) => reachable.has('inner')
      },
      {
        message: 'The airlock still has to work: the crew must be able to open the outer door.',
        test: ({ reachable }) => reachable.has('outer')
      },
      {
        message: 'Keep the DECOMPRESSION state in the model. The goal is to make it unreachable, not to delete the hazard from the drawing.',
        test: ({ states }) => states.some(s => s.innerOpen && s.outerOpen)
      }
    ],
    successMessage: 'The manual vent paths are gone. Both doors still work independently, but no sequence of commands — in any order, at any time — can open them together. That is a proof, not a test run.',
    allowEditing: true
  },

  {
    id: 2,
    title: '2. The Rogue Microwave',
    subtitle: 'Liveness: what must EVENTUALLY happen.',
    metaphor: 'Microwave oven',
    narrative: `Safety alone is easy to satisfy — a machine that does nothing at all is perfectly safe. The second pillar of verification is **liveness**: *something good eventually happens*.

In this microwave the three propositions mean:
- **Heating** — the magnetron is on
- **DoorOpen** — the door is open (the interlock keeps the magnetron off here)
- **CookComplete** — the cycle finished

\`G (Heating ⇒ F CookComplete)\`

**F** is *finally*, also read as *eventually*. Together: at every moment, if heating starts, then at some later moment cooking completes.

A liveness property can never be broken by a single state — only by an **infinite behaviour**. There are two shapes:
- a **deadlock**, where the machine reaches a state with no way out at all
- a **livelock**, where the machine loops forever, busy but making no progress

The counterexample for a livelock is a **lasso**: a finite path into a loop, plus the loop itself.

One honest warning about this formula. Opening the door pauses cooking, so a user who opens the door over and over can keep this microwave from ever finishing. That is a real run, and a strict checker will report it. It is not a design bug — it is the user's choice. So we verify under a **fairness assumption**: if an exit from a loop is available again and again, the system eventually takes it. Fairness is on by default; the switch above the log lets you turn it off and watch what changes.`,
    task: 'Verify. The magnetron can enter "Timer Glitched" and spin there forever with the heat on — a livelock. Deleting the self-loop only turns it into a dead end, so try that first and read the new verdict. The real fix is to add a way out: a watchdog transition from Timer Glitched back to Idle.',
    initialStates: [
      { id: 'ready', label: 'Idle', innerOpen: false, outerOpen: false, pressurized: false, isInitial: true, x: 140, y: 200 },
      { id: 'heating', label: 'Heating', innerOpen: true, outerOpen: false, pressurized: false, x: 370, y: 110 },
      { id: 'paused', label: 'Door Open', innerOpen: false, outerOpen: true, pressurized: false, x: 370, y: 330 },
      { id: 'stalled', label: 'Timer Glitched', innerOpen: true, outerOpen: false, pressurized: false, x: 610, y: 340 },
      { id: 'done', label: 'Cook Complete', innerOpen: false, outerOpen: false, pressurized: true, x: 640, y: 120 }
    ],
    initialTransitions: [
      { id: 'mt1', from: 'ready', to: 'heating', action: 'Press start' },
      { id: 'mt2', from: 'heating', to: 'done', action: 'Timer expires' },
      { id: 'mt3', from: 'heating', to: 'paused', action: 'Open door' },
      { id: 'mt4', from: 'paused', to: 'ready', action: 'Close door' },
      { id: 'mt5', from: 'done', to: 'ready', action: 'Take food out' },
      { id: 'mt_bug', from: 'heating', to: 'stalled', action: 'Timer chip glitch' },
      { id: 'mt_bug2', from: 'stalled', to: 'stalled', action: 'Wait for timer' }
    ],
    targetProperty: {
      id: 'microwave_liveness',
      name: 'Cooking always finishes',
      description: 'Once the magnetron is on, the cycle must eventually complete.',
      formula: 'G (Heating ⇒ F CookComplete)',
      plainEnglish: 'Whenever the magnetron turns on, the cook cycle completes at some later moment.',
      type: 'liveness',
      spec: {
        kind: 'response',
        p: s => s.innerOpen,
        q: s => s.pressurized
      },
      explanation: 'The magnetron can be left running with no route back to a completed cycle.'
    },
    showFairnessToggle: true,
    sanityChecks: [
      {
        message: 'The microwave still has to cook: "Cook Complete" must be reachable.',
        test: ({ reachable }) => reachable.has('done')
      },
      {
        message: 'The user must still be able to open the door mid-cycle — do not solve this by removing the door.',
        test: ({ reachable }) => reachable.has('paused')
      },
      {
        message: 'Keep the "Timer Glitched" state. Hardware faults happen; the job is to recover from them, not to pretend they do not exist.',
        test: ({ reachable }) => reachable.has('stalled')
      }
    ],
    successMessage: 'The watchdog gives the glitched timer a way back into the normal cycle. Now every fair run that starts heating ends at Cook Complete — including the runs where the timer chip misbehaves.',
    allowEditing: true
  },

  {
    id: 3,
    title: '3. The Autonomous Rover Hatch',
    subtitle: 'Branching time, and the fairness assumption.',
    metaphor: 'Mars rover sample hatch',
    narrative: `On Mars nobody can reboot the rover for you. You are verifying the sample hatch controller.

- **HatchOpen** — the external hatch is open
- **RequestPending** — an open command is waiting to be served
- **ShieldEngaged** — the dust shield is up

\`AG (RequestPending ⇒ AF HatchOpen)\`

Chapters 1 and 2 used **LTL**, which talks about one run at a time. This is **CTL**, which talks about the *branching tree* of futures, so it needs a path quantifier in front of each temporal operator:
- **A** — *along all paths*
- **E** — *along at least one path*

So **AG** is "on every path, at every moment" and **AF** is "on every path, at some moment". Read together: no matter which branch the rover takes, a pending request always gets served. (Every LTL formula in this app is implicitly A-quantified — that is why chapter 1's \`G\` and this chapter's \`AG\` mean the same thing here.)

This chapter is really about **fairness**. The rover can detect a dust storm and wait. Waiting is correct behaviour. But "wait" and "wait forever" are different things, and the difference is exactly what the fairness switch controls:
- **Fairness off** — an exit that is available forever must still be taken *at some point*, otherwise it counts as a bug. Any retry loop fails.
- **Fairness on** — we assume an exit that stays available is eventually taken. Only a loop with *no* route out at all counts as a bug.

Real verification tools make you state this assumption explicitly, because without it almost every retry loop reports a false alarm.`,
    task: 'Verify with fairness ON. The rover falls into "Storm Hold" and retries forever with no way out — a genuine livelock. Give it a route back: point the retry transition at "Request Pending" instead of at itself. Then flip fairness OFF and run again to see why the assumption matters.',
    initialStates: [
      { id: 'idle', label: 'Rover Idle', innerOpen: false, outerOpen: false, pressurized: true, isInitial: true, x: 140, y: 210 },
      { id: 'request', label: 'Request Pending', innerOpen: false, outerOpen: true, pressurized: true, x: 380, y: 110 },
      { id: 'dust_wait', label: 'Storm Hold', innerOpen: false, outerOpen: true, pressurized: false, x: 380, y: 330 },
      { id: 'hatch_open', label: 'Hatch Open', innerOpen: true, outerOpen: false, pressurized: false, x: 630, y: 210 }
    ],
    initialTransitions: [
      { id: 'rt1', from: 'idle', to: 'request', action: 'Queue sample' },
      { id: 'rt2', from: 'request', to: 'hatch_open', action: 'Shield off, open' },
      { id: 'rt3', from: 'hatch_open', to: 'idle', action: 'Close hatch' },
      { id: 'rt4', from: 'request', to: 'dust_wait', action: 'Dust detected' },
      { id: 'rt_self_loop', from: 'dust_wait', to: 'dust_wait', action: 'Retry forever' }
    ],
    targetProperty: {
      id: 'rover_progress',
      name: 'Requests are always served',
      description: 'A pending hatch request must eventually be served on every path.',
      formula: 'AG (RequestPending ⇒ AF HatchOpen)',
      plainEnglish: 'On every path, whenever a request is pending, the hatch opens at some later moment.',
      type: 'liveness',
      spec: {
        kind: 'response',
        p: s => s.outerOpen,
        q: s => s.innerOpen
      },
      explanation: 'A pending request can be left unserved forever.'
    },
    showFairnessToggle: true,
    sanityChecks: [
      {
        message: 'The rover must still be able to detect a storm — "Storm Hold" has to stay reachable.',
        test: ({ reachable }) => reachable.has('dust_wait')
      },
      {
        message: 'The hatch must still be able to open.',
        test: ({ reachable }) => reachable.has('hatch_open')
      }
    ],
    successMessage: 'Storm Hold now returns to Request Pending instead of spinning in place. Under fairness the storm eventually clears and the hatch opens on every path — and with fairness off you can see the retry loop reported as a counterexample, which is exactly why the assumption has to be written down.',
    allowEditing: true
  },

  {
    id: 4,
    title: '4. The Verification Sandbox',
    subtitle: 'Build a machine, pick a property, break it on purpose.',
    metaphor: 'Traffic signal controller',
    narrative: `You now have the whole lab. Add states, wire transitions, toggle the three propositions, choose which property to check, and flip the fairness assumption.

The starting model is a traffic signal cycling A → B → C → A. Five properties are available in the picker:
- \`G ¬(A ∧ B)\` and \`G ¬(A ∧ C)\` — **safety**, checked state by state
- \`G (B ⇒ F C)\` and \`G (C ⇒ F A)\` — **liveness**, checked by hunting for loops and dead ends
- \`G ¬deadlock\` — no reachable state may be a dead end

Things worth trying, because each one produces a different kind of verdict:
- add a state with A and B both on, and wire it into the cycle → a **safety** counterexample
- add a state with a self-loop and no exit → a **deadlock**, then a **livelock** once you give it a partner to loop with
- delete the transition that turns B on, then check \`G (B ⇒ F C)\` → a **vacuous pass**, where the property holds only because the trigger never happens
- leave a state disconnected → the checker reports it as unreachable and ignores it, because unreachable states cannot break anything

That last one is the whole idea in miniature: a model checker only reasons about behaviour the system can actually produce.`,
    task: 'Build something, then try to break it. The counterexample trail under each verdict is clickable — use it to walk the failing run on the canvas.',
    initialStates: [
      { id: 's0', label: 'Signal A', innerOpen: true, outerOpen: false, pressurized: false, isInitial: true, x: 200, y: 210 },
      { id: 's1', label: 'Signal B', innerOpen: false, outerOpen: true, pressurized: false, x: 450, y: 110 },
      { id: 's2', label: 'Signal C', innerOpen: false, outerOpen: false, pressurized: true, x: 450, y: 330 }
    ],
    initialTransitions: [
      { id: 'st1', from: 's0', to: 's1', action: 'A → B' },
      { id: 'st2', from: 's1', to: 's2', action: 'B → C' },
      { id: 'st3', from: 's2', to: 's0', action: 'C → A' }
    ],
    targetProperty: SANDBOX_PROPERTIES[0],
    propertyOptions: SANDBOX_PROPERTIES,
    showFairnessToggle: true,
    successMessage: 'Nice. The sandbox has no win condition — every verdict here, pass or fail, is telling you something true about the machine you drew.',
    allowEditing: true
  }
];
