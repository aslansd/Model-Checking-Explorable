/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chapter } from '../types';

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    title: "1. The Decompression Catastrophe",
    subtitle: "Safety is about what should NEVER happen.",
    narrative: `Welcome to the Space Station Airlock! Safeguarding human lives in space is extremely hard. If both the **Inner Cabin Door** and the **Outer Space Door** are open at the same time, the cabin depressurizes instantly, sucking our intrepid astronaut into the vacuum of space!

In formal verification, we write a **Safety Property**: 'Something bad must never happen.' 
Here, the bad thing is the state: **(Inner Door Open) AND (Outer Door Open)**.
Our Safety target formula is:
**G ¬(InnerOpen ∧ OuterOpen)**
*(G means 'Globally' or 'Always' in temporal logic. This formula says: 'It is always true that doors are NOT both open.')*`,
    task: "Explore the reactor/airlock. There is a faulty control sequence. Click the nodes in 'Model Live Simulation' to walk through transitions manually, or run the Model Checker! Find and eliminate the transition that allows both doors to be open at the same time.",
    initialStates: [
      { id: 'off', label: 'Closed & Safe', innerOpen: false, outerOpen: false, pressurized: true, isInitial: true, x: 150, y: 150 },
      { id: 'inner', label: 'Inner Open', innerOpen: true, outerOpen: false, pressurized: true, x: 380, y: 100 },
      { id: 'outer', label: 'Outer Open', innerOpen: false, outerOpen: true, pressurized: false, x: 380, y: 320 },
      { id: 'danger', label: 'DECOMPRESSION!', innerOpen: true, outerOpen: true, pressurized: false, x: 620, y: 210 }
    ],
    initialTransitions: [
      { id: 't1', from: 'off', to: 'inner', action: 'Open Inner' },
      { id: 't2', from: 'inner', to: 'off', action: 'Close Inner' },
      { id: 't3', from: 'off', to: 'outer', action: 'Open Outer' },
      { id: 't4', from: 'outer', to: 'off', action: 'Close Outer' },
      // The bug transition:
      { id: 't_bug', from: 'inner', to: 'danger', action: 'Open Outer Door Vent' },
      { id: 't_bug2', from: 'outer', to: 'danger', action: 'Open Inner Door Vent' },
      { id: 't_escape', from: 'danger', to: 'off', action: 'Emergency Close' }
    ],
    targetProperty: {
      id: 'airlock_safety',
      name: "Airlock Safety",
      description: "Both doors must never be open concurrently.",
      formula: "G ¬(InnerOpen ∧ OuterOpen)",
      type: 'safety',
      isViolated: (s) => s.innerOpen && s.outerOpen,
      explanation: "Cabin decompression occurs when both doors are opened simultaneously. This state is highly lethal."
    },
    successCondition: (states, transitions, checkResult) => {
      // The user successfully completes Level 1 if they remove any transitions leading to an unsafe state,
      // making 'danger' unreachable from the initial 'off' state.
      return checkResult.success;
    },
    successMessage: "Superb! You deleted the rogue manual vent paths. Now, no matter what series of commands the automated pilot issues, both doors can never open at the same time! You saved our astronaut!",
    allowEditing: true
  },
  {
    id: 2,
    title: "2. The Rogue Microwave",
    subtitle: "Liveness is about what must EVENTUALLY happen.",
    narrative: `Fabulous work! Safety properties are great, but there is a second pillar to formal verification: **Liveness**. Liveness properties state: 'Something good must eventually happen.'

Consider a smart microwave oven.
- **InnerOpen** will represent: **Magnetron Heating is Running** 🔥
- **OuterOpen** will represent: **Microwave Door is Open** 🚪
- **Pressurized** will represent: **Cooking Cycled Completed** ⏱️

Safety property: **G ¬(Heating ∧ DoorOpen)** (Never heat while the door is open!)
Liveness property: **G (StartPressed ⇒ F CookingCompleted)** (If we press start, we must eventually finish cooking. 'F' stands for 'Future' or 'Eventually'. This means cooking shouldn't get stuck in an infinite loop!)`,
    task: "Look at this microwave model. There is a liveness infinite loop (liveloock). If the door is opened while cooking, the system gets stuck in a loop and never completes cooking! Modify or complete the state transitions so that if the door is open, heating turns off, allowing the user to reset and complete cook.",
    initialStates: [
      { id: 'ready', label: 'Idle & Closed', innerOpen: false, outerOpen: false, pressurized: false, isInitial: true, x: 150, y: 200 },
      { id: 'heating', label: 'Heating Active', innerOpen: true, outerOpen: false, pressurized: false, x: 400, y: 100 },
      { id: 'open_door', label: 'Door Open (Stopped)', innerOpen: false, outerOpen: true, pressurized: false, x: 400, y: 320 },
      { id: 'done', label: 'Cook Complete', innerOpen: false, outerOpen: false, pressurized: true, x: 650, y: 200 }
    ],
    initialTransitions: [
      { id: 'mt1', from: 'ready', to: 'heating', action: 'Press Start' },
      { id: 'mt2', from: 'heating', to: 'done', action: 'Timer Expires' },
      { id: 'mt3', from: 'open_door', to: 'ready', action: 'Close Door' },
      // The bug: Opening the door while heating does NOT turn off heating, it goes to door open but maintains heating status!
      // To simulate it, opening door transitions but is stuck or we lack a transition back.
      { id: 'mt_bug', from: 'heating', to: 'open_door', action: 'Open Door' }
    ],
    targetProperty: {
      id: 'microwave_liveness',
      name: "Microwave Liveness",
      description: "If heating starts, cooking must eventually finish or safely reset.",
      formula: "G (Heating ⇒ F CookComplete)",
      type: 'liveness',
      isViolated: (s, allStates) => {
        // Technically, a liveness violation is an infinite cycle that never reaches 'done'.
        // For educational simpleness, we will detect if there is a cycle starting from 'heating' that can never reach 'done'
        // or if 'open_door' is a dead-end that cannot reach 'done'.
        return false; // we calculate this dynamically in the model checker!
      },
      explanation: "If you press Start, the microwave must eventually reach the Completed state, or go back to Safety. It must not hang in an infinite loop."
    },
    successCondition: (states, transitions, checkResult) => {
      // User must create a path from 'open_door' back to 'ready' or 'done', and make sure heating turns off.
      // Specifically, we check if the model checker reports success for Liveness property.
      return checkResult.success;
    },
    successMessage: "Amazing! You successfully routed the door-open state back to safe closure and shutdown. The microwave safety-interlock logic now passes all automated verification checks. Delicious food is served safely!",
    allowEditing: true
  },
  {
    id: 3,
    title: "3. The Autonomous Rover Hatch",
    subtitle: "Exploring CTL: Branching Paths & Counterexamples.",
    narrative: `On Mars, errors cannot be fixed by a field technician. You are verifying the airpress hatch of a Mars Rover.
- **InnerOpen** = Martian Dust Storm External Hatch Open 💨
- **OuterOpen** = Internal Sample Container Open 🧪
- **Pressurized** = Safe Shield engaged 🛡️

Safety constraint: **G ¬(DustStormHatch ∧ InternalContainerOpen)** (Never expose Mars dirt to inner crew modules!)
Liveness constraint: **A G (HatchRequested ⇒ A F HatchOpen)** (Hatch must always eventually open when requested. 'AG' means 'Every Path, Globally' and 'AF' means 'Every Path, Eventually' in CTL).`,
    task: "The Rover hatch control software gets deadlocked in a self-loop when a dusty environment is detected. Find the deadlock node and delete the self-loop so it can recover, check, and succeed!",
    initialStates: [
      { id: 'idle', label: 'Rover Idle', innerOpen: false, outerOpen: false, pressurized: true, isInitial: true, x: 150, y: 220 },
      { id: 'request', label: 'Hatch Requested', innerOpen: false, outerOpen: false, pressurized: true, x: 380, y: 110 },
      { id: 'dust_wait', label: 'Storm Deadlock Loop', innerOpen: false, outerOpen: false, pressurized: false, x: 380, y: 330 },
      { id: 'hatch_active', label: 'Hatch Open & Ext', innerOpen: true, outerOpen: false, pressurized: false, x: 620, y: 220 }
    ],
    initialTransitions: [
      { id: 'rt1', from: 'idle', to: 'request', action: 'Trigger Open' },
      { id: 'rt2', from: 'request', to: 'hatch_active', action: 'Shield Off & Open' },
      { id: 'rt3', from: 'hatch_active', to: 'idle', action: 'Close Hatch' },
      // Rogue deadlock self transitions
      { id: 'rt_deadlock_tr', from: 'request', to: 'dust_wait', action: 'Dust Detected' },
      { id: 'rt_self_loop', from: 'dust_wait', to: 'dust_wait', action: 'Retry forever' }
    ],
    targetProperty: {
      id: 'rover_safety',
      name: "Martian Safety & Progress",
      description: "If a hatch is requested, it must eventually open, regardless of weather interruptions.",
      formula: "AG (Request ⇒ AF HatchOpen)",
      type: 'liveness',
      isViolated: () => false, // Evaluated dynamically
      explanation: "A deadlock infinite loop in dust_wait prevents the hatch from ever opening, leaving the command pending forever."
    },
    successCondition: (states, transitions, checkResult) => {
      return checkResult.success;
    },
    successMessage: "Spectacular! You deleted the infinite Martian retry loop. Instead of hanging forever when dust is detected, the rover can safely timeout or fall back to autonomous landing clearance!",
    allowEditing: true
  },
  {
    id: 4,
    title: "4. The Verification Sandbox",
    subtitle: "Build, Hack, & Verify your own algorithms!",
    narrative: `You are now a certified Formal Verification engineer! You have the keys to the entire verification lab.

Here, you can build *any* state machine you like. Add states, mark which ones are initial, toggle atomic variables (propositions), drag transitions, and write customized verification formulas. Play with safety, change transition labels, and trigger the model checker.

See how a Model Checker sweeps every possible branch, uncovering tricky 'edge-case' bugs that standard unit testing could never find.`,
    task: "Design a Traffic Light or a simple Elevators system. Make a loop, write a custom formula, and click Verify to see if there is any violation path!",
    initialStates: [
      { id: 's0', label: 'Green Go', innerOpen: true, outerOpen: false, pressurized: true, isInitial: true, x: 200, y: 200 },
      { id: 's1', label: 'Yellow Care', innerOpen: false, outerOpen: true, pressurized: true, x: 450, y: 120 },
      { id: 's2', label: 'Red Stop', innerOpen: false, outerOpen: false, pressurized: false, x: 450, y: 320 }
    ],
    initialTransitions: [
      { id: 'st1', from: 's0', to: 's1', action: 'Alert timer' },
      { id: 'st2', from: 's1', to: 's2', action: 'Stop signal' },
      { id: 'st3', from: 's2', to: 's0', action: 'Clear intersection' }
    ],
    targetProperty: {
      id: 'sandbox_custom',
      name: "Custom Safety Rule",
      description: "Ensure green and yellow are not on concurrently.",
      formula: "G ¬(Variable1 ∧ Variable2)",
      type: 'safety',
      isViolated: (s) => s.innerOpen && s.outerOpen,
      explanation: "Custom rule checking if your machine has two concurrent door/light indicators active."
    },
    successCondition: () => true, // Sandbox is always completed by exploring
    successMessage: "Awesome playground exploration! You did fantastic.",
    allowEditing: true
  }
];
