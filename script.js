import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.FITPRO_CONFIG ?? null;
const DEMO_STORAGE_KEY = "fitpro_demo_workspace_v1";
const state = {
  supabase: null,
  session: null,
  profile: null,
  gym: null,
  membership: null,
  members: [],
  attendance: [],
  reminders: [],
  staff: [],
  currentPage: "dashboard",
  editingMemberId: null,
  charts: {},
  mode: "cloud"
};

const refs = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheRefs();
  bindEvents();
  setTheme(localStorage.getItem("fitpro_theme") || "light");

  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    refs.setupBanner.classList.remove("hidden");
    refs.setupBanner.textContent = "Supabase config is missing, but you can still use Demo Workspace now.";
    showToast("Supabase config missing. Demo mode is available.", "error");
    return;
  }

  state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  try {
    const { data: { session } } = await state.supabase.auth.getSession();
    state.session = session;

    state.supabase.auth.onAuthStateChange(async (_event, sessionData) => {
      state.session = sessionData;
      state.mode = "cloud";
      await syncAuthView();
    });

    await syncAuthView();
  } catch (_error) {
    refs.setupBanner.classList.remove("hidden");
    refs.setupBanner.textContent = "Could not reach Supabase right now. Open Demo Workspace and keep building.";
    showToast("Supabase connection failed. Demo mode is available.", "error");
  }
});

function cacheRefs() {
  refs.authScreen = document.getElementById("authScreen");
  refs.dashboardShell = document.getElementById("dashboardShell");
  refs.setupBanner = document.getElementById("setupBanner");
  refs.sidebar = document.getElementById("sidebar");
  refs.workspaceTitle = document.getElementById("workspaceTitle");
  refs.sidebarGymName = document.getElementById("sidebarGymName");
  refs.currentUserName = document.getElementById("currentUserName");
  refs.currentUserMeta = document.getElementById("currentUserMeta");
  refs.rolePill = document.getElementById("rolePill");
  refs.staffCapabilityText = document.getElementById("staffCapabilityText");
  refs.heroTitle = document.getElementById("heroTitle");
  refs.heroSubtitle = document.getElementById("heroSubtitle");
  refs.todayLabel = document.getElementById("todayLabel");
  refs.gymCreatedLabel = document.getElementById("gymCreatedLabel");
  refs.statsGrid = document.getElementById("statsGrid");
  refs.recentMembersList = document.getElementById("recentMembersList");
  refs.liveAttendanceList = document.getElementById("liveAttendanceList");
  refs.remindersList = document.getElementById("remindersList");
  refs.reminderSummary = document.getElementById("reminderSummary");
  refs.runReminderSyncBtn = document.getElementById("runReminderSyncBtn");
  refs.membersSummary = document.getElementById("membersSummary");
  refs.membersList = document.getElementById("membersList");
  refs.memberFormTitle = document.getElementById("memberFormTitle");
  refs.memberSubmitBtn = document.getElementById("memberSubmitBtn");
  refs.attendanceSearchResults = document.getElementById("attendanceSearchResults");
  refs.attendanceSessionsList = document.getElementById("attendanceSessionsList");
  refs.attendanceSummary = document.getElementById("attendanceSummary");
  refs.staffSummary = document.getElementById("staffSummary");
  refs.staffList = document.getElementById("staffList");
  refs.toast = document.getElementById("toast");
  refs.themeToggle = document.getElementById("themeToggle");
  refs.profitChart = document.getElementById("profitChart");
  refs.churnChart = document.getElementById("churnChart");
  refs.attendanceChart = document.getElementById("attendanceChart");
  refs.demoModeBtn = document.getElementById("demoModeBtn");
}

function bindEvents() {
  document.querySelectorAll(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
  });

  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("registerForm").addEventListener("submit", handleRegisterGym);
  refs.demoModeBtn.addEventListener("click", enterDemoMode);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("menuToggle").addEventListener("click", () => refs.sidebar.classList.toggle("open"));
  document.getElementById("memberForm").addEventListener("submit", handleMemberSubmit);
  document.getElementById("memberFormReset").addEventListener("click", resetMemberForm);
  document.getElementById("staffForm").addEventListener("submit", handleCreateStaff);
  document.getElementById("memberSearch").addEventListener("input", renderMembersPage);
  document.getElementById("memberStatusFilter").addEventListener("change", renderMembersPage);
  document.getElementById("attendanceSearch").addEventListener("input", renderAttendancePage);
  refs.runReminderSyncBtn.addEventListener("click", runReminderSync);

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });
}

async function syncAuthView() {
  const isLoggedIn = state.mode === "demo" || Boolean(state.session);
  refs.authScreen.classList.toggle("hidden", isLoggedIn);
  refs.dashboardShell.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn) {
    clearWorkspaceState();
    switchAuthTab("login");
    return;
  }

  const hydrated = state.mode === "demo" ? hydrateDemoWorkspace() : await hydrateWorkspace();
  if (!hydrated) {
    refs.authScreen.classList.remove("hidden");
    refs.dashboardShell.classList.add("hidden");
    refs.setupBanner.classList.remove("hidden");
    refs.setupBanner.textContent = "Cloud backend is not fully ready yet. Use Demo Workspace now and finish Supabase setup in parallel.";
    showToast("Your account is signed in but not attached to a gym yet.", "error");
    return;
  }

  navigate(state.currentPage);
}

