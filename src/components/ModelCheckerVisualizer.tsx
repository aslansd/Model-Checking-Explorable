/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ModelCheckerStep } from '../types';
import { Play, Pause, ChevronsRight, RotateCcw, ShieldCheck, ShieldAlert, FileText, CheckCircle, Flame } from 'lucide-react';

interface ModelCheckerVisualizerProps {
  steps: ModelCheckerStep[];
  onStepChange: (index: number) => void;
  onVerify: () => void;
  isVerifying: boolean;
  onVerifyStop: () => void;
  resultSuccess: boolean | null;
  resultMessage: string;
  counterexampleTrace?: string[];
  lassoIndex?: number;
  onTraceStepClick: (stateId: string) => void;
  stateLabels: Record<string, string>;
}

export default function ModelCheckerVisualizer({
  steps,
  onStepChange,
  onVerify,
  isVerifying,
  onVerifyStop,
  resultSuccess,
  resultMessage,
  counterexampleTrace,
  lassoIndex,
  onTraceStepClick,
  stateLabels
}: ModelCheckerVisualizerProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(800); // ms per step
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Sync step position upstream so parent can highlight the correct nodes
  useEffect(() => {
    onStepChange(currentStepIdx);
  }, [currentStepIdx, onStepChange]);

  // Handle Playback Loop
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && isVerifying && steps.length > 0) {
      timer = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            onVerifyStop(); // Finish visual run
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, isVerifying, steps, playbackSpeed, onVerifyStop]);

  // Restart playback when new evaluation starts
  useEffect(() => {
    if (isVerifying && steps.length > 0) {
      setCurrentStepIdx(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isVerifying, steps]);

  const handlePauseToggle = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStepForward = () => {
    if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
    } else {
      onVerifyStop();
    }
  };

  const handleStepBackward = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(currentStepIdx - 1);
    }
  };

  const handleReset = () => {
    setCurrentStepIdx(-1);
    setIsPlaying(false);
    onVerifyStop();
  };

  const activeStep = currentStepIdx >= 0 && currentStepIdx < steps.length ? steps[currentStepIdx] : null;

  return (
    <div id="model-checker-visualizer-card" className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl gap-5">
      <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Flame size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Verification Engine</h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">Exhaustive Reachability State-Space Solver</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isVerifying && steps.length === 0 ? (
            <button
              onClick={onVerify}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-indigo-600/15 flex items-center gap-1.5 transition duration-150 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Play size={13} fill="currentColor" /> Run Model Checker
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={handlePauseToggle}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-300"
                title={isPlaying ? "Pause Visualizer" : "Resume Visualizer"}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button
                onClick={handleStepBackward}
                disabled={currentStepIdx <= 0}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-30"
                title="Prev Step"
              >
                <ChevronsRight size={13} className="rotate-180" />
              </button>
              <button
                onClick={handleStepForward}
                disabled={currentStepIdx >= steps.length - 1}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-30"
                title="Next Step"
              >
                <ChevronsRight size={13} />
              </button>
              <button
                onClick={handleReset}
                className="p-1.5 hover:bg-slate-800 rounded text-rose-400"
                title="Reset Run"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Model Checker Progress Bar */}
      {isVerifying && steps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>Analyzing Path Space: {currentStepIdx + 1} / {steps.length} cycles</span>
            <span className="text-cyan-400">{Math.round(((currentStepIdx + 1) / steps.length) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
            <div
              className="bg-indigo-500 h-full transition-all duration-300 rounded"
              style={{ width: `${((currentStepIdx + 1) / steps.length) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Visual Live Code/Log Screen */}
      <div className="flex flex-col bg-slate-950 rounded-xl border border-slate-850 overflow-hidden relative shadow-inner">
        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-850">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Model_Checker_Output (~/core)</span>
        </div>

        <div className="p-4 font-mono text-xs leading-relaxed max-h-[160px] overflow-y-auto h-[160px] flex flex-col gap-2">
          {steps.length === 0 ? (
            <div className="text-slate-600 flex flex-col items-center justify-center p-6 h-full text-center">
              <FileText size={24} className="opacity-15 mb-2" />
              <span>LOG: Verification idle. Click "Run Model Checker" to search state combinations.</span>
            </div>
          ) : (
            steps.slice(0, (currentStepIdx >= 0 ? currentStepIdx + 1 : 0)).map((step, i) => {
              let logStyle = 'text-sky-400';
              let prefix = '⚙️ [QUEUED]';
              if (step.type === 'check_state') {
                logStyle = 'text-yellow-400';
                prefix = '🔍 [CHECKING]';
              } else if (step.type === 'violation') {
                logStyle = 'text-rose-500 font-bold';
                prefix = '🚨 [BUG FOUND]';
              } else if (step.type === 'success') {
                logStyle = 'text-green-400 font-bold';
                prefix = '🎉 [SUCCESS]';
              } else if (step.type === 'visit') {
                logStyle = 'text-slate-300';
                prefix = '👣 [DISCOVER]';
              }

              return (
                <div key={i} className={`flex gap-2 leading-none whitespace-pre-wrap ${logStyle}`}>
                  <span className="opacity-60">{prefix}</span>
                  <span>{step.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Verification Finished Verdict Indicator */}
      {resultSuccess !== null && !isVerifying && (
        <div
          className={`flex flex-col gap-3 p-4.5 rounded-xl border transition-all duration-300 ${
            resultSuccess
              ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
          }`}
        >
          <div className="flex items-start gap-3">
            {resultSuccess ? (
              <ShieldCheck className="text-emerald-400 shrink-0 mt-0.5" size={20} />
            ) : (
              <ShieldCheck className="text-rose-400 shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider">
                {resultSuccess ? 'System Verified Safe' : 'Property Violation Detected!'}
              </h4>
              <p className="text-xs text-slate-300 mt-1 pb-1">
                {resultMessage}
              </p>
            </div>
          </div>

          {/* Counterexample Trace Navigation Timeline */}
          {counterexampleTrace && counterexampleTrace.length > 0 && (
            <div className="border-t border-slate-800/80 pt-3 flex flex-col gap-2 bg-slate-950/30 p-2.5 rounded-lg border border-slate-850">
              <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider font-bold block">
                🐞 Playback Counterexample Trail:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {counterexampleTrace.map((stateId, idx) => {
                  const stateLabel = stateLabels[stateId] || stateId;
                  const isLassoRepeat = lassoIndex !== undefined && idx >= lassoIndex;

                  return (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="text-slate-600 text-xs font-mono">→</span>}
                      <button
                        onClick={() => onTraceStepClick(stateId)}
                        className={`px-2 py-1 text-[10px] font-mono rounded border transition hover:-translate-y-0.5 active:translate-y-0 transform duration-100 ${
                          isLassoRepeat
                            ? 'bg-amber-950/50 text-amber-400 border-amber-500/30'
                            : 'bg-rose-950/50 text-rose-400 border-rose-500/30'
                        }`}
                        title="Click to view this state on the simulation canvas"
                      >
                        {stateLabel} {isLassoRepeat && '🔄'}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
              <span className="text-[9px] text-slate-400 font-mono italic mt-1 font-semibold">
                👆 Click any segment link above to snap the live simulation preview directly to that step index.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
