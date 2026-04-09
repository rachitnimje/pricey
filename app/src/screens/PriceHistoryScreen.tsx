import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../types/navigation";
import { api } from "../services/api";
import { PriceSnapshot } from "../types";
import { C, R } from "../theme";

type Route = RouteProp<RootStackParamList, "PriceHistory">;
const SCREEN_WIDTH = Dimensions.get("window").width;
const DAY_OPTIONS = [7, 14, 30, 90];

export default function PriceHistoryScreen() {
  const route = useRoute<Route>();
  const { productId, productName } = route.params;

  const [days, setDays] = useState(30);
  const [history, setHistory] = useState<PriceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await api.getProductHistory(
        productId,
        days,
      )) as PriceSnapshot[];
      setHistory(data ?? []);
    } catch {
      // silent
    }
    setLoading(false);
  }, [productId, days]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const prices = history
    .filter((s) => s.price != null)
    .map((s) => s.price as number);

  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;

  const filteredHistory = history.filter((s) => s.price != null);
  const step = Math.max(1, Math.floor(filteredHistory.length / 6));

  const chartDataPoints = filteredHistory.map((s, i) => {
    const d = new Date(s.scraped_at);
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    const showLabel = i % step === 0;
    return {
      value: s.price as number,
      label: showLabel ? label : "",
      date: label,
    };
  });

  const fmt = (n: number) => `\u20B9${n.toLocaleString("en-IN")}`;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={s.headerSection}>
        <Text style={s.screenTitle}>Price History</Text>
        <Text style={s.productName} numberOfLines={2}>
          {productName}
        </Text>
      </View>

      {/* Day chips */}
      <View style={s.chipRow}>
        {DAY_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[s.chip, days === d && s.chipActive]}
            onPress={() => setDays(d)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, days === d && s.chipTextActive]}>
              {d}D
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={C.green500} />
        </View>
      ) : prices.length < 2 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>Not enough data points yet</Text>
        </View>
      ) : (
        <>
          {/* Chart */}
          <View style={s.chartCard}>
            <LineChart
              data={chartDataPoints}
              width={SCREEN_WIDTH - 80}
              height={200}
              spacing={
                (SCREEN_WIDTH - 120) / Math.max(chartDataPoints.length - 1, 1)
              }
              color="#059669"
              thickness={2}
              hideDataPoints
              hideRules
              yAxisColor="transparent"
              xAxisColor={C.borderNav}
              yAxisTextStyle={{ color: C.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: C.textMuted, fontSize: 9 }}
              curved
              areaChart
              startFillColor="rgba(5, 150, 105, 0.15)"
              endFillColor="rgba(5, 150, 105, 0.01)"
              startOpacity={0.3}
              endOpacity={0}
              yAxisLabelPrefix="\u20b9"
              formatYLabel={(v: string) => {
                const n = Number(v);
                return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : v;
              }}
              pointerConfig={{
                pointerStripColor: C.textMuted,
                pointerStripWidth: 1,
                pointerColor: "#059669",
                radius: 5,
                pointerLabelComponent: (items: any[]) => {
                  const item = items[0];
                  return (
                    <View style={s.tooltipBox}>
                      <Text style={s.tooltipPrice}>
                        \u20b9{item.value.toLocaleString("en-IN")}
                      </Text>
                      <Text style={s.tooltipDate}>{item.date ?? ""}</Text>
                    </View>
                  );
                },
              }}
            />
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>MIN</Text>
              <Text style={[s.statValue, { color: C.green700 }]}>
                {fmt(minPrice)}
              </Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statLabel}>MAX</Text>
              <Text style={[s.statValue, { color: C.red }]}>
                {fmt(maxPrice)}
              </Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statLabel}>CURRENT</Text>
              <Text style={s.statValue}>{fmt(currentPrice)}</Text>
            </View>
          </View>
        </>
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
  productName: {
    fontSize: 14,
    color: C.textMuted,
    marginTop: 6,
    lineHeight: 20,
  },

  chipRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginBottom: 20,
    gap: 8,
  },
  chip: {
    borderRadius: R.pill,
    paddingVertical: 8,
    paddingHorizontal: 18,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.borderAccent,
  },
  chipActive: { backgroundColor: C.greenLight, borderColor: C.green500 },
  chipText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
  chipTextActive: { color: C.green700 },

  loadingWrap: { paddingTop: 60, alignItems: "center" },
  emptyWrap: { paddingTop: 60, alignItems: "center" },
  emptyText: { fontSize: 15, color: C.textMuted },

  chartCard: {
    marginHorizontal: 24,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    alignItems: "center",
    ...C.shadowSm,
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 16,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  statValue: { fontSize: 15, fontWeight: "800", color: C.textPrimary },
  tooltipBox: {
    backgroundColor: C.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
    marginLeft: -40,
    marginTop: -8,
  },
  tooltipPrice: {
    color: C.white,
    fontSize: 13,
    fontWeight: "700",
  },
  tooltipDate: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    marginTop: 1,
  },
});
