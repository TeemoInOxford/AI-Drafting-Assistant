/**
 * /api/bp/draft-quality/summary
 *
 * Returns the bp_dashboard.json summary data.
 *
 * GET /api/bp/draft-quality/summary
 * Response: { versions, overview, summaryBySlot, compareTable, highlights }
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'grid_v2', 'bp_dashboard.json');

export async function GET() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return NextResponse.json(
        { error: 'Dashboard data not found. Run: npx tsx scripts/generate_bp_dashboard_data.ts' },
        { status: 404 }
      );
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error loading bp_dashboard.json:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 }
    );
  }
}
