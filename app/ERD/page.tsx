'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function ERDPage() {
  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-cyan-500/30">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Entity <span className="text-cyan-400">Relationship Diagram</span>
              </h1>
              <p className="text-slate-400 mt-2">
                LOL esports data structure from Grid API
              </p>
            </div>
            <Link
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <span>←</span> Back to Home
            </Link>
          </div>

          {/* Usage Description */}
          <div className="bg-slate-800/30 rounded-lg p-4 mb-6 border border-slate-700/50">
            <p className="text-slate-400 text-sm">
              This diagram illustrates the data model used by the AI Drafting Assistant.
              Use it to understand how entities (Regions, Tournaments, Teams, Players, Series, Games)
              relate to each other. This is useful for developers extending the system or understanding
              the underlying data structure.
            </p>
          </div>
        </motion.div>

        {/* Data Source Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-xl p-4 mb-6"
        >
          <h2 className="text-lg font-bold text-cyan-400 mb-2">Data Source: Grid Esports API</h2>
          <div className="text-sm text-slate-300 space-y-1">
            <p>• <strong>Central Data API:</strong> https://api-op.grid.gg/central-data/graphql</p>
            <p>• <strong>Series State API:</strong> https://api-op.grid.gg/live-data-feed/series-state/graphql</p>
            <p>• <strong>Data Collection:</strong> All data downloaded directly from API without modification</p>
            <p>• <strong>API Coverage:</strong> 1,632 LOL series | <strong>Downloaded:</strong> 1,632 series + 1,488 state records (100%)</p>
          </div>
        </motion.div>

        {/* ERD Diagram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6 overflow-x-auto"
        >
          <div className="min-w-[1200px]">
            {/* Row 1: Hierarchy Data */}
            <div className="mb-4 text-center">
              <span className="bg-cyan-600 text-white px-3 py-1 rounded text-sm">Hierarchy Data (Central Data API)</span>
            </div>
            <div className="flex justify-center gap-8 mb-8">
              {/* Region */}
              <Entity
                title="Region"
                subtitle="Region"
                color="cyan"
                fields={[
                  { name: 'code', type: 'string', pk: true },
                  { name: 'name', type: 'string' },
                  { name: 'fullName', type: 'string' },
                  { name: 'country', type: 'string' },
                ]}
              />
              <Arrow label="1:N" />
              {/* Tournament */}
              <Entity
                title="Tournament"
                subtitle="League"
                color="cyan"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'name', type: 'string' },
                  { name: 'nameShortened', type: 'string' },
                  { name: 'parent', type: 'Tournament?', fk: true },
                ]}
              />
              <Arrow label="N:M" />
              {/* Team */}
              <Entity
                title="Team"
                subtitle="Team"
                color="cyan"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'name', type: 'string' },
                  { name: 'nameShortened', type: 'string' },
                  { name: 'logoUrl', type: 'string' },
                ]}
              />
              <Arrow label="1:N" />
              {/* Player */}
              <Entity
                title="Player"
                subtitle="Player"
                color="cyan"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'nickname', type: 'string' },
                  { name: 'teamId', type: 'string', fk: true },
                ]}
              />
            </div>

            {/* Connector */}
            <div className="flex justify-center mb-4">
              <div className="w-px h-8 bg-gray-500"></div>
            </div>
            <div className="text-center mb-4">
              <span className="text-gray-400 text-sm">Tournament.id = Series.tournament.id</span>
            </div>
            <div className="flex justify-center mb-4">
              <div className="w-px h-8 bg-gray-500"></div>
            </div>

            {/* Row 2: Series Data */}
            <div className="mb-4 text-center">
              <span className="bg-pink-600 text-white px-3 py-1 rounded text-sm">Match Data (Central Data API + Series State API)</span>
            </div>
            <div className="flex justify-center gap-8 mb-8">
              {/* Series */}
              <Entity
                title="Series"
                subtitle="Series"
                color="pink"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'startTimeScheduled', type: 'datetime' },
                  { name: 'format', type: '{name, nameShortened}' },
                  { name: 'type', type: 'string' },
                  { name: 'tournament', type: 'Tournament', fk: true },
                  { name: 'teams', type: 'Team[2]', fk: true },
                ]}
              />
              <Arrow label="1:1" />
              {/* SeriesState */}
              <Entity
                title="SeriesState"
                subtitle="Series State"
                color="pink"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'started', type: 'boolean' },
                  { name: 'finished', type: 'boolean' },
                  { name: 'format', type: 'string' },
                  { name: 'startedAt', type: 'datetime' },
                  { name: 'teams', type: 'SeriesTeam[2]' },
                  { name: 'games', type: 'Game[]' },
                ]}
              />
            </div>

            {/* Row 3: Game Data */}
            <div className="flex justify-center gap-8 mb-8">
              {/* SeriesTeam */}
              <Entity
                title="SeriesTeam"
                subtitle="Series Team Stats"
                color="yellow"
                fields={[
                  { name: 'id', type: 'string', fk: true },
                  { name: 'name', type: 'string' },
                  { name: 'score', type: 'int' },
                  { name: 'won', type: 'boolean' },
                  { name: 'kills', type: 'int' },
                  { name: 'deaths', type: 'int' },
                  { name: 'players', type: 'Player[]' },
                ]}
              />
              <Arrow label="1:N" />
              {/* Game */}
              <Entity
                title="Game"
                subtitle="Single Game"
                color="yellow"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'sequenceNumber', type: 'int' },
                  { name: 'started', type: 'boolean' },
                  { name: 'finished', type: 'boolean' },
                  { name: 'draftActions', type: 'DraftAction[]' },
                  { name: 'teams', type: 'GameTeam[2]' },
                ]}
              />
              <Arrow label="1:2" />
              {/* GameTeam */}
              <Entity
                title="GameTeamLol"
                subtitle="Game Team Stats"
                color="yellow"
                fields={[
                  { name: 'id', type: 'string', fk: true },
                  { name: 'name', type: 'string' },
                  { name: 'side', type: 'blue|red' },
                  { name: 'won', type: 'boolean' },
                  { name: 'kills/deaths', type: 'int' },
                  { name: 'netWorth', type: 'int' },
                  { name: 'damageDealt*', type: 'int' },
                  { name: 'visionScore*', type: 'float' },
                  { name: 'objectives', type: 'Objective[]' },
                  { name: 'players', type: 'GamePlayer[]' },
                ]}
              />
            </div>

            {/* Row 4: Detail Data */}
            <div className="flex justify-center gap-8">
              {/* DraftAction */}
              <Entity
                title="DraftAction"
                subtitle="Draft Action"
                color="green"
                fields={[
                  { name: 'type', type: 'ban|pick' },
                  { name: 'sequenceNumber', type: 'string' },
                  { name: 'drafter', type: '{id, type}' },
                  { name: 'draftable', type: '{id, type, name}' },
                ]}
              />
              <Arrow label="1:10" />
              {/* GamePlayer */}
              <Entity
                title="GamePlayerLol"
                subtitle="Game Player Stats"
                color="green"
                fields={[
                  { name: 'id', type: 'string', fk: true },
                  { name: 'name', type: 'string' },
                  { name: 'character', type: '{id, name}' },
                  { name: 'kills/deaths/assists', type: 'int' },
                  { name: 'netWorth', type: 'int' },
                  { name: 'damageDealt*', type: 'int' },
                  { name: 'visionScore*', type: 'float' },
                  { name: 'kdaRatio*', type: 'float' },
                  { name: 'objectives', type: 'Objective[]' },
                  { name: 'inventory', type: '{items[]}' },
                ]}
              />
            </div>
          </div>
        </motion.div>

        {/* Legend */}
        <div className="mt-6 glass-card rounded-xl p-4">
          <h3 className="font-bold mb-3 text-slate-200">Legend</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold">PK</span>
              <span className="text-slate-300">Primary Key</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-pink-400 font-bold">FK</span>
              <span className="text-slate-300">Foreign Key</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">1:N</span>
              <span className="text-slate-300">One-to-Many</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">N:M</span>
              <span className="text-slate-300">Many-to-Many</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">1:1</span>
              <span className="text-slate-300">One-to-One</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">*</span>
              <span className="text-slate-300">LOL-specific extension (requires API v3.23+)</span>
            </div>
          </div>
        </div>

        {/* Data Flow */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card rounded-xl p-4">
            <h3 className="font-bold text-cyan-400 mb-3">Data Download Process</h3>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
              <li>Call Central Data API to get all Series list</li>
              <li>For each Series, call Series State API to get detailed state</li>
              <li>Save raw data to data/lol/series.json and states.json</li>
              <li>Extract player-team relationships from state data to build hierarchy</li>
            </ol>
          </div>
          <div className="glass-card rounded-xl p-4">
            <h3 className="font-bold text-pink-400 mb-3">Local Data Files</h3>
            <ul className="text-sm text-slate-300 space-y-2">
              <li><code className="bg-slate-700 px-1 rounded">data/lol/series.json</code> - Series list (1.69 MB, 1,632 series)</li>
              <li><code className="bg-slate-700 px-1 rounded">data/lol/states.json</code> - State data (111.9 MB, 1,488 series)</li>
              <li><code className="bg-slate-700 px-1 rounded">data/lol/index.json</code> - Index file (358 KB)</li>
            </ul>
          </div>
        </div>

        {/* LOL Extended Fields - Complete List */}
        <div className="mt-6 glass-card rounded-xl p-4">
          <h3 className="font-bold text-yellow-400 mb-3">LOL-Specific Extension Fields (GameTeamStateLol / GamePlayerStateLol) - Complete List</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="text-slate-400 mb-2">Team Level (GameTeamStateLol) - 17 extension fields</h4>
              <ul className="text-slate-300 space-y-1">
                <li><code className="text-green-400">damageDealt</code> - Total damage dealt (int)</li>
                <li><code className="text-green-400">damageTaken</code> - Total damage taken (int)</li>
                <li><code className="text-green-400">damagePerMinute</code> - Damage per minute (float)</li>
                <li><code className="text-green-400">damagePerMoney</code> - Damage per gold efficiency (float)</li>
                <li><code className="text-green-400">visionScore</code> - Vision score (float)</li>
                <li><code className="text-green-400">visionScorePerMinute</code> - Vision score per minute (float)</li>
                <li><code className="text-green-400">experiencePoints</code> - Total experience (int)</li>
                <li><code className="text-green-400">baronPowerPlays</code> - Baron power play data (array)</li>
                <li><code className="text-green-400">moneyDifference</code> - Gold difference (int)</li>
                <li><code className="text-green-400">moneyPerMinute</code> - Gold per minute (float)</li>
                <li><code className="text-green-400">totalMoneyEarned</code> - Total gold earned (int)</li>
                <li><code className="text-green-400">majorMoneyLead</code> - Maximum gold lead (float)</li>
                <li><code className="text-green-400">majorMoneyDeficit</code> - Maximum gold deficit (float)</li>
                <li><code className="text-green-400">forwardPercentage</code> - Forward percentage (float)</li>
                <li><code className="text-green-400">kdaRatio</code> - Team KDA ratio (float)</li>
                <li><code className="text-green-400">killsAndAssists</code> - Kills + assists (float)</li>
                <li><code className="text-green-400">firstKill</code> - First blood (boolean)</li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-400 mb-2">Player Level (GamePlayerStateLol) - 19 extension fields</h4>
              <ul className="text-slate-300 space-y-1">
                <li><code className="text-green-400">damageDealt</code> - Damage dealt (int)</li>
                <li><code className="text-green-400">damageTaken</code> - Damage taken (int)</li>
                <li><code className="text-green-400">damagePercentage</code> - Damage share (float)</li>
                <li><code className="text-green-400">damagePerMinute</code> - Damage per minute (float)</li>
                <li><code className="text-green-400">damagePerMoney</code> - Damage per gold efficiency (float)</li>
                <li><code className="text-green-400">visionScore</code> - Vision score (float)</li>
                <li><code className="text-green-400">visionScorePerMinute</code> - Vision score per minute (float)</li>
                <li><code className="text-green-400">kdaRatio</code> - KDA ratio (float)</li>
                <li><code className="text-green-400">killParticipation</code> - Kill participation (float)</li>
                <li><code className="text-green-400">killsAndAssists</code> - Kills + assists (float)</li>
                <li><code className="text-green-400">experiencePoints</code> - Experience points (int)</li>
                <li><code className="text-green-400">moneyPercentage</code> - Gold share (float)</li>
                <li><code className="text-green-400">moneyPerMinute</code> - Gold per minute (float)</li>
                <li><code className="text-green-400">totalMoneyEarned</code> - Total gold earned (int)</li>
                <li><code className="text-green-400">forwardPercentage</code> - Forward percentage (float)</li>
                <li><code className="text-green-400">alive</code> - Alive status (boolean)</li>
                <li><code className="text-green-400">currentHealth/maxHealth</code> - Current/max health (int)</li>
                <li><code className="text-green-400">currentArmor</code> - Current armor (int)</li>
                <li><code className="text-green-400">respawnClock</code> - Respawn countdown (ClockState)</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">* These fields require API version 3.23+. Older match data may not have them. Use GraphQL fragment: <code className="text-slate-400">... on GameTeamStateLol</code></p>
        </div>

        {/* Additional API Fields */}
        <div className="mt-6 glass-card rounded-xl p-4">
          <h3 className="font-bold text-orange-400 mb-3">Other Available API Fields (Currently Not Downloaded)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="text-slate-400 mb-2">SeriesState Extensions</h4>
              <ul className="text-slate-300 space-y-1">
                <li><code className="text-orange-400">version</code> - API version number</li>
                <li><code className="text-orange-400">title</code> - Game title info</li>
                <li><code className="text-orange-400">forfeited</code> - Forfeit status</li>
                <li><code className="text-orange-400">duration</code> - Match duration</li>
                <li><code className="text-orange-400">draftActions</code> - Series draft</li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-400 mb-2">GameState Extensions</h4>
              <ul className="text-slate-300 space-y-1">
                <li><code className="text-orange-400">titleVersion</code> - Game version</li>
                <li><code className="text-orange-400">type</code> - Match type</li>
                <li><code className="text-orange-400">startedAt</code> - Start time</li>
                <li><code className="text-orange-400">duration</code> - Game duration</li>
                <li><code className="text-orange-400">structures</code> - Structure status</li>
                <li><code className="text-orange-400">nonPlayerCharacters</code> - NPC status</li>
                <li><code className="text-orange-400">segments</code> - Match phases</li>
                <li><code className="text-orange-400">externalLinks</code> - External links</li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-400 mb-2">Player Extensions</h4>
              <ul className="text-slate-300 space-y-1">
                <li><code className="text-orange-400">roles</code> - Position roles</li>
                <li><code className="text-orange-400">position</code> - Map coordinates</li>
                <li><code className="text-orange-400">abilities</code> - Ability status</li>
                <li><code className="text-orange-400">statusEffects</code> - Status effects</li>
                <li><code className="text-orange-400">unitKills</code> - Unit kills</li>
                <li><code className="text-orange-400">firstKill</code> - First blood</li>
                <li><code className="text-orange-400">structuresDestroyed</code> - Structures destroyed</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">These fields are supported by the API but not currently fetched by the download script. Can be extended as needed.</p>
        </div>
      </div>
    </div>
  );
}

