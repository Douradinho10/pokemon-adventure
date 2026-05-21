import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    // Log full payload on server logs so we can inspect deploy logs (Vercel)
    console.error("[ClientErrorLogger]", JSON.stringify(payload, null, 2))
  } catch (e) {
    console.error("[ClientErrorLogger] failed to parse payload", e)
  }

  return NextResponse.json({ ok: true })
}
