/* =============================================================
   FitPro Gym Manager — script.js
   All app logic: navigation, CRUD, attendance, localStorage
   ============================================================= */

/* ===================== STATE ===================== */
let members = [];        // Array of member objects
let attendance = {};     // { "YYYY-MM-DD": [memberId, ...] }
let currentPage = 'dashboard';

/* ===================== INIT ===================== */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setTodayDate();
  navigate('dashboard');
  setDefaultJoiningDate();
  setupSidebar();
  setupModal();

  // Seed sample data if empty
  if (members.length === 0) seedSampleData();
});

/* ===================== LOCAL STORAGE ===================== */
function saveData() {
  localStorage.setItem('fitpro_members', JSON.stringify(members));
  localStorage.setItem('fitpro_attendance', JSON.stringify(attendance));
}

function loadData() {
  const m = localStorage.getItem('fitpro_members');
  const a = localStorage.getItem('fitpro_attendance');
  members = m ? JSON.parse(m) : [];
  attendance = a ? JSON.parse(a) : {};
}

/* ===================== SEED DATA ===================== */
function seedSampleData() {
  const today = new Date();
  const fmt = d => d.toISOString().split('T')[0];

  const sampleMembers = [
    { name: 'Rahul Sharma',    phone: '9876543210', joiningDate: fmt(addDays(today, -60)), plan: 'Monthly',     paymentStatus: 'Paid',    notes: 'Evening batch' },
    { name: 'Priya Patel',     phone: '9812345678', joiningDate: fmt(addDays(today, -25)), plan: 'Quarterly',   paymentStatus: 'Paid',    notes: '' },
    { name: 'Amit Verma',      phone: '9998887776', joiningDate: fmt(addDays(today, -90)), plan: 'Monthly',     paymentStatus: 'Overdue', notes: 'Morning slot' },
    { name: 'Sneha Reddy',     phone: '9123456789', joiningDate: fmt(addDays(today, -10)), plan: 'Half-Yearly', paymentStatus: 'Paid',    notes: '' },
    { name: 'Vikram Singh',    phone: '9011223344', joiningDate: fmt(addDays(today, -55)), plan: 'Monthly',     paymentStatus: 'Pending', notes: '' },
    { name: 'Divya Nair',      phone: '9876001234', joiningDate: fmt(addDays(today, -5)),  plan: 'Annual',      paymentStatus: 'Paid',    notes: 'VIP member' },
    { name: 'Karan Mehta',     phone: '9765432109', joiningDate: fmt(addDays(today, -29)), plan: 'Monthly',     paymentStatus: 'Paid',    notes: '' },
    { name: 'Anjali Gupta',    phone: '9654321098', joiningDate: fmt(addDays(today, -120)),plan: 'Quarterly',   paymentStatus: 'Overdue', notes: '' },
  ];

  sampleMembers.forEach(m => {
    members.push(createMember(m));
  });

  // Seed some attendance for today
  const todayKey = getTodayKey();
  attendance[todayKey] = [members[0].id, members[1].id, members[3].id];

  saveData();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/* ===================== MEMBER HELPERS ===================== */
function createMember({ name, phone, joiningDate, plan, paymentStatus, notes }) {
  const expiry = computeExpiry(joiningDate, plan);
  return {
    id: 'M' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase(),
    name: name.trim(),
    phone: phone.trim(),
    joiningDate,
    plan,
    paymentStatus,
    notes: notes || '',
    expiry,
    createdAt: new Date().toISOString(),
  };
}

function computeExpiry(joiningDate, plan) {
  const d = new Date(joiningDate);
  const map = { 'Monthly': 30, 'Quarterly': 90, 'Half-Yearly': 180, 'Annual': 365 };
  d.setDate(d.getDate() + (map[plan] || 30));
  return d.toISOString().split('T')[0];
}

function getMemberStatus(member) {
  const today = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(member.expiry);
  const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return 'Expired';
  if (diff <= 7) return 'Expiring';
  return 'Active';
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getDaysRemaining(expiry) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiry);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
}

function getAvatarClass(index) {
  return 'av-' + (index % 5);
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substr(0, 2);
}

/* ===================== NAVIGATION ===================== */
function navigate(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target page
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  // Update sidebar links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Update bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  currentPage = page;

  // Render page-specific content
  if (page === 'dashboard')  renderDashboard();
  if (page === 'members')    renderMembers();
  if (page === 'attendance') renderAttendancePage();

  // Close mobile sidebar
  closeSidebar();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Allow sidebar nav links to trigger navigation
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigate(link.dataset.page);
  });
});

