import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuthStore } from "../store/authStore";
import { api } from "../services/api";
import { C, R } from "../theme";

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { user, updateUser } = useAuthStore();

  const [pushEnabled, setPush] = useState(
    user?.notification_prefs?.push ?? true,
  );
  const [emailEnabled, setEmail] = useState(
    user?.notification_prefs?.email ?? true,
  );
  const [whatsappEnabled, setWhatsapp] = useState(
    user?.notification_prefs?.whatsapp ?? false,
  );

  // AI scraping state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiHasKey, setAiHasKey] = useState(false);

  useEffect(() => {
    api
      .getAIScraping()
      .then((res: any) => {
        setAiEnabled(res.enabled);
        setAiHasKey(res.has_key);
      })
      .catch(() => {});
  }, []);

  const saveNotifPrefs = async (prefs: {
    push: boolean;
    email: boolean;
    whatsapp: boolean;
  }) => {
    try {
      await api.updateNotificationPrefs(prefs);
      updateUser({ notification_prefs: prefs });
    } catch {
      // silent
    }
  };

  const handlePushToggle = (val: boolean) => {
    setPush(val);
    saveNotifPrefs({
      push: val,
      email: emailEnabled,
      whatsapp: whatsappEnabled,
    });
  };

  const handleEmailToggle = (val: boolean) => {
    setEmail(val);
    saveNotifPrefs({
      push: pushEnabled,
      email: val,
      whatsapp: whatsappEnabled,
    });
  };

  const handleWhatsappToggle = (val: boolean) => {
    if (val && !user?.phone) {
      Alert.alert(
        "Phone Number Required",
        "Please add your WhatsApp number in My Account first.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Go to Account",
            onPress: () => navigation.navigate("Profile"),
          },
        ],
      );
      return;
    }
    setWhatsapp(val);
    saveNotifPrefs({ push: pushEnabled, email: emailEnabled, whatsapp: val });
  };

  const handleAiToggle = async (val: boolean) => {
    if (val && !aiHasKey) {
      Alert.alert(
        "API Key Required",
        "Groq API key is not configured on the server. Add GROQ_API_KEY to .env.",
      );
      return;
    }
    try {
      const res: any = await api.setAIScraping(val);
      setAiEnabled(res.enabled);
    } catch {
      Alert.alert("Error", "Failed to update AI scraping setting.");
    }
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      <View style={s.headerSection}>
        <Text style={s.screenTitle}>Settings</Text>
      </View>

      {/* Notifications */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Push Notifications</Text>
              <Text style={s.toggleHint}>In-app alerts via Expo</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              trackColor={{ false: "#E7E8E9", true: C.green500 }}
              thumbColor={C.white}
            />
          </View>
          <View style={[s.toggleRow, s.toggleRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Email Alerts</Text>
              <Text style={s.toggleHint}>
                Sent to {user?.email || "your email"}
              </Text>
            </View>
            <Switch
              value={emailEnabled}
              onValueChange={handleEmailToggle}
              trackColor={{ false: "#E7E8E9", true: C.green500 }}
              thumbColor={C.white}
            />
          </View>
          <View style={[s.toggleRow, s.toggleRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>WhatsApp Alerts</Text>
              <Text style={s.toggleHint}>
                Requires phone number in My Account
              </Text>
            </View>
            <Switch
              value={whatsappEnabled}
              onValueChange={handleWhatsappToggle}
              trackColor={{ false: "#E7E8E9", true: C.green500 }}
              thumbColor={C.white}
            />
          </View>
        </View>
      </View>

      {/* AI Scraping */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>AI SCRAPING</Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Groq AI Enrichment</Text>
              <Text style={s.toggleHint}>
                {aiHasKey
                  ? "Uses Llama 3.3 70B to extract richer product data"
                  : "Requires GROQ_API_KEY in server .env"}
              </Text>
            </View>
            <Switch
              value={aiEnabled}
              onValueChange={handleAiToggle}
              trackColor={{ false: "#E7E8E9", true: C.green500 }}
              thumbColor={C.white}
            />
          </View>
        </View>
      </View>

      {/* About */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>ABOUT</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Version</Text>
            <Text style={s.infoValue}>1.0.0</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerSection: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 },
  screenTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -0.75,
  },

  section: { marginHorizontal: 24, marginBottom: 24 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    overflow: "hidden",
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  infoLabel: { fontSize: 14, fontWeight: "500", color: C.textMuted },
  infoValue: { fontSize: 14, fontWeight: "600", color: C.textPrimary },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  toggleRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.borderNav,
  },
  toggleLabel: { fontSize: 14, fontWeight: "500", color: C.textPrimary },
  toggleHint: { fontSize: 11, color: C.textMuted, marginTop: 2 },
});
