import React, { useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./src/api";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions } from "expo-camera";

type Screen =
  | "welcome"
  | "login"
  | "register"
  | "home"
  | "details"
  | "centres"
  | "slots"
  | "waiting"
  | "bookingSuccess"
  | "bookings"
  | "admin"
  | "adminScanner"
  | "government";

function AppContent() {
  const [screen, setScreen] = useState<Screen>("welcome");

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  // ---------------- FARMER PLANNING ----------------
  const [district, setDistrict] = useState("");
  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [centreRecommendations, setCentreRecommendations] = useState<any[]>([]);
  const [selectedCentre, setSelectedCentre] = useState<any | null>(null);
  const [slotRecommendations, setSlotRecommendations] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [predictedWait, setPredictedWait] = useState<number | null>(null);
  const [bookingResult, setBookingResult] = useState<any | null>(null);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  // ---------------- ADMIN / CENTRE OPERATOR ----------------
  const [adminDashboard, setAdminDashboard] = useState<any | null>(null);
  const [adminQueue, setAdminQueue] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [scanBookingId, setScanBookingId] = useState("");
  const [adminActiveCounters, setAdminActiveCounters] = useState("3");
  const [scannerLocked, setScannerLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // ---------------- GOVERNMENT OFFICIAL ----------------
  const [governmentDashboard, setGovernmentDashboard] = useState<any | null>(null);
  const [governmentAnalytics, setGovernmentAnalytics] = useState<any | null>(null);
  const [governmentAnnouncements, setGovernmentAnnouncements] = useState<any[]>([]);
  const [governmentLoading, setGovernmentLoading] = useState(false);
  const [governmentTab, setGovernmentTab] = useState<"dashboard" | "centres" | "analytics" | "alerts">("dashboard");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementDistrict, setAnnouncementDistrict] = useState("");
  const [announcementCrop, setAnnouncementCrop] = useState("");
  const [announcementPriority, setAnnouncementPriority] = useState("NORMAL");


  const DISTRICTS = [
    "Nawada",
    "Jehanabad",
    "Patna",
    "Gaya",
    "Nalanda",
    "Sheikhpura",
    "Jamui",
    "Aurangabad",
  ];

  const CROPS = ["Maize", "Paddy", "Wheat"];

  const openMandiPlanner = () => {
    setDistrict("");
    setCrop("");
    setQuantity("");
    setCentreRecommendations([]);
    setSelectedCentre(null);
    setSlotRecommendations([]);
    setSelectedSlot(null);
    setPredictedWait(null);
    setBookingResult(null);
    setScreen("details");
  };

  // ---------------- CENTRE RECOMMENDATION ----------------
  const getCentreRecommendations = async () => {
    if (!district || !crop || !quantity) {
      Alert.alert("Missing Information", "Please select district, crop and enter quantity.");
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity greater than 0.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.centres({ district, crop, quantity: parsedQuantity, top_n: 5 });
      if (!data?.recommendations?.length) {
        Alert.alert("No Centres Found", "No suitable procurement centres were found for your selection.");
        setCentreRecommendations([]);
        return;
      }
      setCentreRecommendations(data.recommendations);
      setScreen("centres");
    } catch (error: any) {
      Alert.alert("Recommendation Failed", error.message || "Could not get centre recommendations.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- SMART SLOT RECOMMENDATION ----------------
  const getSlotRecommendations = async (centre: any) => {
    setSelectedCentre(centre);
    setLoading(true);
    try {
      const data = await api.slots({
        district,
        crop,
        centre_id: centre.centre_id,
        top_n: 5,
      });

      if (!data?.recommendations?.length) {
        Alert.alert("No Slots Found", "No recommended slots are available for this centre.");
        setSlotRecommendations([]);
        return;
      }

      setSlotRecommendations(data.recommendations);
      setScreen("slots");
    } catch (error: any) {
      Alert.alert("Slot Recommendation Failed", error.message || "Could not get smart slot recommendations.");
    } finally {
      setLoading(false);
    }
  };


  // ---------------- WAITING TIME + BOOKING ----------------
  const selectSlotAndPredictWait = async (slot: any) => {
    setSelectedSlot(slot);
    setLoading(true);

    try {
      const now = new Date();
      const hour = Number(slot.hour);
      const dayOfWeek = now.getDay();
      const month = now.getMonth() + 1;

      // Use the historical slot profile as the model input where available.
      const data = await api.waiting({
        district,
        centre_id: selectedCentre?.centre_id,
        crop,
        hour,
        day_of_week: dayOfWeek,
        month,
        farmers_arrived: Number(slot.avg_arrivals || 0),
        queue_before: Number(slot.avg_queue || 0),
        active_counters: Number(slot.avg_counters || 0),
        avg_processing_time_min: Number(slot.avg_processing_time || 0),
        avg_quantity_quintal: Number(slot.avg_quantity || quantity || 0),
        staff_efficiency_index: Number(slot.avg_staff_efficiency || 0),
        weather_delay_min: Number(slot.avg_weather_delay || 0),
      });

      const wait = Number(data?.predicted_waiting_time_min);
      if (!Number.isFinite(wait)) {
        throw new Error("Waiting-time prediction was not returned.");
      }

      setPredictedWait(wait);
      setScreen("waiting");
    } catch (error: any) {
      Alert.alert(
        "Waiting Time Prediction Failed",
        error.message || "Could not predict waiting time."
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!selectedCentre || !selectedSlot) return;

    setLoading(true);
    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const data = await api.book({
        centre_id: selectedCentre.centre_id,
        district,
        crop,
        quantity: Number(quantity),
        date,
        hour: Number(selectedSlot.hour),
        expected_wait: predictedWait,
      });

      setBookingResult(data?.booking);
      setScreen("bookingSuccess");
    } catch (error: any) {
      Alert.alert(
        "Booking Failed",
        error.message || "Could not create your mandi booking."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------- MY BOOKINGS ----------------
  const loadMyBookings = async () => {
    setBookingsLoading(true);
    try {
      const data = await api.bookings();
      setMyBookings(data?.bookings || []);
      setScreen("bookings");
    } catch (error: any) {
      Alert.alert("Bookings Failed", error.message || "Could not load your bookings.");
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadAdminData = async () => {
    setAdminLoading(true);
    try {
      const [dash, queue] = await Promise.all([api.adminDashboard(), api.adminQueue()]);
      setAdminDashboard(dash);
      setAdminQueue(queue?.queue || []);
    } catch (error: any) {
      Alert.alert("Admin Dashboard Failed", error.message || "Could not load centre data.");
    } finally {
      setAdminLoading(false);
    }
  };

  const checkInFarmerById = async (rawId: string) => {
    const id = rawId.trim().toUpperCase();
    if (!id) {
      Alert.alert("Booking ID Required", "No valid booking ID was found in the QR code.");
      return false;
    }

    setAdminLoading(true);
    try {
      const data = await api.adminCheckIn(id, Number(adminActiveCounters) || 3);
      Alert.alert(
        "Check-in Successful",
        `Booking ${id} verified\nCounter ${data?.booking?.counter_no} assigned\nQueue position: ${data?.booking?.queue_position}`
      );
      setScanBookingId("");
      await loadAdminData();
      return true;
    } catch (error: any) {
      Alert.alert("Check-in Failed", error.message || "Could not check in farmer.");
      return false;
    } finally {
      setAdminLoading(false);
    }
  };

  const checkInFarmer = async () => {
    const id = scanBookingId.trim().toUpperCase();
    if (!id) {
      Alert.alert("Booking ID Required", "Enter the farmer's booking ID from the QR card.");
      return;
    }
    await checkInFarmerById(id);
  };

  const openAdminScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Allow camera access so the admin can scan a farmer's booking QR code."
        );
        return;
      }
    }
    setScannerLocked(false);
    setScreen("adminScanner");
  };

  const handleQrScanned = async ({ data }: { data: string }) => {
    if (scannerLocked || !data) return;

    setScannerLocked(true);
    const bookingId = data.trim();

    // Our KisanQueue QR currently contains the booking ID directly.
    // Also accept a URL/query-style payload if the format is changed later.
    const match = bookingId.match(/(?:booking[_-]?id[=:]|booking[\/?])([A-Za-z0-9-]+)/i);
    const normalizedId = match ? match[1] : bookingId;

    const success = await checkInFarmerById(normalizedId);
    if (success) {
      setScreen("admin");
    } else {
      setScannerLocked(false);
    }
  };

  const loadGovernmentData = async (keepTab = false) => {
    setGovernmentLoading(true);
    try {
      const governmentApi = api as any;
      if (typeof governmentApi.governmentDashboard !== "function" || typeof governmentApi.governmentAnalytics !== "function" || typeof governmentApi.governmentAnnouncements !== "function") {
        throw new Error("Government API methods are missing in src/api.ts. Add dashboard, analytics and announcements endpoints.");
      }

      const [dashboard, analytics, announcements] = await Promise.all([
        governmentApi.governmentDashboard(),
        governmentApi.governmentAnalytics(),
        governmentApi.governmentAnnouncements(),
      ]);

      setGovernmentDashboard(dashboard || {});
      setGovernmentAnalytics(analytics || {});
      setGovernmentAnnouncements(announcements?.announcements || []);
      if (!keepTab) setGovernmentTab("dashboard");
      setScreen("government");
    } catch (error: any) {
      Alert.alert("Government Dashboard Failed", error.message || "Could not load government data.");
    } finally {
      setGovernmentLoading(false);
    }
  };

  const createAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementMessage.trim()) {
      Alert.alert("Missing Information", "Please enter an announcement title and message.");
      return;
    }

    setGovernmentLoading(true);
    try {
      const governmentApi = api as any;
      await governmentApi.createGovernmentAnnouncement({
        title: announcementTitle.trim(),
        message: announcementMessage.trim(),
        district: announcementDistrict || null,
        crop: announcementCrop || null,
        priority: announcementPriority,
      });
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      setAnnouncementDistrict("");
      setAnnouncementCrop("");
      setAnnouncementPriority("NORMAL");
      const refreshed = await governmentApi.governmentAnnouncements();
      setGovernmentAnnouncements(refreshed?.announcements || []);
      Alert.alert("Announcement Published", "The announcement has been published successfully.");
    } catch (error: any) {
      Alert.alert("Publish Failed", error.message || "Could not publish the announcement.");
    } finally {
      setGovernmentLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: string) => {
    setAdminLoading(true);
    try {
      await api.adminStatus(bookingId, status);
      await loadAdminData();
    } catch (error: any) {
      Alert.alert("Update Failed", error.message || "Could not update booking status.");
    } finally {
      setAdminLoading(false);
    }
  };

  // ---------------- REGISTER ----------------
  const handleRegister = async () => {
    if (!name || !mobile || !password) {
      Alert.alert("Missing Information", "Please fill all fields.");
      return;
    }

    if (mobile.length !== 10) {
      Alert.alert("Invalid Mobile", "Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);

    try {
      await api.register({
        name,
        mobile,
        password,
        role: "FARMER",
        language: "en",
      });

      Alert.alert(
        "Registration Successful",
        "Your account has been created. Please login.",
        [
          {
            text: "Login",
            onPress: () => {
              setPassword("");
              setScreen("login");
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        "Registration Failed",
        error.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------- LOGIN ----------------
  const handleLogin = async () => {
    if (!mobile || !password) {
      Alert.alert("Missing Information", "Please enter mobile number and password.");
      return;
    }

    setLoading(true);

    try {
      const data = await api.login(mobile, password);

      // Save JWT token
      await AsyncStorage.setItem("token", data.access_token);

      // Save user information
      await AsyncStorage.setItem("user", JSON.stringify(data.user));

      // Clear password
      setPassword("");

      // Route by role. Farmer flow stays unchanged.
      const role = String(data?.user?.role || "FARMER").toUpperCase();
      if (role === "ADMIN") {
        await loadAdminData();
        setScreen("admin");
      } else if (role === "GOVERNMENT") {
        await loadGovernmentData();
      } else {
        setScreen("home");
      }
    } catch (error: any) {
      Alert.alert(
        "Login Failed",
        error.message || "Invalid mobile number or password."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------- WELCOME ----------------
  if (screen === "welcome") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.logo}>🌾</Text>

          <Text style={styles.title}>KisanQueue</Text>

          <Text style={styles.subtitle}>
            Smart Mandi Queue Management
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome, Farmer</Text>

            <Text style={styles.cardText}>
              Find the best procurement centre, recommended time slot,
              and expected waiting time.
            </Text>
          </View>

          <Pressable
            style={styles.button}
            onPress={() => setScreen("login")}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------- LOGIN ----------------
  if (screen === "login") {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.formContainer}>
            <Text style={styles.formLogo}>🌾</Text>

            <Text style={styles.formTitle}>Welcome Back</Text>

            <Text style={styles.formSubtitle}>
              Login to your KisanQueue account
            </Text>

            <Text style={styles.label}>Mobile Number</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter 10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              value={mobile}
              onChangeText={setMobile}
            />

            <Text style={styles.label}>Password</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Pressable
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </Pressable>

            <View style={styles.registerRow}>
              <Text style={styles.normalText}>
                Don't have an account?{" "}
              </Text>

              <Pressable onPress={() => setScreen("register")}>
                <Text style={styles.linkText}>Register</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.backButton}
              onPress={() => setScreen("welcome")}
            >
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---------------- REGISTER ----------------
  if (screen === "register") {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.formContainer}>
            <Text style={styles.formLogo}>🌾</Text>

            <Text style={styles.formTitle}>Create Account</Text>

            <Text style={styles.formSubtitle}>
              Register as a farmer
            </Text>

            <Text style={styles.label}>Full Name</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Mobile Number</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter 10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              value={mobile}
              onChangeText={setMobile}
            />

            <Text style={styles.label}>Password</Text>

            <TextInput
              style={styles.input}
              placeholder="Create password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Pressable
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </Pressable>

            <View style={styles.registerRow}>
              <Text style={styles.normalText}>
                Already have an account?{" "}
              </Text>

              <Pressable onPress={() => setScreen("login")}>
                <Text style={styles.linkText}>Login</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.backButton}
              onPress={() => setScreen("welcome")}
            >
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---------------- FARMER DETAILS ----------------
  if (screen === "details") {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.formContainer}>
            <Text style={styles.formLogo}>🌾</Text>

            <Text style={styles.formTitle}>
              Plan Your Mandi Visit
            </Text>

            <Text style={styles.formSubtitle}>
              Tell us about your crop and quantity
            </Text>

            <Text style={styles.label}>Select District</Text>

            <View style={styles.optionContainer}>
              {DISTRICTS.map((item) => (
                <Pressable
                  key={item}
                  style={[
                    styles.option,
                    district === item && styles.selectedOption,
                  ]}
                  onPress={() => setDistrict(item)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      district === item && styles.selectedOptionText,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Select Crop</Text>

            <View style={styles.optionContainer}>
              {CROPS.map((item) => (
                <Pressable
                  key={item}
                  style={[
                    styles.option,
                    crop === item && styles.selectedOption,
                  ]}
                  onPress={() => setCrop(item)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      crop === item && styles.selectedOptionText,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Quantity (Quintal)</Text>

            <TextInput
              style={styles.input}
              placeholder="Example: 50"
              keyboardType="numeric"
              value={quantity}
              onChangeText={setQuantity}
            />

            <Pressable
              style={[
                styles.button,
                (!district || !crop || !quantity || loading) && styles.disabledButton,
              ]}
              disabled={!district || !crop || !quantity || loading}
              onPress={getCentreRecommendations}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Find Best Centres</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.backButton}
              onPress={() => setScreen("home")}
            >
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }


  // ---------------- CENTRE RECOMMENDATIONS ----------------
  if (screen === "centres") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.formLogo}>📍</Text>
          <Text style={styles.formTitle}>Best Procurement Centres</Text>
          <Text style={styles.formSubtitle}>AI-ranked centres for {crop} in {district}</Text>

          {centreRecommendations.map((centre, index) => (
            <View key={`${centre.centre_id}-${index}`} style={styles.recommendationCard}>
              <View style={styles.recommendationHeader}>
                <Text style={styles.rankBadge}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recommendationTitle}>Centre {centre.centre_id}</Text>
                  <Text style={styles.recommendationSub}>{centre.district}</Text>
                </View>
                <Text style={styles.matchScore}>{(Number(centre.centre_score || 0) * 100).toFixed(0)}%</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}><Text style={styles.statValue}>{Number(centre.avg_waiting_time || 0).toFixed(0)} min</Text><Text style={styles.statLabel}>Avg wait</Text></View>
                <View style={styles.statBox}><Text style={styles.statValue}>{Number(centre.avg_queue || 0).toFixed(0)}</Text><Text style={styles.statLabel}>Queue</Text></View>
                <View style={styles.statBox}><Text style={styles.statValue}>{Number(centre.avg_counters || 0).toFixed(0)}</Text><Text style={styles.statLabel}>Counters</Text></View>
              </View>

              <Pressable style={styles.selectButton} onPress={() => getSlotRecommendations(centre)} disabled={loading}>
                <Text style={styles.selectButtonText}>Select This Centre →</Text>
              </Pressable>
            </View>
          ))}

          <Pressable style={styles.backButton} onPress={() => setScreen("details")}>
            <Text style={styles.backText}>← Change Details</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------- SMART SLOTS ----------------
  if (screen === "slots") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.formLogo}>🕐</Text>
          <Text style={styles.formTitle}>Smart Slot Recommendation</Text>
          <Text style={styles.formSubtitle}>Recommended time slots for Centre {selectedCentre?.centre_id}</Text>

          {slotRecommendations.map((slot, index) => (
            <View key={`${slot.hour}-${index}`} style={styles.recommendationCard}>
              <View style={styles.recommendationHeader}>
                <Text style={styles.rankBadge}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recommendationTitle}>{slot.time_slot || `${Number(slot.hour)}:00 - ${Number(slot.hour) + 1}:00`}</Text>
                  <Text style={styles.recommendationSub}>{slot.reliability || "Limited"} reliability</Text>
                </View>
                <Text style={styles.matchScore}>{Number(slot.slot_score || 0).toFixed(2)}</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}><Text style={styles.statValue}>{Number(slot.avg_waiting_time || 0).toFixed(0)} min</Text><Text style={styles.statLabel}>Waiting</Text></View>
                <View style={styles.statBox}><Text style={styles.statValue}>{Number(slot.avg_queue || 0).toFixed(0)}</Text><Text style={styles.statLabel}>Queue</Text></View>
                <View style={styles.statBox}><Text style={styles.statValue}>{Number(slot.avg_arrivals || 0).toFixed(0)}</Text><Text style={styles.statLabel}>Arrivals</Text></View>
              </View>

              <Text style={styles.reasonText}>💡 {slot.reason || "Recommended from historical slot performance."}</Text>

              <Pressable
                style={[styles.selectButton, loading && styles.disabledButton]}
                onPress={() => selectSlotAndPredictWait(slot)}
                disabled={loading}
              >
                <Text style={styles.selectButtonText}>Select This Slot →</Text>
              </Pressable>
            </View>
          ))}

          <Pressable style={styles.backButton} onPress={() => setScreen("centres")}>
            <Text style={styles.backText}>← Back to Centres</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }


  // ---------------- WAITING TIME ----------------
  if (screen === "waiting") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.formLogo}>⏳</Text>
          <Text style={styles.formTitle}>Expected Waiting Time</Text>
          <Text style={styles.formSubtitle}>
            AI prediction for your selected mandi slot
          </Text>

          <View style={styles.dashboardCard}>
            <Text style={styles.dashboardTitle}>Your Visit</Text>
            <Text style={styles.feature}>📍 Centre: {selectedCentre?.centre_id}</Text>
            <Text style={styles.feature}>🌾 Crop: {crop}</Text>
            <Text style={styles.feature}>📦 Quantity: {quantity} quintal</Text>
            <Text style={styles.feature}>
              🕐 Slot: {selectedSlot?.time_slot || `${Number(selectedSlot?.hour)}:00 - ${Number(selectedSlot?.hour) + 1}:00`}
            </Text>
          </View>

          <View style={styles.waitCard}>
            <Text style={styles.waitValue}>
              {predictedWait !== null ? Math.round(predictedWait) : "--"} min
            </Text>
            <Text style={styles.waitLabel}>Predicted waiting time</Text>
          </View>

          <Pressable
            style={[styles.button, loading && styles.disabledButton]}
            onPress={confirmBooking}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Confirm Booking</Text>
            )}
          </Pressable>

          <Pressable style={styles.backButton} onPress={() => setScreen("slots")}>
            <Text style={styles.backText}>← Choose Another Slot</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------- BOOKING SUCCESS ----------------
  if (screen === "bookingSuccess") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.formLogo}>✅</Text>
          <Text style={styles.formTitle}>Booking Confirmed!</Text>
          <Text style={styles.formSubtitle}>
            Your mandi visit has been successfully booked.
          </Text>

          <View style={styles.bookingCard}>
            <Text style={styles.bookingLabel}>BOOKING ID</Text>
            <Text style={styles.bookingId}>
              {bookingResult?.booking_id || "KQ-BOOKING"}
            </Text>

            <View style={styles.bookingDivider} />

            <Text style={styles.feature}>📍 Centre: {bookingResult?.centre_id || selectedCentre?.centre_id}</Text>
            <Text style={styles.feature}>🌾 Crop: {bookingResult?.crop || crop}</Text>
            <Text style={styles.feature}>📦 Quantity: {bookingResult?.quantity || quantity} quintal</Text>
            <Text style={styles.feature}>
              🕐 Slot: {bookingResult?.hour !== undefined
                ? `${Number(bookingResult.hour)}:00 - ${Number(bookingResult.hour) + 1}:00`
                : selectedSlot?.time_slot}
            </Text>
            <Text style={styles.feature}>
              ⏳ Expected wait: {bookingResult?.expected_wait ?? predictedWait ?? "--"} min
            </Text>
          </View>

          <View style={styles.qrPlaceholder}>
            <QRCode
              value={String(bookingResult?.booking_id || "KQ-BOOKING")}
              size={180}
              backgroundColor="#FFFFFF"
              color="#111111"
            />
            <Text style={styles.qrTitle}>QR Check-in</Text>
            <Text style={styles.qrText}>
              Show this QR code at the procurement centre for check-in.
            </Text>
          </View>

          <Pressable style={styles.button} onPress={loadMyBookings}>
            <Text style={styles.buttonText}>View My Bookings</Text>
          </Pressable>

          <Pressable style={styles.backButton} onPress={() => setScreen("home")}>
            <Text style={styles.backText}>← Back to Dashboard</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------- MY BOOKINGS SCREEN ----------------
  if (screen === "bookings") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.formLogo}>🎫</Text>
          <Text style={styles.formTitle}>My Bookings</Text>
          <Text style={styles.formSubtitle}>
            Your scheduled mandi visits and QR check-in codes
          </Text>

          {bookingsLoading ? (
            <ActivityIndicator size="large" color="#2E7D32" />
          ) : myBookings.length === 0 ? (
            <View style={styles.bookingCard}>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.qrText}>
                Your confirmed mandi bookings will appear here.
              </Text>
            </View>
          ) : (
            myBookings.map((booking, index) => {
              const bookingId = booking.booking_id || booking.id || `BOOKING-${index + 1}`;
              const hour = booking.hour !== undefined ? Number(booking.hour) : null;

              return (
                <View key={`${bookingId}-${index}`} style={styles.bookingCard}>
                  <Text style={styles.bookingLabel}>BOOKING ID</Text>
                  <Text style={styles.bookingId}>{bookingId}</Text>

                  <View style={styles.bookingDivider} />

                  <Text style={styles.feature}>📍 Centre: {booking.centre_id || "--"}</Text>
                  <Text style={styles.feature}>📅 Date: {booking.date || "--"}</Text>
                  <Text style={styles.feature}>🌾 Crop: {booking.crop || "--"}</Text>
                  <Text style={styles.feature}>
                    📦 Quantity: {booking.quantity ?? "--"} quintal
                  </Text>
                  <Text style={styles.feature}>
                    🕐 Slot: {hour !== null ? `${hour}:00 - ${hour + 1}:00` : (booking.time_slot || "--")}
                  </Text>
                  <Text style={styles.feature}>
                    ⏳ Expected wait: {booking.expected_wait ?? "--"} min
                  </Text>
                  <Text style={styles.statusText}>
                    Status: {String(booking.status || "BOOKED").toUpperCase()}
                  </Text>

                  <View style={styles.qrSmall}>
                    <QRCode
                      value={String(bookingId)}
                      size={145}
                      backgroundColor="#FFFFFF"
                      color="#111111"
                    />
                    <Text style={styles.qrTitle}>Show at Centre</Text>
                  </View>
                </View>
              );
            })
          )}

          <Pressable style={styles.button} onPress={loadMyBookings} disabled={bookingsLoading}>
            <Text style={styles.buttonText}>Refresh Bookings</Text>
          </Pressable>

          <Pressable style={styles.backButton} onPress={() => setScreen("home")}>
            <Text style={styles.backText}>← Back to Dashboard</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------- ADMIN QR SCANNER ----------------
  if (screen === "adminScanner") {
    if (!cameraPermission?.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.scannerPermission}>
            <Text style={styles.formLogo}>📷</Text>
            <Text style={styles.formTitle}>Camera Permission</Text>
            <Text style={styles.formSubtitle}>Allow camera access to scan farmer booking QR codes.</Text>
            <Pressable style={styles.button} onPress={openAdminScanner}>
              <Text style={styles.buttonText}>Allow Camera</Text>
            </Pressable>
            <Pressable style={styles.backButton} onPress={() => setScreen("admin")}>
              <Text style={styles.backText}>← Back to Dashboard</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.scannerScreen}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scannerLocked ? undefined : handleQrScanned}
        />

        <View style={styles.scannerOverlay}>
          <View style={styles.scannerTopBar}>
            <Pressable style={styles.scannerBack} onPress={() => setScreen("admin")}>
              <Text style={styles.scannerBackText}>← Back</Text>
            </Pressable>
            <Text style={styles.scannerTitle}>Scan Farmer QR</Text>
            <View style={{ width: 70 }} />
          </View>

          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          <View style={styles.scannerHintCard}>
            <Text style={styles.scannerHintTitle}>Scan booking QR</Text>
            <Text style={styles.scannerHintText}>
              Ask the farmer to show the QR code from My Bookings. The booking will be verified and assigned to the least-loaded counter.
            </Text>
            {scannerLocked && <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 10 }} />}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------- ADMIN DASHBOARD ----------------
  if (screen === "admin") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.adminContainer}>
          <View style={styles.adminHeader}>
            <View>
              <Text style={styles.adminKicker}>CENTRE OPERATOR</Text>
              <Text style={styles.adminTitle}>Live Mandi Dashboard</Text>
              <Text style={styles.adminCentre}>Centre {adminDashboard?.centre_id || "—"}</Text>
            </View>
            <Text style={styles.adminLive}>● LIVE</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}><Text style={styles.adminStatValue}>{adminDashboard?.total_farmers ?? 0}</Text><Text style={styles.adminStatLabel}>Farmers Today</Text></View>
            <View style={styles.statCard}><Text style={styles.adminStatValue}>{adminDashboard?.current_queue ?? 0}</Text><Text style={styles.adminStatLabel}>Current Queue</Text></View>
            <View style={styles.statCard}><Text style={styles.adminStatValue}>{adminDashboard?.average_waiting_time ?? 0}m</Text><Text style={styles.adminStatLabel}>Avg Waiting</Text></View>
            <View style={styles.statCard}><Text style={styles.adminStatValue}>{adminDashboard?.farmers_processed ?? 0}</Text><Text style={styles.adminStatLabel}>Completed</Text></View>
          </View>

          <View style={styles.adminCard}>
            <Text style={styles.sectionTitle}>🔎 Farmer Check-in</Text>
            <Text style={styles.helperText}>Scan the farmer's booking QR to verify the booking and assign a counter automatically.</Text>
            <Pressable style={styles.scanButton} onPress={openAdminScanner} disabled={adminLoading}>
              <Text style={styles.scanButtonText}>▣  Scan Farmer QR</Text>
            </Pressable>
            <Text style={styles.manualLabel}>Or enter Booking ID manually</Text>
            <TextInput
              style={styles.input}
              value={scanBookingId}
              onChangeText={setScanBookingId}
              placeholder="e.g. KQ-AB12CD34EF"
              autoCapitalize="characters"
            />
            <Text style={styles.label}>Active counters</Text>
            <TextInput style={styles.input} value={adminActiveCounters} onChangeText={setAdminActiveCounters} keyboardType="number-pad" placeholder="3" />
            <Pressable style={styles.button} onPress={checkInFarmer} disabled={adminLoading}>
              {adminLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>✓ Verify & Assign Counter</Text>}
            </Pressable>
          </View>

          <View style={styles.adminCard}>
            <View style={styles.queueHeader}>
              <Text style={styles.sectionTitle}>👥 Live Queue</Text>
              <Pressable onPress={loadAdminData}><Text style={styles.refreshText}>Refresh</Text></Pressable>
            </View>
            {adminQueue.length === 0 ? (
              <Text style={styles.emptyQueue}>No bookings for this centre today.</Text>
            ) : (
              adminQueue.map((b) => (
                <View key={b.booking_id} style={styles.queueItem}>
                  <View style={styles.queueNumber}><Text style={styles.queueNumberText}>{b.queue_position}</Text></View>
                  <View style={styles.queueMain}>
                    <Text style={styles.queueBooking}>{b.booking_id}</Text>
                    <Text style={styles.queueMeta}>{b.crop} • {b.quantity} qtl • Slot {String(b.hour).padStart(2,"0")}:00</Text>
                    <Text style={styles.queueMeta}>Counter: {b.counter_no ? `Counter ${b.counter_no}` : "Not assigned"}</Text>
                  </View>
                  <View style={styles.queueActions}>
                    <Text style={styles.statusBadge}>{b.status}</Text>
                    {b.status === "CHECKED_IN" && <Pressable onPress={() => updateBookingStatus(b.booking_id,"PROCESSING")}><Text style={styles.actionText}>Start</Text></Pressable>}
                    {b.status === "PROCESSING" && <Pressable onPress={() => updateBookingStatus(b.booking_id,"COMPLETED")}><Text style={styles.actionText}>Complete</Text></Pressable>}
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.adminCard}>
            <Text style={styles.sectionTitle}>⚡ Centre Status</Text>
            <View style={styles.statusRow}><Text>Active counters</Text><Text style={styles.statusStrong}>{adminDashboard?.active_counters ?? 0}</Text></View>
            <View style={styles.statusRow}><Text>Farmers waiting</Text><Text style={styles.statusStrong}>{adminDashboard?.farmers_waiting ?? 0}</Text></View>
            <View style={styles.statusRow}><Text>Centre efficiency</Text><Text style={styles.statusStrong}>{adminDashboard?.centre_efficiency ?? 0}%</Text></View>
          </View>

          <Pressable style={styles.logoutButton} onPress={async () => { await AsyncStorage.removeItem("token"); await AsyncStorage.removeItem("user"); setMobile(""); setPassword(""); setScreen("welcome"); }}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------- GOVERNMENT DASHBOARD ----------------
  if (screen === "government") {
    const districts = governmentDashboard?.districts || DISTRICTS;
    const crops = governmentDashboard?.crops || CROPS;
    const centreCount = governmentDashboard?.total_centres ?? 40;
    const bookingsToday = governmentDashboard?.bookings_today ?? 0;
    const completed = governmentDashboard?.completed_today ?? 0;
    const queueCount = governmentDashboard?.active_queue_today ?? 0;
    const districtOverview = governmentDashboard?.district_overview || [];

    const centrePerformance = governmentAnalytics?.centre_performance || [];
    const cropAnalytics = governmentAnalytics?.crop_analytics || [];
    const predictions = governmentAnalytics?.predictions || [];
    const overloaded = governmentAnalytics?.overloaded_centres || [];
    const announcements = governmentAnnouncements.length ? governmentAnnouncements : (governmentDashboard?.announcements || []);

    const maxDistrictArrivals = Math.max(1, ...districtOverview.map((d: any) => Number(d.arrivals ?? d.farmers_arrived ?? d.bookings ?? 0)));
    const maxCropArrivals = Math.max(1, ...cropAnalytics.map((c: any) => Number(c.avg_arrivals || 0)));

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.govContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.govHero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.govKicker}>GOVERNMENT OFFICIAL</Text>
              <Text style={styles.govTitle}>Smart Mandi Intelligence</Text>
              <Text style={styles.govSubtitle}>State-wide procurement monitoring & AI insights</Text>
            </View>
            <View style={styles.govLivePill}><View style={styles.liveDot} /><Text style={styles.govLiveText}>LIVE</Text></View>
          </View>

          <View style={styles.govStatsGrid}>
            <View style={styles.govStatCard}><Text style={styles.govStatIcon}>🏢</Text><Text style={styles.govStatValue}>{centreCount}</Text><Text style={styles.govStatLabel}>Procurement Centres</Text></View>
            <View style={styles.govStatCard}><Text style={styles.govStatIcon}>👨‍🌾</Text><Text style={styles.govStatValue}>{bookingsToday}</Text><Text style={styles.govStatLabel}>Today's Arrivals</Text></View>
            <View style={styles.govStatCard}><Text style={styles.govStatIcon}>👥</Text><Text style={styles.govStatValue}>{queueCount}</Text><Text style={styles.govStatLabel}>Active Queue</Text></View>
            <View style={styles.govStatCard}><Text style={styles.govStatIcon}>✅</Text><Text style={styles.govStatValue}>{completed}</Text><Text style={styles.govStatLabel}>Completed Today</Text></View>
          </View>

          <View style={styles.govNav}>
            {[
              ["dashboard", "📊", "Dashboard"],
              ["centres", "🏢", "Centres"],
              ["analytics", "📈", "Analytics"],
              ["alerts", "📢", "Alerts"],
            ].map(([tab, icon, label]) => (
              <Pressable key={tab} style={[styles.govNavItem, governmentTab === tab && styles.govNavItemActive]} onPress={() => setGovernmentTab(tab as any)}>
                <Text style={styles.govNavIcon}>{icon}</Text>
                <Text style={[styles.govNavText, governmentTab === tab && styles.govNavTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {governmentLoading && <View style={styles.govLoading}><ActivityIndicator color="#1B5E20" /><Text style={styles.govLoadingText}>Updating intelligence...</Text></View>}

          {governmentTab === "dashboard" && (
            <>
              <View style={styles.govSectionCard}>
                <View style={styles.govSectionHeader}>
                  <View><Text style={styles.govSectionTitle}>State Overview</Text><Text style={styles.govSectionCaption}>{districts.length} districts • {crops.length} crops</Text></View>
                  <Pressable onPress={() => loadGovernmentData(true)}><Text style={styles.refreshText}>↻ Refresh</Text></Pressable>
                </View>
                <View style={styles.govMetricRow}><Text>Today's arrivals / bookings</Text><Text style={styles.govMetricValue}>{bookingsToday}</Text></View>
                <View style={styles.govMetricRow}><Text>Current active queue</Text><Text style={styles.govMetricValue}>{queueCount}</Text></View>
                <View style={styles.govMetricRow}><Text>Completed farmers</Text><Text style={styles.govMetricValue}>{completed}</Text></View>
              </View>

              <View style={styles.govSectionCard}>
                <Text style={styles.govSectionTitle}>🗺️ District-wise Arrivals</Text>
                <Text style={styles.govSectionCaption}>Live operational distribution from the government API</Text>
                {districtOverview.length > 0 ? districtOverview.map((d: any, i: number) => {
                  const arrivals = Number(d.arrivals ?? d.farmers_arrived ?? d.bookings ?? 0);
                  return (
                    <View key={`${d.district || i}`} style={styles.chartRow}>
                      <View style={styles.chartLabelRow}><Text style={styles.chartLabel}>{d.district || `District ${i + 1}`}</Text><Text style={styles.chartValue}>{arrivals}</Text></View>
                      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.min(100, Math.max(2, (arrivals / maxDistrictArrivals) * 100))}%` }]} /></View>
                    </View>
                  );
                }) : <View style={styles.emptyGov}><Text style={styles.emptyGovTitle}>No district data</Text><Text style={styles.emptyGovText}>District-level operational data will appear here when returned by the backend.</Text></View>}
              </View>

              <View style={styles.govSectionCard}>
                <View style={styles.govSectionHeader}><Text style={styles.govSectionTitle}>🤖 AI Predictive Watch</Text><Text style={styles.aiBadge}>MODEL</Text></View>
                {predictions.length > 0 ? predictions.slice(0, 6).map((p: any, i: number) => (
                  <View key={i} style={styles.predictionItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.predictionTitle}>{p.district} • {p.crop}</Text>
                      <Text style={styles.predictionMeta}>{p.centre_id} • {p.time_slot} • {p.records} records</Text>
                    </View>
                    <View style={styles.predictionValueBox}><Text style={styles.predictionValue}>{p.expected_arrivals_profile ?? "—"}</Text><Text style={styles.predictionUnit}>arrivals</Text></View>
                  </View>
                )) : <View style={styles.emptyGov}><Text style={styles.emptyGovTitle}>No predictions returned</Text><Text style={styles.emptyGovText}>AI predictive insights will appear here from the existing slot-profile model.</Text></View>}
              </View>

              <View style={styles.govSectionCard}>
                <View style={styles.govSectionHeader}><Text style={styles.govSectionTitle}>⚠️ Load Watch</Text><Text style={styles.alertCount}>{overloaded.length} flagged</Text></View>
                {overloaded.length > 0 ? overloaded.slice(0, 5).map((c: any, i: number) => (
                  <View key={i} style={styles.alertItem}>
                    <View style={styles.alertIcon}><Text>!</Text></View>
                    <View style={{ flex: 1 }}><Text style={styles.alertCentre}>{c.centre_id}</Text><Text style={styles.alertReason}>{c.district} • Avg wait {Number(c.avg_waiting_time || 0).toFixed(0)} min • Queue {Number(c.avg_queue || 0).toFixed(0)}</Text></View>
                  </View>
                )) : <Text style={styles.emptyGovText}>No overloaded centres reported by the model.</Text>}
              </View>
            </>
          )}

          {governmentTab === "centres" && (
            <View style={styles.govSectionCard}>
              <View style={styles.govSectionHeader}><View><Text style={styles.govSectionTitle}>🏢 Centre Performance</Text><Text style={styles.govSectionCaption}>Ranked using the existing centre-profile model</Text></View></View>
              {centrePerformance.length > 0 ? centrePerformance.slice(0, 40).map((c: any, i: number) => (
                <View key={`${c.centre_id}-${c.crop}-${i}`} style={styles.centrePerformanceItem}>
                  <View style={styles.rankCircle}><Text style={styles.rankCircleText}>{i + 1}</Text></View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.centreName}>{c.centre_id}</Text>
                    <Text style={styles.centreMeta}>{c.district} • {c.crop}</Text>
                    <Text style={styles.centreMetrics}>Wait {Number(c.avg_waiting_time || 0).toFixed(0)}m  •  Queue {Number(c.avg_queue || 0).toFixed(0)}  •  Staff {Number(c.avg_staff_efficiency || 0).toFixed(0)}</Text>
                  </View>
                  <View style={styles.centreScoreBox}><Text style={styles.centreScore}>{(Number(c.centre_score || 0) * 100).toFixed(0)}%</Text><Text style={styles.centreScoreLabel}>SCORE</Text></View>
                </View>
              )) : <View style={styles.emptyGov}><Text style={styles.emptyGovTitle}>Centre analytics unavailable</Text><Text style={styles.emptyGovText}>The backend did not return centre-performance records.</Text></View>}
            </View>
          )}

          {governmentTab === "analytics" && (
            <>
              <View style={styles.govSectionCard}>
                <Text style={styles.govSectionTitle}>🌾 Crop Demand Analytics</Text>
                <Text style={styles.govSectionCaption}>Historical profile averages across supported centres</Text>
                {cropAnalytics.length > 0 ? cropAnalytics.map((c: any, i: number) => {
                  const arrivals = Number(c.avg_arrivals || 0);
                  return (
                    <View key={c.crop || i} style={styles.cropAnalyticsCard}>
                      <View style={styles.cropAnalyticsHeader}><Text style={styles.cropName}>{c.crop}</Text><Text style={styles.cropValue}>{arrivals.toFixed(1)} avg arrivals</Text></View>
                      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.min(100, Math.max(4, (arrivals / maxCropArrivals) * 100))}%` }]} /></View>
                      <View style={styles.cropMiniGrid}>
                        <Text style={styles.cropMini}>Wait {Number(c.avg_waiting_time || 0).toFixed(0)}m</Text>
                        <Text style={styles.cropMini}>Queue {Number(c.avg_queue || 0).toFixed(0)}</Text>
                        <Text style={styles.cropMini}>Centres {c.centres ?? 0}</Text>
                      </View>
                    </View>
                  );
                }) : <Text style={styles.emptyGovText}>No crop analytics returned.</Text>}
              </View>

              <View style={styles.govSectionCard}>
                <Text style={styles.govSectionTitle}>🔮 Predictive Analytics</Text>
                {predictions.length > 0 ? predictions.slice(0, 12).map((p: any, i: number) => (
                  <View key={i} style={styles.predictionItem}>
                    <View style={{ flex: 1 }}><Text style={styles.predictionTitle}>{p.district} • {p.crop} • {p.centre_id}</Text><Text style={styles.predictionMeta}>{p.time_slot} • Wait {Number(p.avg_waiting_time || 0).toFixed(0)}m • Queue {Number(p.avg_queue || 0).toFixed(0)}</Text></View>
                    <Text style={styles.predictionValue}>{Number(p.expected_arrivals_profile || 0).toFixed(0)}</Text>
                  </View>
                )) : <Text style={styles.emptyGovText}>No predictive records returned.</Text>}
              </View>

              <View style={styles.govSectionCard}>
                <Text style={styles.govSectionTitle}>📍 Coverage</Text>
                <View style={styles.districtGrid}>{districts.map((d: string) => <View key={d} style={styles.districtChip}><Text style={styles.districtChipText}>✓ {d}</Text></View>)}</View>
              </View>
            </>
          )}

          {governmentTab === "alerts" && (
            <>
              <View style={styles.govSectionCard}>
                <View style={styles.govSectionHeader}><View><Text style={styles.govSectionTitle}>📢 Alerts & Announcements</Text><Text style={styles.govSectionCaption}>Publish operational instructions to the system</Text></View></View>
                {announcements.length > 0 ? announcements.map((a: any, i: number) => (
                  <View key={a.id || i} style={styles.announcementCard}>
                    <View style={styles.announcementHeader}><Text style={styles.announcementTitle}>{a.title}</Text><Text style={[styles.priorityBadge, a.priority === "HIGH" && styles.priorityHigh]}>{a.priority || "NORMAL"}</Text></View>
                    <Text style={styles.announcementText}>{a.message}</Text>
                    {(a.district || a.crop) && <Text style={styles.announcementMeta}>{a.district || "All districts"}{a.crop ? ` • ${a.crop}` : ""}</Text>}
                  </View>
                )) : <Text style={styles.emptyGovText}>No announcements yet.</Text>}
              </View>

              <View style={styles.govSectionCard}>
                <Text style={styles.govSectionTitle}>＋ Publish Announcement</Text>
                <TextInput style={styles.govInput} placeholder="Announcement title" value={announcementTitle} onChangeText={setAnnouncementTitle} />
                <TextInput style={[styles.govInput, styles.govTextArea]} placeholder="Message / instruction" value={announcementMessage} onChangeText={setAnnouncementMessage} multiline />
                <Text style={styles.govFieldLabel}>Target district</Text>
                <View style={styles.optionContainer}>{["", ...districts].map((d: string) => <Pressable key={`ad-${d}`} style={[styles.option, announcementDistrict === d && styles.selectedOption]} onPress={() => setAnnouncementDistrict(d)}><Text style={[styles.optionText, announcementDistrict === d && styles.selectedOptionText]}>{d || "All"}</Text></Pressable>)}</View>
                <Text style={styles.govFieldLabel}>Crop</Text>
                <View style={styles.optionContainer}>{["", ...crops].map((c: string) => <Pressable key={`ac-${c}`} style={[styles.option, announcementCrop === c && styles.selectedOption]} onPress={() => setAnnouncementCrop(c)}><Text style={[styles.optionText, announcementCrop === c && styles.selectedOptionText]}>{c || "All crops"}</Text></Pressable>)}</View>
                <Text style={styles.govFieldLabel}>Priority</Text>
                <View style={styles.optionContainer}>{["NORMAL", "HIGH"].map((p: string) => <Pressable key={p} style={[styles.option, announcementPriority === p && styles.selectedOption]} onPress={() => setAnnouncementPriority(p)}><Text style={[styles.optionText, announcementPriority === p && styles.selectedOptionText]}>{p}</Text></Pressable>)}</View>
                <Pressable style={[styles.govActionButton, governmentLoading && styles.disabledButton]} onPress={createAnnouncement} disabled={governmentLoading}>
                  {governmentLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.govActionButtonText}>Publish to KisanQueue</Text>}
                </Pressable>
              </View>

              <View style={styles.govSectionCard}>
                <Text style={styles.govSectionTitle}>⚠️ Overloaded Centres</Text>
                {overloaded.length > 0 ? overloaded.map((c: any, i: number) => <View key={i} style={styles.alertItem}><View style={styles.alertIcon}><Text>!</Text></View><View><Text style={styles.alertCentre}>{c.centre_id} • {c.district}</Text><Text style={styles.alertReason}>Average waiting time: {Number(c.avg_waiting_time || 0).toFixed(0)} min</Text></View></View>) : <Text style={styles.emptyGovText}>No overloaded centres detected.</Text>}
              </View>
            </>
          )}

          <View style={styles.govFooterCard}>
            <Text style={styles.govInfoTitle}>KisanQueue Intelligence Layer</Text>
            <Text style={styles.govInfoText}>Government insights are consumed from the Flask API. Centre rankings and predictive slot views are derived from the existing backend model profiles.</Text>
          </View>

          <Pressable style={styles.logoutButton} onPress={async () => { await AsyncStorage.removeItem("token"); await AsyncStorage.removeItem("user"); setMobile(""); setPassword(""); setGovernmentDashboard(null); setGovernmentAnalytics(null); setGovernmentAnnouncements([]); setScreen("welcome"); }}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------- FARMER HOME ----------------
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.homeContainer}>
        <Text style={styles.homeLogo}>🌾</Text>

        <Text style={styles.homeTitle}>KisanQueue</Text>

        <Text style={styles.welcomeText}>
          Welcome to your Farmer Dashboard
        </Text>

        <View style={styles.dashboardCard}>
          <Text style={styles.dashboardTitle}>
            Smart Mandi Services
          </Text>

          <Text style={styles.dashboardText}>
            Get AI-powered recommendations for:
          </Text>

          <Text style={styles.feature}>📍 Procurement Centre</Text>
          <Text style={styles.feature}>🕐 Best Time Slot</Text>
          <Text style={styles.feature}>⏳ Expected Waiting Time</Text>
          <Text style={styles.feature}>📊 Farmer Arrival Forecast</Text>
        </View>

        <Pressable
          style={styles.button}
          onPress={openMandiPlanner}
        >
          <Text style={styles.buttonText}>Find Best Centre</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={loadMyBookings}
          disabled={bookingsLoading}
        >
          {bookingsLoading ? (
            <ActivityIndicator color="#2E7D32" />
          ) : (
            <Text style={styles.secondaryButtonText}>🎫 My Bookings</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.logoutButton}
          onPress={async () => {
            await AsyncStorage.removeItem("token");
            await AsyncStorage.removeItem("user");

            setMobile("");
            setPassword("");
            setScreen("welcome");
          }}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F2",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },

  logo: {
    fontSize: 64,
    textAlign: "center",
    marginBottom: 16,
  },

  title: {
    fontSize: 34,
    fontWeight: "700",
    textAlign: "center",
    color: "#1B5E20",
  },

  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#555",
    marginTop: 8,
    marginBottom: 32,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    color: "#222",
  },

  cardText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#666",
  },

  button: {
    backgroundColor: "#2E7D32",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },

  disabledButton: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },

  formContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingBottom: 60,
  },

  formLogo: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 10,
  },

  formTitle: {
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    color: "#1B5E20",
  },

  formSubtitle: {
    fontSize: 15,
    textAlign: "center",
    color: "#666",
    marginTop: 8,
    marginBottom: 30,
  },

  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 7,
    marginTop: 12,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
  },

  optionContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  option: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  selectedOption: {
    backgroundColor: "#2E7D32",
    borderColor: "#2E7D32",
  },

  optionText: {
    color: "#333333",
    fontSize: 14,
    fontWeight: "600",
  },

  selectedOptionText: {
    color: "#FFFFFF",
  },

  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },

  normalText: {
    color: "#555",
    fontSize: 15,
  },

  linkText: {
    color: "#2E7D32",
    fontWeight: "700",
    fontSize: 15,
  },

  backButton: {
    alignItems: "center",
    marginTop: 24,
  },

  backText: {
    color: "#2E7D32",
    fontSize: 16,
    fontWeight: "600",
  },

  homeContainer: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },

  homeLogo: {
    fontSize: 50,
    textAlign: "center",
  },

  homeTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1B5E20",
    textAlign: "center",
    marginTop: 8,
  },

  welcomeText: {
    textAlign: "center",
    color: "#555",
    fontSize: 16,
    marginTop: 8,
    marginBottom: 24,
  },

  dashboardCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },

  dashboardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
    marginBottom: 10,
  },

  dashboardText: {
    color: "#666",
    marginBottom: 12,
  },

  feature: {
    fontSize: 15,
    color: "#333",
    marginVertical: 6,
  },

  recommendationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E7DF",
  },
  recommendationHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  rankBadge: { backgroundColor: "#E8F5E9", color: "#2E7D32", fontWeight: "800", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, marginRight: 10 },
  recommendationTitle: { fontSize: 17, fontWeight: "700", color: "#222" },
  recommendationSub: { color: "#777", marginTop: 3 },
  matchScore: { fontSize: 17, fontWeight: "800", color: "#2E7D32" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: "#F5F7F2", borderRadius: 10, padding: 10, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "700", color: "#333" },
  statLabel: { fontSize: 11, color: "#777", marginTop: 3 },
  selectButton: { backgroundColor: "#2E7D32", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  selectButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  reasonText: { color: "#555", lineHeight: 20, marginBottom: 14 },

  waitCard: {
    backgroundColor: "#E8F5E9",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  waitValue: {
    fontSize: 42,
    fontWeight: "800",
    color: "#1B5E20",
  },
  waitLabel: {
    fontSize: 15,
    color: "#555",
    marginTop: 6,
  },
  bookingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DDE5DA",
  },
  bookingLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#777",
    letterSpacing: 1,
    textAlign: "center",
  },
  bookingId: {
    fontSize: 25,
    fontWeight: "800",
    color: "#2E7D32",
    textAlign: "center",
    marginTop: 8,
  },
  bookingDivider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: 16,
  },
  qrPlaceholder: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#E2E7DF",
  },
  qrIcon: {
    fontSize: 58,
    color: "#222",
  },
  qrTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
    marginTop: 6,
  },
  qrText: {
    color: "#666",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },

  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2E7D32",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },

  secondaryButtonText: {
    color: "#2E7D32",
    fontSize: 16,
    fontWeight: "700",
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
    textAlign: "center",
    marginBottom: 8,
  },

  statusText: {
    marginTop: 10,
    color: "#2E7D32",
    fontWeight: "800",
    fontSize: 14,
  },

  qrSmall: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    alignItems: "center",
  },

  logoutButton: {
    alignItems: "center",
    marginTop: 20,
  },

  logoutText: {
    color: "#C62828",
    fontSize: 16,
    fontWeight: "600",
  },
  govContainer: { padding: 18, paddingBottom: 80 },
  govHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18 },
  govKicker: { fontSize: 11, fontWeight: "800", color: "#1B5E20", letterSpacing: 1.1 },
  govTitle: { fontSize: 25, fontWeight: "800", color: "#173B1A", marginTop: 4 },
  govSubtitle: { color: "#6B716B", marginTop: 4 },
  govLive: { color: "#2E7D32", fontWeight: "800", fontSize: 12, marginTop: 4 },
  govStatsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 12 },
  govStatCard: { width: "48%", backgroundColor: "#FFFFFF", borderRadius: 15, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#E1E8E0" },
  govStatIcon: { fontSize: 20 },
  govStatValue: { fontSize: 25, fontWeight: "800", color: "#1B5E20", marginTop: 4 },
  govStatLabel: { color: "#707570", marginTop: 2, fontSize: 12 },
  govNav: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 14, padding: 5, marginBottom: 14, borderWidth: 1, borderColor: "#E1E8E0" },
  govNavItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  govNavItemActive: { backgroundColor: "#E8F5E9" },
  govNavIcon: { fontSize: 16 },
  govNavText: { fontSize: 10, color: "#777", marginTop: 2, fontWeight: "600" },
  govNavTextActive: { color: "#1B5E20", fontWeight: "800" },
  govSectionCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#E1E8E0" },
  govSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  govSectionTitle: { fontSize: 18, fontWeight: "800", color: "#222", marginBottom: 12 },
  govMetricRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EEF1ED" },
  govMetricValue: { fontWeight: "800", color: "#1B5E20" },
  predictionItem: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF1ED" },
  predictionTitle: { fontWeight: "700", color: "#222" },
  predictionMeta: { color: "#777", fontSize: 12, marginTop: 3 },
  predictionValue: { fontSize: 16, fontWeight: "800", color: "#2E7D32", marginLeft: 10 },
  emptyGov: { backgroundColor: "#F7F9F5", borderRadius: 12, padding: 16 },
  emptyGovTitle: { fontWeight: "800", color: "#333", marginBottom: 4 },
  emptyGovText: { color: "#777", lineHeight: 19 },
  alertItem: { paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF1ED" },
  alertCentre: { fontWeight: "800", color: "#222" },
  alertReason: { color: "#C62828", fontSize: 12, marginTop: 3 },
  centrePerformanceItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#EEF1ED" },
  centreName: { fontSize: 15, fontWeight: "800", color: "#222" },
  centreMeta: { color: "#777", fontSize: 12, marginTop: 3 },
  centreScoreBox: { alignItems: "center", marginLeft: 10, minWidth: 52 },
  centreScore: { fontSize: 16, fontWeight: "800", color: "#2E7D32" },
  centreScoreLabel: { fontSize: 9, color: "#777", marginTop: 2 },
  cropItem: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF1ED" },
  cropName: { fontWeight: "700", color: "#333", marginBottom: 6 },
  cropValue: { fontWeight: "800", color: "#2E7D32", marginLeft: 12 },
  barTrack: { height: 8, backgroundColor: "#E7ECE5", borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: "#2E7D32", borderRadius: 4 },
  districtGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  districtChip: { backgroundColor: "#F5F7F2", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  districtChipText: { color: "#315A34", fontWeight: "700", fontSize: 12 },
  announcementCard: { backgroundColor: "#F7F9F5", borderRadius: 12, padding: 14, marginBottom: 10 },
  announcementTitle: { fontWeight: "800", color: "#222", fontSize: 15 },
  announcementText: { color: "#666", lineHeight: 19, marginTop: 5 },
  govActionButton: { backgroundColor: "#1B5E20", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  govActionButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  govInfoCard: { backgroundColor: "#E8F5E9", borderRadius: 15, padding: 16, marginBottom: 8 },
  govInfoTitle: { fontSize: 16, fontWeight: "800", color: "#1B5E20" },
  govInfoText: { color: "#49614B", lineHeight: 19, marginTop: 5 },
  govHero: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18 },
  govLivePill: { flexDirection: "row", alignItems: "center", backgroundColor: "#E8F5E9", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2E7D32", marginRight: 5 },
  govLiveText: { color: "#1B5E20", fontWeight: "800", fontSize: 10 },
  govSectionCaption: { color: "#7A817A", fontSize: 12, marginTop: -7, marginBottom: 10 },
  govLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#E8F5E9", borderRadius: 12, padding: 10, marginBottom: 12 },
  govLoadingText: { color: "#315A34", marginLeft: 8, fontSize: 12, fontWeight: "600" },
  aiBadge: { backgroundColor: "#E8F5E9", color: "#1B5E20", fontSize: 9, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  chartRow: { paddingVertical: 7 },
  chartLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  chartLabel: { color: "#333", fontSize: 13, fontWeight: "600" },
  chartValue: { color: "#1B5E20", fontSize: 13, fontWeight: "800" },
  predictionValueBox: { alignItems: "flex-end", marginLeft: 10 },
  predictionUnit: { color: "#777", fontSize: 9, marginTop: 1 },
  alertCount: { color: "#C62828", fontWeight: "800", fontSize: 12 },
  alertIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFEBEE", alignItems: "center", justifyContent: "center", marginRight: 10 },
  alertIconText: { color: "#C62828", fontWeight: "900" },
  rankCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#E8F5E9", alignItems: "center", justifyContent: "center" },
  rankCircleText: { color: "#2E7D32", fontWeight: "800", fontSize: 12 },
  centreMetrics: { color: "#707570", fontSize: 10, marginTop: 4 },
  cropAnalyticsCard: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#EEF1ED" },
  cropAnalyticsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  cropMiniGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 7 },
  cropMini: { color: "#707570", fontSize: 11 },
  govInput: { backgroundColor: "#F7F9F5", borderWidth: 1, borderColor: "#DDE5DA", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  govTextArea: { minHeight: 90, textAlignVertical: "top" },
  govFieldLabel: { fontSize: 13, fontWeight: "700", color: "#555", marginTop: 5, marginBottom: 7 },
  announcementHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  announcementMeta: { color: "#7A817A", fontSize: 11, marginTop: 7, fontWeight: "600" },
  priorityBadge: { backgroundColor: "#E8F5E9", color: "#2E7D32", fontSize: 9, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  priorityHigh: { backgroundColor: "#FFEBEE", color: "#C62828" },
  govFooterCard: { backgroundColor: "#E8F5E9", borderRadius: 15, padding: 16, marginBottom: 8 },
  scannerScreen: { flex: 1, backgroundColor: "#000000" },
  scannerOverlay: { flex: 1, backgroundColor: "transparent", justifyContent: "space-between", padding: 20 },
  scannerTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  scannerBack: { width: 70, paddingVertical: 8 },
  scannerBackText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  scannerTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  scanFrame: { width: 250, height: 250, alignSelf: "center", position: "relative" },
  corner: { position: "absolute", width: 42, height: 42, borderColor: "#FFFFFF" },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  scannerHintCard: { backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 16, padding: 18, marginBottom: 12 },
  scannerHintTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", textAlign: "center" },
  scannerHintText: { color: "#EEEEEE", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 6 },
  scannerPermission: { flex: 1, justifyContent: "center", padding: 24 },
  scanButton: { backgroundColor: "#1B5E20", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, marginBottom: 12 },
  scanButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  manualLabel: { color: "#777", fontSize: 13, fontWeight: "600", marginBottom: 4 },

  adminContainer: { padding: 20, paddingBottom: 80 },
  adminHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  adminKicker: { fontSize: 12, fontWeight: "800", color: "#2E7D32", letterSpacing: 1 },
  adminTitle: { fontSize: 26, fontWeight: "800", color: "#173B1A", marginTop: 4 },
  adminCentre: { color: "#666", marginTop: 5 },
  adminLive: { color: "#2E7D32", fontWeight: "800", fontSize: 12 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  statCard: { width: "48%", backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E2E8E1" },
  adminStatValue: { fontSize: 25, fontWeight: "800", color: "#1B5E20" },
  adminStatLabel: { color: "#666", marginTop: 4 },
  adminCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#E2E8E1" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#222", marginBottom: 10 },
  helperText: { color: "#666", lineHeight: 20, marginBottom: 8 },
  queueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refreshText: { color: "#2E7D32", fontWeight: "700" },
  emptyQueue: { color: "#777", paddingVertical: 18, textAlign: "center" },
  queueItem: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#EEF1ED", paddingVertical: 12 },
  queueNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E8F5E9", alignItems: "center", justifyContent: "center" },
  queueNumberText: { fontWeight: "800", color: "#2E7D32" },
  queueMain: { flex: 1, marginLeft: 10 },
  queueBooking: { fontWeight: "800", color: "#222" },
  queueMeta: { color: "#666", fontSize: 12, marginTop: 2 },
  queueActions: { alignItems: "flex-end", marginLeft: 6 },
  statusBadge: { fontSize: 9, fontWeight: "800", color: "#555", marginBottom: 5 },
  actionText: { color: "#2E7D32", fontWeight: "800", fontSize: 12 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#EEF1ED" },
  statusStrong: { fontWeight: "800", color: "#1B5E20" },

});