/* ===================== SIDEBAR ===================== */
function setupSidebar() {
  const hamburger = document.getElementById('hamburgerBtn');
  const overlay   = document.getElementById('sidebarOverlay');
  const sidebar   = document.getElementById('sidebar');

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });
  overlay.addEventListener('click', closeSidebar);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

/* ===================== DASHBOARD RENDER ===================== */
function renderDashboard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayKey = getTodayKey();

  const total   = members.length;
  const active  = members.filter(m => getMemberStatus(m) === 'Active').length;
  const expiring = members.filter(m => getMemberStatus(m) === 'Expiring').length;
  const todayAtt = (attendance[todayKey] || []).length;

  document.getElementById('totalMembers').textContent    = total;
  document.getElementById('activeMembers').textContent   = active;
  document.getElementById('expiringSoon').textContent    = expiring;
  document.getElementById('todayAttendance').textContent = todayAtt;

  // Recent members (last 5 added)
  const recent = [...members].reverse().slice(0, 5);
  const recentList = document.getElementById('recentMembersList');
  if (recent.length === 0) {
    recentList.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px 0">No members yet. Add your first member!</p>';
  } else {
    recentList.innerHTML = recent.map((m, i) => `
      <div class="recent-item" onclick="openMemberModal('${m.id}')">
        <div class="member-avatar-small ${getAvatarClass(i)}">${getInitials(m.name)}</div>
        <div class="recent-info">
          <div class="recent-name">${m.name}</div>
          <div class="recent-meta">${m.plan} · ${m.phone}</div>
        </div>
        <span class="status-badge status-${getMemberStatus(m).toLowerCase()}">${getMemberStatus(m)}</span>
      </div>
    `).join('');
  }

  // Expiring plans (within 7 days)
  const expiringSoon = members.filter(m => getMemberStatus(m) === 'Expiring');
  document.getElementById('expiryBadge').textContent = expiringSoon.length;
  const expiringList = document.getElementById('expiringList');
  if (expiringSoon.length === 0) {
    expiringList.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px 0">No plans expiring in 7 days 🎉</p>';
  } else {
    expiringList.innerHTML = expiringSoon.map((m, i) => {
      const days = getDaysRemaining(m.expiry);
      return `
        <div class="recent-item" onclick="openMemberModal('${m.id}')">
          <div class="member-avatar-small ${getAvatarClass(i)}">${getInitials(m.name)}</div>
          <div class="recent-info">
            <div class="recent-name">${m.name}</div>
            <div class="recent-meta">${m.plan} · Expires ${formatDate(m.expiry)}</div>
          </div>
          <span class="status-badge status-expiring">${days}d left</span>
        </div>
      `;
    }).join('');
  }
}

/* ===================== ADD MEMBER ===================== */
function setDefaultJoiningDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('joiningDate').value = today;
}

function addMember() {
  // Get values
  const name          = document.getElementById('memberName').value.trim();
  const phone         = document.getElementById('memberPhone').value.trim();
  const joiningDate   = document.getElementById('joiningDate').value;
  const plan          = document.getElementById('memberPlan').value;
  const paymentStatus = document.querySelector('input[name="paymentStatus"]:checked')?.value;
  const notes         = document.getElementById('memberNotes').value.trim();

  // Validate
  let valid = true;

  const clearErrors = () => {
    document.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));
  };
  clearErrors();

  if (!name) {
    document.getElementById('memberName').classList.add('error');
    valid = false;
  }
  if (!phone || !/^\d{10}$/.test(phone)) {
    document.getElementById('memberPhone').classList.add('error');
    valid = false;
  }
  if (!joiningDate) {
    document.getElementById('joiningDate').classList.add('error');
    valid = false;
  }
  if (!plan) {
    document.getElementById('memberPlan').classList.add('error');
    valid = false;
  }
  if (!paymentStatus) {
    showToast('Please select payment status', 'warning');
    valid = false;
  }

  if (!valid) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  // Check duplicate phone
  if (members.find(m => m.phone === phone)) {
    document.getElementById('memberPhone').classList.add('error');
    showToast('A member with this phone already exists', 'error');
    return;
  }

  // Create & save
  const member = createMember({ name, phone, joiningDate, plan, paymentStatus, notes });
  members.push(member);
  saveData();

  showToast(`${name} added successfully! 🎉`, 'success');
  clearForm();
  navigate('members');
}

function clearForm() {
  document.getElementById('memberName').value = '';
  document.getElementById('memberPhone').value = '';
  document.getElementById('memberNotes').value = '';
  document.getElementById('memberPlan').value = '';
  document.querySelector('input[name="paymentStatus"]:checked') &&
    (document.querySelector('input[name="paymentStatus"]:checked').checked = false);
  setDefaultJoiningDate();
  document.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));
}

