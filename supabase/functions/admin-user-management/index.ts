import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedDurations = new Set([1, 3, 7, 30, 60, 365]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase server configuration.");
    return respond(500, { error: "Server configuration is incomplete." });
  }

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return respond(401, { error: "Authentication required." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !caller) {
    return respond(401, { error: "Invalid authentication." });
  }
  if (caller.app_metadata?.role !== "admin") {
    return respond(403, { error: "Administrator access required." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { error: "Invalid JSON request body." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond(400, { error: "A JSON object is required." });
  }
  const payload = body as Record<string, unknown>;

  if (payload.action === "list") {
    const { data, error } = await adminClient
      .from("profiles")
      .select("id, email, role, blocked, expires_at, created_at")
      .neq("role", "admin")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to list users:", error.message);
      return respond(500, { error: "Could not load users." });
    }
    return respond(200, { users: data || [] });
  }

  if (payload.action === "block" || payload.action === "renew") {
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    if (!userId || userId === caller.id) {
      return respond(400, { error: "A different user ID is required." });
    }

    const { data: { user: target }, error: targetError } =
      await adminClient.auth.admin.getUserById(userId);
    if (targetError || !target) {
      return respond(404, { error: "User not found." });
    }
    if (target.app_metadata?.role === "admin") {
      return respond(403, { error: "Administrator accounts cannot be changed here." });
    }

    if (payload.action === "block") {
      if (typeof payload.blocked !== "boolean") {
        return respond(400, { error: "A boolean blocked value is required." });
      }

      const { data: profile, error } = await adminClient
        .from("profiles")
        .update({ blocked: payload.blocked })
        .eq("id", userId)
        .select("id, blocked")
        .maybeSingle();
      if (error || !profile) {
        console.error("Failed to update user block status:", error?.message || "Profile not found.");
        return respond(500, { error: "Could not update the user's block status." });
      }
      return respond(200, { id: profile.id, blocked: profile.blocked });
    }

    const days = Number(payload.days);
    if (!allowedDurations.has(days)) {
      return respond(400, { error: "The selected subscription duration is not allowed." });
    }

    const { data: currentProfile, error: currentProfileError } = await adminClient
      .from("profiles")
      .select("expires_at")
      .eq("id", userId)
      .maybeSingle();
    if (currentProfileError || !currentProfile) {
      console.error("Failed to load user subscription:", currentProfileError?.message || "Profile not found.");
      return respond(404, { error: "User profile not found." });
    }

    const currentExpiry = Date.parse(currentProfile.expires_at);
    const baseTime = Number.isFinite(currentExpiry) && currentExpiry > Date.now()
      ? currentExpiry
      : Date.now();
    const expiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
    const { data: profile, error } = await adminClient
      .from("profiles")
      .update({ expires_at: expiresAt, blocked: false })
      .eq("id", userId)
      .select("id, expires_at, blocked")
      .maybeSingle();
    if (error || !profile) {
      console.error("Failed to renew user subscription:", error?.message || "Profile not found.");
      return respond(500, { error: "Could not renew the user's subscription." });
    }
    return respond(200, { id: profile.id, expiresAt: profile.expires_at, blocked: profile.blocked });
  }

  if (payload.action === "delete") {
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    if (!userId || userId === caller.id) {
      return respond(400, { error: "A different user ID is required." });
    }

    const { data: { user: target }, error: targetError } =
      await adminClient.auth.admin.getUserById(userId);
    if (targetError || !target) {
      return respond(404, { error: "User not found." });
    }
    if (target.app_metadata?.role === "admin") {
      return respond(403, { error: "Administrator accounts cannot be deleted here." });
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Failed to delete user:", error.message);
      return respond(500, { error: "Could not delete the user." });
    }
    return respond(200, { success: true });
  }

  if (payload.action !== "create") {
    return respond(400, { error: "Unsupported action." });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const days = Number(payload.days);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { error: "A valid email address is required." });
  }
  if (password.length < 8) {
    return respond(400, { error: "The password must contain at least 8 characters." });
  }
  if (!allowedDurations.has(days)) {
    return respond(400, { error: "The selected subscription duration is not allowed." });
  }

  const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !user) {
    return respond(400, { error: createError?.message || "Could not create the user." });
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .update({ expires_at: expiresAt, blocked: false })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (profileError || !profile) {
    console.error("Failed to set the new user's subscription:", profileError?.message || "Profile not found.");
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(user.id);
    if (rollbackError) console.error("Failed to roll back user creation:", rollbackError.message);
    return respond(500, { error: "Could not assign the subscription to the new user." });
  }

  return respond(201, { id: user.id, email: user.email, expiresAt });
});
