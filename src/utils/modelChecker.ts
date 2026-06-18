/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KripkeState, KripkeTransition, TemporalProperty, ModelCheckerStep } from '../types';

export interface VerificationResult {
  success: boolean;
  steps: ModelCheckerStep[];
  trace?: string[]; // Array of state IDs in the counterexample path
  lassoIndex?: number; // For liveness, index in trace where loop starts
  errorStateId?: string;
  message: string;
}

/**
 * Runs the model checker on the state machine.
 * Generates step-by-step trace logs for visual playback,
 * detects safety violations (unreachable bad states),
 * and liveness violations (non-trivial cycles excluding success targets).
 */
export function verifyModel(
  states: KripkeState[],
  transitions: KripkeTransition[],
  property: TemporalProperty
): VerificationResult {
  const steps: ModelCheckerStep[] = [];
  const initial = states.find(s => s.isInitial);

  if (!initial) {
    return {
      success: false,
      steps,
      message: "No initial state designated! Place/select an initial starting node."
    };
  }

  // Helper map for fast lookup
  const stateMap = new Map(states.map(s => [s.id, s]));
  
  // Safety checking DFS/BFS
  if (property.type === 'safety') {
    const visited = new Set<string>();
    const queue: { current: string; path: string[] }[] = [];
    
    queue.push({ current: initial.id, path: [initial.id] });
    steps.push({
      type: 'visit',
      currentNodeId: initial.id,
      visitedNodes: [],
      path: [initial.id],
      message: `Starting verification from initial state: ${initial.label}`
    });

    while (queue.length > 0) {
      const { current, path } = queue.shift()!;
      
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const state = stateMap.get(current);
      if (!state) continue;

      steps.push({
        type: 'check_state',
        currentNodeId: current,
        visitedNodes: Array.from(visited),
        path: [...path],
        message: `Checking state properties for "${state.label}"`
      });

      // Check violation
      if (property.isViolated(state, states)) {
        steps.push({
          type: 'violation',
          currentNodeId: current,
          visitedNodes: Array.from(visited),
          path: [...path],
          message: `🚨 Safety Violation found! ${property.name} failed: "${state.label}" violates constraint.`
        });

        return {
          success: false,
          steps,
          trace: path,
          errorStateId: current,
          message: `Safety violation found: ${property.explanation}`
        };
      }

      // Find next transitions
      const nextTransitions = transitions.filter(t => t.from === current);
      for (const t of nextTransitions) {
        if (!visited.has(t.to)) {
          queue.push({ current: t.to, path: [...path, t.to] });
          steps.push({
            type: 'visit',
            currentNodeId: t.to,
            visitedNodes: Array.from(visited),
            path: [...path, t.to],
            message: `Queueing transition: "${t.action}" to "${stateMap.get(t.to)?.label || t.to}"`
          });
        }
      }
    }

    steps.push({
      type: 'success',
      currentNodeId: initial.id,
      visitedNodes: Array.from(visited),
      path: [],
      message: "🎉 Success! Checked all reachable states. No safety violations found."
    });

    return {
      success: true,
      steps,
      message: "Perfect! All states satisfy the safety constraints."
    };
  } 
  
  // Liveness checking (Level 2 & 3: Microwave/Rover)
  // Formula G (p -> F q) e.g., G (Heating -> F CookComplete).
  // A liveness violation occurs if there is a cycle where p is true or has been activated,
  // but q is never reached and we lock in a cycle.
  // We can model this by:
  // 1. Finding the trigger states where p is active (e.g. state.innerOpen is true, meaning heating or request is active).
  // 2. Finding the success state where q is reached (e.g. CookComplete, which is state.pressurized === true, or Done state).
  // 3. Finding if there is a path from the trigger states to a cycle that never contains the success state.
  if (property.id === 'microwave_liveness') {
    // p: Heating (state.innerOpen), q: Done (state.pressurized)
    const isTrigger = (s: KripkeState) => s.innerOpen; // Heating
    const isSuccess = (s: KripkeState) => s.pressurized; // CookComplete

    // Let's do a path check: run DFS to find any infinite cycles of states reachable from a trigger
    // that don't ever reach or include a success state.
    const path: string[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    let violationTrace: string[] = [];
    let loopStartIdx = -1;

    // We do DFS checking for cycles in the subgraph of states that are NOT success states
    // reachable from any active trigger.
    function findLivenessBug(uId: string): boolean {
      visited.add(uId);
      recStack.add(uId);
      path.push(uId);

      const state = stateMap.get(uId);
      if (!state) return false;

      // Add a step for visualization
      steps.push({
        type: 'check_state',
        currentNodeId: uId,
        visitedNodes: Array.from(visited),
        path: [...path],
        message: `Analyzing path branch at "${state.label}"...`
      });

      const nextTransitions = transitions.filter(t => t.from === uId);
      for (const t of nextTransitions) {
        const vId = t.to;
        const vState = stateMap.get(vId);
        
        // If it's a success state, this path is "rescued" (successfully cooking finishes!)
        if (vState && isSuccess(vState)) {
          continue; 
        }

        if (!visited.has(vId)) {
          if (findLivenessBug(vId)) {
            return true;
          }
        } else if (recStack.has(vId)) {
          // Found a cycle! Since neither this state nor any state in the DFS recursion stack 
          // (which can reach this cycle) contains a success state, we have a dead loop/livelock!
          loopStartIdx = path.indexOf(vId);
          violationTrace = [...path, vId];
          return true;
        }
      }

      recStack.delete(uId);
      path.pop();
      return false;
    }

    // Start checking from the 'heating' or trigger state if reachable
    const triggerStates = states.filter(isTrigger);
    for (const tState of triggerStates) {
      visited.clear();
      recStack.clear();
      path.length = 0;
      
      steps.push({
        type: 'visit',
        currentNodeId: tState.id,
        visitedNodes: [],
        path: [tState.id],
        message: `Trigger detected: "${tState.label}". Checking for eventual progress...`
      });

      if (findLivenessBug(tState.id)) {
        steps.push({
          type: 'violation',
          currentNodeId: violationTrace[violationTrace.length - 1],
          visitedNodes: Array.from(visited),
          path: violationTrace,
          message: `🚨 Livelock Cycle Detected! The machine can loop infinitely without ever finishing cooking.`
        });

        return {
          success: false,
          steps,
          trace: violationTrace,
          lassoIndex: loopStartIdx,
          message: "Liveness Violation: The microwave has a cycle where the heating element stays active or stuck without ever shutting down or reaching complete cook!"
        };
      }
    }

    // If no violations found but we need to verify if the oven is stuck in static dead-end
    // e.g. state 'open_door' cannot reach cook complete
    const openState = states.find(s => s.id === 'open_door');
    if (openState) {
      // Find if there is any path from open_door back to done or ready
      const visitedFromOpen = new Set<string>();
      const queue = [openState.id];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (visitedFromOpen.has(curr)) continue;
        visitedFromOpen.add(curr);
        transitions.filter(t => t.from === curr).forEach(t => queue.push(t.to));
      }
      
      const completes = Array.from(visitedFromOpen).some(id => id === 'done' || id === 'ready');
      if (!completes) {
        steps.push({
          type: 'violation',
          currentNodeId: 'open_door',
          visitedNodes: Array.from(visitedFromOpen),
          path: ['heating', 'open_door'],
          message: `🚨 Dead-end state! Once you "Open Door", you can never reach completion.`
        });
        return {
          success: false,
          steps,
          trace: ['heating', 'open_door'],
          message: "Liveness Violation: Open door is a dead-end state and cannot reach the happy path state."
        };
      }
    }

    steps.push({
      type: 'success',
      currentNodeId: initial.id,
      visitedNodes: states.map(s => s.id),
      path: [],
      message: "🎉 Success! Verified liveness. Under all behaviors, heating eventually finishes."
    });

    return {
      success: true,
      steps,
      message: "Excellent! The liveness check passed completely. Cooking always finishes."
    };
  }

  // Level 3: Mars Rover Hatch liveness / deadlock safety
  // AG (Request -> AF HatchOpen)
  // If there's a deadlock state (like 'dust_wait' with self loop 'rt_self_loop'), it is a deadlock.
  if (property.id === 'rover_safety') {
    const isTrigger = (s: KripkeState) => s.id === 'request';
    const isSuccess = (s: KripkeState) => s.innerOpen; // HatchOpen is innerOpen

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];
    let violationTrace: string[] = [];
    let loopStartIdx = -1;

    function checkRoverDeadlock(uId: string): boolean {
      visited.add(uId);
      recStack.add(uId);
      path.push(uId);

      const state = stateMap.get(uId);
      if (!state) return false;

      steps.push({
        type: 'check_state',
        currentNodeId: uId,
        visitedNodes: Array.from(visited),
        path: [...path],
        message: `Tracing path at "${state.label}"...`
      });

      const nextTransitions = transitions.filter(t => t.from === uId);
      
      // If there are no outgoing transitions, that is a terminal deadlock state!
      if (nextTransitions.length === 0 && !isSuccess(state)) {
        violationTrace = [...path];
        return true;
      }

      for (const t of nextTransitions) {
        const vId = t.to;
        const vState = stateMap.get(vId);

        if (vState && isSuccess(vState)) {
          continue; // Meets progress condition
        }

        if (!visited.has(vId)) {
          if (checkRoverDeadlock(vId)) return true;
        } else if (recStack.has(vId)) {
          // Found an infinite self loop or cycle excluding success hatch_open
          loopStartIdx = path.indexOf(vId);
          violationTrace = [...path, vId];
          return true;
        }
      }

      recStack.delete(uId);
      path.pop();
      return false;
    }

    // Run DFS from 'request' state
    const requestNode = states.find(isTrigger);
    if (requestNode) {
      if (checkRoverDeadlock(requestNode.id)) {
        steps.push({
          type: 'violation',
          currentNodeId: violationTrace[violationTrace.length - 1],
          visitedNodes: Array.from(visited),
          path: violationTrace,
          message: `🚨 Deadlock pattern detected at "${stateMap.get(violationTrace[violationTrace.length-1])?.label}"!`
        });

        return {
          success: false,
          steps,
          trace: violationTrace,
          lassoIndex: loopStartIdx >= 0 ? loopStartIdx : undefined,
          message: "Liveness Violation: The rover gets stuck in a retry deadlock or infinite wait, never activating the hatch."
        };
      }
    }

    steps.push({
      type: 'success',
      currentNodeId: initial.id,
      visitedNodes: states.map(s => s.id),
      path: [],
      message: "🎉 Success! The rover safety and progress properties are fully satisfied."
    });

    return {
      success: true,
      steps,
      message: "Spectacular! Safety & progress is fully satisfied."
    };
  }

  // Generics for Sandbox chapter
  // Simply runs a general safety BFS search checking the logic of 'sandbox_custom'
  const visited = new Set<string>();
  const queue = [initial.id];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    
    const state = stateMap.get(curr);
    if (state && property.isViolated(state, states)) {
      return {
        success: false,
        steps,
        trace: [initial.id, curr],
        message: `Violation occurred at state: "${state.label}"`
      };
    }
    transitions.filter(t => t.from === curr).forEach(t => queue.push(t.to));
  }

  return {
    success: true,
    steps,
    message: "Verified successfully!"
  };
}
