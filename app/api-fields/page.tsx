'use client';

import { useState } from 'react';

// Field version requirements (verified through API testing) - Complete 24 version levels (base + 23 versions)
// Note: Version number indicates "this field is supported starting from this version"
const fieldVersions: Record<string, string | null> = {
  // Series level
  "series.id": null, "series.format": null, "series.started": null, "series.finished": null, "series.startedAt": null,
  "series.duration": "3.14",
  // Series Teams
  "series.teams.id": null, "series.teams.name": null, "series.teams.score": null, "series.teams.won": null,
  "series.teams.kills": null, "series.teams.deaths": null, "series.teams.players.id": null, "series.teams.players.name": null,
  // Games base
  "games.id": null, "games.sequenceNumber": null, "games.started": null, "games.finished": null,
  "games.startedAt": "3.7", "games.duration": "3.15",
  // DraftActions
  "draftActions.type": null, "draftActions.sequenceNumber": null, "draftActions.drafter.id": null,
  "draftActions.drafter.type": null, "draftActions.draftable.id": null, "draftActions.draftable.type": null, "draftActions.draftable.name": null,
  // Game Teams base
  "teams.id": null, "teams.name": null, "teams.side": null, "teams.won": null, "teams.kills": null, "teams.deaths": null, "teams.netWorth": null,
  // Game Teams LOL extension (GameTeamStateLol) - exact versions
  "teams.experiencePoints": null,
  "teams.totalMoneyEarned": "3.2",
  "teams.firstKill": "3.10",
  "teams.damageDealt": "3.23", "teams.damageTaken": "3.23",
  "teams.damagePerMinute": "3.24",
  "teams.damagePerMoney": "3.26",
  "teams.kdaRatio": "3.27",
  "teams.moneyDifference": "3.28",
  "teams.visionScore": "3.30",
  "teams.visionScorePerMinute": "3.33",
  "teams.killsAndAssists": "3.34",
  "teams.moneyPerMinute": "3.36",
  "teams.baronPowerPlays": "3.38",
  "teams.majorMoneyLead": "3.40",
  "teams.majorMoneyDeficit": "3.41",
  "teams.forwardPercentage": "3.42",
  // Game Teams Objectives
  "teams.objectives.id": null, "teams.objectives.type": null, "teams.objectives.completionCount": null,
  "teams.objectives.completedFirst": "3.11",
  // Game Players base
  "players.id": null, "players.name": null, "players.character.id": null, "players.character.name": null,
  "players.kills": null, "players.deaths": null, "players.killAssistsGiven": null, "players.netWorth": null,
  // Game Players LOL extension (GamePlayerStateLol) - exact versions
  "players.experiencePoints": null,
  "players.totalMoneyEarned": "3.2",
  "players.alive": null, "players.currentHealth": null, "players.maxHealth": null, "players.currentArmor": null,
  "players.respawnClock": "3.3",
  "players.damageDealt": "3.23", "players.damageTaken": "3.23",
  "players.damagePerMinute": "3.24",
  "players.damagePercentage": "3.25",
  "players.damagePerMoney": "3.26",
  "players.kdaRatio": "3.27",
  "players.visionScore": "3.30",
  "players.visionScorePerMinute": "3.33",
  "players.killsAndAssists": "3.34",
  "players.killParticipation": "3.35",
  "players.moneyPerMinute": "3.36",
  "players.moneyPercentage": "3.37",
  "players.forwardPercentage": "3.42",
  // Game Players Inventory
  "players.inventory.items.id": null, "players.inventory.items.name": null, "players.inventory.items.quantity": null,
  // Game Players Objectives
  "players.objectives.id": null, "players.objectives.type": null, "players.objectives.completionCount": null,
  "players.objectives.completedFirst": "3.11",
};

