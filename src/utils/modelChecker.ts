/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KripkeState, KripkeTransition, TemporalProperty, ModelCheckerStep } from '../types';

export type CheckOutcome =
  | 'ok'
  | 'vacuous'
  | 'safety_violation'
  | 'deadlock'
  | 'livelock'
  | 'no_initial';

export interface VerificationResult {
  success: boolean;
  outcome: CheckOutcome;
  steps: ModelCheckerStep[];
  /** Counterexample as a list of state ids, starting at the initial state. */
  trace?: string[];
  /** Index in `trace` where the repeating loop starts (a "lasso"). */
  lassoIndex?: number;
  errorStateId?: string;
  reachable: string[];
  unreachable: string[];
  message: string;
  /** A nudge shown under the verdict. */
  hint?: string;
}

interface Edge {
  to: string;
  action: string;
}

/* ------------------------------------------------------------------ */
/* Graph helpers                                                       */
/* ------------------------------------------------------------------ */

function buildSuccessors(states: KripkeState[], transitions: KripkeTransition[]): Map<string, Edge[]> {
  const succ = new Map<string, Edge[]>();
  states.forEach(s => succ.set(s.id, []));
  transitions.forEach(t => {
    if (succ.has(t.from) && succ.has(t.to)) {
      succ.get(t.from)!.push({ to: t.to, action: t.action });
    }
  });
  return succ;
}

/** Breadth-first search. Returns visit order and parent pointers (shortest paths). */
function bfs(
  startIds: string[],
  succ: Map<string, Edge[]>,
  allowed?: Set<string>
): { visited: Set<string>; parent: Map<string, string | null>; order: string[] } {
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const order: string[] = [];
  const queue: string[] = [];

  for (const id of startIds) {
    if (allowed && !allowed.has(id)) continue;
    if (visited.has(id)) continue;
    visited.add(id);
    parent.set(id, null);
    queue.push(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const edge of succ.get(current) ?? []) {
      if (allowed && !allowed.has(edge.to)) continue;
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      parent.set(edge.to, current);
      queue.push(edge.to);
    }
  }

  return { visited, parent, order };
}

