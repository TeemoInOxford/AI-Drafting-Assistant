import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getCompositionsData, getSyncStatus } from '@/app/lib/lol-db';

// Initialize database on first request
let dbInitialized = false;

export async function GET(request: NextRequest) {
  try {
    // Initialize database if not done
    if (!dbInitialized) {
      initializeDatabase();
      dbInitialized = true;
    }

    const { searchParams } = new URL(request.url);
    const statusOnly = searchParams.get('status') === 'true';

    // Return sync status only if requested
    if (statusOnly) {
      const status = getSyncStatus();
      return NextResponse.json({
        success: true,
        status,
      });
    }

    // Get compositions data from database
    const data = getCompositionsData();

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Team Compositions API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch team compositions',
      },
      { status: 500 }
    );
  }
}
