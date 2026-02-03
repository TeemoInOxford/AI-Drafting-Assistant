'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-cyan-500/30">
      {/* Background Grid - Static & Subtle */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-20">

        {/* ============ HERO SECTION ============ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-28"
        >
          {/* Version badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8 inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur-sm"
          >
            <span className="mr-2 h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            v2.0 Beta Live
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-tight">
            Draft Is About <span className="text-cyan-400">Timing</span>. <br />
            <span className="text-slate-500">Not Strength.</span>
          </h1>

          <h2 className="font-mono text-lg md:text-xl font-medium text-cyan-400 mb-4">
            "Every Pick Closes a Door. Know Which Ones."
          </h2>

          <p className="text-base text-slate-500 mb-8">
            Professional-grade Ban/Pick decision support for LoL esports.
          </p>

          <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-6 leading-relaxed">
            A decision-support system for professional League of Legends drafting.
            <br className="hidden md:block" />
            Built for coaches who understand that drafts are won in the margins—
            <br className="hidden md:block" />
            and lost in the moments you didn't see coming.
          </p>

          <p className="text-base text-slate-500 max-w-2xl mx-auto mb-12">
            Stage-Aware Draft Strategist models timing, exposure, and irreversible consequences—
            so every decision is made with full situational clarity.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/bp"
              className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-8 py-4 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)]"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>Launch Draft Assistant</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
            <Link
              href="/methodology"
              className="text-sm font-semibold text-slate-300 hover:text-white transition-colors"
            >
              View Methodology & Scope <span aria-hidden="true">→</span>
            </Link>
          </div>
        </motion.section>

        {/* ============ WHAT THIS IS / IS NOT ============ */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="mb-28"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
            <h2 className="text-xl font-bold tracking-tight text-white">System Overview</h2>
            <span className="font-mono text-xs text-slate-600">SYSTEM_INFO_01</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-8 transition-all hover:border-cyan-500/30">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">What This Is</h3>
              <p className="text-slate-300 leading-relaxed">
                A stage-aware drafting assistant that makes timing, trade-offs, and draft consequences explicit.
                It surfaces what you're gaining, what you're giving up, and what windows are closing.
              </p>
            </div>
            <div className="glass-card rounded-2xl p-8 transition-all hover:border-rose-500/30">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">What This Is Not</h3>
              <p className="text-slate-300 leading-relaxed">
                Not an auto-draft bot. Not a winrate optimizer. Not a replacement for strategic judgment.
                The final call always belongs to the coaching staff. This tool ensures that call is fully informed.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ PICK THREAT SCORE (PTS) ============ */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mb-28"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
            <h2 className="text-xl font-bold tracking-tight text-white">Core Innovation</h2>
            <span className="font-mono text-xs text-slate-600">CORE_FEATURE_01</span>
          </div>

          <div className="relative overflow-hidden rounded-3xl p-8 md:p-12 border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 via-slate-900/50 to-indigo-950/30">
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl" />

            <div className="relative max-w-3xl mx-auto">
              <h3 className="text-3xl md:text-4xl font-bold text-white text-center mb-10">Pick Threat Score</h3>

              <div className="grid md:grid-cols-2 gap-8 mb-10">
                <div className="space-y-2">
                  <p className="text-slate-500 text-sm uppercase tracking-wider">Traditional Tools Ask</p>
                  <p className="text-xl text-slate-300">"What happens if we pick this?"</p>
                </div>
                <div className="space-y-2">
                  <p className="text-cyan-400 text-sm uppercase tracking-wider">PTS Asks</p>
                  <p className="text-xl text-white font-semibold">"What happens if we don't act now?"</p>
                </div>
              </div>

              <p className="text-slate-300 leading-relaxed mb-8">
                <span className="text-white font-semibold">Pick Threat Score</span> quantifies the cost of inaction.
                It measures what you lose by waiting—factoring in draft stage, side assignment, opponent trajectory,
                and denial risk. PTS reveals the difference between a safe delay and a critical window.
                It exposes forced decisions before they become regrets.
              </p>

              <div className="bg-slate-950/50 rounded-xl p-6 border border-slate-800">
                <p className="text-slate-400 italic text-center">
                  "Winrate tells you what's strong. <span className="text-cyan-400 font-medium">PTS tells you what's slipping away.</span>"
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ============ THREE PILLARS ============ */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="mb-28"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
            <h2 className="text-xl font-bold tracking-tight text-white">Core Innovations</h2>
            <span className="font-mono text-xs text-slate-600">SYSTEM_FEATURES</span>
          </div>

          <div className="grid md:grid-cols-3 gap-6">

            {/* Stage Awareness */}
            <div className="group glass-card rounded-2xl p-8 transition-all hover:border-blue-500/50 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
              <div className="relative">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-blue-950 rounded-xl flex items-center justify-center mb-5 transition-colors">
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Stage Awareness</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Draft phase isn't a sequence—it's a narrowing corridor. Champion value shifts based on pick number,
                  side, what's revealed, and what remains hidden.
                </p>
                <p className="text-slate-500 text-sm">
                  A flex that's powerful when concealed becomes predictable when exposed. Timing changes everything.
                </p>
              </div>
            </div>

            {/* Multi-Path Analysis */}
            <div className="group glass-card rounded-2xl p-8 transition-all hover:border-purple-500/50 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl transition-all group-hover:bg-purple-500/20" />
              <div className="relative">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-purple-950 rounded-xl flex items-center justify-center mb-5 transition-colors">
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Multi-Path Analysis</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Professional drafts don't have optimal solutions—they have trade-off structures.
                  This system surfaces multiple viable directions, each with explicit costs.
                </p>
                <p className="text-slate-500 text-sm">
                  The goal isn't to find the best pick. It's to understand the shape of the decision.
                </p>
              </div>
            </div>

            {/* Coach-Centric */}
            <div className="group glass-card rounded-2xl p-8 transition-all hover:border-cyan-500/50 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl transition-all group-hover:bg-cyan-500/20" />
              <div className="relative">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-cyan-950 rounded-xl flex items-center justify-center mb-5 transition-colors">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Coach-Centric</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Built for professionals who already know how to draft. No auto-selections.
                  No black-box recommendations. Every output is designed to be interrogated and overruled.
                </p>
                <p className="text-slate-500 text-sm">
                  The coach owns the draft. The system ensures nothing was missed.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ============ CALLOUT QUOTES ============ */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="mb-28"
        >
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 rounded-xl p-6 border-l-4 border-cyan-500/50 backdrop-blur-sm">
              <p className="text-slate-300 italic">
                "Drafts aren't won by picking the strongest champions. They're lost by missing the moment a door closed."
              </p>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-6 border-l-4 border-purple-500/50 backdrop-blur-sm">
              <p className="text-slate-300 italic">
                "We don't tell you what to pick. We show you what you're giving up."
              </p>
            </div>
          </div>
        </motion.section>

        {/* ============ NAVIGATION CARDS ============ */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mb-20"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
            <h2 className="text-xl font-bold tracking-tight text-white">System Modules</h2>
            <span className="font-mono text-xs text-slate-600">ACCESS_POINTS</span>
          </div>

          <div className="grid md:grid-cols-3 gap-6">

            {/* BP Simulator - Primary */}
            <Link href="/bp" className="group md:col-span-3">
              <div className="h-full relative overflow-hidden rounded-2xl p-8 border-2 border-cyan-500/50 bg-gradient-to-br from-cyan-950/40 to-slate-900 transition-all hover:scale-[1.01] hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(34,211,238,0.2)]">
                {/* Recommended Badge */}
                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                  Recommended
                </div>
                <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="relative flex items-start gap-6">
                  <div className="w-16 h-16 bg-cyan-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-cyan-500/30 flex-shrink-0">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-2">Draft Assistant</h3>
                    <p className="text-cyan-200/80 text-sm mb-4 max-w-xl">
                      Interactive draft sandbox with real-time PTS analysis. Test scenarios, explore branches, and prepare for stage with full situational awareness.
                    </p>
                    <div className="flex items-center text-sm font-semibold uppercase tracking-wider text-cyan-300">
                      <span>Launch Draft Assistant</span>
                      <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>

          </div>

          {/* Secondary Tools */}
          <div className="mt-6">
            <p className="text-xs text-slate-600 uppercase tracking-wider mb-4">Supporting Tools</p>
            <div className="grid md:grid-cols-3 gap-4">
              {/* Meta Overview */}
              <Link href="/meta" className="group">
                <div className="h-full glass-card rounded-xl p-5 transition-all hover:scale-[1.02] hover:border-amber-500/40">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-800 group-hover:bg-amber-950 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">Meta Overview</h3>
                      <p className="text-slate-500 text-xs truncate">Champion presence & pick/ban rates</p>
                    </div>
                    <span className="text-slate-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all">→</span>
                  </div>
                </div>
              </Link>
              {/* Player Pool */}
              <Link href="/player-pool" className="group">
                <div className="h-full glass-card rounded-xl p-5 transition-all hover:scale-[1.02] hover:border-emerald-500/40">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-800 group-hover:bg-emerald-950 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">Player Pool</h3>
                      <p className="text-slate-500 text-xs truncate">Champion proficiency by player</p>
                    </div>
                    <span className="text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all">→</span>
                  </div>
                </div>
              </Link>
              {/* Flex Pick Dashboard */}
              <Link href="/flex" className="group">
                <div className="h-full glass-card rounded-xl p-5 transition-all hover:scale-[1.02] hover:border-fuchsia-500/40">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-800 group-hover:bg-fuchsia-950 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">Flex Picks</h3>
                      <p className="text-slate-500 text-xs truncate">Multi-role champion analysis</p>
                    </div>
                    <span className="text-slate-600 group-hover:text-fuchsia-400 group-hover:translate-x-1 transition-all">→</span>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Technical Resources */}
          <div className="mt-6">
            <p className="text-xs text-slate-600 uppercase tracking-wider mb-4">Technical Resources</p>
            <div className="grid md:grid-cols-3 gap-4">
              {/* Data Source */}
              <Link href="/data" className="group">
                <div className="h-full glass-card rounded-xl p-5 transition-all hover:scale-[1.02] hover:border-purple-500/40">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-800 group-hover:bg-purple-950 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">Data Source</h3>
                      <p className="text-slate-500 text-xs truncate">Dataset coverage & hierarchy</p>
                    </div>
                    <span className="text-slate-600 group-hover:text-purple-400 group-hover:translate-x-1 transition-all">→</span>
                  </div>
                </div>
              </Link>
              {/* Methodology */}
              <Link href="/methodology" className="group">
                <div className="h-full glass-card rounded-xl p-5 transition-all hover:scale-[1.02] hover:border-slate-500/40">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-800 group-hover:bg-slate-700 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">Methodology</h3>
                      <p className="text-slate-500 text-xs truncate">System scope & constraints</p>
                    </div>
                    <span className="text-slate-600 group-hover:text-slate-300 group-hover:translate-x-1 transition-all">→</span>
                  </div>
                </div>
              </Link>
              {/* Data Model */}
              <Link href="/ERD" className="group">
                <div className="h-full glass-card rounded-xl p-5 transition-all hover:scale-[1.02] hover:border-indigo-500/40">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-800 group-hover:bg-indigo-950 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">Data Model</h3>
                      <p className="text-slate-500 text-xs truncate">ERD & API structure</p>
                    </div>
                    <span className="text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all">→</span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </motion.section>

        {/* ============ CLOSING STATEMENT ============ */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.65 }}
          className="text-center pt-12 border-t border-slate-800"
        >
          <p className="font-mono text-xs text-slate-600 mb-2">
            © {new Date().getFullYear()} lol-draft.com. Designed for Professional Esports Analysis.
          </p>
          <p className="text-slate-700 text-xs">
            Decision support for professional League of Legends coaching staff.
          </p>
        </motion.footer>
      </div>
    </div>
  );
}
