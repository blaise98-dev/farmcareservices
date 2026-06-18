import axios from 'axios';

// In dev, Vite proxies /api → backend so baseURL can be empty (avoids CORS).
// In production set VITE_API_URL to the deployed backend URL.
const BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

export const api = axios.create({ baseURL: BASE });

// Inject JWT token into every request made through this instance.
// axios.create() does NOT inherit axios.defaults, so we need our own interceptor.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('moome_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear stale token so the user is sent back to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('moome_token');
      localStorage.removeItem('moome_user');
      // Navigate to login without a hard reload if possible
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// Dashboard
export const getDashboardSummary = () => api.get('/api/dashboard/summary').then(r => r.data);
export const getRecentAlerts     = () => api.get('/api/dashboard/recent-alerts').then(r => r.data);
export const getMilkTrend        = () => api.get('/api/dashboard/milk-trend').then(r => r.data);
export const getEnvTrend         = () => api.get('/api/dashboard/env-trend').then(r => r.data);
export const getSystemLogs       = () => api.get('/api/dashboard/system-logs').then(r => r.data);

// Herd
export const getCows             = () => api.get('/api/herd/').then(r => r.data);
export const getCow              = (id) => api.get(`/api/herd/${id}`).then(r => r.data);
export const updateCow           = (id, body) => api.patch(`/api/herd/${id}`, body).then(r => r.data);
export const getHerdCounts       = () => api.get('/api/herd/summary/counts').then(r => r.data);

// Milk
export const getMilk             = (days=7) => api.get(`/api/milk/?days=${days}`).then(r => r.data);
export const getMilkDailySummary = (days=7) => api.get(`/api/milk/daily-summary?days=${days}`).then(r => r.data);
export const getTopProducers     = () => api.get('/api/milk/top-producers').then(r => r.data);
export const addMilkRecord       = (body) => api.post('/api/milk/', body).then(r => r.data);
export const getTodaySessions    = () => api.get('/api/milk/sessions/today').then(r => r.data);

// Feed
export const getFeed             = (days=7) => api.get(`/api/feed/?days=${days}`).then(r => r.data);
export const getFeedDailySummary = () => api.get('/api/feed/daily-summary').then(r => r.data);
export const getWaterToday       = () => api.get('/api/feed/water/today').then(r => r.data);
export const addFeedRecord       = (body) => api.post('/api/feed/', body).then(r => r.data);

// Environment
export const getEnvHistory       =(hours=24) => api.get(`/api/environment/history?hours=${hours}`).then(r => r.data);
export const getEnvDailyAvg      = () => api.get('/api/environment/daily-averages').then(r => r.data);
export const getCowTemperatures  = () => api.get('/api/environment/cow-temperatures').then(r => r.data);
export const addEnvReading       = (body) => api.post('/api/environment/', body).then(r => r.data);

// Alerts
export const getAlerts           = (resolved=false) => api.get(`/api/alerts/?resolved=${resolved}`).then(r => r.data);
export const resolveAlert        = (id) => api.patch(`/api/alerts/${id}/resolve`).then(r => r.data);
export const createAlert         = (body) => api.post('/api/alerts/', body).then(r => r.data);
export const getSmsLogs          = () => api.get('/api/alerts/sms-logs').then(r => r.data);
export const getAlertStats       = () => api.get('/api/alerts/stats').then(r => r.data);
export const getVetReports       = () => api.get('/api/alerts/vet-reports').then(r => r.data);

// Economics
export const getComponents           = () => api.get('/api/economics/components').then(r => r.data);
export const getComponentsByCategory = () => api.get('/api/economics/components/by-category').then(r => r.data);
export const getMilkRevenue          =(price=400) => api.get(`/api/economics/milk-revenue?price_per_liter=${price}`).then(r => r.data);
export const getFarmInfo             = () => api.get('/api/economics/farm-info').then(r => r.data);
export const getEconomicsSummary     = () => api.get('/api/economics/summary').then(r => r.data);

// Dashboard herd health trend
export const getHerdHealthTrend  = () => api.get('/api/dashboard/herd-health-trend').then(r => r.data);

// Predictions
export const getPredictions      = () => api.get('/api/predictions/').then(r => r.data);
export const getHealthRisks      = () => api.get('/api/predictions/health-risks').then(r => r.data);
export const getMilkYieldPreds   = () => api.get('/api/predictions/milk-yield').then(r => r.data);
// Herd — cow registration
export const registerCow         = (body) => api.post('/api/herd/register', body).then(r => r.data);
export const getNextRfid         = () => api.get('/api/herd/next-rfid').then(r => r.data);
export const getHerdAnalytics    =() => api.get('/api/herd/analytics').then(r => r.data);