// Version list (low to high) with new fields, field count, and match count - Complete 24 version levels
const versionChangelog = [
  { version: "Base", fields: ["series base", "games base", "teams base", "players base", "draftActions", "inventory", "objectives base"], count: 54, matches: 109 },
  { version: "3.2", fields: ["totalMoneyEarned"], count: 2, matches: 259 },
  { version: "3.3", fields: ["respawnClock"], count: 1, matches: 384 },
  { version: "3.7", fields: ["games.startedAt"], count: 1, matches: 163 },
  { version: "3.10", fields: ["firstKill"], count: 1, matches: 84 },
  { version: "3.11", fields: ["completedFirst"], count: 2, matches: 252 },
  { version: "3.14", fields: ["series.duration"], count: 1, matches: 20 },
  { version: "3.15", fields: ["games.duration"], count: 1, matches: 159 },
  { version: "3.23", fields: ["damageDealt", "damageTaken"], count: 4, matches: 0 },
  { version: "3.24", fields: ["damagePerMinute"], count: 2, matches: 0 },
  { version: "3.25", fields: ["damagePercentage"], count: 1, matches: 0 },
  { version: "3.26", fields: ["damagePerMoney"], count: 2, matches: 0 },
  { version: "3.27", fields: ["kdaRatio"], count: 2, matches: 0 },
  { version: "3.28", fields: ["moneyDifference"], count: 1, matches: 0 },
  { version: "3.30", fields: ["visionScore"], count: 2, matches: 79 },
  { version: "3.33", fields: ["visionScorePerMinute"], count: 2, matches: 0 },
  { version: "3.34", fields: ["killsAndAssists"], count: 2, matches: 0 },
  { version: "3.35", fields: ["killParticipation"], count: 1, matches: 84 },
  { version: "3.36", fields: ["moneyPerMinute"], count: 2, matches: 0 },
  { version: "3.37", fields: ["moneyPercentage"], count: 1, matches: 0 },
  { version: "3.38", fields: ["baronPowerPlays"], count: 1, matches: 209 },
  { version: "3.40", fields: ["majorMoneyLead"], count: 1, matches: 0 },
  { version: "3.41", fields: ["majorMoneyDeficit"], count: 1, matches: 0 },
  { version: "3.42", fields: ["forwardPercentage"], count: 2, matches: 1584 },
];

// Fields organized by category
const sections = [
  {
    title: "Series Level Fields",
    fields: ["series.id", "series.format", "series.started", "series.finished", "series.startedAt", "series.duration"]
  },
  {
    title: "Series Teams Fields",
    fields: ["series.teams.id", "series.teams.name", "series.teams.score", "series.teams.won", "series.teams.kills", "series.teams.deaths", "series.teams.players.id", "series.teams.players.name"]
  },
  {
    title: "Games Base Fields",
    fields: ["games.id", "games.sequenceNumber", "games.started", "games.finished", "games.startedAt", "games.duration"]
  },
  {
    title: "Draft Actions Fields",
    fields: ["draftActions.type", "draftActions.sequenceNumber", "draftActions.drafter.id", "draftActions.drafter.type", "draftActions.draftable.id", "draftActions.draftable.type", "draftActions.draftable.name"]
  },
  {
    title: "Game Teams Base Fields",
    fields: ["teams.id", "teams.name", "teams.side", "teams.won", "teams.kills", "teams.deaths", "teams.netWorth"]
  },
  {
    title: "Game Teams LOL Extension (GameTeamStateLol)",
    fields: ["teams.experiencePoints", "teams.totalMoneyEarned", "teams.firstKill", "teams.damageDealt", "teams.damageTaken", "teams.damagePerMinute", "teams.damagePerMoney", "teams.visionScore", "teams.visionScorePerMinute", "teams.moneyDifference", "teams.moneyPerMinute", "teams.kdaRatio", "teams.killsAndAssists", "teams.majorMoneyLead", "teams.majorMoneyDeficit", "teams.forwardPercentage", "teams.baronPowerPlays"]
  },
  {
    title: "Game Teams Objectives Fields",
    fields: ["teams.objectives.id", "teams.objectives.type", "teams.objectives.completedFirst", "teams.objectives.completionCount"]
  },
  {
    title: "Game Players Base Fields",
    fields: ["players.id", "players.name", "players.character.id", "players.character.name", "players.kills", "players.deaths", "players.killAssistsGiven", "players.netWorth"]
  },
  {
    title: "Game Players LOL Extension (GamePlayerStateLol)",
    fields: ["players.experiencePoints", "players.totalMoneyEarned", "players.alive", "players.currentHealth", "players.maxHealth", "players.currentArmor", "players.respawnClock", "players.damageDealt", "players.damageTaken", "players.damagePercentage", "players.damagePerMinute", "players.damagePerMoney", "players.visionScore", "players.visionScorePerMinute", "players.kdaRatio", "players.killParticipation", "players.killsAndAssists", "players.moneyPerMinute", "players.moneyPercentage", "players.forwardPercentage"]
  },
  {
    title: "Game Players Inventory Fields",
    fields: ["players.inventory.items.id", "players.inventory.items.name", "players.inventory.items.quantity"]
  },
  {
    title: "Game Players Objectives Fields",
    fields: ["players.objectives.id", "players.objectives.type", "players.objectives.completedFirst", "players.objectives.completionCount"]
  },
];