function Entity({ title, subtitle, color, fields }: {
  title: string;
  subtitle: string;
  color: 'cyan' | 'pink' | 'yellow' | 'green';
  fields: { name: string; type: string; pk?: boolean; fk?: boolean }[];
}) {
  const headerColors = {
    cyan: 'bg-cyan-600',
    pink: 'bg-pink-600',
    yellow: 'bg-yellow-600',
    green: 'bg-green-600',
  };

  return (
    <div className="bg-gray-700 rounded-lg overflow-hidden w-56 shadow-lg">
      <div className={`${headerColors[color]} px-3 py-2 text-center`}>
        <div className="font-bold">{title}</div>
        <div className="text-xs opacity-80">{subtitle}</div>
      </div>
      <div className="p-2 text-sm">
        {fields.map((field, i) => (
          <div key={i} className="flex items-center gap-2 py-1 border-b border-gray-600 last:border-0">
            {field.pk && <span className="text-cyan-400 text-xs font-bold">PK</span>}
            {field.fk && <span className="text-pink-400 text-xs font-bold">FK</span>}
            {!field.pk && !field.fk && <span className="w-5"></span>}
            <span className="text-gray-200">{field.name}</span>
            <span className="text-gray-500 text-xs ml-auto">{field.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-gray-400 text-xs mb-1">{label}</span>
      <div className="w-12 h-0.5 bg-gray-500 relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 border-l-8 border-l-gray-500 border-y-4 border-y-transparent"></div>
      </div>
    </div>
  );
}
