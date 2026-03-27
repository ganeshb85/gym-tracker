// Supabase Edge Function: weekly-notify
// Deploy:   supabase functions deploy weekly-notify
// Schedule: Sunday 13:00 UTC = 21:00 MYT
// Set in Supabase Dashboard > Edge Functions > Schedules: 0 13 * * 0

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL  = Deno.env.get("SUPABASE_URL")!;
const SB_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@gymlog.app";
const V_PUB   = Deno.env.get("VAPID_PUBLIC_KEY")!;
const V_PRIV  = Deno.env.get("VAPID_PRIVATE_KEY")!;

serve(async () => {
  const sb = createClient(SB_URL, SB_KEY);

  const { data: settings } = await sb
    .from("user_settings").select("push_subscription").eq("id", 1).single();

  if (!settings?.push_subscription)
    return json({ ok: false, reason: "no subscription" });

  // Week range (Mon–Sun)
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mon.setHours(0,0,0,0);

  const { data: sessions } = await sb
    .from("workout_sessions")
    .select("workout_type, kcal_burned")
    .gte("session_date", mon.toISOString().split("T")[0]);

  const count = sessions?.length ?? 0;
  const kcal  = Math.round(sessions?.reduce((a,s) => a + (s.kcal_burned ?? 0), 0) ?? 0);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const weekStr = `${mon.getDate()}-${MONTHS[mon.getMonth()]}-${mon.getFullYear()}`;

  const title = "GymLog · Weekly recap";
  const body  = count > 0
    ? `Week of ${weekStr}: ${count} session${count>1?"s":""} · ${kcal} kcal. Tap to export to Obsidian.`
    : `Week of ${weekStr}: No sessions logged. Fresh start next week!`;

  const sub = JSON.parse(settings.push_subscription);
  const res = await sendPush(sub, { title, body }, V_PUB, V_PRIV, SUBJECT);

  return json({ ok: true, push_status: res.status, sessions: count, kcal });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" }
  });
}

async function sendPush(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: object,
  pubKey: string, privKey: string, subject: string
) {
  const { endpoint } = sub;
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const token = await makeVapidJwt(audience, now + 43200, subject, pubKey, privKey);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${pubKey}`,
      "Content-Type": "application/json",
      TTL: "86400",
    },
    body: JSON.stringify(payload),
  });
}

async function makeVapidJwt(aud: string, exp: number, sub: string, pub: string, priv: string) {
  const enc = (s: string) => btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const h = enc(JSON.stringify({ typ:"JWT", alg:"ES256" }));
  const p = enc(JSON.stringify({ aud, exp, sub }));
  const privBytes = Uint8Array.from(atob(priv.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", privBytes, { name:"ECDSA", namedCurve:"P-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name:"ECDSA", hash:"SHA-256" }, key, new TextEncoder().encode(`${h}.${p}`)
  );
  return `${h}.${p}.${enc(String.fromCharCode(...new Uint8Array(sig)))}`;
}