// Version description mapping
const versionDescriptions: Record<string, string> = {
  "Base": "Core fields supported by all matches",
  "3.2": "totalMoneyEarned (total gold income)",
  "3.3": "respawnClock (respawn countdown)",
  "3.7": "games.startedAt (game start time)",
  "3.10": "firstKill (first blood)",
  "3.11": "completedFirst (first objective completed)",
  "3.14": "series.duration (series duration)",
  "3.15": "games.duration (game duration)",
  "3.23": "damageDealt, damageTaken (damage dealt/taken)",
  "3.24": "damagePerMinute (damage per minute)",
  "3.25": "damagePercentage (damage share, players only)",
  "3.26": "damagePerMoney (damage per gold)",
  "3.27": "kdaRatio (KDA ratio)",
  "3.28": "moneyDifference (gold difference)",
  "3.30": "visionScore (vision score)",
  "3.33": "visionScorePerMinute (vision score per minute)",
  "3.34": "killsAndAssists (kills + assists)",
  "3.35": "killParticipation (kill participation rate)",
  "3.36": "moneyPerMinute (gold per minute)",
  "3.37": "moneyPercentage (gold share)",
  "3.38": "baronPowerPlays (baron power plays)",
  "3.40": "majorMoneyLead (major gold lead)",
  "3.41": "majorMoneyDeficit (major gold deficit)",
  "3.42": "forwardPercentage (forward percentage)",
};

