import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import { useAuthStore } from "../store/authStore";
import { api } from "../services/api";
import { C, R } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout, updateUser } = useAuthStore();

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const handleSavePhone = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      Alert.alert(
        "Phone Required",
        "Please enter your phone number with country code.",
      );
      return;
    }
    setSavingPhone(true);
    try {
      await api.updatePhone(trimmed);
      updateUser({ phone: trimmed });
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 2000);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save phone number");
    }
    setSavingPhone(false);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      <View style={s.headerSection}>
        <Text style={s.screenTitle}>My Account</Text>
      </View>

      {/* Account info */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>ACCOUNT DETAILS</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Email</Text>
            <Text style={s.infoValue}>{user?.email || "Not signed in"}</Text>
          </View>
          {user?.name && (
            <View style={[s.infoRow, s.rowBorder]}>
              <Text style={s.infoLabel}>Name</Text>
              <Text style={s.infoValue}>{user.name}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Phone number */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>PHONE NUMBER</Text>
        <View style={s.card}>
          <View style={s.phoneRow}>
            <TextInput
              style={s.phoneInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={C.textPlaceholder}
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={[s.phoneSaveBtn, phoneSaved && s.phoneSavedBtn]}
              onPress={handleSavePhone}
              disabled={savingPhone}
              activeOpacity={0.7}
            >
              {savingPhone ? (
                <ActivityIndicator size="small" color={C.white} />
              ) : (
                <Text style={s.phoneSaveBtnText}>
                  {phoneSaved ? "\u2713" : "Save"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={s.phoneHint}>
            Used for WhatsApp alerts. Include country code (e.g. +91...).
          </Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={s.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>
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
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.borderNav,
  },
  infoLabel: { fontSize: 14, fontWeight: "500", color: C.textMuted },
  infoValue: { fontSize: 14, fontWeight: "600", color: C.textPrimary },

  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: C.textPrimary,
    backgroundColor: C.surfaceAlt,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  phoneSaveBtn: {
    backgroundColor: C.green600,
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  phoneSavedBtn: { backgroundColor: C.green700 },
  phoneSaveBtnText: { fontSize: 13, fontWeight: "700", color: C.white },
  phoneHint: {
    fontSize: 11,
    color: C.textMuted,
    paddingHorizontal: 20,
    paddingBottom: 14,
    lineHeight: 16,
  },

  logoutBtn: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.redBg,
  },
  logoutText: { fontSize: 14, fontWeight: "700", color: C.red },
});
