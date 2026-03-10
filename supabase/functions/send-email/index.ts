import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Process queued emails (batch of 10)
    const { data: emails, error } = await supabaseAdmin
      .from("email_queue")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) throw error;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const email of emails) {
      try {
        // Send via Resend API
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: Deno.env.get("EMAIL_FROM") || "Miamz <noreply@miamz.ch>",
              to: email.to_email,
              subject: email.subject,
              html: email.body_html || undefined,
              text: email.body_text || email.body || undefined,
            }),
          });

          if (!resendResponse.ok) {
            const errorBody = await resendResponse.text();
            throw new Error(`Resend API error: ${resendResponse.status} - ${errorBody}`);
          }
        } else {
          console.log(`[Email] (No RESEND_API_KEY) To: ${email.to_email}, Subject: ${email.subject}`);
        }

        // Mark as sent
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", email.id);

        processed++;
      } catch (emailError: unknown) {
        const errMsg = emailError instanceof Error ? emailError.message : "Unknown error";
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "failed", error: errMsg })
          .eq("id", email.id);
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("send-email error:", error);
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
