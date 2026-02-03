import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'grid_v2');
    const countFile = path.join(dataDir, 'count.json');

    if (!fs.existsSync(countFile)) {
      return NextResponse.json({ success: false, error: 'count.json not found' }, { status: 404 });
    }

    const countData = JSON.parse(fs.readFileSync(countFile, 'utf-8'));

    return NextResponse.json({ success: true, data: countData });
  } catch (error) {
    console.error('Error reading count data:', error);
    return NextResponse.json({ success: false, error: 'Failed to read count data' }, { status: 500 });
  }
}
