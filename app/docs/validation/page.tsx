'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ValidationSummary {
  meta: {
    runDate: string;
    totalModules: number;
    duration: string;
  };
  modules: Array<{
    name: string;
    script: string;
    status: 'PASS' | 'FAIL' | 'ERROR';
    duration: number;
  }>;
  overallStatus: 'PASS' | 'FAIL';
}

export default function ValidationDocsPage() {
  const [summary, setSummary] = useState<ValidationSummary | null>(null);

  useEffect(() => {
    // In a real app, this would fetch from an API
    // For now, we'll show static content
  }, []);

  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-teal-500/30">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <Link
            href="/methodology"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8"
          >
            <span className="mr-2">←</span>
            Back to Methodology
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Validation & Diagnostics
            </h1>
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-sm font-semibold">
              In Progress
            </span>
          </div>
          <p className="text-lg text-slate-400 max-w-2xl">
            This section provides empirical evidence that the system behaves according to the
            specifications established in the Methodology. Validation focuses on reliability
            and correctness, not on predictive performance or outcome optimization.
          </p>
        </motion.header>

        {/* ============ Relationship to Methodology ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mb-12"
        >
          <div className="bg-slate-900/30 rounded-xl p-6 border border-slate-700/50">
            <p className="text-slate-400 text-sm leading-relaxed">
              <span className="text-slate-300 font-medium">Relationship to Methodology:</span> The{' '}
              <Link href="/methodology" className="text-teal-400 hover:text-teal-300 underline">
                Methodology & Scope
              </Link>{' '}
              section defines <span className="text-white">what the system is designed to do</span> and
              the assumptions under which it operates. This Validation section provides empirical evidence
              that the system <span className="text-white">behaves according to those specifications</span>.
              Methodology establishes the contract; Validation verifies adherence to that contract.
            </p>
          </div>
        </motion.section>

        {/* ============ SECTION 2: Data Integrity ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded">02</span>
            <h2 className="text-2xl font-bold text-white">Data Integrity Verification</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Property Validated</h3>
              <p className="text-slate-300 leading-relaxed">
                Input data is complete, correctly formatted, and free from corruption. Missing values
                are identified and handled according to documented imputation rules.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Why It Matters</h3>
              <p className="text-slate-300 leading-relaxed">
                All downstream computations depend on data integrity. Corrupted or missing data can
                propagate errors through the entire system. Data QA ensures that the foundation
                upon which all analysis rests is sound.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Verification Method</h3>
              <ul className="text-slate-400 text-sm space-y-2">
                <li>• Null/undefined field counts across all data sources</li>
                <li>• Schema validation against expected field types</li>
                <li>• Coverage disclosure (champions, players, games)</li>
                <li>• Imputation verification for handled missing values</li>
              </ul>
            </div>

            <div className="p-4 bg-cyan-950/20 rounded-lg border border-cyan-500/20">
              <p className="text-cyan-200 text-sm">
                <span className="font-medium">Module:</span> Data QA — Validates input data integrity
                before any model computations occur.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 3: Model Calibration ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-purple-500 bg-purple-500/10 px-2 py-1 rounded">03</span>
            <h2 className="text-2xl font-bold text-white">Model Calibration Assessment</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Property Validated</h3>
              <p className="text-slate-300 leading-relaxed">
                Probability outputs are well-calibrated: when the model assigns 70% probability to
                an outcome, that outcome should occur approximately 70% of the time in held-out data.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Why It Matters</h3>
              <p className="text-slate-300 leading-relaxed">
                Calibration ensures that probability outputs can be interpreted at face value.
                Poorly calibrated models produce probabilities that do not correspond to actual
                frequencies, undermining their utility for decision support.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Verification Method</h3>
              <ul className="text-slate-400 text-sm space-y-2">
                <li>• Temporal split: train on earlier patches, test on later patches</li>
                <li>• Expected Calibration Error (ECE) computation</li>
                <li>• Log loss and Brier score on held-out data</li>
                <li>• Prior strength sensitivity analysis</li>
              </ul>
            </div>

            <div className="p-4 bg-purple-950/20 rounded-lg border border-purple-500/20">
              <p className="text-purple-200 text-sm">
                <span className="font-medium">Module:</span> M1 (Role Posterior) — Validates Bayesian
                role probability calibration using temporal holdout evaluation.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 4: Temporal Stability ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded">04</span>
            <h2 className="text-2xl font-bold text-white">Temporal Stability Analysis</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Property Validated</h3>
              <p className="text-slate-300 leading-relaxed">
                System outputs remain stable over time. Patterns identified in earlier data persist
                in later data at acceptable rates, indicating that the system captures durable
                signals rather than transient noise.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Why It Matters</h3>
              <p className="text-slate-300 leading-relaxed">
                Temporal stability distinguishes signal from noise. If player pools or context
                adjustments change dramatically between time periods, the system may be fitting
                to noise rather than capturing meaningful patterns.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Verification Method</h3>
              <ul className="text-slate-400 text-sm space-y-2">
                <li>• Recall@K: fraction of top-K items in test period that appeared in train period</li>
                <li>• Bootstrap stability: variance of outputs under resampling</li>
                <li>• Context filter stability across patch boundaries</li>
              </ul>
            </div>

            <div className="p-4 bg-amber-950/20 rounded-lg border border-amber-500/20">
              <p className="text-amber-200 text-sm">
                <span className="font-medium">Modules:</span> M2 (Context Filter), M4 (Player Pool) —
                Validate that context adjustments and player pools remain stable over time.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 5: Conservatism Enforcement ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">05</span>
            <h2 className="text-2xl font-bold text-white">Conservatism Enforcement</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Property Validated</h3>
              <p className="text-slate-300 leading-relaxed">
                The system applies appropriate conservatism: small samples do not produce strong
                signals, low-sample players cannot generate STRONG evidence, and fallback to
                baseline occurs when data is insufficient.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Why It Matters</h3>
              <p className="text-slate-300 leading-relaxed">
                Conservatism prevents over-assertion from limited data. Without proper gating,
                the system could surface misleading signals based on statistical noise, undermining
                trust and decision quality.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Verification Method</h3>
              <ul className="text-slate-400 text-sm space-y-2">
                <li>• Low-sample gating: verify players with &lt;10 games produce no STRONG evidence</li>
                <li>• Fallback correctness: verify small-sample contexts return global baseline</li>
                <li>• Monotonicity: verify higher raw lift produces higher scores (not inverted)</li>
                <li>• Conservatism gap: measure obs vs obsLower difference by sample size</li>
              </ul>
            </div>

            <div className="p-4 bg-emerald-950/20 rounded-lg border border-emerald-500/20">
              <p className="text-emerald-200 text-sm">
                <span className="font-medium">Modules:</span> M2 (Context Filter), M3 (Threat Signals), M4 (Player Pool) —
                Validate fallback behavior, monotonicity, and low-sample gating.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 6: Action Safety ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-rose-500 bg-rose-500/10 px-2 py-1 rounded">06</span>
            <h2 className="text-2xl font-bold text-white">Action Safety Verification</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Property Validated</h3>
              <p className="text-slate-300 leading-relaxed">
                The draft state machine operates correctly: phase transitions follow valid sequences,
                actions are only permitted in appropriate phases, and evidence attribution is
                deterministic (same inputs always produce same outputs).
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Why It Matters</h3>
              <p className="text-slate-300 leading-relaxed">
                Action safety ensures the system cannot enter invalid states or produce inconsistent
                outputs. Determinism is essential for debugging, auditing, and building trust in
                system behavior.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Verification Method</h3>
              <ul className="text-slate-400 text-sm space-y-2">
                <li>• State machine tests: verify valid phase transitions</li>
                <li>• Action safety: verify actions are rejected in invalid phases</li>
                <li>• Determinism: verify identical inputs produce identical outputs</li>
                <li>• Boundary tests: verify edge cases are handled correctly</li>
              </ul>
            </div>

            <div className="p-4 bg-rose-950/20 rounded-lg border border-rose-500/20">
              <p className="text-rose-200 text-sm">
                <span className="font-medium">Modules:</span> M5 (Evidence Trace), M6 (Draft Decision) —
                Validate determinism, boundary correctness, and state machine safety.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 7: Validation Scope Limitations ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-slate-500 bg-slate-500/10 px-2 py-1 rounded">07</span>
            <h2 className="text-2xl font-bold text-white">Validation Scope Limitations</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800">
            <p className="text-slate-400 leading-relaxed mb-6">
              The validation suite verifies system reliability, not predictive performance.
              The following are explicitly outside the scope of validation:
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-slate-600 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">Win Rate Prediction</p>
                  <p className="text-slate-500 text-sm mt-1">
                    No claims are made about draft quality or game outcomes.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-600 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">Meta Forecasting</p>
                  <p className="text-slate-500 text-sm mt-1">
                    All analysis is historical; no predictions of future meta states.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-600 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">UI Rendering</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Validation covers data and logic layers only.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-600 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">Causal Relationships</p>
                  <p className="text-slate-500 text-sm mt-1">
                    All outputs are correlational, not causal.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </motion.section>

        {/* ============ SECTION 8: Running the Suite ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-teal-500 bg-teal-500/10 px-2 py-1 rounded">CLI</span>
            <h2 className="text-2xl font-bold text-white">Running the Validation Suite</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800">
            <pre className="text-sm text-slate-300 overflow-x-auto">
              <code>{`# Run all validations
npm run validate:all

# Run individual modules
npm run validate:data-qa
npm run validate:m1
npm run validate:m2
npm run validate:m3
npm run validate:m4
npm run validate:m5
npm run validate:m6`}</code>
            </pre>
            <p className="text-slate-500 text-sm mt-4">
              Reports are generated in <code className="text-slate-400">app/docs/validation/</code>
            </p>
          </div>
        </motion.section>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center pt-12 border-t border-slate-800"
        >
          <p className="text-slate-600 text-sm mb-4">
            This validation suite verifies system reliability according to the methodological
            specifications. It does not make predictive claims or evaluate outcome quality.
          </p>
          <Link
            href="/methodology"
            className="inline-flex items-center gap-2 text-sm text-teal-500 hover:text-teal-400 transition-colors"
          >
            <span>← Back to Methodology</span>
          </Link>
        </motion.footer>
      </div>
    </div>
  );
}