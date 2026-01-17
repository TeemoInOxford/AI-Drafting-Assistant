import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 数据目录
const DATA_DIR = path.join(process.cwd(), 'scripts/grid-data-fetcher/data');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary';
  const regionCode = searchParams.get('region');
  const tournamentId = searchParams.get('tournament');
  const teamId = searchParams.get('team');

  try {
    switch (type) {
      case 'summary': {
        // 返回摘要数据
        const summaryPath = path.join(DATA_DIR, 'lol_hierarchy_summary.json');
        if (!fs.existsSync(summaryPath)) {
          return NextResponse.json({ error: 'Summary data not found' }, { status: 404 });
        }
        const data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        return NextResponse.json({ success: true, ...data });
      }

      case 'regions': {
        // 返回所有赛区列表
        const hierarchyPath = path.join(DATA_DIR, 'lol_hierarchy.json');
        if (!fs.existsSync(hierarchyPath)) {
          return NextResponse.json({ error: 'Hierarchy data not found' }, { status: 404 });
        }
        const data = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));
        const regions = data.map((r: any) => ({
          code: r.code,
          name: r.name,
          fullName: r.fullName,
          country: r.country,
          tournamentCount: r.tournamentCount,
          teamCount: r.teamCount,
          playerCount: r.playerCount
        }));
        return NextResponse.json({ success: true, regions });
      }

      case 'region': {
        // 返回指定赛区的联赛列表
        if (!regionCode) {
          return NextResponse.json({ error: 'region parameter is required' }, { status: 400 });
        }
        const hierarchyPath = path.join(DATA_DIR, 'lol_hierarchy.json');
        if (!fs.existsSync(hierarchyPath)) {
          return NextResponse.json({ error: 'Hierarchy data not found' }, { status: 404 });
        }
        const data = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));
        const region = data.find((r: any) => r.code === regionCode);
        if (!region) {
          return NextResponse.json({ error: 'Region not found' }, { status: 404 });
        }
        // 返回联赛列表（不包含战队详情以减少数据量）
        const tournaments = region.tournaments.map((t: any) => ({
          id: t.id,
          name: t.name,
          nameShortened: t.nameShortened,
          startDate: t.startDate,
          endDate: t.endDate,
          teamCount: t.teamCount
        }));
        return NextResponse.json({
          success: true,
          region: {
            code: region.code,
            name: region.name,
            fullName: region.fullName,
            country: region.country
          },
          tournaments
        });
      }

      case 'tournament': {
        // 返回指定联赛的战队列表
        if (!tournamentId) {
          return NextResponse.json({ error: 'tournament parameter is required' }, { status: 400 });
        }
        const hierarchyPath = path.join(DATA_DIR, 'lol_hierarchy.json');
        if (!fs.existsSync(hierarchyPath)) {
          return NextResponse.json({ error: 'Hierarchy data not found' }, { status: 404 });
        }
        const data = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));

        // 在所有赛区中查找联赛
        let tournament = null;
        let regionInfo = null;
        for (const region of data) {
          const found = region.tournaments.find((t: any) => t.id === tournamentId);
          if (found) {
            tournament = found;
            regionInfo = {
              code: region.code,
              name: region.name
            };
            break;
          }
        }

        if (!tournament) {
          return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          region: regionInfo,
          tournament: {
            id: tournament.id,
            name: tournament.name,
            nameShortened: tournament.nameShortened,
            startDate: tournament.startDate,
            endDate: tournament.endDate
          },
          teams: tournament.teams.map((t: any) => ({
            id: t.id,
            name: t.name,
            nameShortened: t.nameShortened,
            logoUrl: t.logoUrl,
            organization: t.organization,
            playerCount: t.players?.length || 0
          }))
        });
      }

      case 'team': {
        // 返回指定战队的选手列表
        if (!teamId) {
          return NextResponse.json({ error: 'team parameter is required' }, { status: 400 });
        }

        // 从所有战队数据中查找
        const allTeamsPath = path.join(DATA_DIR, 'lol_all_teams.json');
        if (!fs.existsSync(allTeamsPath)) {
          return NextResponse.json({ error: 'Teams data not found' }, { status: 404 });
        }
        const allTeams = JSON.parse(fs.readFileSync(allTeamsPath, 'utf-8'));
        const team = allTeams.find((t: any) => t.id === teamId);

        if (!team) {
          return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          team: {
            id: team.id,
            name: team.name,
            nameShortened: team.nameShortened,
            logoUrl: team.logoUrl,
            organization: team.organization,
            region: team.region
          },
          players: team.players,
          tournaments: team.tournaments
        });
      }

      case 'all-teams': {
        // 返回所有有选手的战队
        const allTeamsPath = path.join(DATA_DIR, 'lol_all_teams.json');
        if (!fs.existsSync(allTeamsPath)) {
          return NextResponse.json({ error: 'Teams data not found' }, { status: 404 });
        }
        const allTeams = JSON.parse(fs.readFileSync(allTeamsPath, 'utf-8'));

        // 只返回有选手的战队
        const teamsWithPlayers = allTeams
          .filter((t: any) => t.playerCount > 0)
          .map((t: any) => ({
            id: t.id,
            name: t.name,
            nameShortened: t.nameShortened,
            logoUrl: t.logoUrl,
            organization: t.organization,
            region: t.region,
            playerCount: t.playerCount,
            players: t.players
          }));

        return NextResponse.json({
          success: true,
          teams: teamsWithPlayers,
          total: teamsWithPlayers.length
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Hierarchy API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
