import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'grid_v2');
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'global';
    const view = searchParams.get('view') || 'career'; // 'career' or 'meta'

    let filePath: string;

    // Career view (default) - no weighting
    if (view === 'career') {
      switch (type) {
        case 'by-league':
          filePath = path.join(dataDir, 'player_pool_career_by_league.json');
          break;
        case 'by-team':
          filePath = path.join(dataDir, 'player_pool_career_by_team.json');
          break;
        case 'global':
        default:
          filePath = path.join(dataDir, 'player_pool_career_global.json');
          break;
      }
    } else {
      // Meta view (experimental) - with weighting
      switch (type) {
        case 'by-league':
          filePath = path.join(dataDir, 'player_pool_by_league.json');
          break;
        case 'by-team':
          filePath = path.join(dataDir, 'player_pool_by_team.json');
          break;
        case 'global':
        default:
          filePath = path.join(dataDir, 'player_pool_global.json');
          break;
      }
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: `File not found: ${type} (${view})` },
        { status: 404 }
      );
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return NextResponse.json({ success: true, data, view });
  } catch (error) {
    console.error('Error loading player pool data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load player pool data' },
      { status: 500 }
    );
  }
}
