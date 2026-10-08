import AsyncStorage from "@react-native-async-storage/async-storage";

export const API =
  process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.40:5000/api";

async function req(path: string, opts: any = {}) {
  const token = await AsyncStorage.getItem("token");

  const r = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const d = await r.json();

  if (!r.ok) {
    throw new Error(d.error || d.detail || "Request failed");
  }

  return d;
}

export const api = {
  // ---------------- AUTH ----------------
  login: (mobile: string, password: string) =>
    req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ mobile, password }),
    }),

  register: (x: any) =>
    req("/auth/register", {
      method: "POST",
      body: JSON.stringify(x),
    }),

  // ---------------- FARMER ----------------
  forecast: (x: any) =>
    req("/forecast", {
      method: "POST",
      body: JSON.stringify(x),
    }),

  waiting: (x: any) =>
    req("/waiting-time/predict", {
      method: "POST",
      body: JSON.stringify(x),
    }),

  centres: (x: any) =>
    req("/centres/recommend", {
      method: "POST",
      body: JSON.stringify(x),
    }),

  slots: (x: any) =>
    req("/slots/recommend", {
      method: "POST",
      body: JSON.stringify(x),
    }),

  book: (x: any) =>
    req("/bookings", {
      method: "POST",
      body: JSON.stringify(x),
    }),

  bookings: () =>
    req("/bookings/my"),

  // ---------------- ADMIN ----------------
  adminDashboard: () =>
    req("/admin/dashboard"),

  adminQueue: () =>
    req("/admin/queue"),

  adminCheckIn: (
    booking_id: string,
    active_counters: number
  ) =>
    req("/admin/check-in", {
      method: "POST",
      body: JSON.stringify({
        booking_id,
        active_counters,
      }),
    }),

  adminStatus: (
    booking_id: string,
    status: string
  ) =>
    req(`/admin/bookings/${booking_id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // ---------------- GOVERNMENT ----------------

  // Main government dashboard
  governmentDashboard: () =>
    req("/government/dashboard"),

  // Government analytics
  governmentAnalytics: () =>
    req("/government/analytics"),

  // Get announcements
  governmentAnnouncements: () =>
    req("/government/announcements"),

  // Create announcement
  createGovernmentAnnouncement: (x: any) =>
    req("/government/announcements", {
      method: "POST",
      body: JSON.stringify(x),
    }),
};