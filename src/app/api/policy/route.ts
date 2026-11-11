import { cookies } from "next/headers";
import { readPolicy } from "@/lib/chain";
import { json } from "@/lib/http";
import { isPaused, setPaused } from "@/lib/store";

export async function GET() {
  const policy = await readPolicy();
  if (isPaused()) policy.paused = true;
  return json({ policy, deskPaused: isPaused() });
}

export async function POST(request: Request) {
  if (process.env.DEMO_OPEN_KILL_SWITCH === "0") {
    return json({ error: "The demo kill switch is closed. Set DEMO_OPEN_KILL_SWITCH=1 or call set_paused on chain." }, 403);
  }
  const body = (await request.json()) as { paused?: boolean };
  const paused = Boolean(body.paused);
  setPaused(paused);
  const jar = await cookies();
  jar.set("ll_paused", paused ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  const policy = await readPolicy();
  policy.paused = paused || policy.paused;
  return json({ policy, deskPaused: isPaused() });
}
