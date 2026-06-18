/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CHAPTERS } from './data/chapters';
import { KripkeState, KripkeTransition, TemporalProperty, ModelCheckerStep } from './types';
import { verifyModel, VerificationResult } from './utils/modelChecker';
import KripkeEditor from './components/KripkeEditor';
import ModelCheckerVisualizer from './components/ModelCheckerVisualizer';
import { 
  CheckCircle, 
  HelpCircle, 
  Zap, 
  ArrowRight, 
  Sparkles, 
  RefreshCw, 
  Bookmark, 
  Trophy, 
  AlertTriangle, 
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(0);
  const activeChapter = CHAPTERS[currentChapterIdx];

  const [states, setStates] = useState<KripkeState[]>([]);
  const [transitions, setTransitions] = useState<KripkeTransition[]>([]);
  const [activeStateId, setActiveStateId] = useState<string | null>(null);

  // Model Checking Playback State
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifierSteps, setVerifierSteps] = useState<ModelCheckerStep[]>([]);
  const [checkResult, setCheckResult] = useState<VerificationResult | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [violationNodeId, setViolationNodeId] = useState<string | null>(null);

  // AI explanation state
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  
  // Solved tracking
  const [solvedChapters, setSolvedChapters] = useState<Record<number, boolean>>({});
  const [showCelebration, setShowCelebration] = useState<boolean>(false);

  // Initialize chapter state data
  useEffect(() => {
    setStates(activeChapter.initialStates);
    setTransitions(activeChapter.initialTransitions);
    
    const initNode = activeChapter.initialStates.find(s => s.isInitial);
    setActiveStateId(initNode ? initNode.id : activeChapter.initialStates[0]?.id || null);

    // Reset verification states
    setIsVerifying(false);
    setVerifierSteps([]);
    setCheckResult(null);
    setHighlightedPath([]);
    setViolationNodeId(null);
    setAiExplanation('');
  }, [currentChapterIdx, activeChapter]);

  // Request Gemini to explain the property formula
  const getAiExplanation = async () => {
    setIsLoadingAi(true);
    setAiExplanation('');
    try {
      const response = await fetch('/api/explain-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formula: activeChapter.targetProperty.formula,
          metaphor: `${activeChapter.title} - ${activeChapter.subtitle}`
        })
      });
      const data = await response.json();
      setAiExplanation(data.explanation);
    } catch (e) {
      setAiExplanation("Offline support: This formula ensures safety invariants are maintained unconditionally throughout branching histories.");
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Run the Model checker
  const handleRunModelCheck = useCallback(() => {
    setIsVerifying(true);
    setHighlightedPath([]);
    setViolationNodeId(null);

    const result = verifyModel(states, transitions, activeChapter.targetProperty);
    setCheckResult(result);
    setVerifierSteps(result.steps);
  }, [states, transitions, activeChapter]);

  // Stepping handle from visualizer playback
  const handleStepIndexChange = useCallback((idx: number) => {
    if (idx < 0 || idx >= verifierSteps.length) {
      setHighlightedPath(prev => prev.length === 0 ? prev : []);
      setViolationNodeId(prev => prev === null ? null : null);
      return;
    }

    const currentStep = verifierSteps[idx];
    
    setHighlightedPath(prev => {
      if (prev.length === currentStep.path.length && prev.every((v, i) => v === currentStep.path[i])) {
        return prev;
      }
      return currentStep.path;
    });
    
    // If it's a violation step, highlight the failed node red!
    const targetViolationNodeId = currentStep.type === 'violation' ? currentStep.currentNodeId : null;
    setViolationNodeId(prev => prev === targetViolationNodeId ? prev : targetViolationNodeId);
    
    // Guide active simulation to match visual analyzer focus
    if (currentStep.currentNodeId) {
      setActiveStateId(prev => prev === currentStep.currentNodeId ? prev : currentStep.currentNodeId);
    }
  }, [verifierSteps]);

  // When verification stops / playback concludes
  const handleVerifyFinish = useCallback(() => {
    setIsVerifying(false);
    
    if (checkResult) {
      const success = checkResult.success;
      
      // Let level's custom success condition decide
      const levelResult = activeChapter.successCondition(states, transitions, {
        success,
        trace: checkResult.trace
      });

      if (levelResult) {
        setSolvedChapters(prev => ({ ...prev, [activeChapter.id]: true }));
        setShowCelebration(true);
      }
    }
  }, [checkResult, activeChapter, states, transitions]);

  // Memoize state labels to avoid unnecessary object allocations on each render
  const stateLabels = useMemo(() => {
    return states.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.label;
      return acc;
    }, {});
  }, [states]);

  // Quick reset to level defaults
  const handleResetLevel = () => {
    if (window.confirm("Do you want to reset states and transitions back to level defaults?")) {
      setStates(activeChapter.initialStates);
      setTransitions(activeChapter.initialTransitions);
      const initNode = activeChapter.initialStates.find(s => s.isInitial);
      setActiveStateId(initNode ? initNode.id : activeChapter.initialStates[0]?.id || null);
      setCheckResult(null);
      setVerifierSteps([]);
      setHighlightedPath([]);
      setViolationNodeId(null);
      setAiExplanation('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500/30">
      {/* Dynamic Fonts Import in CSS style */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600;750&display=swap');
        
        .title-fancy {
          font-family: 'Space Grotesk', sans-serif;
        }
        .code-fancy {
          font-family: 'JetBrains Mono', monospace;
        }
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>

      {/* Floating Success Celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-40 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="bg-slate-950 border border-indigo-500/30 rounded-3xl p-8 max-w-xl text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[6px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500"></div>
              
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400 mb-5 animate-bounce">
                <Trophy size={32} />
              </div>

              <span className="text-[10px] code-fancy tracking-widest text-indigo-400 font-bold uppercase block mb-1">Chapter Cleared</span>
              <h2 className="text-2xl font-bold title-fancy text-white mb-2">Verification Success!</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-6">
                {activeChapter.successMessage}
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowCelebration(false)}
                  className="px-4.5 py-2.5 bg-slate-905 border border-slate-800 hover:border-slate-700 font-bold text-xs text-slate-300 rounded-xl transition duration-150"
                >
                  Stay on Level
                </button>
                {currentChapterIdx < CHAPTERS.length - 1 && (
                  <button
                    onClick={() => {
                      setShowCelebration(false);
                      setCurrentChapterIdx(prev => prev + 1);
                    }}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-505 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition duration-150 transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Next Chapter <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Navigation bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-white font-black text-sm uppercase shadow-lg shadow-indigo-605/10">
              MC
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5 leading-none">
                <span className="title-fancy">Model Checking Explorable</span>
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] px-1.5 py-0.5 rounded uppercase code-fancy tracking-wider font-bold">
                  v1.2.0
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 mt-1 leading-none font-medium">An interactive, playable guide to formal system verification.</p>
            </div>
          </div>

          {/* Chapter selector pills */}
          <nav className="flex flex-wrap items-center gap-1.5">
            {CHAPTERS.map((ch, idx) => {
              const isActive = currentChapterIdx === idx;
              const isSolved = solvedChapters[ch.id];
              return (
                <button
                  key={ch.id}
                  onClick={() => setCurrentChapterIdx(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-sans border transition-all duration-150 flex items-center gap-1 ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/15'
                      : isSolved
                      ? 'bg-emerald-950/15 text-emerald-400 border-emerald-500/15 hover:border-emerald-500/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800/80 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  {isSolved && <CheckCircle size={12} className="text-emerald-400" />}
                  <span>{ch.id === 4 ? "Sandbox Mode" : `CH ${ch.id}`}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Left narrative & tutorials column (Nicky Case description panel) */}
        <section className="xl:col-span-4 flex flex-col gap-6 bg-slate-950 xl:sticky xl:top-24">
          
          {/* Main Comic story bubble */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6.5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

            <span className="text-[9px] code-fancy font-bold tracking-widest text-indigo-400 uppercase">
              Chapter Objective
            </span>
            <h2 className="text-xl font-bold title-fancy text-white mt-1 mb-3">
              {activeChapter.title}
            </h2>

            {/* Split description paragraphs */}
            <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans flex flex-col gap-3.5 pb-4 border-b border-slate-850">
              {activeChapter.narrative}
            </div>

            {/* Practical instructions panel */}
            <div className="mt-4 flex flex-col gap-2.5">
              <span className="text-[10px] code-fancy uppercase text-amber-400 tracking-wider font-bold block">
                🛠️ YOUR MISSION:
              </span>
              <p className="text-xs text-slate-300 leading-relaxed font-semibold italic">
                {activeChapter.task}
              </p>
            </div>

            {/* Play reset buttons */}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={handleRunModelCheck}
                disabled={isVerifying}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
              >
                <Zap size={13} fill="currentColor" /> Run Auto Verifier
              </button>
              
              {activeChapter.allowEditing && (
                <button
                  onClick={handleResetLevel}
                  className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs rounded-xl transition flex items-center gap-1"
                  title="Restore default state tree"
                >
                  <RefreshCw size={12} /> Reset Chapter
                </button>
              )}
            </div>
          </div>

          {/* AI Helper Desk card */}
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5.5 flex flex-col gap-3.5">
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-400" /> AI Formula Helper
                </h4>
                <p className="text-[9px] text-slate-500 mt-0.5">Learn Temporal Logic effortlessly with Gemini</p>
              </div>

              <button
                onClick={getAiExplanation}
                disabled={isLoadingAi}
                className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 disabled:bg-slate-850 text-indigo-400 hover:text-indigo-300 border border-slate-800 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
              >
                <MessageSquare size={11} /> Explain Logic
              </button>
            </div>

            {/* AI response box */}
            <div className="bg-slate-950/80 rounded-xl border border-slate-850 p-3 text-xs leading-relaxed min-h-[90px] flex flex-col justify-center">
              {isLoadingAi ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                  <span className="text-[9px] text-indigo-400 code-fancy tracking-wider">AI is translating math to comics...</span>
                </div>
              ) : aiExplanation ? (
                <div className="text-slate-300 whitespace-pre-wrap pr-1 font-sans">
                  {/* Since react-markdown could be used, we render in clean paragraph sections */}
                  <div className="markdown-body">
                    {aiExplanation}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 text-center py-4 flex flex-col items-center gap-1">
                  <HelpCircle size={18} className="opacity-40" />
                  <p className="text-[10px] font-mono leading-tight">Click 'Explain Logic' to get a friendly translation of the temporal formula <strong>{activeChapter.targetProperty.formula}</strong></p>
                </div>
              )}
            </div>
          </div>

        </section>

        {/* Right workspace: Kripke Editor Canvas & Model Checking debug monitor */}
        <section className="xl:col-span-8 flex flex-col gap-6">

          {/* Canvas state editor */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs code-fancy font-bold text-slate-400">Simulation Canvas (Drag states to layout)</span>
              <span className="text-xs text-sky-400 font-mono font-semibold">Active Metaphor: {activeChapter.id === 1 ? 'Spaceship Airlock' : activeChapter.id === 2 ? 'Microwave Oven' : 'Rover Cargo Box'}</span>
            </div>
            
            <KripkeEditor
              states={states}
              transitions={transitions}
              onStatesChange={setStates}
              onTransitionsChange={setTransitions}
              activeStateId={activeStateId}
              onActiveStateChange={setActiveStateId}
              highlightedPath={highlightedPath}
              violationStateId={violationNodeId}
              allowEditing={activeChapter.allowEditing}
              chapterId={activeChapter.id}
            />
          </div>

          {/* Model Checking Visual terminal */}
          <ModelCheckerVisualizer
            steps={verifierSteps}
            onStepChange={handleStepIndexChange}
            onVerify={handleRunModelCheck}
            isVerifying={isVerifying}
            onVerifyStop={handleVerifyFinish}
            resultSuccess={checkResult ? checkResult.success : null}
            resultMessage={checkResult ? checkResult.message : ''}
            counterexampleTrace={checkResult?.trace}
            lassoIndex={checkResult?.lassoIndex}
            onTraceStepClick={setActiveStateId}
            stateLabels={stateLabels}
          />

        </section>

      </main>

      {/* Footer credits and external references */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-6 mt-16 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-sans">
            Created in memory of Case's interactive game architectures. Perfect design over excessive options.
          </p>
          <div className="flex items-center gap-4">
            <a 
              href="https://ncase.me/" target="_blank" rel="noreferrer" 
              className="hover:text-indigo-400 transition flex items-center gap-1 font-semibold text-slate-400"
            >
              Nicky's Workspace <ExternalLink size={11} />
            </a>
            <span className="text-slate-800">|</span>
            <a 
              href="https://en.wikipedia.org/wiki/Model_checking" target="_blank" rel="noreferrer" 
              className="hover:text-indigo-400 transition flex items-center gap-1 font-semibold text-slate-400"
            >
              Learn Verification <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