function hydrateDemoWorkspace() {
  const demo = loadDemoWorkspace();
  state.profile = demo.profile;
  state.membership = demo.membership;
  state.gym = demo.gym;
  state.members = demo.members;
  state.attendance = demo.attendance;
  state.reminders = demo.reminders;
  state.staff = demo.staff;

  refs.sidebarGymName.textContent = state.gym.name;
  refs.currentUserName.textContent = state.profile.full_name;
  refs.currentUserMeta.textContent = "Demo workspace";
  refs.rolePill.textContent = "Demo Owner";
  refs.staffCapabilityText.textContent = "Everything is running locally so you can test the full flow.";
  refs.heroTitle.textContent = `${state.gym.name} demo workspace`;
  refs.heroSubtitle.textContent = "This is a fully working local demo while your cloud backend is being finished.";
  refs.todayLabel.textContent = formatDateLong(new Date().toISOString());
  refs.gymCreatedLabel.textContent = `Demo data seeded ${formatDateShort(state.gym.created_at)}`;
  resetMemberForm();
  return true;
}

async function hydrateWorkspace() {
  const supabase = state.supabase;
  if (!supabase || !state.session?.user) return false;

  const userId = state.session.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email")
    .eq("id", userId)
    .single();
  if (profileError) {
    showToast(profileError.message, "error");
    return false;
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("gym_memberships")
    .select(`
      id,
      role,
      gym_id,
      gyms (
        id,
        name,
        slug,
        phone,
        owner_id,
        whatsapp_provider,
        created_at
      )
    `)
    .eq("user_id", userId)
    .limit(1);

  if (membershipError || !membershipRows?.length) {
    showToast(membershipError?.message || "No gym membership found.", "error");
    return false;
  }

  state.profile = profile;
  state.membership = membershipRows[0];
  state.gym = membershipRows[0].gyms;

  refs.sidebarGymName.textContent = state.gym.name;
  refs.currentUserName.textContent = profile.full_name;
  refs.currentUserMeta.textContent = `${capitalize(state.membership.role)} access`;
  refs.rolePill.textContent = capitalize(state.membership.role);
  refs.staffCapabilityText.textContent = state.membership.role === "owner"
    ? "You can manage members, staff, attendance, and reminder automation."
    : "You can manage members and attendance inside this gym.";
  refs.heroTitle.textContent = `${state.gym.name} command center`;
  refs.heroSubtitle.textContent = `Realtime cloud sync with Supabase, WhatsApp automation, and live charts.`;
  refs.todayLabel.textContent = formatDateLong(new Date().toISOString());
  refs.gymCreatedLabel.textContent = `Live since ${formatDateShort(state.gym.created_at)}`;

  await Promise.all([
    fetchMembers(),
    fetchAttendance(),
    fetchReminders(),
    fetchStaff()
  ]);

  resetMemberForm();
  return true;
}

function clearWorkspaceState() {
  state.profile = null;
  state.gym = null;
  state.membership = null;
  state.members = [];
  state.attendance = [];
  state.reminders = [];
  state.staff = [];
  state.mode = "cloud";
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });
  document.querySelectorAll(".auth-form").forEach((form) => {
    form.classList.toggle("active", form.id === `${tab}Form`);
  });
}

async function handleLogin(event) {
  event.preventDefault();
  if (!state.supabase) return;
  state.mode = "cloud";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast(error.message, "error");
    return;
  }

  event.target.reset();
  showToast("Signed in successfully.", "success");
}

async function handleRegisterGym(event) {
  event.preventDefault();
  if (!state.supabase) return;
  state.mode = "cloud";

  const gymName = document.getElementById("registerGymName").value.trim();
  const ownerName = document.getElementById("registerOwnerName").value.trim();
  const phone = document.getElementById("registerPhone").value.trim();
  const email = document.getElementById("registerEmail").value.trim().toLowerCase();
  const password = document.getElementById("registerPassword").value;

  if (!gymName || !ownerName || !email || password.length < 6) {
    showToast("Fill all registration fields correctly.", "error");
    return;
  }

  const { data: signUpData, error: signUpError } = await state.supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: ownerName }
    }
  });

  if (signUpError) {
    showToast(signUpError.message, "error");
    return;
  }

  if (!signUpData.user || !signUpData.session) {
    showToast("Sign-up created. Disable email confirmation or confirm email, then sign in.", "error");
    return;
  }

  const ownerId = signUpData.user.id;
  const slug = slugify(gymName);

  const { error: profileError } = await state.supabase.from("profiles").upsert({
    id: ownerId,
    full_name: ownerName,
    phone,
    email
  });

  if (profileError) {
    showToast(profileError.message, "error");
    return;
  }

  const { data: gymRows, error: gymError } = await state.supabase
    .from("gyms")
    .insert({
      name: gymName,
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      phone,
      owner_id: ownerId
    })
    .select("id")
    .single();

  if (gymError || !gymRows) {
    showToast(gymError?.message || "Could not create gym.", "error");
    return;
  }

  const { error: membershipError } = await state.supabase.from("gym_memberships").insert({
    gym_id: gymRows.id,
    user_id: ownerId,
    role: "owner"
  });

  if (membershipError) {
    showToast(membershipError.message, "error");
    return;
  }

  event.target.reset();
  showToast("Gym workspace created successfully.", "success");
  await syncAuthView();
}

