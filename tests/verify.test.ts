/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression suite for the verification engine and the chapter designs.
 * No test framework needed: `npm test` runs this with tsx.
 *
 * Every chapter must be (a) failing as shipped, (b) solvable by the fix the
 * task text actually describes, and (c) not solvable by deleting the
 * behaviour the chapter is about.
 */

import { CHAPTERS } from '../src/data/chapters';
import { verifyModel } from '../src/utils/modelChecker';
import { KripkeState, KripkeTransition } from '../src/types';

type Mutate = (s: KripkeState[], t: KripkeTransition[]) => [KripkeState[], KripkeTransition[]];

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

let passed = 0;
let failed = 0;

function expectOutcome(
  name: string,
  chapterIdx: number,
  mutate: Mutate,
  want: string,
  opts: { fairness?: boolean; propertyIdx?: number } = {}
) {
  const chapter = CHAPTERS[chapterIdx];
  const [states, transitions] = mutate(clone(chapter.initialStates), clone(chapter.initialTransitions));
  const property =
    opts.propertyIdx !== undefined ? chapter.propertyOptions![opts.propertyIdx] : chapter.targetProperty;

  const result = verifyModel(states, transitions, property, {
    assumeFairness: opts.fairness ?? true
  });

  const reachable = new Set(result.reachable);
  const sane = (chapter.sanityChecks ?? []).every(c => c.test({ states, transitions, reachable }));
  const got = result.success ? (sane ? 'SOLVED' : 'cheat-blocked') : result.outcome;

  if (got === want) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name} — expected ${want}, got ${got}`);
  }
}

console.log('Chapter 1 — safety');
expectOutcome('fails as shipped', 0, (s, t) => [s, t], 'safety_violation');
expectOutcome('one vent removed is not enough', 0, (s, t) => [s, t.filter(x => x.id !== 't_bug')], 'safety_violation');
expectOutcome('both vents removed solves it', 0, (s, t) => [s, t.filter(x => !x.id.startsWith('t_bug'))], 'SOLVED');
expectOutcome('welding the doors shut is rejected', 0, (s, t) => [s, t.filter(x => x.id !== 't1' && x.id !== 't3')], 'cheat-blocked');
expectOutcome('deleting the hazard state is rejected', 0, (s, t) => [
  s.filter(x => x.id !== 'danger'),
  t.filter(x => x.to !== 'danger' && x.from !== 'danger')
], 'cheat-blocked');

console.log('Chapter 2 — liveness');
expectOutcome('livelock as shipped', 1, (s, t) => [s, t], 'livelock');
expectOutcome('removing the self-loop leaves a deadlock', 1, (s, t) => [s, t.filter(x => x.id !== 'mt_bug2')], 'deadlock');
expectOutcome('watchdog to Idle solves it', 1, (s, t) => [s, t.map(x => (x.id === 'mt_bug2' ? { ...x, to: 'ready' } : x))], 'SOLVED');
expectOutcome('watchdog to Done also solves it', 1, (s, t) => [s, t.map(x => (x.id === 'mt_bug2' ? { ...x, to: 'done' } : x))], 'SOLVED');
expectOutcome('fixed model fails without fairness', 1, (s, t) => [s, t.map(x => (x.id === 'mt_bug2' ? { ...x, to: 'ready' } : x))], 'livelock', { fairness: false });
expectOutcome('deleting Press start is vacuous, not a pass', 1, (s, t) => [s, t.filter(x => x.id !== 'mt1')], 'vacuous');
expectOutcome('removing the door is rejected', 1, (s, t) => [s, t.filter(x => x.id !== 'mt3')], 'livelock');
expectOutcome('an unreachable island is ignored', 1, (s, t) => [
  [...s, { id: 'ghost', label: 'Ghost', innerOpen: true, outerOpen: false, pressurized: false, x: 10, y: 10 }],
  [...t.map(x => (x.id === 'mt_bug2' ? { ...x, to: 'ready' } : x)), { id: 'g', from: 'ghost', to: 'ghost', action: 'spin' }]
], 'SOLVED');

console.log('Chapter 3 — fairness');
expectOutcome('livelock as shipped', 2, (s, t) => [s, t], 'livelock');
expectOutcome('removing the self-loop leaves a deadlock', 2, (s, t) => [s, t.filter(x => x.id !== 'rt_self_loop')], 'deadlock');
expectOutcome('retry back to Request solves it', 2, (s, t) => [s, t.map(x => (x.id === 'rt_self_loop' ? { ...x, to: 'request' } : x))], 'SOLVED');
expectOutcome('fixed model fails without fairness', 2, (s, t) => [s, t.map(x => (x.id === 'rt_self_loop' ? { ...x, to: 'request' } : x))], 'livelock', { fairness: false });
expectOutcome('never detecting dust is rejected', 2, (s, t) => [s, t.filter(x => x.id !== 'rt4')], 'cheat-blocked');

console.log('Chapter 4 — sandbox');
[0, 1, 2, 3, 4].forEach(i =>
  expectOutcome(`starting model satisfies ${CHAPTERS[3].propertyOptions![i].formula}`, 3, (s, t) => [s, t], 'SOLVED', { propertyIdx: i })
);
expectOutcome('an A∧B state breaks safety', 3, (s, t) => [
  [...s, { id: 'bad', label: 'A+B', innerOpen: true, outerOpen: true, pressurized: false, x: 650, y: 220 }],
  [...t, { id: 'z1', from: 's0', to: 'bad', action: 'glitch' }, { id: 'z2', from: 'bad', to: 's0', action: 'clear' }]
], 'safety_violation', { propertyIdx: 0 });
expectOutcome('a dead end breaks G ¬deadlock', 3, (s, t) => [
  [...s, { id: 'de', label: 'Dead', innerOpen: false, outerOpen: false, pressurized: false, x: 650, y: 220 }],
  [...t, { id: 'z', from: 's1', to: 'de', action: 'crash' }]
], 'deadlock', { propertyIdx: 4 });
expectOutcome('no initial state is reported', 3, (s, t) => [s.map(x => ({ ...x, isInitial: false })), t], 'no_initial', { propertyIdx: 0 });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
