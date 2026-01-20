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
            <p>• <strong>Series State API:</strong> https://api-op.grid.gg/live-data-feed/series-state/graphql</p>
            <p>• <strong>数据完全从API下载:</strong> 所有数据均原样保存，未做任何修改</p>
            <p>• <strong>API总数据量:</strong> 1632场LOL比赛 | <strong>已下载:</strong> 1632场比赛 + 1488场状态数据 (100%)</p>
          </div>
        </div>

        {/* ERD Diagram */}
        <div className="bg-gray-800 rounded-lg p-6 overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Row 1: Hierarchy Data */}
            <div className="mb-4 text-center">
              <span className="bg-cyan-600 text-white px-3 py-1 rounded text-sm">层级数据 (Central Data API)</span>
            </div>
            <div className="flex justify-center gap-8 mb-8">
              {/* Region */}
              <Entity
                title="Region"
                subtitle="赛区"
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
                subtitle="联赛"
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
                subtitle="战队"
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
                subtitle="选手"
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
              <span className="bg-pink-600 text-white px-3 py-1 rounded text-sm">比赛数据 (Central Data API + Series State API)</span>
            </div>
            <div className="flex justify-center gap-8 mb-8">
              {/* Series */}
              <Entity
                title="Series"
                subtitle="系列赛"
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
                subtitle="系列赛状态"
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
                subtitle="系列赛战队统计"
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
                subtitle="单局游戏"
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
                subtitle="单局战队统计"
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
                subtitle="BP动作"
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
                subtitle="单局选手统计"
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
            <div className="flex items-center gap-2">
              <span className="text-gray-400">1:1</span>
              <span className="text-gray-300">一对一关系</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">*</span>
              <span className="text-gray-300">LOL专属扩展字段 (需API版本3.23+)</span>
            </div>
          </div>
        </div>

        {/* Data Flow */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-bold text-cyan-400 mb-3">数据下载流程</h3>
            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>调用 Central Data API 获取所有 Series 列表</li>
              <li>对每个 Series 调用 Series State API 获取详细状态</li>
              <li>原样保存到 data/lol/series.json 和 states.json</li>
              <li>从状态数据中提取选手-战队关系构建层级</li>
            </ol>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-bold text-pink-400 mb-3">本地数据文件</h3>
            <ul className="text-sm text-gray-300 space-y-2">
              <li><code className="bg-gray-700 px-1 rounded">data/lol/series.json</code> - 比赛列表 (1.69 MB, 1632场)</li>
              <li><code className="bg-gray-700 px-1 rounded">data/lol/states.json</code> - 状态数据 (111.9 MB, 1488场)</li>
              <li><code className="bg-gray-700 px-1 rounded">data/lol/index.json</code> - 索引文件 (358 KB)</li>
            </ul>
          </div>
        </div>

        {/* LOL Extended Fields - Complete List */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-yellow-400 mb-3">LOL专属扩展字段 (GameTeamStateLol / GamePlayerStateLol) - 完整列表</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="text-gray-400 mb-2">战队级别 (GameTeamStateLol) - 17个扩展字段</h4>
              <ul className="text-gray-300 space-y-1">
                <li><code className="text-green-400">damageDealt</code> - 总伤害输出 (int)</li>
                <li><code className="text-green-400">damageTaken</code> - 总承受伤害 (int)</li>
                <li><code className="text-green-400">damagePerMinute</code> - 每分钟伤害 (float)</li>
                <li><code className="text-green-400">damagePerMoney</code> - 每金币伤害效率 (float)</li>
                <li><code className="text-green-400">visionScore</code> - 视野得分 (float)</li>
                <li><code className="text-green-400">visionScorePerMinute</code> - 每分钟视野得分 (float)</li>
                <li><code className="text-green-400">experiencePoints</code> - 总经验值 (int)</li>
                <li><code className="text-green-400">baronPowerPlays</code> - 大龙强势期数据 (array)</li>
                <li><code className="text-green-400">moneyDifference</code> - 经济差 (int)</li>
                <li><code className="text-green-400">moneyPerMinute</code> - 每分钟经济 (float)</li>
                <li><code className="text-green-400">totalMoneyEarned</code> - 总获得金币 (int)</li>
                <li><code className="text-green-400">majorMoneyLead</code> - 最大经济领先 (float)</li>
                <li><code className="text-green-400">majorMoneyDeficit</code> - 最大经济落后 (float)</li>
                <li><code className="text-green-400">forwardPercentage</code> - 前压比例 (float)</li>
                <li><code className="text-green-400">kdaRatio</code> - 团队KDA比率 (float)</li>
                <li><code className="text-green-400">killsAndAssists</code> - 击杀+助攻数 (float)</li>
                <li><code className="text-green-400">firstKill</code> - 是否一血 (boolean)</li>
              </ul>
            </div>
            <div>
              <h4 className="text-gray-400 mb-2">选手级别 (GamePlayerStateLol) - 19个扩展字段</h4>
              <ul className="text-gray-300 space-y-1">
                <li><code className="text-green-400">damageDealt</code> - 伤害输出 (int)</li>
                <li><code className="text-green-400">damageTaken</code> - 承受伤害 (int)</li>
                <li><code className="text-green-400">damagePercentage</code> - 伤害占比 (float)</li>
                <li><code className="text-green-400">damagePerMinute</code> - 每分钟伤害 (float)</li>
                <li><code className="text-green-400">damagePerMoney</code> - 每金币伤害效率 (float)</li>
                <li><code className="text-green-400">visionScore</code> - 视野得分 (float)</li>
                <li><code className="text-green-400">visionScorePerMinute</code> - 每分钟视野得分 (float)</li>
                <li><code className="text-green-400">kdaRatio</code> - KDA比率 (float)</li>
                <li><code className="text-green-400">killParticipation</code> - 参战率 (float)</li>
                <li><code className="text-green-400">killsAndAssists</code> - 击杀+助攻数 (float)</li>
                <li><code className="text-green-400">experiencePoints</code> - 经验值 (int)</li>
                <li><code className="text-green-400">moneyPercentage</code> - 经济占比 (float)</li>
                <li><code className="text-green-400">moneyPerMinute</code> - 每分钟经济 (float)</li>
                <li><code className="text-green-400">totalMoneyEarned</code> - 总获得金币 (int)</li>
                <li><code className="text-green-400">forwardPercentage</code> - 前压比例 (float)</li>
                <li><code className="text-green-400">alive</code> - 存活状态 (boolean)</li>
                <li><code className="text-green-400">currentHealth/maxHealth</code> - 当前/最大生命值 (int)</li>
                <li><code className="text-green-400">currentArmor</code> - 当前护甲 (int)</li>
                <li><code className="text-green-400">respawnClock</code> - 复活倒计时 (ClockState)</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">* 这些字段需要API版本3.23+，较旧的比赛数据可能没有。使用 GraphQL fragment: <code className="text-gray-400">... on GameTeamStateLol</code></p>
        </div>

        {/* Additional API Fields */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-orange-400 mb-3">其他可用API字段 (当前未下载)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="text-gray-400 mb-2">SeriesState 扩展</h4>
              <ul className="text-gray-300 space-y-1">
                <li><code className="text-orange-400">version</code> - API版本号</li>
                <li><code className="text-orange-400">title</code> - 游戏标题信息</li>
                <li><code className="text-orange-400">forfeited</code> - 是否弃权</li>
                <li><code className="text-orange-400">duration</code> - 比赛时长</li>
                <li><code className="text-orange-400">draftActions</code> - 系列赛BP</li>
              </ul>
            </div>
            <div>
              <h4 className="text-gray-400 mb-2">GameState 扩展</h4>
              <ul className="text-gray-300 space-y-1">
                <li><code className="text-orange-400">titleVersion</code> - 游戏版本</li>
                <li><code className="text-orange-400">type</code> - 比赛类型</li>
                <li><code className="text-orange-400">startedAt</code> - 开始时间</li>
                <li><code className="text-orange-400">duration</code> - 单局时长</li>
                <li><code className="text-orange-400">structures</code> - 建筑状态</li>
                <li><code className="text-orange-400">nonPlayerCharacters</code> - NPC状态</li>
                <li><code className="text-orange-400">segments</code> - 比赛阶段</li>
                <li><code className="text-orange-400">externalLinks</code> - 外部链接</li>
              </ul>
            </div>
            <div>
              <h4 className="text-gray-400 mb-2">Player 扩展</h4>
              <ul className="text-gray-300 space-y-1">
                <li><code className="text-orange-400">roles</code> - 位置角色</li>
                <li><code className="text-orange-400">position</code> - 地图坐标</li>
                <li><code className="text-orange-400">abilities</code> - 技能状态</li>
                <li><code className="text-orange-400">statusEffects</code> - 状态效果</li>
                <li><code className="text-orange-400">unitKills</code> - 单位击杀</li>
                <li><code className="text-orange-400">firstKill</code> - 是否一血</li>
                <li><code className="text-orange-400">structuresDestroyed</code> - 拆塔数</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">这些字段API支持但当前下载脚本未获取，可根据需要扩展下载</p>
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
