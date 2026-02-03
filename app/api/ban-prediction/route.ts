import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getNextBanPrediction, BanPredictionInput } from '@/app/lib/ban-prediction';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('team_id');
    const side = searchParams.get('side') as 'blue' | 'red' | null;
    const banSlotStr = searchParams.get('ban_slot');
    // Treat empty string as undefined
    const opponentLastBanRaw = searchParams.get('opponent_last_ban');
    const opponentLastBan = opponentLastBanRaw && opponentLastBanRaw.trim() ? opponentLastBanRaw.trim() : undefined;
    const alreadyBannedStr = searchParams.get('already_banned');

    // Validate required params - return success:false instead of 400 for missing params
    if (!teamId) {
      return NextResponse.json({
        success: false,
        error: 'team_id is required',
        predictions: [],
      });
    }

    if (!side || !['blue', 'red'].includes(side)) {
      return NextResponse.json({
        success: false,
        error: 'side must be "blue" or "red"',
        predictions: [],
      });
    }

    if (!banSlotStr) {
      return NextResponse.json({
        success: false,
        error: 'ban_slot is required',
        predictions: [],
      });
    }

    const banSlot = parseInt(banSlotStr, 10);
    if (![1, 2, 3].includes(banSlot)) {
      return NextResponse.json({
        success: false,
        error: 'ban_slot must be 1, 2, or 3',
        predictions: [],
      });
    }

    // Parse already_banned (comma-separated) - treat empty string as empty array
    const alreadyBanned = alreadyBannedStr && alreadyBannedStr.trim()
      ? alreadyBannedStr.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const input: BanPredictionInput = {
      team_id: teamId,
      side,
      ban_slot: banSlot as 1 | 2 | 3,
      opponent_last_ban: opponentLastBan,
      already_banned: alreadyBanned.length > 0 ? alreadyBanned : undefined,
    };

    const result = getNextBanPrediction(input);

    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Team not found or no data available',
        predictions: [],
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in ban-prediction API:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      predictions: [],
    });
  }
}