async function logout() {
  if (state.mode === "demo") {
    state.mode = "cloud";
    clearWorkspaceState();
    refs.authScreen.classList.remove("hidden");
    refs.dashboardShell.classList.add("hidden");
    destroyAllCharts();
    showToast("Exited demo workspace.", "success");
    return;
  }

  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  showToast("Logged out.", "success");
}

function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  refs.workspaceTitle.textContent = capitalize(page);
  refs.sidebar.classList.remove("open");

  if (page === "dashboard") renderDashboard();
  if (page === "members") renderMembersPage();
  if (page === "attendance") renderAttendancePage();
  if (page === "staff") renderStaffPage();
}

async function fetchMembers() {
  if (state.mode === "demo") return;
  if (!state.supabase || !state.gym) return;
  const { data, error } = await state.supabase
    .from("members")
    .select("*")
    .eq("gym_id", state.gym.id)
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  state.members = data ?? [];
}

async function fetchAttendance() {
  if (state.mode === "demo") return;
  if (!state.supabase || !state.gym) return;
  const { data, error } = await state.supabase
    .from("attendance_sessions")
    .select("id, member_id, check_in_at, check_out_at, duration_minutes, marked_by, created_at")
    .eq("gym_id", state.gym.id)
    .gte("check_in_at", isoDaysAgo(7))
    .order("check_in_at", { ascending: false });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  state.attendance = data ?? [];
}

async function fetchReminders() {
  if (state.mode === "demo") return;
  if (!state.supabase || !state.gym) return;
  const { data, error } = await state.supabase
    .from("whatsapp_reminders")
    .select("id, member_id, reminder_type, reminder_date, provider, status, phone, message, sent_at, error_message")
    .eq("gym_id", state.gym.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  state.reminders = data ?? [];
}

async function fetchStaff() {
  if (state.mode === "demo") return;
  if (!state.supabase || !state.gym) return;
  const { data, error } = await state.supabase
    .from("gym_memberships")
    .select(`
      id,
      role,
      user_id,
      profiles (
        full_name,
        email,
        phone
      )
    `)
    .eq("gym_id", state.gym.id)
    .order("created_at", { ascending: true });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  state.staff = data ?? [];
}

function renderDashboard() {
  const metrics = getDashboardMetrics();

  refs.statsGrid.innerHTML = [
    metricCard("Total members", metrics.totalMembers, "Cloud member count"),
    metricCard("Active plans", metrics.activeMembers, "Members with valid plans"),
    metricCard("Today's check-ins", metrics.todayCheckIns, "Sessions logged today"),
    metricCard("Live sessions", metrics.liveSessions, "Members currently inside"),
    metricCard("Net position", formatCurrency(metrics.netPosition), "Collected minus dues"),
    metricCard("At-risk clients", metrics.atRiskCount, "Absent 3+ days")
  ].join("");

  const recentMembers = state.members.slice(0, 5);
  refs.recentMembersList.innerHTML = recentMembers.length
    ? recentMembers.map((member) => stackItem(
        member.full_name,
        `${member.plan} · Joined ${formatDateShort(member.joining_date)}`,
        member.payment_status
      )).join("")
    : emptyCard("No members added yet.");

  const liveSessions = getTodaySessions().filter((session) => !session.check_out_at);
  refs.liveAttendanceList.innerHTML = liveSessions.length
    ? liveSessions.map((session) => {
        const member = findMember(session.member_id);
        return sessionCard(
          member?.full_name || "Unknown member",
          `${formatTime(session.check_in_at)} check-in`,
          `${getLiveDurationMinutes(session.check_in_at)} min active`,
          "live",
          "Currently working out"
        );
      }).join("")
    : emptyCard("No active sessions right now.");

  const reminderPreview = getReminderPreview();
  refs.reminderSummary.textContent = reminderPreview.length
    ? `${reminderPreview.length} reminders are ready to send automatically.`
    : "No reminders queued right now.";
  refs.remindersList.innerHTML = reminderPreview.length
    ? reminderPreview.map((item) => stackItem(item.memberName, item.reason, item.badge)).join("")
    : emptyCard("No fee or absence reminders needed.");

  renderCharts(metrics);
}

function renderCharts(metrics) {
  if (typeof Chart === "undefined") return;
  destroyChart("profit");
  destroyChart("churn");
  destroyChart("attendance");

  state.charts.profit = new Chart(refs.profitChart, {
    type: "bar",
    data: {
      labels: ["Collected", "Outstanding", "Net"],
      datasets: [{
        data: [metrics.collectedRevenue, metrics.outstandingRevenue, metrics.netPosition],
        backgroundColor: ["#174f45", "#d96c3d", "#f4b764"],
        borderRadius: 12
      }]
    },
    options: chartOptions("Financial overview", true)
  });

  state.charts.churn = new Chart(refs.churnChart, {
    type: "doughnut",
    data: {
      labels: ["Healthy", "At risk", "Hot risk", "Expired"],
      datasets: [{
        data: [metrics.healthyMembers, metrics.atRiskCount, metrics.churnHotCount, metrics.expiredMembers],
        backgroundColor: ["#174f45", "#d96c3d", "#f4b764", "#c93b2d"],
        borderWidth: 0
      }]
    },
    options: chartOptions("Churn risk", false)
  });

  const attendanceTrend = getAttendanceTrend();
  state.charts.attendance = new Chart(refs.attendanceChart, {
    type: "line",
    data: {
      labels: attendanceTrend.labels,
      datasets: [{
        label: "Check-ins",
        data: attendanceTrend.values,
        borderColor: "#d96c3d",
        backgroundColor: "rgba(217,108,61,0.18)",
        fill: true,
        tension: 0.35
      }]
    },
    options: chartOptions("Attendance trend", true)
  });
}

function chartOptions(title, showY) {
  const dark = document.body.dataset.theme === "dark";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: dark ? "#ecf3f1" : "#221a11"
        }
      },
      title: {
        display: false,
        text: title
      }
    },
    scales: showY ? {
      x: {
        ticks: { color: dark ? "#9cb0ae" : "#645747" },
        grid: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(34,26,17,0.06)" }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: dark ? "#9cb0ae" : "#645747"
        },
        grid: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(34,26,17,0.06)" }
      }
    } : {}
  };
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    state.charts[key] = null;
  }
}

