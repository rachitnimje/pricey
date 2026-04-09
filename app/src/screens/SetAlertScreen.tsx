import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../types/navigation";
import { useAppStore } from "../store/appStore";
import { useAuthStore } from "../store/authStore";
import { AlertChannel } from "../types";
import { C, R } from "../theme";

type Route = RouteProp<RootStackParamList, "SetAlert">;

const CHANNELS: { key: AlertChannel; label: string; icon: string }[] = [
  { key: "push", label: "Push", icon: "\uD83D\uDD14" },
  { key: "email", label: "Email", icon: "\u2709" },
  { key: "whatsapp", label: "WhatsApp", icon: "\uD83D\uDCAC" },
];

export default function SetAlertScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const {
    comparisonId,
    comparisonName,
    alertId,
    alertTargetPrice,
    alertChannels,
  } = route.params;

  const isEditing = !!alertId;
  const { user } = useAuthStore();

  const {
    createAlert,
    updateAlert,
    deleteAlert,
    fetchComparison,
    currentComparison,
  } = useAppStore();

  // Fetch comparison to always have accurate best price
  useEffect(() => {
    fetchComparison(comparisonId);
  }, [comparisonId]);

  const bestPrice = useMemo(() => {
    if (!currentComparison || currentComparison.id !== comparisonId)
      return null;
    let min = Infinity;
    for (const p of currentComparison.products ?? []) {
      const price = p.latest_snapshot?.price;
      if (price != null && price > 0 && price < min) {
        min = price;
      }
    }
    return min === Infinity ? null : min;
  }, [currentComparison, comparisonId]);

  const [targetPrice, setTargetPrice] = useState(
    alertTargetPrice != null ? String(alertTargetPrice) : "",
  );

  // Set default target price once bestPrice loads (only for new alerts)
  useEffect(() => {
    if (!isEditing && bestPrice != null && targetPrice === "") {
      setTargetPrice(String(Math.round(bestPrice * 0.9)));
    }
  }, [bestPrice]);

  const [selectedChannels, setSelectedChannels] = useState<AlertChannel[]>(
    (alertChannels as AlertChannel[]) ?? ["push"],
  );
  const [saving, setSaving] = useState(false);

  const toggleChannel = (ch: AlertChannel) => {
    if (ch === "whatsapp" && !selectedChannels.includes("whatsapp")) {
      if (!user?.phone) {
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
    }
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  };

  const priceDiff = useMemo(() => {
    if (bestPrice == null) return null;
    const target = parseFloat(targetPrice);
    if (isNaN(target) || target <= 0) return null;
    const diff = bestPrice - target;
    const pct = ((diff / bestPrice) * 100).toFixed(0);
    return { diff, pct };
  }, [bestPrice, targetPrice]);

  const handleSave = async () => {
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert("Invalid Price", "Please enter a valid target price.");
      return;
    }
    if (selectedChannels.length === 0) {
      Alert.alert("No Channel", "Select at least one notification channel.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await updateAlert(alertId, {
          target_price: price,
          is_active: true,
          channels: selectedChannels,
        });
      } else {
        await createAlert({
          comparison_id: comparisonId,
          target_price: price,
          channels: selectedChannels,
        });
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save alert");
    }
    setSaving(false);
  };

  const handleDeleteAlert = () => {
    if (!alertId) return;
    Alert.alert(
      "Delete Alert",
      "Are you sure you want to delete this price alert?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteAlert(alertId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const fmt = (n: number) => `\u20B9${n.toLocaleString("en-IN")}`;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      <View style={s.headerSection}>
        <Text style={s.screenTitle}>
          {isEditing ? "Edit Alert" : "New Alert"}
        </Text>
        <Text style={s.screenSubtitle}>{comparisonName}</Text>
      </View>

      {/* Price card — current + target side by side */}
      <View style={s.priceCard}>
        {bestPrice != null && (
          <View style={s.priceHalf}>
            <Text style={s.priceHalfLabel}>CURRENT BEST</Text>
            <Text style={s.priceHalfValue}>{fmt(bestPrice)}</Text>
          </View>
        )}
        {bestPrice != null && <View style={s.priceCardDivider} />}
        <View style={[s.priceHalf, !bestPrice && { flex: 1 }]}>
          <Text style={s.priceHalfLabel}>YOUR TARGET</Text>
          <View style={s.targetInputRow}>
            <Text style={s.rupee}>{"\u20B9"}</Text>
            <TextInput
              style={s.targetInput}
              value={targetPrice}
              onChangeText={setTargetPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.textPlaceholder}
            />
          </View>
        </View>
      </View>

      {/* Savings hint */}
      {priceDiff != null && priceDiff.diff > 0 && (
        <View style={s.savingsHint}>
          <Text style={s.savingsText}>
            You'll save {fmt(priceDiff.diff)} ({priceDiff.pct}% off current
            price)
          </Text>
        </View>
      )}

      {/* Quick-set buttons */}
      {bestPrice != null && (
        <View style={s.quickRow}>
          {[5, 10, 15, 20].map((pct) => (
            <TouchableOpacity
              key={pct}
              style={s.quickChip}
              onPress={() =>
                setTargetPrice(String(Math.round(bestPrice * (1 - pct / 100))))
              }
              activeOpacity={0.7}
            >
              <Text style={s.quickChipText}>-{pct}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Channels */}
      <View style={s.section}>
        <Text style={s.fieldLabel}>NOTIFY VIA</Text>
        <View style={s.channelRow}>
          {CHANNELS.map((ch) => {
            const active = selectedChannels.includes(ch.key);
            return (
              <TouchableOpacity
                key={ch.key}
                style={[s.channelChip, active && s.channelActive]}
                onPress={() => toggleChannel(ch.key)}
                activeOpacity={0.7}
              >
                <Text style={s.channelIcon}>{ch.icon}</Text>
                <Text style={[s.channelText, active && s.channelTextActive]}>
                  {ch.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Save */}
      <View style={s.actions}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
          style={{ flex: 1 }}
        >
          <LinearGradient
            colors={[C.greenGradientStart, C.greenGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.saveBtn}
          >
            {saving ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Text style={s.saveBtnText}>
                {isEditing ? "Update Alert" : "Save Alert"}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Delete alert (edit mode only) */}
      {isEditing && (
        <TouchableOpacity
          style={s.deleteRow}
          onPress={handleDeleteAlert}
          activeOpacity={0.7}
        >
          <Text style={s.deleteText}>Delete this alert</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerSection: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  screenTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  screenSubtitle: { fontSize: 14, color: C.textMuted, marginTop: 4 },

  /* Price card */
  priceCard: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  priceHalf: { flex: 1, padding: 16, alignItems: "center" },
  priceCardDivider: { width: 1, backgroundColor: C.border, marginVertical: 12 },
  priceHalfLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  priceHalfValue: { fontSize: 20, fontWeight: "800", color: C.green700 },
  targetInputRow: { flexDirection: "row", alignItems: "center" },
  rupee: { fontSize: 20, fontWeight: "700", color: C.green700 },
  targetInput: {
    fontSize: 20,
    fontWeight: "800",
    color: C.textPrimary,
    minWidth: 60,
    textAlign: "center",
    paddingVertical: 0,
  },

  /* Savings hint */
  savingsHint: {
    marginHorizontal: 24,
    marginTop: 10,
    backgroundColor: C.greenLight,
    borderRadius: R.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  savingsText: { fontSize: 12, fontWeight: "600", color: C.green700 },

  /* Quick-set */
  quickRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 24,
    marginTop: 16,
  },
  quickChip: {
    borderRadius: R.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderAccent,
  },
  quickChipText: { fontSize: 13, fontWeight: "600", color: C.textPrimary },

  /* Section */
  section: { paddingHorizontal: 24, marginTop: 24 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  channelRow: { flexDirection: "row", gap: 10 },
  channelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.borderAccent,
  },
  channelActive: { backgroundColor: C.greenLight, borderColor: C.green500 },
  channelIcon: { fontSize: 14 },
  channelText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
  channelTextActive: { color: C.green700 },

  /* Actions */
  actions: { flexDirection: "row", paddingHorizontal: 24, marginTop: 28 },
  saveBtn: { borderRadius: R.pill, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: C.white },

  deleteRow: { alignItems: "center", marginTop: 20, paddingVertical: 8 },
  deleteText: { fontSize: 14, fontWeight: "600", color: C.red },
});
