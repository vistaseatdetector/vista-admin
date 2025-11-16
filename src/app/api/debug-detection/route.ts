import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL;

  if (!DETECTION_SERVICE_URL) {
    return NextResponse.json(
      { ok: false, message: "DETECTION_SERVICE_URL is not set" },
      { status: 500 }
    );
  }

  try {
    // Hit /health on your Python backend
    const res = await fetch(`${DETECTION_SERVICE_URL}/health`, {
      method: "GET",
    });

    const bodyText = await res.text();

    return NextResponse.json({
      ok: true,
      detectionServiceUrl: DETECTION_SERVICE_URL,
      detectionStatus: res.status,
      detectionStatusText: res.statusText,
      detectionBody: bodyText,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        detectionServiceUrl: DETECTION_SERVICE_URL,
        error: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}
