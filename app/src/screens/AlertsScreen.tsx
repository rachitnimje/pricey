import React, { useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Switch,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/appStore";
import { PriceAlert, Comparison } from "../types";
import { C, R } from "../theme";

export default function AlertsScreen() {
  const navigation = useNavigation<any>();
  const {
    alerts,
    comparisons,
    isLoadingAlerts,
    fetchAlerts,
    fetchComparisons,
    updateAlert,
  } = useAppStore();

  useEffect(() => {
    fetchAlerts();
    fetchComparisons();
  }, []);
  const onRefresh = useCallback(() => {
    fetchAlerts();
    fetchComparisons();
  }, []);

  const compNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of comparisons) m.set(c.id, c.name);
    return m;
  }, [comparisons]);

  /* Build a map from comparison_id → best price across all products */
  const compBestPriceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comparisons) {
      if (!c.products) continue;
      const prices = c.products
        .map((p) => p.latest_snapshot?.price)
        .filter((p): p is number => p != null && p > 0);
      if (prices.length > 0) m.set(c.id, Math.min(...prices));
    }
    return m;
  }, [comparisons]);

  const handleToggle = (alert: PriceAlert) => {
    updateAlert(alert.id, {
      target_price: alert.target_price,
      is_active: !alert.is_active,
    });
  };

  const handleEdit = (alert: PriceAlert) => {
    navigation.navigate("SetAlert", {
      comparisonId: alert.comparison_id,
      comparisonName:
        compNameMap.get(alert.comparison_id) ||
        alert.product?.product_name ||
        "Alert",
      currentBestPrice: compBestPriceMap.get(alert.comparison_id) ?? undefined,
      alertId: alert.id,
      alertTargetPrice: alert.target_price,
      alertChannels: alert.channels,
    });
  };

  const [showCreateModal, setShowCreateModal] = React.useState(false);

  const comparisonsWithoutAlert = useMemo(() => {
    const alertedIds = new Set(alerts.map((a) => a.comparison_id));
    return comparisons.filter((c) => !alertedIds.has(c.id));
  }, [comparisons, alerts]);

  const handleCreateForComparison = (compId: string, compName: string) => {
    setShowCreateModal(false);
    navigation.navigate("SetAlert", {
      comparisonId: compId,
      comparisonName: compName,
    });
  };

  const fmt = (n: number) => `\u20B9${n.toLocaleString("en-IN")}`;

  const renderItem = ({ item }: { item: PriceAlert }) => {
    const currentPrice = compBestPriceMap.get(item.comparison_id) ?? null;
    const atOrBelow = currentPrice != null && currentPrice <= item.target_price;
    const compName = compNameMap.get(item.comparison_id);
    return (
      <TouchableOpacity
        style={[s.card, !item.is_active && s.inactiveCard]}
        onPress={() => handleEdit(item)}
        activeOpacity={0.7}
      >
        {/* Row 1 — comparison name + toggle */}
        <View style={s.cardTopRow}>
          <Text style={s.compName} numberOfLines={1}>
            {compName || item.product?.product_name || "Comparison"}
          </Text>
          <Switch
            value={item.is_active}
            onValueChange={() => handleToggle(item)}
            trackColor={{ false: "#E7E8E9", true: C.green700 }}
            thumbColor={C.white}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>

        {atOrBelow && (
          <View style={s.hitPill}>
            <Text style={s.hitPillText}>Price hit!</Text>
          </View>
        )}

        {/* Prices row */}
        <View style={s.priceRow}>
          <View style={s.priceBlock}>
            <Text style={s.priceMetaLabel}>TARGET</Text>
            <Text style={s.targetPrice}>{fmt(item.target_price)}</Text>
          </View>
          <View style={s.priceDivider} />
          <View style={s.priceBlock}>
            <Text style={s.priceMetaLabel}>CURRENT BEST</Text>
            <Text style={[s.currentPrice, atOrBelow && { color: C.green700 }]}>
              {currentPrice != null ? fmt(currentPrice) : "\u2014"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyList = () => (
    <View style={s.emptyContainer}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>{"\uD83D\uDD14"}</Text>
      <Text style={s.emptyTitle}>No price alerts</Text>
      <Text style={s.emptySubtitle}>
        Create an alert to get notified when prices drop
      </Text>
    </View>
  );

  return (
    <View style={s.container}>
      <View style={s.headerSection}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.screenTitle}>Alerts</Text>
            <Text style={s.screenSubtitle}>
              We're watching the markets for you.
            </Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.7}
          >
            <Text style={s.addBtnText}>{"\uFF0B"}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingAlerts}
            onRefresh={onRefresh}
            tintColor={C.green500}
          />
        }
        ListEmptyComponent={<EmptyList />}
        contentContainerStyle={
          alerts.length === 0 ? { flex: 1 } : { paddingBottom: 24 }
        }
      />

      {/* Create Alert — pick comparison */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Create Alert</Text>
            <Text style={s.modalSubtitle}>
              Choose a comparison to set an alert for
            </Text>
            {comparisonsWithoutAlert.length === 0 ? (
              <Text style={s.modalEmpty}>
                All your comparisons already have alerts.
              </Text>
            ) : (
              <FlatList
                data={comparisonsWithoutAlert}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: 300 }}
                renderItem={({ item: c }) => (
                  <TouchableOpacity
                    style={s.modalCompItem}
                    onPress={() => handleCreateForComparison(c.id, c.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.modalCompName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={s.modalCompMeta}>
                      {c.products?.length ?? 0} retailers
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={s.modalCancelBtn}
              onPress={() => setShowCreateModal(false)}
            >
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerSection: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -0.75,
  },
  screenSubtitle: {
    fontSize: 14,
    color: C.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.green600,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  addBtnText: {
    fontSize: 20,
    fontWeight: "600",
    color: C.white,
    lineHeight: 22,
    includeFontPadding: false,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingTop: 10,
    paddingBottom: 16,
    paddingHorizontal: 16,
    marginHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  inactiveCard: { opacity: 0.45 },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  compName: {
    fontSize: 15,
    fontWeight: "700",
    color: C.textPrimary,
    flex: 1,
    marginRight: 8,
  },

  hitPill: {
    backgroundColor: C.greenLight,
    borderRadius: R.pill,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  hitPillText: { fontSize: 10, fontWeight: "700", color: C.green700 },

  priceRow: { flexDirection: "row", alignItems: "center" },
  priceBlock: { flex: 1 },
  priceDivider: {
    width: 1,
    height: 28,
    backgroundColor: C.border,
    marginHorizontal: 12,
  },
  priceMetaLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: C.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  targetPrice: { fontSize: 17, fontWeight: "800", color: C.green700 },
  currentPrice: { fontSize: 17, fontWeight: "800", color: C.textPrimary },

  emptyContainer: { alignItems: "center", paddingTop: 80 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: C.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: C.textMuted,
    textAlign: "center",
    paddingHorizontal: 40,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 16 },
  modalEmpty: {
    fontSize: 14,
    color: C.textMuted,
    textAlign: "center",
    paddingVertical: 24,
  },
  modalCompItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  modalCompName: { fontSize: 15, fontWeight: "600", color: C.textPrimary },
  modalCompMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  modalCancelBtn: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: C.textMuted },
});
