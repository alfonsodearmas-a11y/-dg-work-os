import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const HIGHLIGHTS_PATH = path.join(process.cwd(), 'scraper', 'output', 'oversight-highlights-latest.json');

export async function GET() {
  try {
    if (!fs.existsSync(HIGHLIGHTS_PATH)) {
      return NextResponse.json(
        { success: false, error: 'No scrape data found. Run the scraper first.' },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(HIGHLIGHTS_PATH, 'utf-8');
    const data = JSON.parse(raw);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
