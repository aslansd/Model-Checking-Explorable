/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ModelCheckerStep } from '../types';
import { VerificationResult } from '../utils/modelChecker';
import {
  Play,
  Pause,
  ChevronsRight,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  FileText,
  AlertTriangle,
  Terminal
} from 'lucide-react';

interface ModelCheckerVisualizerProps {
  steps: ModelCheckerStep[];
  onStepChange: (index: number) => void;
  onVerify: () => void;
  isVerifying: boolean;
  /** Fires once when playback reaches the last step. */
  onPlaybackComplete: () => void;
  /** Fires when the learner abandons a run. Must NOT count as completion. */
  onStop: () => void;
  result: VerificationResult | null;
  sanityFailures: string[];
  onTraceStepClick: (stateId: string) => void;
  stateLabels: Record<string, string>;
}

const OUTCOME_COPY: Record<string, { title: string; tone: 'ok' | 'bad' | 'warn' }> = {
  ok: { title: 'Property holds', tone: 'ok' },
  vacuous: { title: 'Vacuously true — nothing was actually checked', tone: 'warn' },
  safety_violation: { title: 'Safety violation', tone: 'bad' },
  deadlock: { title: 'Deadlock', tone: 'bad' },
  livelock: { title: 'Livelock', tone: 'bad' },
  no_initial: { title: 'Cannot start', tone: 'warn' }
};

