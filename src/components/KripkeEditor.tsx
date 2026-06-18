/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { KripkeState, KripkeTransition } from '../types';
import { Plus, Trash, Play, HelpCircle, ToggleLeft, ToggleRight, ArrowRight, CircleDot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface KripkeEditorProps {
  states: KripkeState[];
  transitions: KripkeTransition[];
  onStatesChange: (states: KripkeState[]) => void;
  onTransitionsChange: (transitions: KripkeTransition[]) => void;
  activeStateId: string | null;
  onActiveStateChange: (stateId: string | null) => void;
  highlightedPath: string[]; // Traced nodes from the Model Checker
  violationStateId: string | null;
  allowEditing: boolean;
  chapterId: number;
}

export default function KripkeEditor({
  states,
  transitions,
  onStatesChange,
  onTransitionsChange,
  activeStateId,
  onActiveStateChange,
  highlightedPath,
  violationStateId,
  allowEditing,
  chapterId
}: KripkeEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(states[0]?.id || null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Transition builder state
  const [newTransFrom, setNewTransFrom] = useState<string>('');
  const [newTransTo, setNewTransTo] = useState<string>('');
  const [newTransAction, setNewTransAction] = useState<string>('');

  const svgRef = useRef<SVGSVGElement>(null);

  // Auto-select first state if none selected
  useEffect(() => {
    if (states.length > 0 && !selectedNodeId) {
      setSelectedNodeId(states[0].id);
    }
  }, [states, selectedNodeId]);

  // Handle Drag Start
  const handleMouseDown = (e: React.MouseEvent, stateId: string) => {
    if (!allowEditing) return;
    e.preventDefault();
    const state = states.find(s => s.id === stateId);
    if (!state || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDraggedNodeId(stateId);
    setDragOffset({
      x: mouseX - state.x,
      y: mouseY - state.y
    });
    setSelectedNodeId(stateId);
  };

  // Handle Drag Touch Start for mobile
  const handleTouchStart = (e: React.TouchEvent, stateId: string) => {
    if (!allowEditing) return;
    const state = states.find(s => s.id === stateId);
    if (!state || !svgRef.current || e.touches.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const mouseX = touch.clientX - rect.left;
    const mouseY = touch.clientY - rect.top;

    setDraggedNodeId(stateId);
    setDragOffset({
      x: mouseX - state.x,
      y: mouseY - state.y
    });
    setSelectedNodeId(stateId);
  };

  // Handle Dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Boundary constraints: ensure node stays inside the workspace
    const newX = Math.max(50, Math.min(rect.width - 50, mouseX - dragOffset.x));
    const newY = Math.max(50, Math.min(rect.height - 50, mouseY - dragOffset.y));

    onStatesChange(
      states.map(s => s.id === draggedNodeId ? { ...s, x: newX, y: newY } : s)
    );
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggedNodeId || !svgRef.current || e.touches.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const mouseX = touch.clientX - rect.left;
    const mouseY = touch.clientY - rect.top;

    const newX = Math.max(50, Math.min(rect.width - 50, mouseX - dragOffset.x));
    const newY = Math.max(50, Math.min(rect.height - 50, mouseY - dragOffset.y));

    onStatesChange(
      states.map(s => s.id === draggedNodeId ? { ...s, x: newX, y: newY } : s)
    );
  };

  // Handle Drag End
  const handleMouseUp = () => {
    setDraggedNodeId(null);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setDraggedNodeId(null);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Creation Utilities
  const addNewState = () => {
    if (!allowEditing) return;
    const newId = `state_${Date.now().toString(36)}`;
    const newState: KripkeState = {
      id: newId,
      label: `State ${states.length + 1}`,
      innerOpen: false,
      outerOpen: false,
      pressurized: false,
      x: Math.floor(Math.random() * 200) + 150,
      y: Math.floor(Math.random() * 150) + 150
    };
    onStatesChange([...states, newState]);
    setSelectedNodeId(newId);
  };

  const deleteState = (stateId: string) => {
    if (!allowEditing) return;
    // Remove transitions associated with this state
    onTransitionsChange(transitions.filter(t => t.from !== stateId && t.to !== stateId));
    onStatesChange(states.filter(s => s.id !== stateId));
    if (selectedNodeId === stateId) {
      setSelectedNodeId(states.find(s => s.id !== stateId)?.id || null);
    }
    if (activeStateId === stateId) {
      onActiveStateChange(states.find(s => s.id !== stateId && s.isInitial)?.id || null);
    }
  };

  const addTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTransFrom || !newTransTo || !newTransAction) return;
    const newT: KripkeTransition = {
      id: `trans_${Date.now().toString(36)}`,
      from: newTransFrom,
      to: newTransTo,
      action: newTransAction.trim()
    };
    onTransitionsChange([...transitions, newT]);
    setNewTransAction('');
  };

  const deleteTransition = (tId: string) => {
    onTransitionsChange(transitions.filter(t => t.id !== tId));
  };

  // State parameter toggling
  const toggleStateProp = (stateId: string, flag: 'innerOpen' | 'outerOpen' | 'pressurized') => {
    onStatesChange(
      states.map(s => s.id === stateId ? { ...s, [flag]: !s[flag] } : s)
    );
  };

  const setAsInitial = (stateId: string) => {
    onStatesChange(
      states.map(s => ({
        ...s,
        isInitial: s.id === stateId
      }))
    );
    onActiveStateChange(stateId);
  };

  // Graph arrow geometry helpers
  const getLineData = (t: KripkeTransition) => {
    const fromState = states.find(s => s.id === t.from);
    const toState = states.find(s => s.id === t.to);

    if (!fromState || !toState) return null;

    const r = 40; // circle radius

    // Angle of the vector from -> to
    const dx = toState.x - fromState.x;
    const dy = toState.y - fromState.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return null;

    // Self loop
    if (t.from === t.to) {
      const cx = fromState.x;
      const cy = fromState.y - r;
      const pathData = `M ${cx - 15} ${cy + 12} A 25 25 0 1 1 ${cx + 15} ${cy + 12}`;
      return {
        path: pathData,
        labelX: cx,
        labelY: cy - 25,
        isSelf: true
      };
    }

    // Double-link (is there a link in reverse?)
    const hasReverse = transitions.some(other => other.from === t.to && other.to === t.from);
    
    // We start and end at the border of the circles
    const padFromX = (dx / dist) * r;
    const padFromY = (dy / dist) * r;
    const padToX = (dx / dist) * r;
    const padToY = (dy / dist) * r;

    const startX = fromState.x + padFromX;
    const startY = fromState.y + padFromY;
    const endX = toState.x - padToX;
    const endY = toState.y - padToY;

    if (hasReverse) {
      // Curve line slightly to avoid overlap
      const controlX = (startX + endX) / 2 - (dy / dist) * 35;
      const controlY = (startY + endY) / 2 + (dx / dist) * 35;
      return {
        path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
        labelX: controlX,
        labelY: controlY,
        isSelf: false
      };
    }

    // Straight vector
    return {
      path: `M ${startX} ${startY} L ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2 - 12,
      isSelf: false
    };
  };

  const selectedNode = states.find(s => s.id === selectedNodeId);

  // Specific metaphor keys depending on Chapter
  const getMetaphorLabel = (prop: 'innerOpen' | 'outerOpen' | 'pressurized') => {
    if (chapterId === 1) {
      return prop === 'innerOpen' ? 'Inner Door Open' : prop === 'outerOpen' ? 'Outer Door Open' : 'Cabin Pressurized';
    } else if (chapterId === 2) {
      return prop === 'innerOpen' ? 'Magnetron Heating ON' : prop === 'outerOpen' ? 'Door Open' : 'Cycled Finished';
    } else if (chapterId === 3) {
      return prop === 'innerOpen' ? 'Dust Storm Hatch Open' : prop === 'outerOpen' ? 'Internal Core Open' : 'Shield Engaged';
    }
    return prop === 'innerOpen' ? 'Prop A (Inner)' : prop === 'outerOpen' ? 'Prop B (Outer)' : 'Prop C (Pressurized)';
  };

  return (
    <div id="kripke-layout-editor" className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
      {/* Node Graphic Canvas */}
      <div className="lg:col-span-2 flex flex-col bg-slate-950/70 rounded-xl overflow-hidden relative border border-slate-800/60 shadow-inner h-[460px]">
        {/* Help & Sandbox Status */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
          <span className="px-2.5 py-1 text-xs uppercase font-mono font-bold tracking-wider rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm backdrop-blur-md">
            Interactive State Engine
          </span>
          {allowEditing && (
            <span id="label-draft" className="text-[10px] uppercase font-mono font-semibold tracking-wide text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/50 backdrop-blur-md">
              Draft mode
            </span>
          )}
        </div>

        {/* Canvas Area */}
        <svg
          ref={svgRef}
          className="w-full h-full select-none cursor-default"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          {/* SVG Definitions for prettier curved arrow markers */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#38bdf8" />
            </marker>
            <marker
              id="arrowhead-highlight"
              markerWidth="8"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#f43f5e" />
            </marker>
          </defs>

          {/* Graticule Grid background */}
          <g className="opacity-20">
            <line x1="0" y1="230" x2="100%" y2="230" stroke="#334155" strokeDasharray="5,5" />
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#334155" strokeDasharray="5,5" />
          </g>

          {/* Draw Transitions (Wires) */}
          {transitions.map((t) => {
            const line = getLineData(t);
            if (!line) return null;

            const isTracePath = highlightedPath.includes(t.from) && highlightedPath.includes(t.to) &&
              highlightedPath.indexOf(t.to) === highlightedPath.indexOf(t.from) + 1;
            
            const isSelfTrace = highlightedPath.includes(t.from) && t.from === t.to;

            return (
              <g key={t.id} className="transition-all duration-300">
                <path
                  d={line.path}
                  fill="none"
                  stroke={isTracePath || isSelfTrace ? '#f43f5e' : '#334155'}
                  strokeWidth={isTracePath || isSelfTrace ? '3.5' : '1.8'}
                  markerEnd={isTracePath || isSelfTrace ? 'url(#arrowhead-highlight)' : 'url(#arrowhead)'}
                  className="transition-colors duration-200"
                />
                
                {/* Visual Signal pulse traveling if this is active path */}
                {(isTracePath || isSelfTrace) && (
                  <circle r="4" fill="#fb7185">
                    <animateMotion dur="2.5s" repeatCount="indefinite" path={line.path} />
                  </circle>
                )}

                {/* Transition Action Trigger Label */}
                <g transform={`translate(${line.labelX}, ${line.labelY})`}>
                  <rect
                    px="2"
                    py="1"
                    x={-42}
                    y={-10}
                    width={84}
                    height={18}
                    rx="4"
                    fill="#0f172a"
                    stroke={isTracePath || isSelfTrace ? '#e11d48' : '#1e293b'}
                    strokeWidth="1"
                    className="opacity-90"
                  />
                  <text
                    fontSize="9 font-mono font-bold"
                    fill={isTracePath || isSelfTrace ? '#fda4af' : '#94a3b8'}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    className="font-mono"
                  >
                    {t.action.length > 13 ? `${t.action.slice(0, 11)}..` : t.action}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw States (Bubbles) */}
          {states.map((s) => {
            const isActiveSim = activeStateId === s.id;
            const isTraceChecked = highlightedPath.includes(s.id);
            const isViolatedNode = violationStateId === s.id;
            const isSelectedNode = selectedNodeId === s.id;

            // Determine border color and ring scale
            let strokeColor = '#475569';
            if (isSelectedNode) strokeColor = '#6366f1';
            if (isTraceChecked) strokeColor = '#fb7185';
            if (isActiveSim) strokeColor = '#38bdf8';
            if (isViolatedNode) strokeColor = '#ef4444';

            return (
              <g
                key={s.id}
                transform={`translate(${s.x}, ${s.y})`}
                className="cursor-pointer"
                onMouseDown={(e) => handleMouseDown(e, s.id)}
                onTouchStart={(e) => handleTouchStart(e, s.id)}
                onClick={() => {
                  setSelectedNodeId(s.id);
                  // Allow manual walking/simulation click if connected to active state
                  const isConnectedFromActive = transitions.some(t => t.from === activeStateId && t.to === s.id);
                  if (isConnectedFromActive || s.isInitial) {
                    onActiveStateChange(s.id);
                  }
                }}
              >
                {/* Active model checking visual ping effect */}
                {isActiveSim && (
                  <circle
                    r="48"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    className="animate-ping opacity-25"
                  />
                )}

                {/* Main bubble body */}
                <circle
                  r="38"
                  fill={isViolatedNode ? '#7f1d1d' : isActiveSim ? '#0c4a6e' : isSelectedNode ? '#1e1b4b' : '#030712'}
                  stroke={strokeColor}
                  strokeWidth={isActiveSim || isSelectedNode ? '3.5' : '2'}
                  className="transition-colors duration-200"
                />

                {/* If Initial State Indicator */}
                {s.isInitial && (
                  <circle
                    cx="-25"
                    cy="-25"
                    r="6"
                    fill="#10b981"
                    stroke="#022c22"
                    strokeWidth="1.5"
                  />
                )}

                {/* Inner State Proposition Toggles preview indicators (small colored pills) */}
                <g transform="translate(0, 16)">
                  {s.innerOpen && <circle cx="-12" cy="0" r="4.5" fill="#f43f5e" title={getMetaphorLabel('innerOpen')} />}
                  {s.outerOpen && <circle cx="0" cy="0" r="4.5" fill="#eab308" title={getMetaphorLabel('outerOpen')} />}
                  {s.pressurized && <circle cx="12" cy="0" r="4.5" fill="#10b981" title={getMetaphorLabel('pressurized')} />}
                </g>

                {/* State Human Name */}
                <text
                  fontSize="11"
                  fill={isActiveSim ? '#f0f9ff' : isViolatedNode ? '#fee2e2' : '#e2e8f0'}
                  textAnchor="middle"
                  fontWeight="bold"
                  y="-4"
                  className="font-sans"
                >
                  {s.label.length > 11 ? `${s.label.slice(0, 9)}..` : s.label}
                </text>

                {/* Small indicator explaining variables */}
                <text
                  fontSize="8"
                  fill="#64748b"
                  textAnchor="middle"
                  y="6"
                  className="font-mono uppercase tracking-wide leading-none"
                >
                  {s.id}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Live play directions on footer */}
        <div className="absolute bottom-3 left-4 right-4 flex justify-between items-center bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800/80 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-[10px] font-mono text-slate-300">
              Active Simulation state: <strong className="text-cyan-300 font-bold">{states.find(s => s.id === activeStateId)?.label || 'None'}</strong>
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            💡 Click on neighboring connected nodes to cycle/test manually
          </span>
        </div>
      </div>

      {/* Editor & Parameters Inspector panel */}
      <div className="flex flex-col gap-5 bg-slate-950/45 rounded-xl border border-slate-800/80 p-5 overflow-y-auto max-h-[460px]">
        {selectedNode ? (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-mono text-indigo-400 font-semibold uppercase tracking-wider">Node Inspector</span>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 leading-none mt-1">
                  {selectedNode.label}
                </h3>
              </div>
              
              {allowEditing && !selectedNode.isInitial && (
                <button
                  onClick={() => deleteState(selectedNode.id)}
                  className="p-1.5 rounded-md hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 text-rose-400 transition"
                  title="Delete State"
                >
                  <Trash size={14} />
                </button>
              )}
            </div>

            {/* Input Name */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1.5 font-bold">Node Label</label>
              <input
                type="text"
                value={selectedNode.label}
                disabled={!allowEditing}
                onChange={(e) => {
                  onStatesChange(states.map(s => s.id === selectedNode.id ? { ...s, label: e.target.value } : s));
                }}
                className="w-full text-xs font-semibold px-2.5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 focus:outline-none rounded-lg text-slate-200 transition"
              />
            </div>

            {/* Init Node Toggler */}
            {allowEditing && (
              <div className="flex items-center justify-between py-2.5 px-3 bg-slate-900/50 rounded-lg border border-slate-850">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <CircleDot size={13} className="text-green-400" />
                    Initial State
                  </span>
                  <span className="text-[9px] text-slate-500 mt-0.5 font-mono">Verification starts here</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAsInitial(selectedNode.id)}
                  className={`px-2 py-1 text-[10px] font-mono font-bold uppercase rounded border transition ${
                    selectedNode.isInitial
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-indigo-500'
                  }`}
                >
                  {selectedNode.isInitial ? 'YES' : 'SET'}
                </button>
              </div>
            )}

            {/* State Propositions Section */}
            <div className="flex flex-col gap-2.5">
              <label className="block text-[10px] font-mono text-indigo-400 uppercase font-bold">Active Properties</label>
              
              {/* Prop 1 */}
              <div className="flex items-center justify-between py-2 px-2.5 bg-slate-900/40 border border-slate-800 rounded-lg">
                <span className="text-xs font-semibold text-slate-300">{getMetaphorLabel('innerOpen')}</span>
                <button
                  onClick={() => toggleStateProp(selectedNode.id, 'innerOpen')}
                  className="text-slate-400 hover:text-slate-100 transition"
                >
                  {selectedNode.innerOpen ? (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-rose-400">
                      TRUE <ToggleRight className="text-rose-400" size={20} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-slate-500">
                      FALSE <ToggleLeft className="text-slate-600" size={20} />
                    </span>
                  )}
                </button>
              </div>

              {/* Prop 2 */}
              <div className="flex items-center justify-between py-2 px-2.5 bg-slate-900/40 border border-slate-800 rounded-lg">
                <span className="text-xs font-semibold text-slate-300">{getMetaphorLabel('outerOpen')}</span>
                <button
                  onClick={() => toggleStateProp(selectedNode.id, 'outerOpen')}
                  className="text-slate-400 hover:text-slate-100 transition"
                >
                  {selectedNode.outerOpen ? (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-yellow-400">
                      TRUE <ToggleRight className="text-yellow-400" size={20} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-slate-500">
                      FALSE <ToggleLeft className="text-slate-600" size={20} />
                    </span>
                  )}
                </button>
              </div>

              {/* Prop 3 */}
              <div className="flex items-center justify-between py-2 px-2.5 bg-slate-900/40 border border-slate-800 rounded-lg">
                <span className="text-xs font-semibold text-slate-300">{getMetaphorLabel('pressurized')}</span>
                <button
                  onClick={() => toggleStateProp(selectedNode.id, 'pressurized')}
                  className="text-slate-400 hover:text-slate-100 transition"
                >
                  {selectedNode.pressurized ? (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-emerald-400">
                      TRUE <ToggleRight className="text-emerald-400" size={20} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-slate-500">
                      FALSE <ToggleLeft className="text-slate-600" size={20} />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Sandbox creation of transitions */}
            {allowEditing && (
              <div className="border-t border-slate-800/80 pt-3.5 mt-1.5 flex flex-col gap-3">
                <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold">Add Transition Arc</span>
                <form onSubmit={addTransition} className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[8px] uppercase font-mono text-slate-500 block mb-1">From</label>
                      <select
                        value={newTransFrom}
                        onChange={(e) => setNewTransFrom(e.target.value)}
                        className="w-full text-xs font-semibold px-2 py-1.5 bg-slate-900 border border-slate-800 text-slate-200 rounded focus:outline-none"
                      >
                        <option value="">Select...</option>
                        {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[8px] uppercase font-mono text-slate-500 block mb-1">To State</label>
                      <select
                        value={newTransTo}
                        onChange={(e) => setNewTransTo(e.target.value)}
                        className="w-full text-xs font-semibold px-2 py-1.5 bg-slate-900 border border-slate-800 text-slate-200 rounded focus:outline-none"
                      >
                        <option value="">Select...</option>
                        {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] uppercase font-mono text-slate-500 block mb-0.5">Transition Label (Event/Command)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="e.g. Press cook"
                        value={newTransAction}
                        onChange={(e) => setNewTransAction(e.target.value)}
                        className="flex-1 text-xs px-2 py-1.5 bg-slate-900 border border-slate-800 text-slate-200 rounded focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={!newTransFrom || !newTransTo || !newTransAction}
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:opacity-50 text-white rounded text-xs transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col justify-center items-center text-center p-6 text-slate-500">
            <HelpCircle size={32} className="opacity-20 mb-2" />
            <span className="text-xs font-mono">Click a node to inspect and toggle properties.</span>
          </div>
        )}

        {/* Floating Add State button inside editor list */}
        {allowEditing && (
          <div className="border-t border-slate-800/80 pt-4 mt-auto">
            <button
              onClick={addNewState}
              className="w-full py-2.5 bg-slate-900 hover:bg-indigo-950 border border-slate-800 hover:border-indigo-500/50 text-indigo-400 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition duration-150"
            >
              <Plus size={15} /> Add New State Bubble
            </button>
          </div>
        )}

        {/* List of transitions */}
        <div className="flex flex-col gap-2 mt-2">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">Active Transitions Wirelist ({transitions.length})</span>
          <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto">
            {transitions.map((t) => {
              const fromName = states.find(s => s.id === t.from)?.label || t.from;
              const toName = states.find(s => s.id === t.to)?.label || t.to;
              return (
                <div key={t.id} className="flex justify-between items-center bg-slate-900/60 border border-slate-850 px-2 py-1.5 rounded text-[11px] font-mono text-slate-300">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-orange-400 font-bold block truncate max-w-[50px]">{fromName}</span>
                    <ArrowRight size={10} className="text-slate-500 shrink-0" />
                    <span className="text-cyan-400 font-bold block truncate max-w-[50px]">{toName}</span>
                    <span className="text-[10px] text-slate-400 block truncate italic shrink-0">({t.action})</span>
                  </div>
                  {allowEditing && (
                    <button
                      onClick={() => deleteTransition(t.id)}
                      className="text-rose-400 hover:text-rose-300 p-0.5"
                    >
                      <Trash size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