function destroyAllCharts() {
  destroyChart("profit");
  destroyChart("churn");
  destroyChart("attendance");
}

function renderMembersPage() {
  const query = document.getElementById("memberSearch").value.trim().toLowerCase();
  const statusFilter = document.getElementById("memberStatusFilter").value;

  const filtered = state.members.filter((member) => {
    const matchesQuery = member.full_name.toLowerCase().includes(query) || member.phone.includes(query);
    const matchesStatus = !statusFilter || getMemberStatus(member) === statusFilter;
    return matchesQuery && matchesStatus;
  });

  refs.membersSummary.textContent = `${filtered.length} of ${state.members.length} members`;
  refs.membersList.innerHTML = filtered.length
    ? filtered.map((member) => `
        <article class="table-card">
          <div>
            <h4>${member.full_name}</h4>
            <p>${member.phone} · ${member.goal || "No goal set"}</p>
          </div>
          <div class="table-meta">
            <span class="status-pill">${member.plan}</span>
            <span class="status-pill muted">${getMemberStatus(member)}</span>
            <span class="status-pill muted">${member.payment_status}</span>
          </div>
          <div class="table-foot">
            <span>${formatCurrency(member.fee)}</span>
            <span>Expiry ${formatDateShort(member.expiry_date)}</span>
          </div>
          <div class="button-row">
            <button class="btn btn-secondary" data-action="edit-member" data-id="${member.id}" type="button">Edit</button>
            <button class="btn btn-secondary" data-action="delete-member" data-id="${member.id}" type="button">Delete</button>
          </div>
        </article>
      `).join("")
    : emptyCard("No members matched your search.");

  refs.membersList.querySelectorAll("[data-action='edit-member']").forEach((button) => {
    button.addEventListener("click", () => startMemberEdit(button.dataset.id));
  });
  refs.membersList.querySelectorAll("[data-action='delete-member']").forEach((button) => {
    button.addEventListener("click", () => deleteMember(button.dataset.id));
  });
}