/* ===================== MEMBERS LIST ===================== */
function renderMembers() {
  const query  = document.getElementById('searchInput').value.toLowerCase();
  const plan   = document.getElementById('filterPlan').value;
  const status = document.getElementById('filterStatus').value;

  let filtered = members.filter(m => {
    const matchQuery  = m.name.toLowerCase().includes(query) || m.phone.includes(query);
    const matchPlan   = !plan   || m.plan === plan;
    const matchStatus = !status || getMemberStatus(m) === status;
    return matchQuery && matchPlan && matchStatus;
  });

  document.getElementById('membersCount').textContent = `${filtered.length} of ${members.length} members`;

  const emptyState = document.getElementById('membersEmptyState');

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    document.getElementById('membersTableBody').innerHTML = '';
    document.getElementById('membersCards').innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';

  // --- Desktop Table ---
  document.getElementById('membersTableBody').innerHTML = filtered.map((m, i) => {
    const status  = getMemberStatus(m);
    const todayKey = getTodayKey();
    const checkedIn = (attendance[todayKey] || []).includes(m.id);
    return `
      <tr>
        <td>
          <div class="table-name-cell">
            <div class="member-avatar-small ${getAvatarClass(i)}" style="width:32px;height:32px;font-size:12px">${getInitials(m.name)}</div>
            <span>${m.name}</span>
          </div>
        </td>
        <td>${m.phone}</td>
        <td>${m.plan}</td>
        <td>${formatDate(m.joiningDate)}</td>
        <td>${formatDate(m.expiry)}</td>
        <td><span class="status-badge status-${m.paymentStatus.toLowerCase()}">${m.paymentStatus}</span></td>
        <td><span class="status-badge status-${status.toLowerCase()}">${status}</span></td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="checkin-btn ${checkedIn ? 'checked' : ''}" 
              onclick="checkIn('${m.id}')" 
              ${checkedIn ? 'disabled' : ''}
              style="padding:6px 12px;font-size:12px;min-width:auto">
              ${checkedIn ? '✔ Checked In' : 'Check In'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="openMemberModal('${m.id}')">⋯</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // --- Mobile Cards ---
  document.getElementById('membersCards').innerHTML = filtered.map((m, i) => {
    const status   = getMemberStatus(m);
    const todayKey = getTodayKey();
    const checkedIn = (attendance[todayKey] || []).includes(m.id);
    return `
      <div class="member-card">
        <div class="member-card-header">
          <div class="member-card-identity">
            <div class="member-avatar-small ${getAvatarClass(i)}">${getInitials(m.name)}</div>
            <div>
              <div class="member-card-name">${m.name}</div>
              <div class="member-card-phone">${m.phone}</div>
            </div>
          </div>
          <span class="status-badge status-${status.toLowerCase()}">${status}</span>
        </div>
        <div class="member-card-details">
          <div class="detail-item">
            <span class="detail-label">Plan</span>
            <span class="detail-value">${m.plan}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Expiry</span>
            <span class="detail-value">${formatDate(m.expiry)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Payment</span>
            <span class="detail-value"><span class="status-badge status-${m.paymentStatus.toLowerCase()}">${m.paymentStatus}</span></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Joined</span>
            <span class="detail-value">${formatDate(m.joiningDate)}</span>
          </div>
        </div>
        <div class="member-card-actions">
          <button class="checkin-btn ${checkedIn ? 'checked' : ''}"
            onclick="checkIn('${m.id}')"
            ${checkedIn ? 'disabled' : ''}>
            ${checkedIn ? '✔ Checked In' : '🏃 Check In'}
          </button>
          <button class="btn btn-outline btn-sm" onclick="openMemberModal('${m.id}')">Details</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ===================== ATTENDANCE ===================== */
function renderAttendancePage() {
  const todayKey = getTodayKey();
  const todayCheckins = attendance[todayKey] || [];

  // Update today's count
  document.getElementById('todayCountPill').textContent = `${todayCheckins.length} today`;
  document.getElementById('checkinCount').textContent    = todayCheckins.length;

  // Set date
  document.getElementById('attendanceDate').textContent = formatDate(todayKey);

  // Render search results
  renderAttendanceList();

  // Render today's checkin list
  const list = document.getElementById('todayCheckinList');
  const empty = document.getElementById('attendanceEmpty');

  if (todayCheckins.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    list.innerHTML = todayCheckins.map(id => {
      const m = members.find(m => m.id === id);
      if (!m) return '';
      return `
        <div class="checkin-item">
          <div class="checkin-check">✓</div>
          <div class="checkin-info">
            <div class="checkin-name">${m.name}</div>
            <div class="checkin-time">${m.plan} plan · ${m.phone}</div>
          </div>
          <span class="status-badge status-active">Checked In</span>
        </div>
      `;
    }).filter(Boolean).join('');
  }
}

function renderAttendanceList() {
  const query = document.getElementById('attendanceSearch').value.toLowerCase();
  const todayKey = getTodayKey();
  const todayCheckins = attendance[todayKey] || [];

  const results = document.getElementById('attendanceSearchResults');

  if (!query) {
    results.innerHTML = '';
    return;
  }

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query) || m.phone.includes(query)
  ).slice(0, 6);

  if (filtered.length === 0) {
    results.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:14px">No members found</p>';
    return;
  }

  results.innerHTML = filtered.map((m, i) => {
    const checkedIn = todayCheckins.includes(m.id);
    return `
      <div class="attendance-result-item">
        <div class="attendance-member-info">
          <div class="member-avatar-small ${getAvatarClass(i)}" style="width:36px;height:36px;font-size:13px">${getInitials(m.name)}</div>
          <div>
            <div class="att-name">${m.name}</div>
            <div class="att-plan">${m.plan} · ${m.phone}</div>
          </div>
        </div>
        <button
          class="checkin-btn ${checkedIn ? 'checked' : ''}"
          onclick="checkIn('${m.id}')"
          ${checkedIn ? 'disabled' : ''}>
          ${checkedIn ? '✔ Checked In' : '✚ Check In'}
        </button>
      </div>
    `;
  }).join('');
}

/* ===================== CHECK-IN ===================== */
function checkIn(memberId) {
  const todayKey = getTodayKey();
  if (!attendance[todayKey]) attendance[todayKey] = [];

  if (attendance[todayKey].includes(memberId)) return;

  attendance[todayKey].push(memberId);
  saveData();

  const member = members.find(m => m.id === memberId);
  showToast(`${member?.name || 'Member'} checked in ✓`, 'success');

  // Re-render current page
  if (currentPage === 'attendance') renderAttendancePage();
  if (currentPage === 'members')    renderMembers();
}

/* ===================== MEMBER MODAL ===================== */
function setupModal() {
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
}

let currentModalMemberId = null;

function openMemberModal(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;

  currentModalMemberId = id;
  const status = getMemberStatus(m);
  const daysLeft = getDaysRemaining(m.expiry);

  document.getElementById('modalMemberName').textContent = m.name;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-field">
      <span class="modal-field-label">📞 Phone</span>
      <span class="modal-field-value">${m.phone}</span>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">📅 Joined</span>
      <span class="modal-field-value">${formatDate(m.joiningDate)}</span>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">📋 Plan</span>
      <span class="modal-field-value">${m.plan}</span>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">⏰ Expiry</span>
      <span class="modal-field-value">${formatDate(m.expiry)} <span style="color:var(--text-muted);font-size:12px">(${daysLeft > 0 ? daysLeft + 'd left' : 'Expired'})</span></span>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">💳 Payment</span>
      <span class="modal-field-value"><span class="status-badge status-${m.paymentStatus.toLowerCase()}">${m.paymentStatus}</span></span>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">🏋️ Status</span>
      <span class="modal-field-value"><span class="status-badge status-${status.toLowerCase()}">${status}</span></span>
    </div>
    ${m.notes ? `
    <div class="modal-field">
      <span class="modal-field-label">📝 Notes</span>
      <span class="modal-field-value" style="max-width:60%;text-align:right">${m.notes}</span>
    </div>` : ''}
  `;

  document.getElementById('deleteMemberBtn').onclick = () => deleteMember(id);
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  currentModalMemberId = null;
}

function deleteMember(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  if (!confirm(`Delete ${m.name}? This cannot be undone.`)) return;

  members = members.filter(m => m.id !== id);

  // Remove from attendance records
  Object.keys(attendance).forEach(day => {
    attendance[day] = attendance[day].filter(mid => mid !== id);
  });

  saveData();
  closeModal();
  showToast(`${m.name} has been removed`, 'success');

  if (currentPage === 'members') renderMembers();
  if (currentPage === 'dashboard') renderDashboard();
}

/* ===================== DATE HELPERS ===================== */
function setTodayDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const str = now.toLocaleDateString('en-IN', options);
  const el = document.getElementById('todayDate');
  if (el) el.textContent = str;
  const attDate = document.getElementById('attendanceDate');
  if (attDate) attDate.textContent = str;
}

/* ===================== TOAST ===================== */
let toastTimeout;
function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
