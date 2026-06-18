/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface KripkeState {
  id: string;
  label: string;
  innerOpen: boolean;
  outerOpen: boolean;
  pressurized: boolean;
  isInitial?: boolean;
  // Position coordinates in the node editor
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

export interface TemporalProperty {
  id: string;
  name: string;
  description: string;
  formula: string; // CTL/LTL represented as mathematical string
  type: 'safety' | 'liveness' | 'custom';
  // Evaluates a state. Used by model checker to find failure conditions
  isViolated: (state: KripkeState, allStates: KripkeState[]) => boolean;
  // Dynamic description maker
  explanation: string;
}

export interface ModelCheckerStep {
  type: 'visit' | 'check_state' | 'backtrack' | 'violation' | 'success';
  currentNodeId: string;
  visitedNodes: string[];
  path: string[]; // From initial to current
  message: string;
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
  successCondition: (states: KripkeState[], transitions: KripkeTransition[], checkResult: { success: boolean; trace?: string[] }) => boolean;
  successMessage: string;
  allowEditing: boolean; // Customizing or adding states/transitions
  predefinedBugs?: Array<{
    name: string;
    description: string;
    transitions: KripkeTransition[];
  }>;
}