export default function ModelCheckerVisualizer({
  steps,
  onStepChange,
  onVerify,
  isVerifying,
  onPlaybackComplete,
  onStop,
  result,
  sanityFailures,
  onTraceStepClick,
  stateLabels
}: ModelCheckerVisualizerProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(600);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onStepChange(currentStepIdx);
  }, [currentStepIdx, onStepChange]);

  // Keep the newest log line in view.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [currentStepIdx]);

  // Playback loop.
  useEffect(() => {
    if (!isPlaying || !isVerifying || steps.length === 0) return;

    const timer = setInterval(() => {
      setCurrentStepIdx(prev => {
        if (prev >= steps.length - 1) return prev;
        return prev + 1;
      });
    }, playbackSpeed);

    return () => clearInterval(timer);
  }, [isPlaying, isVerifying, steps.length, playbackSpeed]);

  // Completion is its own effect so it fires exactly once per run.
  useEffect(() => {
    if (isVerifying && steps.length > 0 && currentStepIdx >= steps.length - 1) {
      setIsPlaying(false);
      onPlaybackComplete();
    }
  }, [currentStepIdx, isVerifying, steps.length, onPlaybackComplete]);

  // A new run arrives: rewind and play. An empty run must not strand the UI.
  useEffect(() => {
    if (!isVerifying) {
      setIsPlaying(false);
      return;
    }
    if (steps.length === 0) {
      onStop();
      return;
    }
    setCurrentStepIdx(0);
    setIsPlaying(true);
  }, [isVerifying, steps, onStop]);

  const handleSkipToEnd = () => {
    setIsPlaying(false);
    setCurrentStepIdx(steps.length - 1);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIdx(-1);
    onStop();
  };

  const outcome = result ? (OUTCOME_COPY[result.outcome] ?? OUTCOME_COPY.ok) : null;
  const tone = sanityFailures.length > 0 ? 'warn' : outcome?.tone;
  const showVerdict = result !== null && !isVerifying;

  const toneClasses =
    tone === 'ok'
      ? 'bg-emerald-950/30 border-emerald-500/30'
      : tone === 'warn'
        ? 'bg-amber-950/30 border-amber-500/30'
        : 'bg-rose-950/30 border-rose-500/30';

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl gap-5">
      <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Terminal size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Verification engine</h3>
            <p className="text-[10px] text-slate-400 code-fancy mt-0.5">
              Exhaustive search over every reachable state
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {steps.length === 0 ? (
            <button
              onClick={onVerify}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition duration-150"
            >
              <Play size={13} fill="currentColor" /> Run model checker
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setIsPlaying(p => !p)}
                disabled={!isVerifying}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-300 disabled:opacity-30"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button
                onClick={() => setCurrentStepIdx(i => Math.max(0, i - 1))}
                disabled={currentStepIdx <= 0}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-30"
                title="Previous step"
              >
                <ChevronsRight size={13} className="rotate-180" />
              </button>
              <button
                onClick={() => setCurrentStepIdx(i => Math.min(steps.length - 1, i + 1))}
                disabled={currentStepIdx >= steps.length - 1}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-30"
                title="Next step"
              >
                <ChevronsRight size={13} />
              </button>
              <button
                onClick={handleSkipToEnd}
                disabled={currentStepIdx >= steps.length - 1}
                className="px-1.5 py-1 hover:bg-slate-800 rounded text-[9px] code-fancy font-bold text-slate-400 disabled:opacity-30"
                title="Skip to the verdict"
              >
                END
              </button>
              <select
                value={playbackSpeed}
                onChange={e => setPlaybackSpeed(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded text-[9px] code-fancy text-slate-400 px-1 py-1 focus:outline-none"
                aria-label="Playback speed"
              >
                <option value={1200}>0.5×</option>
                <option value={600}>1×</option>
                <option value={250}>2×</option>
              </select>
              <button
                onClick={handleReset}
                className="p-1.5 hover:bg-slate-800 rounded text-rose-400"
                title="Clear this run"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[10px] code-fancy text-slate-400">
            <span>
              Step {Math.max(currentStepIdx + 1, 0)} of {steps.length}
            </span>
            <span className="text-cyan-400">
              {Math.round(((currentStepIdx + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className="bg-indigo-500 h-full transition-all duration-300 rounded"
              style={{ width: `${Math.max(((currentStepIdx + 1) / steps.length) * 100, 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Log */}
      <div className="flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative">
        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <span className="text-[10px] code-fancy text-slate-500 uppercase tracking-widest">checker output</span>
        </div>

        <div
          ref={logRef}
          className="p-4 code-fancy text-xs leading-relaxed h-[170px] overflow-y-auto flex flex-col gap-2"
          aria-live="polite"
        >
          {steps.length === 0 ? (
            <div className="text-slate-600 flex flex-col items-center justify-center p-6 h-full text-center">
              <FileText size={24} className="opacity-20 mb-2" />
              <span>Idle. Run the model checker to search the state space.</span>
            </div>
          ) : (
            steps.slice(0, currentStepIdx >= 0 ? currentStepIdx + 1 : 0).map((step, i) => {
              const style: Record<string, [string, string]> = {
                visit: ['text-slate-300', 'reached'],
                check_state: ['text-yellow-400', 'check'],
                info: ['text-sky-400', 'info'],
                warning: ['text-amber-400', 'warn'],
                violation: ['text-rose-400 font-bold', 'FAIL'],
                success: ['text-emerald-400 font-bold', 'PASS']
              };
              const [logStyle, prefix] = style[step.type] ?? style.info;

              return (
                <div key={i} className={`flex gap-2 ${logStyle}`}>
                  <span className="opacity-50 shrink-0 w-14 text-right">{prefix}</span>
                  <span className="min-w-0">{step.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Verdict */}
      {showVerdict && result && outcome && (
        <div className={`flex flex-col gap-3 p-4 rounded-xl border transition-all duration-300 ${toneClasses}`}>
          <div className="flex items-start gap-3">
            {tone === 'ok' ? (
              <ShieldCheck className="text-emerald-400 shrink-0 mt-0.5" size={20} />
            ) : tone === 'warn' ? (
              <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
            ) : (
              <ShieldAlert className="text-rose-400 shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex flex-col">
              <h4
                className={`text-xs font-bold uppercase tracking-wider ${
                  tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {outcome.title}
              </h4>
              <p className="text-xs text-slate-300 mt-1">{result.message}</p>
              {result.hint && <p className="text-[11px] text-slate-400 mt-1.5 italic">{result.hint}</p>}
            </div>
          </div>

          {sanityFailures.length > 0 && (
            <div className="border-t border-slate-800 pt-3 flex flex-col gap-1.5">
              <span className="text-[10px] code-fancy uppercase text-amber-400 tracking-wider font-bold">
                The property holds, but the model is no longer useful
              </span>
              {sanityFailures.map((f, i) => (
                <p key={i} className="text-[11px] text-slate-300 leading-snug">
                  • {f}
                </p>
              ))}
            </div>
          )}

          {result.trace && result.trace.length > 0 && (
            <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
              <span className="text-[10px] code-fancy uppercase text-slate-400 tracking-wider font-bold block">
                Counterexample {result.lassoIndex !== undefined ? '(lasso)' : '(path)'}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {result.trace.map((stateId, idx) => {
                  const isLoop = result.lassoIndex !== undefined && idx >= result.lassoIndex;
                  return (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="text-slate-600 text-xs code-fancy">→</span>}
                      <button
                        onClick={() => onTraceStepClick(stateId)}
                        className={`px-2 py-1 text-[10px] code-fancy rounded border transition ${
                          isLoop
                            ? 'bg-amber-950/50 text-amber-400 border-amber-500/30'
                            : 'bg-rose-950/50 text-rose-400 border-rose-500/30'
                        }`}
                        title="Show this state on the canvas"
                      >
                        {stateLabels[stateId] ?? stateId}
                        {isLoop && ' ↻'}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
              <span className="text-[10px] text-slate-500 italic">
                {result.lassoIndex !== undefined
                  ? 'The amber states repeat forever. That infinite loop is the bug.'
                  : 'Click a state to jump the canvas to that point in the run.'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
