'use client';

export default function ERDPage() {
  return (
    <div className="min-h-screen bg-gray-900 p-4 text-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <a href="/" className="text-blue-400 hover:text-blue-300">
            ← Home
          </a>
          <h1 className="text-2xl font-bold">LOL Esports Data - Entity Relationship Diagram</h1>
          <div></div>
        </div>

        {/* Data Source Info */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-cyan-400 mb-2">数据来源: Grid Esports API</h2>
          <div className="text-sm text-gray-300 space-y-1">
            <p>• <strong>Central Data API:</strong> https://api-op.grid.gg/central-data/graphql</p>
            <p>• <strong>数据结构:</strong> 层级数据 (Region → League → Team → Player)</p>
            <p>• <strong>清洗后数据:</strong> 5,804名选手 | 56支战队 | 93个联赛（已移除测试账号和重复数据）</p>
            <p>• <strong>更新时间:</strong> 2026-01-24</p>
          </div>
        </div>

        {/* ERD Diagram */}
        <div className="bg-gray-800 rounded-lg p-6 overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Title */}
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-cyan-400">层级数据结构 (Hierarchy Data Structure)</h2>
              <p className="text-sm text-gray-400 mt-2">Region → League → Team → Player</p>
            </div>

            {/* Main Hierarchy */}
            <div className="flex justify-center gap-8 mb-8">
              {/* Stats */}
              <Entity
                title="Stats"
                subtitle="全局统计"
                color="purple"
                fields={[
                  { name: 'totalRegions', type: 'int' },
                  { name: 'totalLeagues', type: 'int' },
                  { name: 'totalTeams', type: 'int' },
                  { name: 'totalPlayers', type: 'int' },
                ]}
              />
            </div>

            <div className="flex justify-center mb-4">
              <div className="w-px h-8 bg-gray-500"></div>
            </div>

            {/* Hierarchy Flow */}
            <div className="flex justify-center gap-8 mb-8">
              {/* Region */}
              <Entity
                title="Region"
                subtitle="赛区"
                color="cyan"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'name', type: 'string' },
                  { name: 'shortName', type: 'string' },
                  { name: 'leagues', type: 'Map<League>' },
                  { name: 'stats', type: 'RegionStats' },
                ]}
              />
              <Arrow label="1:N" />
              {/* League */}
              <Entity
                title="League"
                subtitle="联赛"
                color="cyan"
                fields={[
                  { name: 'name', type: 'string', pk: true },
                  { name: 'split', type: 'string' },
                  { name: 'teams', type: 'string[]', fk: true },
                  { name: 'tournaments', type: 'Map' },
                ]}
              />
              <Arrow label="N:M" />
              {/* Team */}
              <Entity
                title="Team"
                subtitle="战队"
                color="yellow"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'name', type: 'string' },
                  { name: 'players', type: 'Map<Player>' },
                  { name: 'leagues', type: 'string[]', fk: true },
                  { name: 'seriesCount', type: 'int' },
                ]}
              />
              <Arrow label="1:N" />
              {/* Player */}
              <Entity
                title="Player"
                subtitle="选手"
                color="green"
                fields={[
                  { name: 'id', type: 'string', pk: true },
                  { name: 'name', type: 'string' },
                  { name: 'teams', type: 'string[]', fk: true },
                  { name: 'seriesCount', type: 'int' },
                ]}
              />
            </div>

            {/* Sub-entities */}
            <div className="flex justify-center gap-8 mt-8">
              {/* RegionStats */}
              <Entity
                title="RegionStats"
                subtitle="赛区统计"
                color="purple"
                fields={[
                  { name: 'players', type: 'int' },
                  { name: 'teams', type: 'int' },
                  { name: 'leagues', type: 'int' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold mb-3">图例</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold">PK</span>
              <span className="text-gray-300">Primary Key (主键)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-pink-400 font-bold">FK</span>
              <span className="text-gray-300">Foreign Key (外键)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">1:N</span>
              <span className="text-gray-300">一对多关系</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">N:M</span>
              <span className="text-gray-300">多对多关系</span>
            </div>
          </div>
        </div>

        {/* Data Structure Details */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-bold text-cyan-400 mb-3">数据获取流程</h3>
            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>调用 Central Data API 获取所有 Players 数据</li>
              <li>调用 Central Data API 获取所有 Teams 数据</li>
              <li>调用 Central Data API 获取所有 Tournaments 数据</li>
              <li>构建 Region → League → Team → Player 层级关系</li>
              <li>生成统计数据并保存到 hierarchy.json</li>
            </ol>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-bold text-yellow-400 mb-3">本地数据文件</h3>
            <ul className="text-sm text-gray-300 space-y-2">
              <li><code className="bg-gray-700 px-1 rounded">data/lol/hierarchy.json</code> - 层级数据 (1.3 MB)</li>
              <li><code className="bg-gray-700 px-1 rounded">data/lol/index.json</code> - 战队索引 (1.2 MB)</li>
              <li><code className="bg-gray-700 px-1 rounded">data/lol/series.json</code> - 比赛数据 (1.7 MB)</li>
            </ul>
          </div>
        </div>

        {/* Data Statistics */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-purple-400 mb-3">数据统计详情</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400">7</div>
              <div className="text-gray-400 mt-1">赛区 (Regions)</div>
              <div className="text-xs text-gray-500 mt-1">LPL, LCK, LEC, LCS, LTA等</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400">93</div>
              <div className="text-gray-400 mt-1">联赛 (Leagues)</div>
              <div className="text-xs text-gray-500 mt-1">有战队的活跃联赛</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400">56</div>
              <div className="text-gray-400 mt-1">战队 (Teams)</div>
              <div className="text-xs text-gray-500 mt-1">有选手的活跃战队</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400">5,804</div>
              <div className="text-gray-400 mt-1">选手 (Players)</div>
              <div className="text-xs text-gray-500 mt-1">清洗后的有效选手</div>
            </div>
          </div>
        </div>

        {/* API Endpoints */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-orange-400 mb-3">API 端点</h3>
          <div className="text-sm text-gray-300 space-y-2">
            <div>
              <code className="bg-gray-700 px-2 py-1 rounded">GET /api/lol/hierarchy?type=summary</code>
              <span className="ml-2 text-gray-400">- 获取全局统计</span>
            </div>
            <div>
              <code className="bg-gray-700 px-2 py-1 rounded">GET /api/lol/hierarchy?type=regions</code>
              <span className="ml-2 text-gray-400">- 获取所有赛区列表</span>
            </div>
            <div>
              <code className="bg-gray-700 px-2 py-1 rounded">GET /api/lol/hierarchy?type=region&region=LPL</code>
              <span className="ml-2 text-gray-400">- 获取指定赛区的联赛</span>
            </div>
            <div>
              <code className="bg-gray-700 px-2 py-1 rounded">GET /api/lol/hierarchy?type=tournament&tournament=...</code>
              <span className="ml-2 text-gray-400">- 获取指定联赛的战队</span>
            </div>
            <div>
              <code className="bg-gray-700 px-2 py-1 rounded">GET /api/lol/hierarchy?type=team&team=123</code>
              <span className="ml-2 text-gray-400">- 获取指定战队的选手</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Entity({ title, subtitle, color, fields }: {
  title: string;
  subtitle: string;
  color: 'cyan' | 'pink' | 'yellow' | 'green' | 'purple';
  fields: { name: string; type: string; pk?: boolean; fk?: boolean }[];
}) {
  const headerColors = {
    cyan: 'bg-cyan-600',
    pink: 'bg-pink-600',
    yellow: 'bg-yellow-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
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
