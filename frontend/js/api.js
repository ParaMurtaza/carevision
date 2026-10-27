/* ==========================================================================
   api.js - the ONLY file that talks to the backend.
   Every other frontend file calls CareVisionAPI.* instead of using fetch().
   Same-origin deployment => API_BASE can stay empty.
   ========================================================================== */
const CareVisionAPI = (() => {
  const API_BASE = ''; // e.g. 'https://your-app.onrender.com' if frontend is hosted separately
  const TOKEN_KEY = 'cv_token';
  const USER_KEY = 'cv_user';

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getUser = () => JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  const isLoggedIn = () => !!getToken();

  async function request(path, { method = 'GET', body, isForm = false } = {}) {
    const headers = {};
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    if (body && !isForm) headers['Content-Type'] = 'application/json';

    const res = await fetch(API_BASE + '/api' + path, {
      method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) logout();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  function agentUpload(path, file, notes) {
    const form = new FormData();
    form.append('file', file);
    form.append('notes', notes || '');
    return request(path, { method: 'POST', body: form, isForm: true });
  }

  function saveSession({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return {
    isLoggedIn, getUser, logout,
    async register(payload) { const d = await request('/auth/register', { method: 'POST', body: payload }); saveSession(d); return d; },
    async login(payload)    { const d = await request('/auth/login',    { method: 'POST', body: payload }); saveSession(d); return d; },
    getDoctors: () => request('/doctors'),
    triage: (payload) => request('/ai/triage', { method: 'POST', body: payload }),
    bookAppointment: (payload) => request('/appointments', { method: 'POST', body: payload }),
    myAppointments: () => request('/appointments/mine'),
    doctorQueue: () => request('/appointments/queue'),
    completeCase: (id, payload) => request(`/appointments/${id}/complete`, { method: 'PATCH', body: payload }),
    uploadReport(file, type) {
      const form = new FormData();
      form.append('report', file);
      form.append('type', type || 'General');
      return request('/reports', { method: 'POST', body: form, isForm: true });
    },
    myReports: () => request('/reports'),
    // --- AI agents ---
    supportChat: (messages) => request('/agents/support', { method: 'POST', body: { messages } }),
    analyseImaging: (file, notes) => agentUpload('/agents/imaging', file, notes),
    analyseSkin: (file, notes) => agentUpload('/agents/skin', file, notes),
    agentHistory: () => request('/agents/history'),
    aiStatus: () => request('/agents/status'),
    // --- recommendations + AI report ---
    recommendDoctors: (speciality, urgency) => request('/ai/recommend-doctors', { method: 'POST', body: { speciality, urgency } }),
    healthReport: (source, analysis) => request('/ai/health-report', { method: 'POST', body: { source, analysis } }),
    me: () => request('/auth/me'),
    // --- patient ---
    cancelAppointment: (id) => request(`/appointments/${id}/cancel`, { method: 'PATCH' }),
    async updateProfile(payload) {
      const d = await request('/auth/me', { method: 'PATCH', body: payload });
      localStorage.setItem(USER_KEY, JSON.stringify(d.user));
      return d;
    },
    // --- services / orders ---
    catalog: () => request('/services/catalog'),
    createRequest: (payload) => request('/services/requests', { method: 'POST', body: payload }),
    myRequests: () => request('/services/requests/mine'),
    cancelRequest: (id) => request(`/services/requests/${id}/cancel`, { method: 'PATCH' }),
    // --- doctor ---
    doctorMe: () => request('/doctors/me'),
    doctorHistory: () => request('/appointments/queue?status=completed'),
    patientRecords: (userId) => request(`/appointments/patient/${userId}/records`),
    // --- admin ---
    adminStats: () => request('/admin/stats'),
    adminUsers: () => request('/admin/users'),
    adminToggleUser: (id) => request(`/admin/users/${id}/toggle`, { method: 'PATCH' }),
    adminAddDoctor: (payload) => request('/admin/doctors', { method: 'POST', body: payload }),
    adminUpdateDoctor: (id, payload) => request(`/admin/doctors/${id}`, { method: 'PATCH', body: payload }),
    adminDeleteDoctor: (id) => request(`/admin/doctors/${id}`, { method: 'DELETE' }),
    adminAppointments: () => request('/admin/appointments'),
    adminRequests: () => request('/admin/requests'),
    adminSetRequest: (id, status) => request(`/admin/requests/${id}`, { method: 'PATCH', body: { status } })
  };
})();