function pathTo(parent: Map<string, string | null>, target: string): string[] {
  const path: string[] = [];
  let cursor: string | null | undefined = target;
  while (cursor !== null && cursor !== undefined) {
    path.unshift(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  return path;
}

/** Reverse-reachability: every state from which some state in `targets` is reachable. */
function canReach(
  targets: Set<string>,
  succ: Map<string, Edge[]>,
  within: Set<string>
): Set<string> {
  const pred = new Map<string, string[]>();
  within.forEach(id => pred.set(id, []));
  within.forEach(id => {
    for (const edge of succ.get(id) ?? []) {
      if (within.has(edge.to)) pred.get(edge.to)!.push(id);
    }
  });

  const result = new Set<string>();
  const queue: string[] = [];
  targets.forEach(id => {
    if (within.has(id)) {
      result.add(id);
      queue.push(id);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const p of pred.get(current) ?? []) {
      if (!result.has(p)) {
        result.add(p);
        queue.push(p);
      }
    }
  }
  return result;
}

/**
 * Search inside `allowed` for an infinite bad behaviour: either a cycle (a
 * "lasso") or a dead-end state with no outgoing transitions at all.
 * Returns the suffix path from `start` plus where the loop closes.
 */
function findLassoOrDeadlock(
  start: string,
  allowed: Set<string>,
  succ: Map<string, Edge[]>
): { suffix: string[]; loopStart: number | null } | null {
  const stack: string[] = [];
  const onStack = new Set<string>();
  const finished = new Set<string>();
  let found: { suffix: string[]; loopStart: number | null } | null = null;

  const dfs = (id: string): boolean => {
    stack.push(id);
    onStack.add(id);

    const edges = (succ.get(id) ?? []);

    // A state with no outgoing transitions at all is a deadlock.
    if (edges.length === 0) {
      found = { suffix: [...stack], loopStart: null };
      return true;
    }

    for (const edge of edges) {
      if (!allowed.has(edge.to)) continue;
      if (onStack.has(edge.to)) {
        found = { suffix: [...stack, edge.to], loopStart: stack.indexOf(edge.to) };
        return true;
      }
      if (!finished.has(edge.to) && dfs(edge.to)) return true;
    }

    onStack.delete(id);
    finished.add(id);
    stack.pop();
    return false;
  };

  if (!allowed.has(start)) return null;
  dfs(start);
  return found;
}

/* ------------------------------------------------------------------ */
/* The model checker                                                   */
/* ------------------------------------------------------------------ */

export interface VerifyOptions {
  /**
   * When true, we assume *weak fairness*: if a transition out of a loop is
   * available over and over again, the system eventually takes it. Real
   * hardware behaves this way; without the assumption almost every cyclic
   * system "fails" liveness, which is not a useful answer.
   */
  assumeFairness: boolean;
}

export function verifyModel(
  states: KripkeState[],
  transitions: KripkeTransition[],
  property: TemporalProperty,
  options: VerifyOptions = { assumeFairness: true }
): VerificationResult {
  const steps: ModelCheckerStep[] = [];
  const stateMap = new Map(states.map(s => [s.id, s]));
  const succ = buildSuccessors(states, transitions);
  const label = (id: string) => stateMap.get(id)?.label ?? id;

  const initial = states.find(s => s.isInitial);
  if (!initial) {
    return {
      success: false,
      outcome: 'no_initial',
      steps: [{
        type: 'violation',
        currentNodeId: '',
        visitedNodes: [],
        path: [],
        message: 'No initial state is marked. A model checker has to start somewhere — pick a state and set it as initial.'
      }],
      reachable: [],
      unreachable: states.map(s => s.id),
      message: 'No initial state is marked. Select a state and press SET under "Initial state".'
    };
  }

  /* ---- Step 1: reachability. Only reachable states can ever occur. ---- */

  const reach = bfs([initial.id], succ);
  const reachable = reach.visited;
  const unreachable = states.filter(s => !reachable.has(s.id)).map(s => s.id);

  steps.push({
    type: 'info',
    currentNodeId: initial.id,
    visitedNodes: [initial.id],
    path: [initial.id],
    message: `Starting from the initial state "${initial.label}". Exploring every state the system can actually get to.`
  });

  for (const id of reach.order) {
    steps.push({
      type: 'visit',
      currentNodeId: id,
      visitedNodes: [...reachable],
      path: pathTo(reach.parent, id),
      message: `Reached "${label(id)}" in ${pathTo(reach.parent, id).length - 1} step(s).`
    });
  }

  if (unreachable.length > 0) {
    steps.push({
      type: 'warning',
      currentNodeId: initial.id,
      visitedNodes: [...reachable],
      path: [],
      message: `${unreachable.length} state(s) are unreachable and will be ignored: ${unreachable.map(label).join(', ')}. Unreachable states cannot break the system — but they usually mean a wire is missing.`
    });
  }

  const unreachableHint = unreachable.length > 0
    ? `Heads up: ${unreachable.map(label).join(', ')} can never be reached from the initial state, so the checker ignored them.`
    : undefined;

  /* ---- Step 2: check the specification. ---- */

  const spec = property.spec;

  /* -------- Safety: G ¬bad -------- */
  if (spec.kind === 'invariant') {
    for (const id of reach.order) {
      const state = stateMap.get(id)!;
      const path = pathTo(reach.parent, id);
      steps.push({
        type: 'check_state',
        currentNodeId: id,
        visitedNodes: [...reachable],
        path,
        message: `Checking "${state.label}" against ${property.formula}`
      });

      if (spec.bad(state)) {
        steps.push({
          type: 'violation',
          currentNodeId: id,
          visitedNodes: [...reachable],
          path,
          message: `Safety violated at "${state.label}". Shortest counterexample: ${path.map(label).join(' → ')}`
        });
        return {
          success: false,
          outcome: 'safety_violation',
          steps,
          trace: path,
          errorStateId: id,
          reachable: [...reachable],
          unreachable,
          message: `Safety violation. ${property.explanation}`,
          hint: 'Because we searched breadth-first, this is the shortest way to reach the bad state. Follow the red trail and remove the step that should not be possible.'
        };
      }
    }

    steps.push({
      type: 'success',
      currentNodeId: initial.id,
      visitedNodes: [...reachable],
      path: [],
      message: `Checked all ${reachable.size} reachable state(s). ${property.formula} holds on every one of them.`
    });

    return {
      success: true,
      outcome: 'ok',
      steps,
      reachable: [...reachable],
      unreachable,
      message: `Verified. Every one of the ${reachable.size} reachable states satisfies ${property.formula}.`,
      hint: unreachableHint
    };
  }

  /* -------- No dead ends: G ¬deadlock -------- */
  if (spec.kind === 'no_deadlock') {
    for (const id of reach.order) {
      if ((succ.get(id) ?? []).length === 0) {
        const path = pathTo(reach.parent, id);
        steps.push({
          type: 'violation',
          currentNodeId: id,
          visitedNodes: [...reachable],
          path,
          message: `Dead end at "${label(id)}" — it has no outgoing transitions, so the system freezes here forever.`
        });
        return {
          success: false,
          outcome: 'deadlock',
          steps,
          trace: path,
          errorStateId: id,
          reachable: [...reachable],
          unreachable,
          message: `Deadlock: "${label(id)}" has no way out.`,
          hint: 'Give this state at least one outgoing transition, or remove it.'
        };
      }
    }
    steps.push({
      type: 'success',
      currentNodeId: initial.id,
      visitedNodes: [...reachable],
      path: [],
      message: 'No dead ends: every reachable state has somewhere to go.'
    });
    return {
      success: true,
      outcome: 'ok',
      steps,
      reachable: [...reachable],
      unreachable,
      message: 'Verified. The system can never freeze — every reachable state has an outgoing transition.',
      hint: unreachableHint
    };
  }

  /* -------- Liveness: G (p ⇒ F q) -------- */

  const { p, q } = spec;
  const triggers = reach.order.filter(id => p(stateMap.get(id)!));
  const goals = new Set(reach.order.filter(id => q(stateMap.get(id)!)));

  steps.push({
    type: 'info',
    currentNodeId: initial.id,
    visitedNodes: [...reachable],
    path: [],
    message: `Trigger states (where the promise starts): ${triggers.length ? triggers.map(label).join(', ') : 'none'}. Goal states (where it is kept): ${goals.size ? [...goals].map(label).join(', ') : 'none'}.`
  });

  /* Vacuity — the property "passes" only because it never applies. */
  if (triggers.length === 0) {
    steps.push({
      type: 'warning',
      currentNodeId: initial.id,
      visitedNodes: [...reachable],
      path: [],
      message: `${property.formula} is satisfied VACUOUSLY: no reachable state ever makes the left-hand side true, so the promise is never tested.`
    });
    return {
      success: false,
      outcome: 'vacuous',
      steps,
      reachable: [...reachable],
      unreachable,
      message: `Vacuously true. Nothing in this model ever triggers the property, so "always keep the promise" is trivially satisfied — the checker learned nothing.`,
      hint: 'Real verification teams treat a vacuous pass as a failure. Restore the behaviour that makes the trigger reachable and check again.'
    };
  }

  /* States that still have a route to a goal state. */
  const canStillReachGoal = canReach(goals, succ, reachable);
  /* States from which the goal is gone forever. */
  const hopeless = new Set([...reachable].filter(id => !canStillReachGoal.has(id)));
  /* Search space: reachable states that have not already kept the promise. */
  const pending = new Set([...reachable].filter(id => !goals.has(id)));

  const searchSpace = options.assumeFairness ? hopeless : pending;

  for (const triggerId of triggers) {
    if (goals.has(triggerId)) continue; // promise kept the instant it was made

    // Where can we get from the trigger without ever passing through a goal?
    const fromTrigger = bfs([triggerId], succ, pending);

    for (const candidate of fromTrigger.order) {
      if (!searchSpace.has(candidate)) continue;

      const bad = findLassoOrDeadlock(candidate, searchSpace, succ);
      if (!bad) continue;

      const prefix = pathTo(reach.parent, triggerId);
      const middle = pathTo(fromTrigger.parent, candidate).slice(1);
      const suffix = bad.suffix.slice(1);
      const trace = [...prefix, ...middle, ...suffix];
      // `bad.suffix[0]` is `candidate`, which is already the last element of
      // prefix+middle, so the suffix is offset by one.
      const lassoIndex =
        bad.loopStart === null
          ? undefined
          : prefix.length + middle.length - 1 + bad.loopStart;

      const isDeadlock = bad.loopStart === null;
      const endId = trace[trace.length - 1];

      steps.push({
        type: 'violation',
        currentNodeId: endId,
        visitedNodes: [...reachable],
        path: trace,
        message: isDeadlock
          ? `Dead end at "${label(endId)}". Once "${label(triggerId)}" happens the system can walk into a state with no exit, so ${property.formula} is broken.`
          : `Loop found: ${trace.slice(lassoIndex ?? 0).map(label).join(' → ')}. The system can go round this loop forever without ever reaching the goal.`
      });

      const fairnessNote = options.assumeFairness
        ? 'Fairness is assumed, so this is a real bug: from here there is no route back to the goal at all.'
        : 'Fairness is switched OFF, so a loop counts as a bug even if it has an exit. Turn fairness on to assume the system eventually takes an available exit.';

      return {
        success: false,
        outcome: isDeadlock ? 'deadlock' : 'livelock',
        steps,
        trace,
        lassoIndex,
        errorStateId: endId,
        reachable: [...reachable],
        unreachable,
        message: isDeadlock
          ? `Deadlock. After "${label(triggerId)}", the system can end up in "${label(endId)}", which has no outgoing transitions. ${property.explanation}`
          : `Livelock. After "${label(triggerId)}", the system can loop forever without reaching the goal. ${property.explanation}`,
        hint: fairnessNote
      };
    }
  }

  steps.push({
    type: 'success',
    currentNodeId: initial.id,
    visitedNodes: [...reachable],
    path: [],
    message: `${property.formula} holds. Every trigger is followed by the goal on every ${options.assumeFairness ? 'fair ' : ''}run.`
  });

  return {
    success: true,
    outcome: 'ok',
    steps,
    reachable: [...reachable],
    unreachable,
    message: options.assumeFairness
      ? `Verified under fairness. Whenever the trigger happens, the system always gets to the goal — assuming it does not refuse an available exit forever.`
      : `Verified without any fairness assumption. Even an adversarial scheduler cannot stop the system from reaching the goal.`,
    hint: unreachableHint
  };
}