// Feed — methane tracking
export const getMethaneSummary   = () => api.get('/api/feed/methane-summary').then(r => r.data);

// Cow Economics
export const getCowEconSummary   = () => api.get('/api/cow-economics/summary').then(r => r.data);
export const getCowEconDetail    = (id) => api.get(`/api/cow-economics/cow/${id}`).then(r => r.data);
export const getCowEconFleet     = () => api.get('/api/cow-economics/fleet').then(r => r.data);
export const addCowCost          = (body) => api.post('/api/cow-economics/costs', body).then(r => r.data);
export const addCowRevenue       = (body) => api.post('/api/cow-economics/revenues', body).then(r => r.data);
export const deleteCowCost       = (id) => api.delete(`/api/cow-economics/costs/${id}`).then(r => r.data);
export const deleteCowRevenue    = (id) => api.delete(`/api/cow-economics/revenues/${id}`).then(r => r.data);

// Auth — user management
export const getUsers            = () => api.get('/api/auth/users').then(r => r.data);
export const getVets             = () => api.get('/api/auth/vets').then(r => r.data);
export const createUser          = (body) => api.post('/api/auth/users/create', body).then(r => r.data);
export const updateUser          = (id, body) => api.patch(`/api/auth/users/${id}`, body).then(r => r.data);

// Auth — password reset (public, no login required)
export const requestPasswordReset = (identifier) =>
  api.post('/api/auth/forgot-password', { identifier }).then(r => r.data);
export const validateResetToken   = (token) =>
  api.get('/api/auth/reset-password/validate', { params: { token } }).then(r => r.data);
export const resetPassword        = (token, newPassword) =>
  api.post('/api/auth/reset-password', { token, new_password: newPassword }).then(r => r.data);

// Admin reports
export const getAdminActivityLogs  = (limit = 100) => api.get(`/api/admin/activity-logs?limit=${limit}`).then(r => r.data);
export const getAdminUserActivity  = () => api.get('/api/admin/user-activity').then(r => r.data);
export const getAdminPlatformReport = () => api.get('/api/admin/platform-report').then(r => r.data);
export const getAdminAlertHistory  = (days = 30, alertType = '', severity = '') => {
  const params = new URLSearchParams({ days });
  if (alertType) params.append('alert_type', alertType);
  if (severity)  params.append('severity', severity);
  return api.get(`/api/admin/alert-history?${params}`).then(r => r.data);
};

// User management — delete + admin password reset
export const deleteUser            = (id) => api.delete(`/api/auth/users/${id}`).then(r => r.data);
export const adminResetPassword    = (id, newPassword) => api.post(`/api/auth/users/${id}/reset-password`, { new_password: newPassword }).then(r => r.data);

// Reproduction
export const getReproduction       = () => api.get('/api/reproduction/').then(r => r.data);
export const getReproSummary       = () => api.get('/api/reproduction/summary').then(r => r.data);
export const getCowRepro           = (cowId) => api.get(`/api/reproduction/cow/${cowId}`).then(r => r.data);
export const addReproRecord        = (body) => api.post('/api/reproduction/', body).then(r => r.data);
export const deleteReproRecord     =(id) => api.delete(`/api/reproduction/${id}`).then(r => r.data);
export const getTreatments         = () => api.get('/api/reproduction/treatments').then(r => r.data);
export const getCowTreatments      = (cowId) => api.get(`/api/reproduction/treatments/cow/${cowId}`).then(r => r.data);
export const addTreatment          = (body) => api.post('/api/reproduction/treatments', body).then(r => r.data);
export const completeTreatment     = (id) => api.patch(`/api/reproduction/treatments/${id}/complete`).then(r => r.data);
export const getVaccinations       = () => api.get('/api/reproduction/vaccinations').then(r => r.data);
export const getVaccinationsDue    = () => api.get('/api/reproduction/vaccinations/due').then(r => r.data);
export const addVaccination        = (body) => api.post('/api/reproduction/vaccinations', body).then(r => r.data);

