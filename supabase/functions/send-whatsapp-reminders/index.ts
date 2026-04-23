import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type MemberRow = {
  id: string;
  gym_id: string;
  full_name: string;
  phone: string;
  plan: "Monthly" | "Quarterly" | "Half-Yearly" | "Annual";
  fee: number;
  payment_status: "Paid" | "Pending" | "Overdue";
  expiry_date: string;
};

type GymRow = {
  id: string;
  name: string;
  whatsapp_provider: "twilio" | "meta";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = Deno.env.get("REMINDER_CRON_SECRET") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");
  const body = await safeJson(request);
  const targetGymId = typeof body?.gymId === "string" ? body.gymId : null;

  const usingCronSecret = cronSecret && bearerToken === cronSecret;

  if (!usingCronSecret) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });
    const {
      data: { user }
    } = await userClient.auth.getUser();
    if (!user || !targetGymId) {
      return json({ error: "Unauthorized." }, 401);
    }

    const { data: membership } = await userClient
      .from("gym_memberships")
      .select("role")
      .eq("gym_id", targetGymId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "owner") {
      return json({ error: "Only the gym owner can run reminder sync." }, 403);
    }
  }

  const gyms = await getGyms(targetGymId);
  const results = [];

  for (const gym of gyms) {
    const reminders = await buildRemindersForGym(gym);
    for (const reminder of reminders) {
      results.push(await sendReminder(gym, reminder));
    }
  }

  return json({
    processed: results.length,
    sent: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
    results
  });
});

async function getGyms(targetGymId: string | null): Promise<GymRow[]> {
  let query = supabase.from("gyms").select("id, name, whatsapp_provider");
  if (targetGymId) {
    query = query.eq("id", targetGymId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function buildRemindersForGym(gym: GymRow) {
  const { data: members, error: memberError } = await supabase
    .from("members")
    .select("id, gym_id, full_name, phone, plan, fee, payment_status, expiry_date")
    .eq("gym_id", gym.id);

  if (memberError) throw memberError;

  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance_sessions")
    .select("member_id, check_in_at")
    .eq("gym_id", gym.id)
    .gte("check_in_at", isoDaysAgo(7));

  if (attendanceError) throw attendanceError;

  const { data: reminderLog, error: reminderError } = await supabase
    .from("whatsapp_reminders")
    .select("member_id, reminder_type, reminder_date")
    .eq("gym_id", gym.id)
    .eq("reminder_date", todayKey());

  if (reminderError) throw reminderError;

  const sentToday = new Set(
    (reminderLog ?? []).map((item) => `${item.member_id}:${item.reminder_type}:${item.reminder_date}`)
  );

  const attendanceMap = new Map<string, Set<string>>();
  for (const row of attendance ?? []) {
    const dateKey = row.check_in_at.slice(0, 10);
    if (!attendanceMap.has(row.member_id)) attendanceMap.set(row.member_id, new Set());
    attendanceMap.get(row.member_id)?.add(dateKey);
  }

  const reminders = [];

  for (const member of (members ?? []) as MemberRow[]) {
    const absentDays = getConsecutiveAbsentDays(attendanceMap.get(member.id) ?? new Set());
    const absenceKey = `${member.id}:absence:${todayKey()}`;
    if (absentDays >= 3 && !sentToday.has(absenceKey)) {
      reminders.push({
        member,
        reminderType: "absence" as const,
        phone: member.phone,
        message: `Hi ${member.full_name}, we missed you at ${gym.name}. You have been absent for ${absentDays} consecutive days. Reply here if you want help getting back into your workout routine.`
      });
    }

    const feeKey = `${member.id}:fee:${todayKey()}`;
    if (member.payment_status !== "Paid" && !sentToday.has(feeKey)) {
      reminders.push({
        member,
        reminderType: "fee" as const,
        phone: member.phone,
        message: `Hi ${member.full_name}, this is a fee reminder from ${gym.name}. Your ${member.plan} plan fee of Rs ${Number(member.fee).toLocaleString("en-IN")} is currently ${member.payment_status.toLowerCase()}. Please complete the payment to keep your membership active.`
      });
    }
  }

  return reminders;
}

function getConsecutiveAbsentDays(attendanceDates: Set<string>) {
  let absentDays = 0;
  for (let i = 0; i < 7; i += 1) {
    const key = offsetDateKey(i);
    if (attendanceDates.has(key)) break;
    absentDays += 1;
  }
  return absentDays;
}

async function sendReminder(
  gym: GymRow,
  reminder: { member: MemberRow; reminderType: "absence" | "fee"; phone: string; message: string }
) {
  try {
    const providerResult = gym.whatsapp_provider === "meta"
      ? await sendWithMeta(reminder.phone, reminder.message)
      : await sendWithTwilio(reminder.phone, reminder.message);

    const { error } = await supabase.from("whatsapp_reminders").insert({
      gym_id: gym.id,
      member_id: reminder.member.id,
      reminder_type: reminder.reminderType,
      reminder_date: todayKey(),
      provider: gym.whatsapp_provider,
      status: "sent",
      phone: normalizePhone(reminder.phone),
      message: reminder.message,
      external_id: providerResult.externalId,
      sent_at: new Date().toISOString()
    });

    if (error) throw error;

    return {
      memberId: reminder.member.id,
      type: reminder.reminderType,
      status: "sent"
    };
  } catch (error) {
    await supabase.from("whatsapp_reminders").upsert({
      gym_id: gym.id,
      member_id: reminder.member.id,
      reminder_type: reminder.reminderType,
      reminder_date: todayKey(),
      provider: gym.whatsapp_provider,
      status: "failed",
      phone: normalizePhone(reminder.phone),
      message: reminder.message,
      error_message: error instanceof Error ? error.message : String(error)
    }, { onConflict: "gym_id,member_id,reminder_type,reminder_date" });

    return {
      memberId: reminder.member.id,
      type: reminder.reminderType,
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function sendWithTwilio(phone: string, message: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio secrets are missing.");
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        From: from,
        To: `whatsapp:${normalizePhone(phone)}`,
        Body: message
      })
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? "Twilio send failed.");
  }

  return { externalId: payload.sid as string };
}

async function sendWithMeta(phone: string, message: string) {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    throw new Error("Meta WhatsApp secrets are missing.");
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(phone),
      type: "text",
      text: { body: message }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Meta WhatsApp send failed.");
  }

  return { externalId: payload.messages?.[0]?.id as string };
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^91/, "");
  return `91${digits}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDateKey(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function safeJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
