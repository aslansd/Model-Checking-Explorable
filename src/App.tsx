/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CHAPTERS } from './data/chapters';
import { KripkeState, KripkeTransition, ModelCheckerStep, TemporalProperty } from './types';
import { verifyModel, VerificationResult } from './utils/modelChecker';
import KripkeEditor from './components/KripkeEditor';
import ModelCheckerVisualizer from './components/ModelCheckerVisualizer';
import Markdown from './components/Markdown';
import {
  CheckCircle,
  HelpCircle,
  Zap,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Trophy,
  ExternalLink,
  MessageSquare,
  Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/** Chapter data is a module-level constant, so always hand React its own copy. */
const cloneStates = (states: KripkeState[]) => states.map(s => ({ ...s }));
const cloneTransitions = (ts: KripkeTransition[]) => ts.map(t => ({ ...t }));

export default function App() {
  const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(0);
  const activeChapter = CHAPTERS[currentChapterIdx];

  const [states, setStates] = useState<KripkeState[]>(() => cloneStates(CHAPTERS[0].initialStates));
  const [transitions, setTransitions] = useState<KripkeTransition[]>(() =>
    cloneTransitions(CHAPTERS[0].initialTransitions)
  );
  const [activeStateId, setActiveStateId] = useState<string | null>(null);

  // Which property are we checking? Only the sandbox offers a choice.
  const [propertyId, setPropertyId] = useState<string>(CHAPTERS[0].targetProperty.id);
  const activeProperty: TemporalProperty = useMemo(() => {
    const options = activeChapter.propertyOptions;
    return options?.find(p => p.id === propertyId) ?? activeChapter.targetProperty;
  }, [activeChapter, propertyId]);

  // Fairness assumption for liveness checks.
  const [assumeFairness, setAssumeFairness] = useState<boolean>(true);

  // Model checking playback state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifierSteps, setVerifierSteps] = useState<ModelCheckerStep[]>([]);
  const [checkResult, setCheckResult] = useState<VerificationResult | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [violationNodeId, setViolationNodeId] = useState<string | null>(null);
  const [sanityFailures, setSanityFailures] = useState<string[]>([]);

  // AI explanation state
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);

  // Solved tracking
  const [solvedChapters, setSolvedChapters] = useState<Record<number, boolean>>({});
  const [showCelebration, setShowCelebration] = useState<boolean>(false);
  const solvedRef = useRef(solvedChapters);
  solvedRef.current = solvedChapters;

  const resetRun = useCallback(() => {
    setIsVerifying(false);
    setVerifierSteps([]);
    setCheckResult(null);
    setHighlightedPath([]);
    setViolationNodeId(null);
    setSanityFailures([]);
  }, []);

  // Load a chapter
  useEffect(() => {
    const chapter = CHAPTERS[currentChapterIdx];
    setStates(cloneStates(chapter.initialStates));
    setTransitions(cloneTransitions(chapter.initialTransitions));
    setPropertyId(chapter.targetProperty.id);
    setAssumeFairness(true);

    const initNode = chapter.initialStates.find(s => s.isInitial);
    setActiveStateId(initNode?.id ?? chapter.initialStates[0]?.id ?? null);

    resetRun();
    setAiExplanation('');
  }, [currentChapterIdx, resetRun]);

  // Editing the model invalidates the previous verdict.
  const handleStatesChange = useCallback((next: KripkeState[]) => {
    setStates(next);
    setCheckResult(prev => (prev === null ? prev : null));
    setSanityFailures(prev => (prev.length === 0 ? prev : []));
  }, []);

  const handleTransitionsChange = useCallback((next: KripkeTransition[]) => {
    setTransitions(next);
    setCheckResult(prev => (prev === null ? prev : null));
    setSanityFailures(prev => (prev.length === 0 ? prev : []));
  }, []);

  const getAiExplanation = async () => {
    setIsLoadingAi(true);
    setAiExplanation('');
    try {
      const response = await fetch('/api/explain-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formula: activeProperty.formula,
          plainEnglish: activeProperty.plainEnglish,
          metaphor: `${activeChapter.metaphor} — ${activeChapter.subtitle}`
        })
      });
      if (!response.ok) throw new Error(`Server responded ${response.status}`);
      const data = await response.json();
      setAiExplanation(data.explanation ?? 'No explanation came back. Try again in a moment.');
    } catch {
      setAiExplanation(
        `The explainer is unreachable right now, so here is the short version.\n\n` +
          `\`${activeProperty.formula}\`\n\n${activeProperty.plainEnglish}`
      );
    } finally {
      setIsLoadingAi(false);
    }
  };

  const handleRunModelCheck = useCallback(() => {
    const result = verifyModel(states, transitions, activeProperty, { assumeFairness });
    setHighlightedPath([]);
    setViolationNodeId(null);
    setCheckResult(result);
    setVerifierSteps(result.steps);
    setSanityFailures([]);
    setIsVerifying(true);
  }, [states, transitions, activeProperty, assumeFairness]);

  const handleStepIndexChange = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= verifierSteps.length) {
        setHighlightedPath(prev => (prev.length === 0 ? prev : []));
        setViolationNodeId(prev => (prev === null ? null : null));
        return;
      }

      const currentStep = verifierSteps[idx];

      setHighlightedPath(prev => {
        if (prev.length === currentStep.path.length && prev.every((v, i) => v === currentStep.path[i])) {
          return prev;
        }
        return currentStep.path;
      });

      const targetViolationNodeId = currentStep.type === 'violation' ? currentStep.currentNodeId : null;
      setViolationNodeId(prev => (prev === targetViolationNodeId ? prev : targetViolationNodeId));

      if (currentStep.currentNodeId) {
        setActiveStateId(prev => (prev === currentStep.currentNodeId ? prev : currentStep.currentNodeId));
      }
    },
    [verifierSteps]
  );

  /** Called once, when playback reaches the end of a run. */
  const handlePlaybackComplete = useCallback(() => {
    setIsVerifying(false);
    if (!checkResult) return;

    const chapter = activeChapter;
    if (chapter.propertyOptions) return; // the sandbox has no win condition

    if (!checkResult.success) {
      setSanityFailures([]);
      return;
    }

    const reachable = new Set(checkResult.reachable);
    const failures = (chapter.sanityChecks ?? [])
      .filter(check => !check.test({ states, transitions, reachable }))
      .map(check => check.message);

    setSanityFailures(failures);

    if (failures.length === 0 && !solvedRef.current[chapter.id]) {
      setSolvedChapters(prev => ({ ...prev, [chapter.id]: true }));
      setShowCelebration(true);
    }
  }, [checkResult, activeChapter, states, transitions]);

  const stateLabels = useMemo(
    () =>
      states.reduce<Record<string, string>>((acc, s) => {
        acc[s.id] = s.label;
        return acc;
      }, {}),
    [states]
  );

  const handleResetLevel = () => {
    if (window.confirm('Reset the states and transitions back to this chapter\u2019s starting model?')) {
      setStates(cloneStates(activeChapter.initialStates));
      setTransitions(cloneTransitions(activeChapter.initialTransitions));
      const initNode = activeChapter.initialStates.find(s => s.isInitial);
      setActiveStateId(initNode?.id ?? activeChapter.initialStates[0]?.id ?? null);
      resetRun();
      setAiExplanation('');
    }
  };

  const isLivenessCheck = activeProperty.spec.kind === 'response';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500/30">
      {/* Success celebration */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-40 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="bg-slate-950 border border-indigo-500/30 rounded-3xl p-8 max-w-xl text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[6px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500" />

              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400 mb-5">
                <Trophy size={32} />
              </div>

              <span className="text-[10px] code-fancy tracking-widest text-indigo-400 font-bold uppercase block mb-1">
                Chapter cleared
              </span>
              <h2 className="text-2xl font-bold title-fancy text-white mb-2">Property verified</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-6">{activeChapter.successMessage}</p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowCelebration(false)}
                  className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 font-bold text-xs text-slate-300 rounded-xl transition duration-150"
                >
                  Stay on this chapter
                </button>
                {currentChapterIdx < CHAPTERS.length - 1 && (
                  <button
                    onClick={() => {
                      setShowCelebration(false);
                      setCurrentChapterIdx(prev => prev + 1);
                    }}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition duration-150"
                  >
                    Next chapter <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-white font-black text-sm uppercase shadow-lg">
              MC
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5 leading-none">
                <span className="title-fancy">Model Checking Explorable</span>
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] px-1.5 py-0.5 rounded uppercase code-fancy tracking-wider font-bold">
                  v2.0
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 mt-1 leading-none font-medium">
                An interactive, playable guide to formal system verification.
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Chapters">
            {CHAPTERS.map((ch, idx) => {
              const isActive = currentChapterIdx === idx;
              const isSolved = solvedChapters[ch.id];
              return (
                <button
                  key={ch.id}
                  onClick={() => setCurrentChapterIdx(idx)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 flex items-center gap-1 ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : isSolved
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {isSolved && <CheckCircle size={12} className="text-emerald-400" />}
                  <span>{ch.propertyOptions ? 'Sandbox' : `CH ${ch.id}`}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Narrative column */}
        <section className="xl:col-span-4 flex flex-col gap-6">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

            <span className="text-[9px] code-fancy font-bold tracking-widest text-indigo-400 uppercase">
              {activeChapter.subtitle}
            </span>
            <h2 className="text-xl font-bold title-fancy text-white mt-1 mb-3">{activeChapter.title}</h2>

            <div className="text-xs text-slate-300 pb-4 border-b border-slate-800">
              <Markdown>{activeChapter.narrative}</Markdown>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[10px] code-fancy uppercase text-amber-400 tracking-wider font-bold block">
                Your mission
              </span>
              <div className="text-xs text-slate-300">
                <Markdown>{activeChapter.task}</Markdown>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={handleRunModelCheck}
                disabled={isVerifying}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
              >
                <Zap size={13} fill="currentColor" /> Run the verifier
              </button>

              {activeChapter.allowEditing && (
                <button
                  onClick={handleResetLevel}
                  className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs rounded-xl transition flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Reset chapter
                </button>
              )}
            </div>
          </div>

          {/* Property panel */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3.5">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Property being checked</h4>

            {activeChapter.propertyOptions && (
              <select
                value={propertyId}
                onChange={e => {
                  setPropertyId(e.target.value);
                  resetRun();
                }}
                className="w-full text-xs font-semibold px-2.5 py-2 bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg text-slate-200"
                aria-label="Choose a property to verify"
              >
                {activeChapter.propertyOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 flex flex-col gap-1.5">
              <code className="code-fancy text-sm text-cyan-300 font-semibold break-words">
                {activeProperty.formula}
              </code>
              <p className="text-[11px] text-slate-400 leading-relaxed">{activeProperty.plainEnglish}</p>
            </div>

            {(activeChapter.showFairnessToggle || activeChapter.propertyOptions) && (
              <div
                className={`flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg border transition ${
                  isLivenessCheck
                    ? 'bg-slate-900/60 border-slate-800'
                    : 'bg-slate-900/30 border-slate-800/60 opacity-50'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Scale size={13} className="text-amber-400" /> Assume fairness
                  </span>
                  <span className="text-[9px] text-slate-500 mt-0.5 leading-snug">
                    {isLivenessCheck
                      ? 'An exit that stays available is eventually taken.'
                      : 'Only affects liveness properties.'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={assumeFairness}
                  disabled={!isLivenessCheck}
                  onClick={() => {
                    setAssumeFairness(v => !v);
                    resetRun();
                  }}
                  className={`px-2 py-1 text-[10px] code-fancy font-bold uppercase rounded border transition shrink-0 ${
                    assumeFairness
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  {assumeFairness ? 'On' : 'Off'}
                </button>
              </div>
            )}
          </div>

          {/* AI helper */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-400" /> Formula helper
                </h4>
                <p className="text-[9px] text-slate-500 mt-0.5">A plain-language walkthrough of the operators</p>
              </div>

              <button
                onClick={getAiExplanation}
                disabled={isLoadingAi}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-indigo-400 hover:text-indigo-300 border border-slate-800 rounded-lg text-[10px] font-bold transition flex items-center gap-1 shrink-0"
              >
                <MessageSquare size={11} /> Explain
              </button>
            </div>

            <div
              className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 text-xs leading-relaxed min-h-[90px] flex flex-col justify-center"
              aria-live="polite"
            >
              {isLoadingAi ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  <span className="text-[9px] text-indigo-400 code-fancy tracking-wider">Writing an explanation…</span>
                </div>
              ) : aiExplanation ? (
                <Markdown className="text-slate-300">{aiExplanation}</Markdown>
              ) : (
                <div className="text-slate-500 text-center py-4 flex flex-col items-center gap-1">
                  <HelpCircle size={18} className="opacity-40" />
                  <p className="text-[10px] code-fancy leading-tight">
                    Press Explain for a friendly reading of{' '}
                    <strong className="text-slate-400">{activeProperty.formula}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Workspace */}
        <section className="xl:col-span-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1 gap-3 flex-wrap">
              <span className="text-xs code-fancy font-bold text-slate-400">
                State machine — drag to rearrange
              </span>
              <span className="text-xs text-sky-400 code-fancy font-semibold">
                Model: {activeChapter.metaphor}
              </span>
            </div>

            <KripkeEditor
              key={activeChapter.id}
              states={states}
              transitions={transitions}
              onStatesChange={handleStatesChange}
              onTransitionsChange={handleTransitionsChange}
              activeStateId={activeStateId}
              onActiveStateChange={setActiveStateId}
              highlightedPath={highlightedPath}
              violationStateId={violationNodeId}
              allowEditing={activeChapter.allowEditing}
              chapterId={activeChapter.id}
              unreachableStateIds={checkResult?.unreachable ?? []}
            />
          </div>

          <ModelCheckerVisualizer
            steps={verifierSteps}
            onStepChange={handleStepIndexChange}
            onVerify={handleRunModelCheck}
            isVerifying={isVerifying}
            onPlaybackComplete={handlePlaybackComplete}
            onStop={() => setIsVerifying(false)}
            result={checkResult}
            sanityFailures={sanityFailures}
            onTraceStepClick={setActiveStateId}
            stateLabels={stateLabels}
          />
        </section>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-6 mt-16 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>Built in the spirit of Nicky Case&rsquo;s explorable explanations.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://ncase.me/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-400 transition flex items-center gap-1 font-semibold text-slate-400"
            >
              ncase.me <ExternalLink size={11} />
            </a>
            <span className="text-slate-800">|</span>
            <a
              href="https://en.wikipedia.org/wiki/Model_checking"
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-400 transition flex items-center gap-1 font-semibold text-slate-400"
            >
              Model checking <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
