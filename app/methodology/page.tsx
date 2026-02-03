'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function MethodologyPage() {
  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-cyan-500/30">
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
            href="/"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8"
          >
            <span className="mr-2">←</span>
            Back to Home
          </Link>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Methodology & Scope
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl">
            This document establishes the methodological contract under which the system operates.
            It defines system intent, modeling assumptions, scope boundaries, and conservatism principles.
          </p>

          {/* Disclaimer Box */}
          <div className="mt-6 bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
            <p className="text-slate-400 text-sm">
              <span className="text-slate-300 font-medium">Disclaimer:</span> This document is for transparency.
              Users are not required to understand these details to use the tool.
            </p>
          </div>
        </motion.header>

        {/* Table of Contents */}
        <motion.nav
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.03 }}
          className="mb-16 glass-card rounded-xl p-6"
        >
          <h2 className="text-lg font-bold text-white mb-4">Table of Contents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <a href="#section-1" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              01. System Purpose and Design Intent
            </a>
            <a href="#section-2" className="text-rose-400 hover:text-rose-300 transition-colors">
              02. Scope Exclusions and Non-Claims
            </a>
            <a href="#section-3" className="text-amber-400 hover:text-amber-300 transition-colors">
              03. Deliberate Modeling Constraints
            </a>
            <a href="#section-4" className="text-purple-400 hover:text-purple-300 transition-colors">
              04. Reference Population Architecture
            </a>
            <a href="#section-5" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              05. Data Scope and Coverage
            </a>
            <a href="#section-6" className="text-blue-400 hover:text-blue-300 transition-colors">
              06. Data Cleaning and Quality Assurance
            </a>
            <a href="#section-7" className="text-teal-400 hover:text-teal-300 transition-colors">
              07. Evidence Coverage and Conservatism
            </a>
            <a href="#section-8" className="text-amber-400 hover:text-amber-300 transition-colors">
              08. Historical Role Outcomes
            </a>
          </div>
        </motion.nav>

        {/* ============ Relationship to Validation ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mb-16"
        >
          <div className="bg-slate-900/30 rounded-xl p-6 border border-slate-700/50">
            <p className="text-slate-400 text-sm leading-relaxed">
              <span className="text-slate-300 font-medium">Relationship to Validation:</span> This
              Methodology section defines <span className="text-white">what the system is designed to do</span> and
              the assumptions under which it operates. The companion{' '}
              <Link href="/docs/validation" className="text-teal-400 hover:text-teal-300 underline">
                Validation & Diagnostics
              </Link>{' '}
              section provides empirical evidence that the system behaves according to these specifications.
              Methodology establishes the contract; Validation verifies adherence to that contract.
            </p>
          </div>
        </motion.section>

        {/* ============ SECTION 1: System Purpose and Design Intent ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded">01</span>
            <h2 className="text-2xl font-bold text-white">System Purpose and Design Intent</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">1.1 Functional Role</h3>
              <p className="text-slate-300 leading-relaxed">
                The system is designed as a decision support tool for professional coaching staff during
                the champion selection phase. Its function is to surface historical patterns, quantify
                trade-offs, and expose opportunity costs at each decision point. The system analyzes
                professional match data to identify what strategic options are being gained, foregone,
                or constrained as the draft progresses.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">1.2 Output Specification</h3>
              <p className="text-slate-300 leading-relaxed">
                All system outputs take the form of <span className="text-white font-medium">probability distributions</span>,
                not point estimates or prescriptive recommendations. Role flexibility is represented as a
                distribution over positions, preserving uncertainty rather than collapsing it into
                deterministic assignments. This design choice ensures that outputs remain amenable to
                human interrogation, contextual interpretation, and override.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-3">1.3 Intended User and Interaction Model</h3>
              <p className="text-slate-300 leading-relaxed">
                The system is explicitly designed to <span className="text-white font-medium">augment human decision-making</span>,
                not to replace it. It functions as an analyst-facing tool that surfaces structured data
                for human interpretation. The system does not prescribe actions; it exposes information
                that informs decisions made by domain experts.
              </p>
            </div>

            <div className="p-4 bg-cyan-950/30 rounded-lg border border-cyan-500/20">
              <p className="text-cyan-200 text-sm">
                <span className="font-medium">Design Principle:</span> The system surfaces patterns; it does not make decisions.
                Strategic context, opponent modeling, player state, and meta-game interpretation remain
                exclusively within the domain of the coaching staff.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 2: Scope Exclusions and Non-Claims ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-rose-500 bg-rose-500/10 px-2 py-1 rounded">02</span>
            <h2 className="text-2xl font-bold text-white">Scope Exclusions and Non-Claims</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800">
            <p className="text-slate-400 leading-relaxed mb-6">
              The following capabilities are explicitly excluded from the system&apos;s scope. These are
              not missing features but deliberate design boundaries that define what the system does not claim to do.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-rose-500 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">No Meta Prediction</p>
                  <p className="text-slate-500 text-sm mt-1">
                    The system does not forecast how balance changes, patch updates, or meta shifts will
                    affect champion viability. All outputs reflect historical patterns observed in the data,
                    not predictions of future states.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-500 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">No Optimal Draft Solutions</p>
                  <p className="text-slate-500 text-sm mt-1">
                    The system does not claim to identify optimal draft compositions. Draft quality is
                    contingent on execution, adaptation, and factors outside pre-game analysis. The system
                    exposes trade-offs and opportunity costs; it does not prescribe solutions.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-500 mt-1">×</span>
                <div>
                  <p className="text-slate-300 font-medium">No Win Rate Optimization</p>
                  <p className="text-slate-500 text-sm mt-1">
                    The system makes no claims about win rate improvement. Post-draft execution, in-game
                    adaptation, and individual performance are outside the scope of this analysis. Using
                    system outputs does not guarantee improved outcomes.
                  </p>
                </div>
              </li>
            </ul>

            <div className="mt-6 p-4 bg-slate-950/50 rounded-lg border border-slate-700">
              <p className="text-slate-400 text-sm">
                <span className="text-slate-300 font-medium">Scope Boundary:</span> The system assists with
                understanding historical patterns in professional drafts. It does not predict, prescribe, or optimize.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 3: Deliberate Modeling Constraints ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded">03</span>
            <h2 className="text-2xl font-bold text-white">Deliberate Modeling Constraints</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800">
            <p className="text-slate-400 leading-relaxed mb-6">
              The following constraints are deliberate design choices that prioritize statistical rigor
              and interpretability over model complexity.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-amber-500 mt-1">○</span>
                <div>
                  <p className="text-slate-300 font-medium">No Patch-Specific Learning</p>
                  <p className="text-slate-500 text-sm mt-1">
                    The system does not train patch-specific models or learn causal patch effects.
                    Context filtering reports observed frequencies in data subsets; it does not model
                    patch dynamics or balance change impacts.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-500 mt-1">○</span>
                <div>
                  <p className="text-slate-300 font-medium">No Region-Specific Model Training</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Regional differences are exposed through data filtering, not separate learned models.
                    The base model is trained on global data; regional views represent data subsets,
                    not distinct learned representations.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-500 mt-1">○</span>
                <div>
                  <p className="text-slate-300 font-medium">No Small-Sample Reweighting</p>
                  <p className="text-slate-500 text-sm mt-1">
                    When sample size is insufficient (below the minimum threshold), the system returns
                    the global baseline unchanged. This prevents noise from small samples from
                    contaminating outputs.
                  </p>
                </div>
              </li>
            </ul>

            <div className="mt-6 p-4 bg-amber-950/20 rounded-lg border border-amber-500/20">
              <p className="text-amber-200 text-sm">
                <span className="font-medium">Design Rationale:</span> Historical data exists for interpretability
                and prior transparency, not for driving current-patch predictions. These constraints reflect
                commitment to statistical rigor, not missing capabilities.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 4: Reference Population Architecture ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-purple-500 bg-purple-500/10 px-2 py-1 rounded">04</span>
            <h2 className="text-2xl font-bold text-white">Reference Population Architecture</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            {/* 4.1 Two-View Design */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.1 Two-View Design</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                The system provides two distinct views of role probability distributions. These views differ in
                their <span className="text-white font-medium">reference population</span>, not in their underlying model.
                The Bayesian model structure remains identical; only the data subset from which frequencies are
                computed changes.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Default View</p>
                  <p className="text-slate-400 text-sm mb-2">Global baseline derived from full dataset</p>
                  <p className="text-slate-500 text-xs">
                    Represents stable, long-term role distributions. This is the authoritative baseline
                    against which all contextual views are calibrated.
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Context-Filtered View</p>
                  <p className="text-slate-400 text-sm mb-2">Conditioned on user-specified subset</p>
                  <p className="text-slate-500 text-xs">
                    Reports observed frequencies within a specified data subset. This is a conditioning
                    operation on historical data, not a prediction of future behavior.
                  </p>
                </div>
              </div>
            </div>

            {/* 4.2 Default View Specification */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.2 Default View Specification</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                The default mode computes role probabilities from the full dataset using Bayesian
                posteriors with a Dirichlet-Multinomial conjugate prior. The prior strength parameter
                is selected via cross-validation to balance responsiveness and stability.
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                <ul className="text-slate-400 text-sm space-y-1">
                  <li>• Reference population: Full professional match dataset</li>
                  <li>• Model: Dirichlet-Multinomial conjugate prior</li>
                  <li>• Interpretation: Long-term structural role distributions</li>
                  <li>• Use case: Default reference when no specific context is required</li>
                </ul>
              </div>
            </div>

            {/* 4.3 Context-Filtered View Specification */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.3 Context-Filtered View Specification</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                When a user selects a specific patch or region, the system <span className="text-white font-medium">conditions
                the reference population</span> to that subset and recomputes observed frequencies. The output
                reports what was observed in the selected context—it does not predict what will occur in future
                games under similar conditions.
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                <ul className="text-slate-400 text-sm space-y-1">
                  <li>• Reference population: User-selected subset (patch, region, or both)</li>
                  <li>• Operation: Frequency recomputation with conservative smoothing</li>
                  <li>• Interpretation: Observed frequencies within the specified context</li>
                  <li>• Use case: Contextual inspection when analyst requires narrower reference</li>
                </ul>
              </div>
            </div>

            {/* 4.4 Rationale for Context Filtering */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.4 Rationale for Context Filtering</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Context filtering addresses a specific methodological concern: the global baseline aggregates
                data across heterogeneous conditions. When an analyst is preparing for a match in a specific
                context, the global distribution may not accurately represent the relevant reference population.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-purple-400 mt-1">1.</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Prevents Incorrect Generalization</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Global frequencies may misrepresent role distributions in specific contexts.
                      Context filtering surfaces this heterogeneity.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-purple-400 mt-1">2.</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Constrains Reference Population</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Enables analysts to query historical data within specific contexts.
                      This is a question about historical data, not a request for prediction.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-purple-400 mt-1">3.</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Supports Analyst Validation</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Allows analysts to validate whether global patterns hold in specific contexts.
                      This is an inspection tool for data heterogeneity.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4.5 Context Filtering Constraints */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.5 Context Filtering Constraints</h3>
              <p className="text-slate-400 leading-relaxed mb-4">
                To prevent misinterpretation, the following constraints are explicit:
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">×</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Not Patch-Level Meta Modeling</p>
                    <p className="text-slate-500 text-sm mt-1">
                      The system does not learn patch effects or model balance changes.
                      It reports observed frequencies in historical data subsets.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">×</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Not Predictive</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Filtered frequencies describe what was observed, not what will occur.
                      No claim is made that historical context frequencies generalize to future games.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">×</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Not Causal</p>
                    <p className="text-slate-500 text-sm mt-1">
                      The system does not claim that patch changes cause role shifts.
                      It only reports that observed frequencies differ across data subsets.
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* 4.6 Fallback Behavior */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.6 Fallback Behavior</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                To prevent noise from small samples from contaminating outputs, the system enforces minimum
                sample thresholds and implements automatic fallback to the global baseline.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Minimum Sample Threshold</p>
                  <p className="text-slate-400 text-sm">
                    Context adjustments are only applied when sufficient games exist in the specified
                    context. Below this threshold, the global baseline is returned unchanged.
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Graceful Degradation</p>
                  <p className="text-slate-400 text-sm">
                    When context data is insufficient, unavailable, or not specified, the system returns
                    the global baseline without error. This ensures stable outputs under all conditions.
                  </p>
                </div>
              </div>
            </div>

            {/* 4.7 User Control */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">4.7 User Control and Transparency</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                Context filtering is an explicit, user-controlled operation. The system never automatically
                applies context adjustments based on inferred conditions. Users must actively select a
                context to activate filtering.
              </p>
              <div className="p-3 bg-purple-950/20 rounded-lg border border-purple-500/20">
                <p className="text-purple-200 text-sm">
                  <span className="font-medium">Design Principle:</span> Users always know which reference
                  population is active. Context filtering is transparent and reversible—never hidden,
                  never automatic, never permanent.
                </p>
              </div>
            </div>

            {/* Methodological Position */}
            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm leading-relaxed">
                <span className="text-slate-300 font-medium">Methodological Position:</span> The system does not predict
                patch meta. It conditions historical data to ensure probabilities remain decision-relevant under
                explicitly defined contexts. The context filter is a reference population selector, not a
                forecasting mechanism.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 5: Data Scope and Coverage ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">05</span>
            <h2 className="text-2xl font-bold text-white">Data Scope and Coverage</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            {/* Dataset Composition */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">5.1 Dataset Composition</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                All analysis is derived from professional match data spanning the 2024–2025 competitive seasons
                across major regional leagues. Data is sourced from the GRID Esports API.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Temporal Coverage:</p>
                  <ul className="text-slate-400 text-sm space-y-1">
                    <li>• Time range: 2024-01-13 to 2025-09-28</li>
                    <li>• Total: 1,478 series / 3,386 games</li>
                    <li>• 442 professional players</li>
                    <li>• 56 teams across 4 regions</li>
                  </ul>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Region Coverage:</p>
                  <ul className="text-slate-400 text-sm space-y-1">
                    <li>• LCK (Korea) - 14 tournaments</li>
                    <li>• LPL (China) - 30 tournaments</li>
                    <li>• LEC (Europe) - 14 tournaments</li>
                    <li>• LTA (Americas) - 22 tournaments</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Tournament Details */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">5.2 Tournament Coverage by Region</h3>
              <div className="space-y-3">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">LCK (Korea) - 14 tournaments</p>
                  <p className="text-slate-500 text-xs">
                    Spring 2024 (Regular Season, Playoffs), Summer 2024 (Regular Season, Playoffs), Regional Qualifier 2024, LCK Cup 2025 (Groups, Play-Ins, Playoffs), Split 2 2025 (Regular Season, Road to MSI), Split 3 2025 (Groups, Play-Ins, Playoffs)
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">LPL (China) - 30 tournaments</p>
                  <p className="text-slate-500 text-xs">
                    Spring 2024 (Regular Season, Playoffs), Summer 2024 (Group Stage A-D, Rumble Stage, Playoffs, Play-in), Regional Qualifier 2024, Split 1 2025 (Groups A-D, Knockouts), Split 2 2025 (Group Stage A-D, Rumble Stage, Qualifying Series, Playoffs, Play-in), Split 3 2025 (Rumble Stage, Regional Qualifier, Playoffs, Play-in)
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">LEC (Europe) - 14 tournaments</p>
                  <p className="text-slate-500 text-xs">
                    Winter 2024 (Regular Season, Playoffs), Spring 2024 (Regular Season, Playoffs), Summer 2024 (Regular Season, Playoffs), Season Finals 2024, Winter 2025 (Regular Season, Playoffs), Spring 2025 (Regular Season, Playoffs), Summer 2025 (Groups, Playoffs)
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">LTA (Americas) - 22 tournaments</p>
                  <p className="text-slate-500 text-xs">
                    LCS: Spring 2024 (Regular Season, Playoffs), Summer 2024 (Regular Season, Playoffs) | LTA North: Split 1-3 2025 (Rounds 1-3, Playoffs, Regional Qualifier) | LTA South: Split 1-3 2025 (Rounds 1-3, Playoffs, Regional Qualifier) | Cross-Conference: Split 1 2025, Regional Championship 2025
                  </p>
                </div>
              </div>
            </div>

            {/* Interpretation Note */}
            <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
              <p className="text-slate-400 text-sm">
                <span className="text-slate-300 font-medium">Interpretation note:</span> A champion showing high
                presence in the data indicates frequent professional selection during the covered period,
                not necessarily current meta viability or balance state. Champion evaluations reflect
                <span className="text-white font-medium"> historical usage patterns</span>, not theoretical
                optimal usage or current patch strength.
              </p>
            </div>

            {/* Limitations */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">5.3 Limitations and Temporal Boundaries</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-slate-600 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Temporal Lag</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Data is historical and does not cover matches after 2025-09-28.
                      Outputs reflect past patterns, not real-time meta shifts.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-slate-600 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Regional Imbalance</p>
                    <p className="text-slate-500 text-sm mt-1">
                      LCS coverage is limited to 2024 season only. LTA coverage begins from 2025.
                      Regional comparisons should account for differing sample sizes.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-slate-600 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">No International Events</p>
                    <p className="text-slate-500 text-sm mt-1">
                      The current dataset focuses on regional league play. International tournaments
                      (MSI, Worlds) are not included in this analysis.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-slate-600 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">No Causal Claims</p>
                    <p className="text-slate-500 text-sm mt-1">
                      All outputs reflect correlation (observed frequency differences), not causation.
                      The system does not claim that patch changes cause role shifts; it only reports
                      that frequencies differ across data subsets.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 6: Data Cleaning and Quality Assurance ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-blue-500 bg-blue-500/10 px-2 py-1 rounded">06</span>
            <h2 className="text-2xl font-bold text-white">Data Cleaning and Quality Assurance</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            {/* 6.1 Data Acquisition */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">6.1 Data Acquisition Strategy</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                All match data is acquired through the GRID Esports API (test version). Data retrieval follows a
                maximum-coverage strategy as documented in the{' '}
                <Link href="/api-fields" className="text-blue-400 hover:text-blue-300 underline">
                  API Fields Reference
                </Link>
                , ensuring comprehensive capture of all available match attributes including draft actions,
                player statistics, team compositions, and game outcomes.
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-4">
                <p className="text-slate-300 font-medium text-sm mb-2">Initial Data Retrieval:</p>
                <ul className="text-slate-400 text-sm space-y-1">
                  <li>• Total series queried from API: <span className="text-white font-medium">1,632</span></li>
                  <li>• Series with empty response (data: {'{}'} ): <span className="text-rose-400">145 excluded</span></li>
                  <li>• Series with valid data: <span className="text-green-400">1,487</span></li>
                </ul>
              </div>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                <p className="text-slate-400 text-sm">
                  <span className="text-slate-300 font-medium">API Version Note:</span> The current dataset is
                  sourced from the test version of the GRID API. Production API access would provide improved
                  data consistency and reduced error rates. Many of the data quality issues addressed below
                  are artifacts of the test environment and would be significantly mitigated with production access.
                </p>
              </div>
            </div>

            {/* 6.2 Player Name Normalization */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">6.2 Player Name Normalization</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Player identifiers in the source data exhibit inconsistencies including case variations,
                whitespace differences, and prefix/suffix variations. The following normalization rules are applied:
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-blue-400 mt-1">•</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Case Normalization</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Player names with case differences are unified to a canonical form
                      (e.g., &quot;Xun&quot; → &quot;XUN&quot;, &quot;Knight&quot; → &quot;knight&quot;, &quot;shad0w&quot; → &quot;Shad0w&quot;).
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-400 mt-1">•</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Whitespace Trimming</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Leading and trailing whitespace is removed
                      (e.g., &quot;Loki &quot; → &quot;Loki&quot;, &quot;Quantum &quot; → &quot;Quantum&quot;).
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-400 mt-1">•</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Team Prefix/Suffix Removal</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Team prefixes and promotional suffixes are removed to ensure consistent player identification
                      (e.g., &quot;FNC Wunder&quot; → &quot;Wunder&quot;, &quot;LGDBurdol&quot; → &quot;Burdol&quot;, &quot;TH Flakked&quot; → &quot;Flakked&quot;).
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* 6.3 Manual Corrections */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">6.3 Manual Data Corrections</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                A small number of records required manual intervention due to data quality issues that could
                not be resolved through automated normalization:
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 space-y-3">
                <div>
                  <p className="text-slate-300 font-medium text-sm">Test Account Corrections</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Records associated with test accounts (e.g., &quot;BJTest&quot; placeholder players) were
                    identified and corrected with actual player information where determinable from match context.
                  </p>
                </div>
                <div>
                  <p className="text-slate-300 font-medium text-sm">Missing Player Name Recovery</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Players with empty or null names in game state data (e.g., player &quot;Samver&quot;) were
                    recovered by cross-referencing with hierarchy data and manual verification.
                  </p>
                </div>
              </div>
            </div>

            {/* 6.4 Data Exclusion Criteria */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">6.4 Data Exclusion Criteria</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                The following categories of records are excluded from the analysis dataset. These exclusions
                are deliberate quality controls, not data loss.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">×</span>
                  <div>
                    <p className="text-slate-300 font-medium">Empty API Responses</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Series where the API returned empty data objects (data: {'{}'}) with no game information.
                      These represent matches that were scheduled but either not played or not recorded.
                      <span className="text-slate-400"> 145 series removed at initial retrieval.</span>
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">×</span>
                  <div>
                    <p className="text-slate-300 font-medium">Games With Incomplete Draft Data</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Games where the draft phase (Ban/Pick) does not contain exactly 20 actions
                      (10 bans + 10 picks) are excluded. This ensures draft analysis operates on
                      complete, standard-format drafts only. This includes games with missing score data,
                      as incomplete games typically also have incomplete draft records.
                      <span className="text-slate-400"> 9 series (56 games) removed.</span>
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* 6.5 Exclusion Rationale */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">6.5 Draft Data Exclusion Rationale</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                The system is designed specifically for Ban/Pick phase analysis. Draft data integrity is
                therefore a critical requirement. Games with non-standard draft action counts may indicate:
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Data Collection Issues</p>
                  <ul className="text-slate-500 text-xs space-y-1">
                    <li>• Missing ban/pick events due to API timing</li>
                    <li>• Incomplete data transmission</li>
                    <li>• Test environment artifacts</li>
                  </ul>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Match Irregularities</p>
                  <ul className="text-slate-500 text-xs space-y-1">
                    <li>• Game remakes with partial draft data</li>
                    <li>• Technical pauses affecting data capture</li>
                    <li>• Non-standard tournament formats</li>
                  </ul>
                </div>
              </div>
              <div className="p-4 bg-blue-950/20 rounded-lg border border-blue-500/20">
                <p className="text-blue-200 text-sm">
                  <span className="font-medium">Design Decision:</span> Given the system&apos;s focus on draft
                  phase analysis, any uncertainty in draft data integrity is unacceptable. The excluded games
                  represent approximately 1.6% of the total dataset (56 of 3,442 games). This conservative
                  exclusion ensures that all draft-based analysis operates on verified, complete data.
                </p>
              </div>
            </div>

            {/* 6.6 Final Dataset Statistics */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">6.6 Data Pipeline Summary</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Complete data flow from API retrieval to final dataset:
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-1 border-b border-slate-700">
                    <span className="text-slate-400">Initial API query</span>
                    <span className="text-white font-medium">1,632 series</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-700">
                    <span className="text-slate-400">− Empty responses (data: {'{}'})</span>
                    <span className="text-rose-400">−145 series</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-700">
                    <span className="text-slate-400">= Valid data retrieved</span>
                    <span className="text-slate-300">1,487 series</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-700">
                    <span className="text-slate-400">− Incomplete draft data (≠20 BP)</span>
                    <span className="text-rose-400">−9 series (56 games)</span>
                  </div>
                  <div className="flex justify-between items-center py-1 font-medium">
                    <span className="text-green-400">= Final dataset</span>
                    <span className="text-green-400">1,478 series</span>
                  </div>
                </div>
              </div>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 text-center">
                  <p className="text-2xl font-bold text-white">1,478</p>
                  <p className="text-slate-400 text-sm">Series</p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 text-center">
                  <p className="text-2xl font-bold text-white">3,386</p>
                  <p className="text-slate-400 text-sm">Games</p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 text-center">
                  <p className="text-2xl font-bold text-white">442</p>
                  <p className="text-slate-400 text-sm">Players</p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 text-center">
                  <p className="text-2xl font-bold text-white">56</p>
                  <p className="text-slate-400 text-sm">Teams</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mt-4">
                All games in the final dataset have exactly 20 draft actions (10 bans + 10 picks),
                ensuring complete draft phase coverage for analysis. Data retention rate: 90.6% (1,478 / 1,632).
              </p>
            </div>

            {/* Methodological Position */}
            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm leading-relaxed">
                <span className="text-slate-300 font-medium">Methodological Position:</span> Data quality is
                prioritized over data quantity. The exclusion of incomplete or anomalous records ensures that
                all analysis operates on verified, consistent data. With production API access, the proportion
                of excluded records would be significantly reduced.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 7: Evidence Coverage, Strength Calibration, and Conservatism ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-teal-500 bg-teal-500/10 px-2 py-1 rounded">07</span>
            <h2 className="text-2xl font-bold text-white">Evidence Coverage, Strength Calibration, and Conservatism</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            {/* 7.1 Evidence Coverage Disclosure */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">7.1 Evidence Coverage Disclosure</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                The system surfaces evidence only where sufficient historical data exists to support meaningful
                attribution. Evidence coverage is bounded by data availability, and the system explicitly
                discloses these boundaries rather than extrapolating beyond them.
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-4">
                <p className="text-slate-300 font-medium text-sm mb-3">Current Coverage:</p>
                <ul className="text-slate-400 text-sm space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-teal-400 mt-0.5">•</span>
                    <span><span className="text-white font-medium">162 champions</span> with Bayesian role posteriors derived from professional match data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-400 mt-0.5">•</span>
                    <span><span className="text-white font-medium">413 professional players</span> with champion pool concentration data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-400 mt-0.5">•</span>
                    <span><span className="text-white font-medium">6.5% of players</span> classified as low-sample (&lt;10 games) and explicitly gated from producing strong evidence</span>
                  </li>
                </ul>
              </div>
              <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">
                  <span className="text-slate-300 font-medium">Absence handling:</span> When evidence is absent for a
                  champion, player, or context, the system treats this as <span className="text-white font-medium">uncertainty</span>,
                  not as a negative signal. No inference is drawn from missing data; the system simply does not
                  surface evidence where none exists.
                </p>
              </div>
            </div>

            {/* 7.2 Evidence Strength Calibration */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">7.2 Evidence Strength Calibration</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Not all evidence is treated equally. Evidence strength is calibrated from observed data distributions,
                not from heuristic rules or manual tuning. Each evidence type has empirically derived thresholds
                that determine whether a signal qualifies as STRONG, MODERATE, or WEAK.
              </p>

              {/* Team Denial */}
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-4">
                <p className="text-slate-300 font-medium text-sm mb-2">Team Denial Evidence</p>
                <p className="text-slate-400 text-sm mb-2">
                  Strength is derived from empirical score percentiles computed across all positive denial signals.
                </p>
                <ul className="text-slate-500 text-xs space-y-1">
                  <li>• STRONG threshold corresponds to approximately the top ~15% of positive signals</li>
                  <li>• Thresholds are recomputed when underlying data is updated</li>
                </ul>
              </div>

              {/* Role Flexibility */}
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-4">
                <p className="text-slate-300 font-medium text-sm mb-2">Role Flexibility Evidence</p>
                <p className="text-slate-400 text-sm mb-2">
                  Measured via normalized Shannon entropy of role probability distributions. Higher entropy
                  indicates greater role ambiguity.
                </p>
                <ul className="text-slate-500 text-xs space-y-1">
                  <li>• STRONG threshold set at P85 of the entropy distribution (H<sub>norm</sub> ≥ 0.4435)</li>
                  <li>• Approximately 16% of champions qualify as STRONG flex picks under this criterion</li>
                  <li>• Champions below threshold are not surfaced as flex evidence</li>
                </ul>
              </div>

              {/* Player Specialty */}
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-4">
                <p className="text-slate-300 font-medium text-sm mb-2">Player Specialty Evidence</p>
                <p className="text-slate-400 text-sm mb-2">
                  Based on pick concentration within a player&apos;s champion pool, not on performance metrics.
                  This reflects historical selection patterns, not effectiveness claims.
                </p>
                <ul className="text-slate-500 text-xs space-y-1">
                  <li>• STRONG requires both pickCount ≥ P85 (9 picks) AND pickShare ≥ P85 (11.1%)</li>
                  <li>• Approximately 5.4% of (player, champion) entries qualify as STRONG</li>
                  <li>• MODERATE requires pickCount ≥ P75 (6 picks)</li>
                </ul>
              </div>

              <div className="p-4 bg-teal-950/20 rounded-lg border border-teal-500/20">
                <p className="text-teal-200 text-sm">
                  <span className="font-medium">Calibration principle:</span> All thresholds are derived from
                  observed distributions in the underlying data. No threshold is manually tuned or heuristically
                  chosen. When data distributions change, thresholds are recalibrated accordingly.
                </p>
              </div>
            </div>

            {/* 7.3 Conservatism and Over-Assertion Control */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">7.3 Conservatism and Over-Assertion Control</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                The system is intentionally conservative by design. Multiple mechanisms prevent over-attribution
                and ensure that weak signals cannot be misinterpreted as strong evidence.
              </p>

              <ul className="space-y-4 mb-4">
                <li className="flex items-start gap-3">
                  <span className="text-teal-500 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Low-sample player gating</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Players with fewer than 10 games cannot produce STRONG evidence. Their maximum
                      evidence strength is capped at MODERATE regardless of concentration metrics.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal-500 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Weak evidence exclusion from primary attribution</p>
                    <p className="text-slate-500 text-sm mt-1">
                      WEAK evidence cannot become a primary driver of any explanation. Only STRONG or
                      MODERATE evidence may be surfaced as the primary attribution for a signal.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal-500 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Read-only evidence layers</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Evidence layers are strictly read-only and do not influence decision ordering.
                      All actionable operations (bans) flow through a single Action Panel, ensuring
                      clear separation between evidence display and action execution.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal-500 mt-1">○</span>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">No inferential claims</p>
                    <p className="text-slate-500 text-sm mt-1">
                      The system makes no win-rate inferences, no causal claims, and uses no predictive
                      language. All outputs describe historical patterns, not future expectations.
                    </p>
                  </div>
                </li>
              </ul>

              <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                <p className="text-slate-300 text-sm font-medium">
                  These constraints are design choices, not limitations.
                </p>
                <p className="text-slate-500 text-xs mt-2">
                  Conservative defaults ensure that the system remains interpretable, stable, and
                  under analyst control. Aggressive inference would undermine trust and reduce
                  the system&apos;s utility as a decision support tool.
                </p>
              </div>
            </div>

            {/* 7.4 What This Section Does Not Change */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">7.4 What This Section Does Not Change</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Evidence calibration affects explanation metadata only. The following system behaviors
                remain unchanged:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Unchanged: Scoring</p>
                  <ul className="text-slate-500 text-xs space-y-1">
                    <li>• PTS (Priority Threat Score) calculations</li>
                    <li>• Ban candidate ranking order</li>
                    <li>• Decision tag assignment thresholds</li>
                  </ul>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">Unchanged: Architecture</p>
                  <ul className="text-slate-500 text-xs space-y-1">
                    <li>• No new models or learned weights</li>
                    <li>• No changes to Bayesian posteriors</li>
                    <li>• No modifications to threat signal computation</li>
                  </ul>
                </div>
              </div>
              <div className="mt-4 p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">
                  <span className="text-slate-300 font-medium">Scope boundary:</span> Evidence calibration
                  determines <span className="text-white font-medium">how signals are explained</span>, not
                  how they are ranked or prioritized. The decision order presented to analysts is
                  determined by threat scores and draft state, not by evidence attribution.
                </p>
              </div>
            </div>

            {/* Methodological Position */}
            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm leading-relaxed">
                <span className="text-slate-300 font-medium">Methodological position:</span> This section
                establishes the evidentiary standards under which the system operates. Coverage is disclosed,
                strength is calibrated from data, and conservatism is enforced by design. These properties
                ensure that system outputs remain trustworthy, interpretable, and appropriate for
                professional decision support contexts.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ SECTION 8: Historical Role Outcomes ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded">08</span>
            <h2 className="text-2xl font-bold text-white">Historical Role Outcomes</h2>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 space-y-6">
            {/* What It Is */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">What It Is</h3>
              <p className="text-slate-300 leading-relaxed">
                The system may expose historical outcome differences across role assignments, including
                low-frequency roles. These statistics reflect <span className="text-white font-medium">conditional
                historical outcomes only</span> and do not imply strategic intent or likelihood.
              </p>
            </div>

            {/* Display Criteria */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Display Criteria</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Low-frequency role outcomes are only displayed when ALL three criteria are met:
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">1. Low Probability</p>
                  <p className="text-slate-400 text-sm">
                    Role probability ≤ threshold (mean − 1 std dev of all role probabilities)
                  </p>
                  <p className="text-slate-500 text-xs mt-2">
                    Current threshold: 6.1%
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">2. Sufficient Sample</p>
                  <p className="text-slate-400 text-sm">
                    Sample size ≥ minimum threshold for statistical reliability
                  </p>
                  <p className="text-slate-500 text-xs mt-2">
                    Current minimum: 15 games
                  </p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 font-medium text-sm mb-2">3. Notable Difference</p>
                  <p className="text-slate-400 text-sm">
                    Win rate difference from main role ≥ delta threshold
                  </p>
                  <p className="text-slate-500 text-xs mt-2">
                    Current delta: 10%
                  </p>
                </div>
              </div>
            </div>

            {/* Threshold Derivation */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Threshold Derivation</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                All thresholds are data-driven, computed from the actual distribution of role statistics:
              </p>
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-700 mb-3">
                <p className="text-slate-400 text-sm font-mono mb-2">Probability Threshold:</p>
                <p className="text-slate-300 font-mono text-sm">
                  threshold = max(0.05, mean(all_role_probabilities) − stddev(all_role_probabilities))
                </p>
                <p className="text-slate-500 text-xs mt-3">
                  This identifies roles that are statistically uncommon (below average minus one standard deviation).
                </p>
              </div>
              <p className="text-slate-400 text-sm">
                The minimum sample size (15 games) is based on practical considerations for professional match data,
                balancing statistical reliability against data availability.
              </p>
            </div>

            {/* Interpretation Note */}
            <div className="p-4 bg-amber-950/20 rounded-lg border border-amber-500/20">
              <p className="text-amber-200 text-sm">
                <span className="font-medium">Interpretation note:</span> Low-frequency roles may reflect niche usage,
                team-specific strategies, or situational picks. A higher win rate in a low-frequency role does not
                imply that the role is &quot;better&quot; — it may simply reflect favorable matchup conditions or
                opponent unfamiliarity. These statistics are descriptive, not prescriptive.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center pt-12 border-t border-slate-800"
        >
          <p className="text-slate-600 text-sm mb-4">
            This document establishes the methodological contract under which the system operates.
            For empirical verification of these specifications, see the Validation section.
          </p>
          <Link
            href="/docs/validation"
            className="inline-flex items-center gap-2 text-sm text-teal-500 hover:text-teal-400 transition-colors"
          >
            <span>Validation & Diagnostics</span>
            <span>→</span>
          </Link>
        </motion.footer>
      </div>
    </div>
  );
}
