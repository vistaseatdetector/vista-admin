import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "PDF export is disabled. Install @react-pdf/renderer and implement this route to enable downloads.",
    },
    { status: 501 }
  );
}