async function handleMemberSubmit(event) {
  event.preventDefault();
  if (!state.gym) return;

  const payload = {
    gym_id: state.gym.id,
    full_name: document.getElementById("memberName").value.trim(),
    phone: document.getElementById("memberPhone").value.trim(),
    goal: document.getElementById("memberGoal").value.trim(),
    joining_date: document.getElementById("memberJoiningDate").value,
    plan: document.getElementById("memberPlan").value,
    fee: Number(document.getElementById("memberFee").value || 0),
    payment_status: document.getElementById("memberPaymentStatus").value,
    last_payment_date: getDateKey(),
    notes: document.getElementById("memberNotes").value.trim()
  };

  if (!payload.full_name || !/^\d{10}$/.test(payload.phone) || !payload.joining_date || !payload.plan || !payload.payment_status) {
    showToast("Fill all member fields correctly.", "error");
    return;
  }

  payload.expiry_date = computeExpiry(payload.joining_date, payload.plan);

  if (state.mode === "demo") {
    if (state.editingMemberId) {
      const index = state.members.findIndex((item) => item.id === state.editingMemberId);
      if (index >= 0) {
        state.members[index] = { ...state.members[index], ...payload };
      }
    } else {
      state.members.unshift({
        id: `demo-member-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...payload
      });
    }
    saveDemoWorkspace();
  } else {
    let error = null;
    if (state.editingMemberId) {
      ({ error } = await state.supabase.from("members").update(payload).eq("id", state.editingMemberId));
    } else {
      ({ error } = await state.supabase.from("members").insert(payload));
    }

    if (error) {
      showToast(error.message, "error");
      return;
    }

    await fetchMembers();
  }

  showToast(state.editingMemberId ? "Member updated." : "Member added.", "success");
  resetMemberForm();
  renderMembersPage();
  renderDashboard();
}

function startMemberEdit(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;

  state.editingMemberId = memberId;
  refs.memberFormTitle.textContent = "Edit member";
  refs.memberSubmitBtn.textContent = "Update member";
  document.getElementById("memberName").value = member.full_name;
  document.getElementById("memberPhone").value = member.phone;
  document.getElementById("memberGoal").value = member.goal || "";
  document.getElementById("memberJoiningDate").value = member.joining_date;
  document.getElementById("memberPlan").value = member.plan;
  document.getElementById("memberFee").value = member.fee;
  document.getElementById("memberPaymentStatus").value = member.payment_status;
  document.getElementById("memberNotes").value = member.notes || "";
  navigate("members");
}

function resetMemberForm() {
  state.editingMemberId = null;
  refs.memberFormTitle.textContent = "Add member";
  refs.memberSubmitBtn.textContent = "Save member";
  document.getElementById("memberForm").reset();
  document.getElementById("memberJoiningDate").value = getDateKey();
}

async function deleteMember(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;
  if (!window.confirm(`Delete ${member.full_name}?`)) return;

  if (state.mode === "demo") {
    state.members = state.members.filter((item) => item.id !== memberId);
    state.attendance = state.attendance.filter((item) => item.member_id !== memberId);
    saveDemoWorkspace();
  } else {
    const { error } = await state.supabase.from("members").delete().eq("id", memberId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    await Promise.all([fetchMembers(), fetchAttendance(), fetchReminders()]);
  }

  showToast("Member deleted.", "success");
  renderMembersPage();
  renderAttendancePage();
  renderDashboard();
}

function renderAttendancePage() {
  const query = document.getElementById("attendanceSearch").value.trim().toLowerCase();
  const filteredMembers = state.members.filter((member) => {
    if (!query) return true;
    return member.full_name.toLowerCase().includes(query) || member.phone.includes(query);
  });
  const todaySessions = getTodaySessions();

  refs.attendanceSummary.textContent = `${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"} logged today. Green means live inside the gym.`;
  refs.attendanceSearchResults.innerHTML = filteredMembers.length
    ? filteredMembers.map((member) => {
        const liveSession = getOpenSession(member.id);
        const activeMinutes = liveSession ? getLiveDurationMinutes(liveSession.check_in_at) : 0;
        return `
          <article class="action-card attendance-action-card ${liveSession ? "card-live" : ""}">
            <div class="action-card-copy">
              <h4>${member.full_name}</h4>
              <p>${member.phone} | ${member.plan} | ${getMemberStatus(member)}</p>
            </div>
            <div class="attendance-quick-actions">
              <button class="attendance-mark-btn attendance-in ${liveSession ? "disabled-state" : ""}" data-action="check-in" data-id="${member.id}" type="button" ${liveSession ? "disabled" : ""}>
                <span class="attendance-dot dot-in"></span>
                <span>Check in</span>
              </button>
              <button class="attendance-mark-btn attendance-out ${liveSession ? "" : "disabled-state"}" data-action="check-out" data-id="${member.id}" type="button" ${liveSession ? "" : "disabled"}>
                <span class="attendance-dot dot-out"></span>
                <span>Check out</span>
              </button>
            </div>
            <div class="attendance-helper-row">
              <span class="status-pill ${liveSession ? "pill-live" : "muted"}">${liveSession ? `${activeMinutes} min active` : "Not inside gym"}</span>
              <span class="attendance-helper-text">${liveSession ? "Member is currently working out." : "Tap green when the customer enters."}</span>
            </div>
          </article>
        `;
      }).join("")
    : emptyCard("No members matched your search.");

  refs.attendanceSearchResults.querySelectorAll("[data-action='check-in']").forEach((button) => {
    button.addEventListener("click", () => checkInMember(button.dataset.id));
  });
  refs.attendanceSearchResults.querySelectorAll("[data-action='check-out']").forEach((button) => {
    button.addEventListener("click", () => checkOutMember(button.dataset.id));
  });

  refs.attendanceSessionsList.innerHTML = todaySessions.length
    ? todaySessions.map((session) => {
        const member = findMember(session.member_id);
        const isLive = !session.check_out_at;
        return sessionCard(
          member?.full_name || "Unknown member",
          `${formatTime(session.check_in_at)} check-in${session.check_out_at ? ` | ${formatTime(session.check_out_at)} check-out` : ""}`,
          isLive ? `${getLiveDurationMinutes(session.check_in_at)} min live` : `${session.duration_minutes || 0} min total`,
          isLive ? "live" : "closed",
          isLive ? "Still inside the gym" : "Session completed"
        );
      }).join("")
    : emptyCard("No attendance yet today.");
}

async function checkInMember(memberId) {
  if (!state.gym) return;
  if (getOpenSession(memberId)) {
    showToast("Member already has an open session.", "error");
    return;
  }

  if (state.mode === "demo") {
    state.attendance.unshift({
      id: `demo-att-${Date.now()}`,
      gym_id: state.gym.id,
      member_id: memberId,
      check_in_at: new Date().toISOString(),
      check_out_at: null,
      duration_minutes: null,
      marked_by: state.profile.id,
      created_at: new Date().toISOString()
    });
    saveDemoWorkspace();
  } else {
    const { error } = await state.supabase.from("attendance_sessions").insert({
      gym_id: state.gym.id,
      member_id: memberId,
      check_in_at: new Date().toISOString(),
      marked_by: state.profile.id
    });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    await fetchAttendance();
  }

  showToast("Check-in marked.", "success");
  renderAttendancePage();
  renderDashboard();
}

async function checkOutMember(memberId) {
  const session = getOpenSession(memberId);
  if (!session) {
    showToast("No open session for that member.", "error");
    return;
  }

  const checkOutAt = new Date().toISOString();
  const duration = getLiveDurationMinutes(session.check_in_at, checkOutAt);

  if (state.mode === "demo") {
    const target = state.attendance.find((item) => item.id === session.id);
    if (target) {
      target.check_out_at = checkOutAt;
      target.duration_minutes = duration;
    }
    saveDemoWorkspace();
  } else {
    const { error } = await state.supabase
      .from("attendance_sessions")
      .update({
        check_out_at: checkOutAt,
        duration_minutes: duration
      })
      .eq("id", session.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    await fetchAttendance();
  }

  showToast("Check-out marked.", "success");
  renderAttendancePage();
  renderDashboard();
}

function renderStaffPage() {
  const isOwner = state.membership?.role === "owner";
  refs.staffSummary.textContent = `${Math.max(state.staff.length - 1, 0)} staff users`;

  refs.staffList.innerHTML = state.staff.length
    ? state.staff.map((row) => `
        <article class="stack-item">
          <div>
            <h4>${row.profiles?.full_name || "Unknown user"}</h4>
            <p>${row.profiles?.email || "No email"} · ${capitalize(row.role)}</p>
          </div>
          <span class="status-pill">${capitalize(row.role)}</span>
        </article>
      `).join("")
    : emptyCard("No staff users found.");

  Array.from(document.querySelectorAll("#staffForm input, #staffForm select, #staffForm button")).forEach((element) => {
    element.disabled = !isOwner;
  });
}

async function handleCreateStaff(event) {
  event.preventDefault();
  if (!state.gym) return;
  if (state.membership?.role !== "owner") {
    showToast("Only the owner can create staff users.", "error");
    return;
  }

  const payload = {
    gymId: state.gym.id,
    fullName: document.getElementById("staffName").value.trim(),
    phone: document.getElementById("staffPhone").value.trim(),
    email: document.getElementById("staffEmail").value.trim().toLowerCase(),
    password: document.getElementById("staffPassword").value,
    role: document.getElementById("staffRole").value
  };

  if (state.mode === "demo") {
    state.staff.push({
      id: `demo-staff-${Date.now()}`,
      role: payload.role,
      user_id: `demo-user-${Date.now()}`,
      profiles: {
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone
      }
    });
    saveDemoWorkspace();
  } else {
    const { data, error } = await state.supabase.functions.invoke("create-staff-user", {
      body: payload
    });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    if (data?.error) {
      showToast(data.error, "error");
      return;
    }

    await fetchStaff();
  }

  event.target.reset();
  showToast("Staff user created.", "success");
  renderStaffPage();
}

async function runReminderSync() {
  if (!state.gym) return;
  if (state.membership?.role !== "owner") {
    showToast("Only the owner can run reminder sync manually.", "error");
    return;
  }

  if (state.mode === "demo") {
    state.reminders = getReminderPreview().map((item, index) => ({
      id: `demo-reminder-${Date.now()}-${index}`,
      memberName: item.memberName,
      reason: item.reason,
      badge: item.badge,
      status: "sent",
      reminder_date: getDateKey()
    }));
    saveDemoWorkspace();
    renderDashboard();
    showToast(`Demo reminder sync finished. Sent: ${state.reminders.length}.`, "success");
    return;
  }

  const { data, error } = await state.supabase.functions.invoke("send-whatsapp-reminders", {
    body: { gymId: state.gym.id }
  });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  if (data?.error) {
    showToast(data.error, "error");
    return;
  }

  await fetchReminders();
  renderDashboard();
  showToast(`Reminder sync finished. Sent: ${data?.sent ?? 0}.`, "success");
}

function getDashboardMetrics() {
  const totalMembers = state.members.length;
  const activeMembers = state.members.filter((member) => getMemberStatus(member) === "Active").length;
  const expiredMembers = state.members.filter((member) => getMemberStatus(member) === "Expired").length;
  const todaySessions = getTodaySessions();
  const collectedRevenue = state.members
    .filter((member) => member.payment_status === "Paid")
    .reduce((sum, member) => sum + Number(member.fee || 0), 0);
  const outstandingRevenue = state.members
    .filter((member) => member.payment_status !== "Paid")
    .reduce((sum, member) => sum + Number(member.fee || 0), 0);
  const atRiskMembers = getAtRiskMembers();

  return {
    totalMembers,
    activeMembers,
    expiredMembers,
    todayCheckIns: todaySessions.length,
    liveSessions: todaySessions.filter((item) => !item.check_out_at).length,
    collectedRevenue,
    outstandingRevenue,
    netPosition: collectedRevenue - outstandingRevenue,
    atRiskCount: atRiskMembers.filter((item) => item.absentDays >= 3).length,
    churnHotCount: atRiskMembers.filter((item) => item.absentDays >= 5).length,
    healthyMembers: Math.max(totalMembers - atRiskMembers.length, 0)
  };
}

function getReminderPreview() {
  return state.members.flatMap((member) => {
    const list = [];
    const absentDays = getConsecutiveAbsentDays(member.id);
    if (absentDays >= 3 && getMemberStatus(member) !== "Expired") {
      list.push({
        memberName: member.full_name,
        reason: `${absentDays} consecutive days absent.`,
        badge: `${absentDays}d absent`
      });
    }
    if (member.payment_status !== "Paid") {
      list.push({
        memberName: member.full_name,
        reason: `Fee reminder for ${formatCurrency(member.fee)}.`,
        badge: member.payment_status
      });
    }
    return list;
  }).slice(0, 8);
}

function getAtRiskMembers() {
  return state.members
    .map((member) => ({
      member,
      absentDays: getConsecutiveAbsentDays(member.id)
    }))
    .filter((item) => item.absentDays >= 3 && getMemberStatus(item.member) !== "Expired");
}

function getAttendanceTrend() {
  const labels = [];
  const values = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = offsetDateKey(i);
    labels.push(formatChartDate(key));
    values.push(state.attendance.filter((session) => session.check_in_at.slice(0, 10) === key).length);
  }
  return { labels, values };
}

function getTodaySessions() {
  const today = getDateKey();
  return state.attendance.filter((session) => session.check_in_at.slice(0, 10) === today);
}

function getOpenSession(memberId) {
  return state.attendance.find((session) => (
    session.member_id === memberId &&
    session.check_in_at.slice(0, 10) === getDateKey() &&
    !session.check_out_at
  )) || null;
}

function getConsecutiveAbsentDays(memberId) {
  let absentDays = 0;
  for (let i = 0; i < 7; i += 1) {
    const key = offsetDateKey(i);
    const hasAttendance = state.attendance.some((session) => session.member_id === memberId && session.check_in_at.slice(0, 10) === key);
    if (hasAttendance) break;
    absentDays += 1;
  }
  return absentDays;
}

function findMember(memberId) {
  return state.members.find((member) => member.id === memberId) || null;
}

function getMemberStatus(member) {
  const remaining = daysUntil(member.expiry_date);
  if (remaining < 0) return "Expired";
  if (remaining <= 7) return "Expiring";
  return "Active";
}

function computeExpiry(joiningDate, plan) {
  const date = new Date(joiningDate);
  const map = { Monthly: 30, Quarterly: 90, "Half-Yearly": 180, Annual: 365 };
  date.setDate(date.getDate() + (map[plan] || 30));
  return date.toISOString().slice(0, 10);
}

function toggleTheme() {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  setTheme(next);
  if (state.gym) renderDashboard();
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem("fitpro_theme", theme);
  refs.themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
}

function metricCard(label, value, meta) {
  return `
    <article class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${meta}</p>
    </article>
  `;
}

function stackItem(title, text, badge) {
  return `
    <article class="stack-item">
      <div>
        <h4>${title}</h4>
        <p>${text}</p>
      </div>
      <span class="status-pill">${badge}</span>
    </article>
  `;
}

function sessionCard(title, text, badge, tone = "default", hint = "") {
  return `
    <article class="stack-item session-card ${tone === "live" ? "session-live" : ""}">
      <div class="session-copy">
        <div class="session-title-row">
          ${tone === "live" ? '<span class="live-dot" aria-hidden="true"></span>' : ""}
          <h4>${title}</h4>
        </div>
        <p>${text}</p>
        ${hint ? `<span class="session-hint">${hint}</span>` : ""}
      </div>
      <span class="status-pill ${tone === "live" ? "pill-live" : tone === "closed" ? "pill-closed" : ""}">${badge}</span>
    </article>
  `;
}

function emptyCard(message) {
  return `<div class="empty-card">${message}</div>`;
}

function showToast(message, type = "default") {
  refs.toast.textContent = message;
  refs.toast.className = `toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    refs.toast.className = "toast";
  }, 2800);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDateKey(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function getLiveDurationMinutes(checkInAt, checkOutAt = new Date().toISOString()) {
  return Math.max(1, Math.round((new Date(checkOutAt) - new Date(checkInAt)) / 60000));
}

function formatDateShort(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateLong(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatChartDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function enterDemoMode() {
  state.mode = "demo";
  state.session = null;
  hydrateDemoWorkspace();
  refs.authScreen.classList.add("hidden");
  refs.dashboardShell.classList.remove("hidden");
  navigate("dashboard");
  showToast("Demo workspace opened.", "success");
}

function loadDemoWorkspace() {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    }
  }

  const today = new Date();
  const workspace = {
    profile: {
      id: "demo-owner",
      full_name: "Demo Owner",
      email: "demo@fitpro.local",
      phone: "9876500000"
    },
    membership: {
      id: "demo-membership",
      role: "owner",
      gym_id: "demo-gym"
    },
    gym: {
      id: "demo-gym",
      name: "FitPro Demo Gym",
      created_at: today.toISOString()
    },
    members: [
      createDemoMember("Rahul Sharma", "9876543210", "Strength training", dateOffset(today, -40), "Monthly", 1800, "Paid", "Evening slot"),
      createDemoMember("Priya Patel", "9812345678", "Fat loss", dateOffset(today, -15), "Quarterly", 4500, "Paid", "Cardio focus"),
      createDemoMember("Amit Verma", "9998887776", "General fitness", dateOffset(today, -87), "Monthly", 1600, "Overdue", "Needs fee reminder"),
      createDemoMember("Sneha Reddy", "9123456789", "Muscle gain", dateOffset(today, -8), "Half-Yearly", 9000, "Paid", "Morning batch")
    ],
    attendance: [],
    reminders: [],
    staff: [
      {
        id: "demo-owner-row",
        role: "owner",
        user_id: "demo-owner",
        profiles: { full_name: "Demo Owner", email: "demo@fitpro.local", phone: "9876500000" }
      },
      {
        id: "demo-trainer",
        role: "trainer",
        user_id: "demo-trainer-user",
        profiles: { full_name: "Nisha Patel", email: "nisha@fitpro.local", phone: "9123456780" }
      }
    ]
  };

  workspace.attendance = [
    createDemoAttendance(workspace.members[0].id, 0, 18, 10, 19, 15),
    createDemoAttendance(workspace.members[1].id, 0, 19, 5, null, null),
    createDemoAttendance(workspace.members[0].id, 1, 18, 2, 19, 6),
    createDemoAttendance(workspace.members[3].id, 2, 7, 0, 8, 5)
  ];

  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace));
  return workspace;
}

function saveDemoWorkspace() {
  if (state.mode !== "demo") return;
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
    profile: state.profile,
    membership: state.membership,
    gym: state.gym,
    members: state.members,
    attendance: state.attendance,
    reminders: state.reminders,
    staff: state.staff
  }));
}

function createDemoMember(fullName, phone, goal, joiningDate, plan, fee, paymentStatus, notes) {
  return {
    id: `demo-member-${Math.random().toString(36).slice(2, 8)}`,
    gym_id: "demo-gym",
    full_name: fullName,
    phone,
    goal,
    joining_date: joiningDate,
    plan,
    fee,
    payment_status: paymentStatus,
    last_payment_date: joiningDate,
    expiry_date: computeExpiry(joiningDate, plan),
    notes,
    created_at: new Date().toISOString()
  };
}

function createDemoAttendance(memberId, daysAgo, inHour, inMinute, outHour, outMinute) {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() - daysAgo);
  checkIn.setHours(inHour, inMinute, 0, 0);
  const item = {
    id: `demo-att-${Math.random().toString(36).slice(2, 8)}`,
    gym_id: "demo-gym",
    member_id: memberId,
    check_in_at: checkIn.toISOString(),
    check_out_at: null,
    duration_minutes: null,
    marked_by: "demo-owner",
    created_at: new Date().toISOString()
  };

  if (outHour !== null && outMinute !== null) {
    const checkOut = new Date(checkIn);
    checkOut.setHours(outHour, outMinute, 0, 0);
    item.check_out_at = checkOut.toISOString();
    item.duration_minutes = getLiveDurationMinutes(item.check_in_at, item.check_out_at);
  }

  return item;
}

function dateOffset(date, offsetDays) {
  const next = new Date(date);
  next.setDate(next.getDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

