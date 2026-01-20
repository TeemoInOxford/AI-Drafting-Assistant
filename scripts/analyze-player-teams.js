const states = require('../data/lol/states.json');

// Build player-team relationships from actual match data
const playerTeams = {}; // playerId -> { name, teams: { teamId: { name, count } } }
const teamPlayers = {}; // teamId -> { name, players: { playerId: { name, count } } }

Object.values(states).forEach(state => {
  state.teams?.forEach(team => {
    if (!teamPlayers[team.id]) {
      teamPlayers[team.id] = { name: team.name, players: {} };
    }
    team.players?.forEach(player => {
      // Track player -> team
      if (!playerTeams[player.id]) {
        playerTeams[player.id] = { name: player.name, teams: {} };
      }
      if (!playerTeams[player.id].teams[team.id]) {
        playerTeams[player.id].teams[team.id] = { name: team.name, count: 0 };
      }
      playerTeams[player.id].teams[team.id].count++;

      // Track team -> player
      if (!teamPlayers[team.id].players[player.id]) {
        teamPlayers[team.id].players[player.id] = { name: player.name, count: 0 };
      }
      teamPlayers[team.id].players[player.id].count++;
    });
  });
});

// Find players who played for multiple teams
console.log('=== 多队效力选手 (前10) ===');
Object.entries(playerTeams)
  .filter(([id, p]) => Object.keys(p.teams).length > 1)
  .slice(0, 10)
  .forEach(([id, p]) => {
    console.log(`${p.name} (${id}): ${Object.values(p.teams).map(t => t.name).join(', ')}`);
  });

// Check TT's actual players
console.log('\n=== THUNDERTALKGAMING 实际参赛选手 ===');
const ttTeam = Object.entries(teamPlayers).find(([id, t]) => t.name.includes('THUNDER'));
if (ttTeam) {
  const [teamId, team] = ttTeam;
  console.log('Team ID:', teamId);
  Object.entries(team.players).forEach(([pid, p]) => {
    console.log(`  ${p.name} (${pid}): ${p.count}场`);
  });
}

// Check FPX's actual players
console.log('\n=== FunPlus Phoenix 实际参赛选手 ===');
const fpxTeam = Object.entries(teamPlayers).find(([id, t]) => t.name.includes('FunPlus'));
if (fpxTeam) {
  const [teamId, team] = fpxTeam;
  console.log('Team ID:', teamId);
  Object.entries(team.players).forEach(([pid, p]) => {
    console.log(`  ${p.name} (${pid}): ${p.count}场`);
  });
}

// Summary
console.log('\n=== 总结 ===');
console.log('总选手数:', Object.keys(playerTeams).length);
console.log('总战队数:', Object.keys(teamPlayers).length);
console.log('多队效力选手数:', Object.entries(playerTeams).filter(([id, p]) => Object.keys(p.teams).length > 1).length);
