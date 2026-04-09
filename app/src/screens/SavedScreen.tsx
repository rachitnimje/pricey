import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from "react-native";
import { useAppStore } from "../store/appStore";
import { Comparison } from "../types";
import { C, R } from "../theme";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface Props {
  navigation: any;
}

export default function SavedScreen({ navigation }: Props) {
  const {
    comparisons,
    isLoadingComparisons,
    fetchComparisons,
    deleteComparison,
  } = useAppStore();

  useEffect(() => {
    fetchComparisons();
  }, []);
  const onRefresh = useCallback(() => {
    fetchComparisons();
  }, []);

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete Comparison", `Delete "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteComparison(id),
      },
    ]);
  };

  const getBestPrice = (comp: Comparison): number | null => {
    if (!comp.products) return null;
    const prices = comp.products
      .map((p) => p.latest_snapshot?.price)
      .filter((p): p is number => p != null && p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  };

  const getProductCount = (comp: Comparison) => comp.products?.length || 0;

  const renderItem = ({ item }: { item: Comparison }) => {
    const best = getBestPrice(item);

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() =>
          navigation.navigate("ComparisonResult", { comparisonId: item.id })
        }
        onLongPress={() => handleDelete(item.id, item.name)}
        activeOpacity={0.7}
      >
        {/* Header — name + timestamp */}
        <View style={s.cardHeader}>
          <Text style={s.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={s.cardTime}>{timeAgo(item.updated_at)}</Text>
        </View>

        {/* Retailer count badge */}
        <View style={s.badgeRow}>
          <View style={s.badge}>
            <Text style={s.badgeText}>{getProductCount(item)} RETAILERS</Text>
          </View>
        </View>

        {/* Price + action */}
        <View style={s.cardBottom}>
          <View>
            <Text style={s.priceLabel}>BEST PRICE</Text>
            <Text style={s.priceValue}>
              {best != null
                ? `\u20B9${best.toLocaleString("en-IN")}`
                : "\u2014"}
            </Text>
          </View>
          <TouchableOpacity
            style={s.viewBtn}
            onPress={() =>
              navigation.navigate("ComparisonResult", { comparisonId: item.id })
            }
            activeOpacity={0.7}
          >
            <Text style={s.viewBtnText}>View</Text>
            <Text style={s.viewArrow}>{"\u203A"}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyList = () => (
    <View style={s.emptyCard}>
      <View style={s.emptyIconStack}>
        <View style={[s.emptyDot, s.emptyDotOuter]} />
        <View style={[s.emptyDot, s.emptyDotInner]} />
        <Text style={s.emptyPlus}>+</Text>
      </View>
      <Text style={s.emptyTitle}>No comparisons yet</Text>
      <Text style={s.emptyDesc}>Start tracking prices across retailers</Text>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.headerSection}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={s.titleRow}>
              <Text style={s.screenTitle}>Saved</Text>
              {comparisons.length > 0 && (
                <View style={s.countBadge}>
                  <Text style={s.countBadgeText}>{comparisons.length}</Text>
                </View>
              )}
            </View>
            <Text style={s.screenSubtitle}>
              Your curated price comparisons.
            </Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => navigation.navigate("Home")}
            activeOpacity={0.7}
          >
            <Text style={s.addBtnText}>{"\uFF0B"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={comparisons}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingComparisons}
            onRefresh={onRefresh}
            tintColor={C.green500}
          />
        }
        ListEmptyComponent={<EmptyList />}
        ListFooterComponent={null}
        contentContainerStyle={
          comparisons.length === 0 ? { flex: 1 } : { paddingBottom: 24 }
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  /* Header */
  headerSection: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  screenTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: C.textPrimary,
    letterSpacing: -1,
  },
  countBadge: {
    backgroundColor: C.green600,
    borderRadius: 999,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  countBadgeText: { fontSize: 12, fontWeight: "800", color: C.white },
  screenSubtitle: { fontSize: 14, color: C.textMuted, marginTop: 4 },

  /* Add button */
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

  /* Card */
  card: {
    marginHorizontal: 24,
    marginBottom: 12,
    borderRadius: R.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
    ...C.shadowSm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  cardTime: { fontSize: 11, fontWeight: "500", color: C.textPlaceholder },

  /* Badge */
  badgeRow: { flexDirection: "row" },
  badge: {
    backgroundColor: C.surfaceMuted,
    borderRadius: R.sm,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textBody,
    letterSpacing: 0.5,
  },

  /* Card bottom */
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 2,
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: C.green700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  priceValue: {
    fontSize: 22,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -1,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.textPrimary,
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 12,
    gap: 6,
  },
  viewBtnText: { fontSize: 12, fontWeight: "700", color: C.white },
  viewArrow: {
    fontSize: 18,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
    lineHeight: 18,
    includeFontPadding: false,
  },

  /* Empty state */
  emptyCard: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: C.borderAccent,
    borderRadius: R.lg,
    padding: 32,
    marginHorizontal: 24,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyIconStack: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyDot: { position: "absolute", borderRadius: 999 },
  emptyDotOuter: { width: 56, height: 56, backgroundColor: C.greenLight },
  emptyDotInner: { width: 36, height: 36, backgroundColor: C.greenSubtle },
  emptyPlus: { fontSize: 22, fontWeight: "700", color: C.green600 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.textPrimary },
  emptyDesc: { fontSize: 13, color: C.textMuted },
});