// Feed Inventory
export const getFeedInventory      = () => api.get('/api/feed-inventory/').then(r => r.data);
export const getFeedInventorySummary = () => api.get('/api/feed-inventory/summary').then(r => r.data);
export const addFeedInventoryItem  = (body) => api.post('/api/feed-inventory/', body).then(r => r.data);
export const updateFeedInventoryItem = (id, body) => api.patch(`/api/feed-inventory/${id}`, body).then(r => r.data);
export const deleteFeedInventoryItem = (id) => api.delete(`/api/feed-inventory/${id}`).then(r => r.data);

// Groups
export const getGroups             = () => api.get('/api/groups/').then(r => r.data);
export const getGroupMembers       = (id) => api.get(`/api/groups/${id}/members`).then(r => r.data);
export const createGroup           = (body) => api.post('/api/groups/', body).then(r => r.data);
export const addGroupMembers       = (id, cowIds) => api.post(`/api/groups/${id}/members`, { cow_ids: cowIds }).then(r => r.data);
export const removeGroupMember     = (groupId, cowId) => api.delete(`/api/groups/${groupId}/members/${cowId}`).then(r => r.data);
export const deleteGroup           = (id) => api.delete(`/api/groups/${id}`).then(r => r.data);

// Notifications
export const getNotifications      = () => api.get('/api/notifications/').then(r => r.data);
export const getUnreadCount        = () => api.get('/api/notifications/unread-count').then(r => r.data);
export const markNotifRead         = (id) => api.patch(`/api/notifications/${id}/read`).then(r => r.data);
export const markAllNotifRead      = () => api.patch('/api/notifications/read-all').then(r => r.data);

// Tanks
export const getTanks              = () => api.get('/api/tanks/').then(r => r.data);
export const getTankHistory        = (id) => api.get(`/api/tanks/${id}/history`).then(r => r.data);
export const addTankReading        = (body) => api.post('/api/tanks/readings', body).then(r => r.data);
export const createTank            = (body) => api.post('/api/tanks/', body).then(r => r.data);

// Weekly Plan
export const getWeeklyTasks        = (days=7) => api.get(`/api/weekly-plan/?days=${days}`).then(r => r.data);
export const getTodayTasks         = () => api.get('/api/weekly-plan/today').then(r => r.data);
export const createTask            = (body) => api.post('/api/weekly-plan/', body).then(r => r.data);
export const updateTask            = (id, body) => api.patch(`/api/weekly-plan/${id}`, body).then(r => r.data);
export const deleteTask            = (id) => api.delete(`/api/weekly-plan/${id}`).then(r => r.data);

// Feedback
export const getAllFeedback        = () => api.get('/api/feedback/').then(r => r.data);
export const getMyFeedback        = () => api.get('/api/feedback/my').then(r => r.data);
export const submitFeedback       = (body) => api.post('/api/feedback/', body).then(r => r.data);
export const replyFeedback        = (id, body) => api.patch(`/api/feedback/${id}/reply`, body).then(r => r.data);
export const deleteFeedback       = (id) => api.delete(`/api/feedback/${id}`).then(r => r.data);

// IoT Device Control
export const getDeviceStatus      = () => api.get('/api/iot/devices').then(r => r.data);
export const getControlLogs       = (limit=100) => api.get(`/api/iot/logs?limit=${limit}`).then(r => r.data);
export const sendDeviceCommand    = (body) => api.post('/api/iot/command', body).then(r => r.data);
export const logCalibration       = (body) => api.post('/api/iot/calibrate', body).then(r => r.data);

// SMS Configuration
export const getSmsSubscribers    = () => api.get('/api/sms-config/subscribers').then(r => r.data);
export const addSmsSubscriber     = (body) => api.post('/api/sms-config/subscribers', body).then(r => r.data);
export const updateSmsSubscriber  = (id, body) => api.patch(`/api/sms-config/subscribers/${id}`, body).then(r => r.data);
export const deleteSmsSubscriber  = (id) => api.delete(`/api/sms-config/subscribers/${id}`).then(r => r.data);
export const getSmsHistory        = (limit=100) => api.get(`/api/sms-config/sms-logs?limit=${limit}`).then(r => r.data);

// Body Condition Score
export const getBCS               = () => api.get('/api/reproduction/bcs').then(r => r.data);
export const addBCS               = (body) => api.post('/api/reproduction/bcs', body).then(r => r.data);

// Profile avatar upload (base64 stored in Users table)
export const updateAvatar         = (avatarDataUrl) => api.patch('/api/auth/avatar', { avatar_url: avatarDataUrl }).then(r => r.data);

// Cow activity sensor
export const getCowActivity       = () => api.get('/api/herd/activity').then(r => r.data);