export default function ApiFieldsPage() {
  const [hideZeroMatches, setHideZeroMatches] = useState(false);

  const filteredVersions = hideZeroMatches
    ? versionChangelog.filter(item => item.matches > 0)
    : versionChangelog;

  const totalMatches = filteredVersions.reduce((sum, item) => sum + item.matches, 0);

  // Get set of versions with 0 matches
  const zeroMatchVersions = new Set(
    versionChangelog.filter(item => item.matches === 0).map(item => item.version)
  );

  // Determine if field should be displayed
  const shouldShowField = (version: string | null) => {
    if (!hideZeroMatches) return true;
    if (!version) return true; // Base fields always shown
    return !zeroMatchVersions.has(version);
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-cyan-500/30">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                API <span className="text-cyan-400">Field Reference</span>
              </h1>
              <p className="text-slate-400 mt-2">
                GRID Esports API field version requirements
              </p>
            </div>
            <a
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <span>←</span> Back to Home
            </a>
          </div>

          {/* Description */}
          <div className="bg-slate-800/30 rounded-lg p-4 mb-6 border border-slate-700/50">
            <p className="text-slate-400 text-sm">
              This reference documents the minimum API version required for each field in the GRID Esports Series State API.
              Fields are organized by category and tagged with their version requirements.
            </p>
          </div>
        </div>

        {/* Version Changelog (merged with field count statistics) */}
        <div className="glass-card rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-cyan-400">
              Version Changelog ({filteredVersions.length} version levels, {filteredVersions.reduce((sum, item) => sum + item.count, 0)} fields, {totalMatches} matches)
            </h3>
            <button
              onClick={() => setHideZeroMatches(!hideZeroMatches)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                hideZeroMatches
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
              }`}
            >
              {hideZeroMatches ? 'Show All Versions' : 'Hide 0-Match Versions'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {filteredVersions.map((item, idx) => (
              <div key={idx} className={`p-2 rounded-lg ${item.version === "Base" ? "bg-green-500/10 border border-green-500/20" : "bg-purple-500/10 border border-purple-500/20"}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`font-bold ${item.version === "Base" ? "text-green-400" : "text-purple-300"}`}>
                    {item.version === "Base" ? "Base Support" : `v${item.version}`}
                  </span>
                  <div className="flex gap-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${item.version === "Base" ? "bg-green-500/30 text-green-300" : "bg-purple-500/30 text-purple-200"}`}>
                      {item.count} fields
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/30 text-cyan-300 group relative cursor-help">
                      {item.matches} matches
                      <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-900 text-xs text-slate-300 p-2 rounded shadow-lg w-48 z-20 border border-slate-700 text-left">
                        Number of matches in our dataset that support this version level
                      </span>
                    </span>
                  </div>
                </div>
                <div className="text-slate-400 text-[10px]">
                  {item.fields.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mb-5 text-sm">
          <span><span className="inline-block w-16 text-center bg-green-500/20 text-green-400 rounded px-2 py-0.5 text-xs">Base</span> Supported by all versions</span>
          <span><span className="inline-block w-16 text-center bg-purple-500/20 text-purple-300 rounded px-2 py-0.5 text-xs">v3.xx</span> Requires this version or higher</span>
        </div>

        {/* Field Tables */}
        {sections.map((section, idx) => {
          const visibleFields = section.fields.filter(field => shouldShowField(fieldVersions[field]));
          if (visibleFields.length === 0) return null;
          return (
            <div key={idx} className="glass-card rounded-xl mb-4 overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-4 py-2 font-semibold text-sm border-b border-slate-700/50">
                {section.title}
              </div>
              <div className="p-3">
                <div className="flex flex-wrap gap-2">
                  {visibleFields.map((field, i) => {
                    const version = fieldVersions[field];
                    const isBasic = !version;
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isBasic ? "bg-green-500/10 border border-green-500/20" : "bg-purple-500/10 border border-purple-500/20"}`}>
                        <span className="font-mono text-slate-300">{field.split('.').pop()}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isBasic ? "bg-green-500/30 text-green-300" : "bg-purple-500/30 text-purple-200"}`}>
                          {isBasic ? "Base" : `v${version}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Notes */}
        <div className="glass-card rounded-xl p-4 mt-6">
          <h3 className="text-cyan-400 font-semibold mb-3">Version Notes</h3>
          <div className="text-sm text-slate-400 space-y-2">
            <p><strong className="text-white">Why are there version differences?</strong></p>
            <p>GRID Esports match data is stored based on match time. Each match uses the API version&apos;s data format available at that time. When you query older matches with newer version fields, the API returns an error stating &quot;this field requires version X.XX&quot;.</p>
            <p className="mt-3"><strong className="text-white">Verified {filteredVersions.length} version breakpoints:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
              {filteredVersions.map((item, idx) => (
                <li key={idx}>
                  <span className={item.version === "Base" ? "text-green-400" : "text-purple-300"}>
                    {item.version === "Base" ? "Base" : `v${item.version}`}
                  </span>
                  {" - "}
                  {versionDescriptions[item.version]}
                  {item.matches > 0 && <span className="text-cyan-400"> ({item.matches} matches)</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
