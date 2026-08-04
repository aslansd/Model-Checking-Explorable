/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The three atomic propositions every state carries. */
export type PropKey = 'innerOpen' | 'outerOpen' | 'pressurized';

export interface KripkeState {
  id: string;
  label: string;
  innerOpen: boolean;
  outerOpen: boolean;
  pressurized: boolean;
  isInitial?: boolean;
  // Position coordinates in the node editor (SVG user units)
  x: number;
  y: number;
}

export interface KripkeTransition {
  id: string;
  from: string;
  to: string;
  action: string;
}

export type TemporalOperator = 'G' | 'F' | 'X' | 'U' | 'A' | 'E';

/**
 * A machine-checkable specification.
 *
 *  - invariant   G ¬bad          "the bad thing never happens"      (safety)
 *  - response    G (p ⇒ F q)     "every p is eventually followed by q" (liveness)
 *  - no_deadlock G ¬deadlock     "no reachable state is a dead end"  (safety-ish)
 */
export type Spec =
  | { kind: 'invariant'; bad: (s: KripkeState) => boolean }
  | { kind: 'response'; p: (s: KripkeState) => boolean; q: (s: KripkeState) => boolean }
  | { kind: 'no_deadlock' };

export interface TemporalProperty {
  id: string;
  name: string;
  description: string;
  /** The formula, rendered for humans. */
  formula: string;
  /** A plain-English reading of the formula, shown right under it. */
  plainEnglish: string;
  type: 'safety' | 'liveness';
  spec: Spec;
  explanation: string;
}

export type StepType =
  | 'visit'
  | 'check_state'
  | 'info'
  | 'violation'
  | 'success'
  | 'warning';

export interface ModelCheckerStep {
  type: StepType;
  currentNodeId: string;
  visitedNodes: string[];
  path: string[]; // From initial to current
  message: string;
}

export interface ChapterCheck {
  /** Shown to the user when this extra condition is not met yet. */
  message: string;
  /** True when the sanity check passes. */
  test: (ctx: {
    states: KripkeState[];
    transitions: KripkeTransition[];
    reachable: Set<string>;
  }) => boolean;
}

export interface Chapter {
  id: number;
  title: string;
  subtitle: string;
  narrative: string;
  task: string;
  initialStates: KripkeState[];
  initialTransitions: KripkeTransition[];
  targetProperty: TemporalProperty;
  /** Extra properties the learner can switch to (used by the sandbox). */
  propertyOptions?: TemporalProperty[];
  /**
   * Extra "is this model still useful?" checks run after verification passes.
   * They stop learners from "solving" a level by deleting the interesting behaviour.
   */
  sanityChecks?: ChapterCheck[];
  successMessage: string;
  allowEditing: boolean;
  /** Whether the fairness switch is meaningful for this chapter. */
  showFairnessToggle?: boolean;
  /** Metaphor shown above the canvas. */
  metaphor: string;
}
