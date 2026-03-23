/* ================================= ============================
   supabase-client.js
   Initializes the Supabase client used by all pages.

   SETUP STEPS:
   1. Create a project at https://supabase.com
   2. Go to Project Settings → API
   3. Copy "Project URL" and paste it into SUPABASE_URL below
   4. Copy the "anon / public" key and paste it into SUPABASE_ANON_KEY below
   5. Run supabase-schema.sql in the Supabase SQL Editor to create all tables
   ============================================================= */

const SUPABASE_URL      = "https://pyahtdcrithbbsftqgxp.supabase.co";   // ← replace
const SUPABASE_ANON_KEY = "sb_publishable_NZwrAs2t-_HN2fQexiYGlQ_ucU24c7X";                   // ← replace

function getSupabaseStorageUrl(projectUrl) {
    try {
        const parsed = new URL(projectUrl);
        const parts = parsed.hostname.split(".");
        if (parts.length >= 3 && parts[1] === "supabase" && parts[2] === "co") {
            parsed.hostname = `${parts[0]}.storage.supabase.co`;
        }
        return parsed.origin;
    } catch (_) {
        return projectUrl;
    }
}

// Guard: prevent crashing pages that load this file before the SDK
if (typeof window.supabase === "undefined") {
    console.error(
        "[supabase-client] Supabase SDK not found. " +
        "Make sure the CDN <script> tag appears BEFORE this file in every HTML page."
    );
}

const supabaseClient = (typeof window.supabase !== "undefined")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

window.DAERO_SUPABASE_URL = SUPABASE_URL;
window.DAERO_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.DAERO_SUPABASE_STORAGE_URL = getSupabaseStorageUrl(SUPABASE_URL);
window.DAERO_MEDIA_UPLOADS_BUCKET = "media-uploads";
window.DAERO_MEDIA_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/*
   Quick connectivity check — visible in the browser console.
   Remove or comment this out once you have confirmed the connection works.
*/
(async function checkConnection() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from("app_settings")
            .select("key")
            .limit(1);
        if (error) throw error;
        console.log("[supabase-client] ✅ Connected to Supabase successfully.");
    } catch (err) {
        console.warn("[supabase-client] ⚠️  Could not reach Supabase:", err.message);
    }
})();
