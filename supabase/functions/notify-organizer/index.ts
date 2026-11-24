import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { event_id, applicant_name, experience, message } = await req.json();

    if (!event_id || !applicant_name) {
      return new Response(JSON.stringify({ error: "event_id and applicant_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supabaseクライアント（service role で主催者情報を取得）
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // イベント情報を取得
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("title, date, time, place, org, user_id")
      .eq("id", event_id)
      .single();

    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 主催者のメールアドレスを取得
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(event.user_id);

    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Organizer email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgEmail = userData.user.email;

    // メール送信（Resend API）
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "フィッシングオフ <onboarding@resend.dev>",
        to: [orgEmail],
        subject: `【フィッシングオフ】${applicant_name}さんから参加希望が届きました`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#0d9488">🎣 参加希望のお知らせ</h2>
            <p><b>${applicant_name}</b>さんがあなたの釣行に参加を希望しています。</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0">
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold;width:120px">釣行名</td><td style="padding:8px;border:1px solid #ddd">${event.title}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">日時</td><td style="padding:8px;border:1px solid #ddd">${event.date} ${event.time}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">場所</td><td style="padding:8px;border:1px solid #ddd">${event.place}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">申込者</td><td style="padding:8px;border:1px solid #ddd">${applicant_name}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">釣り経験</td><td style="padding:8px;border:1px solid #ddd">${experience || "未記入"}</td></tr>
              ${message ? `<tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">メッセージ</td><td style="padding:8px;border:1px solid #ddd">${message}</td></tr>` : ""}
            </table>
            <p><a href="https://fishing-off.vercel.app/#my" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">マイページで確認する</a></p>
            <p style="color:#888;font-size:12px;margin-top:24px">このメールはフィッシングオフから自動送信されています。</p>
          </div>
        `,
      }),
    });

    const emailData = await emailRes.json();

    if (!emailRes.ok) {
      console.error("Resend error:", emailData);
      return new Response(JSON.stringify({ error: "Email send failed", detail: emailData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
