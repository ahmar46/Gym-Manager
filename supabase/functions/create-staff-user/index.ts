import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return json({ error: "Missing auth header." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: "Invalid user session." }, 401);
  }

  const body = await request.json();
  const gymId = body?.gymId as string;
  const fullName = String(body?.fullName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const role = String(body?.role ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();

  if (!gymId || !fullName || !email || password.length < 6 || !["manager", "trainer", "reception"].includes(role)) {
    return json({ error: "Invalid payload." }, 400);
  }

  const { data: membership, error: membershipError } = await userClient
    .from("gym_memberships")
    .select("id, role")
    .eq("gym_id", gymId)
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership || membership.role !== "owner") {
    return json({ error: "Only the gym owner can create staff users." }, 403);
  }

  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });

  if (createError || !createdUser.user) {
    return json({ error: createError?.message ?? "Could not create staff user." }, 400);
  }

  const staffId = createdUser.user.id;

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: staffId,
    full_name: fullName,
    email,
    phone
  });

  if (profileError) {
    return json({ error: profileError.message }, 400);
  }

  const { error: staffMembershipError } = await adminClient.from("gym_memberships").insert({
    gym_id: gymId,
    user_id: staffId,
    role
  });

  if (staffMembershipError) {
    return json({ error: staffMembershipError.message }, 400);
  }

  return json({
    id: staffId,
    fullName,
    email,
    role
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
