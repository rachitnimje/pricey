import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  TextInput,
  Linking,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-gifted-charts";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import { useAppStore } from "../store/appStore";
import { wsService } from "../services/websocket";
import { api } from "../services/api";
import { Product, PriceSnapshot, CardOffer, WSMessage } from "../types";
import { C, R } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "ComparisonResult">;

const COL_WIDTH = 150;
const LABEL_WIDTH = 110;
const SCREEN_WIDTH = Dimensions.get("window").width;

export default function ComparisonResultScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { comparisonId } = route.params;

  const {
    currentComparison,
    fetchComparison,
    refreshComparison,
    addURLsToComparison,
    deleteComparison,
    updateComparison,
    alerts,
    fetchAlerts,
  } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTo, setRenameTo] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Price history chart
  const [priceHistory, setPriceHistory] = useState<
    { ts: string; best_price: number }[]
  >([]);
  const chartRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [chartY, setChartY] = useState(0);

  useEffect(() => {
    fetchComparison(comparisonId);
    fetchAlerts();
    api
      .getComparisonPriceHistory(comparisonId, 30)
      .then(setPriceHistory)
      .catch(() => {});

    // Listen for batch-complete: auto-refresh data when background scraping finishes
    const unsub = wsService.on("scrape_batch_complete", (msg: WSMessage) => {
      const d = msg.data as any;
      if (d.comparison_id === comparisonId) {
        fetchComparison(comparisonId);
        api
          .getComparisonPriceHistory(comparisonId, 30)
          .then(setPriceHistory)
          .catch(() => {});
      }
    });
    return () => {
      unsub();
    };
  }, [comparisonId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Wait for batch-complete WS event before fetching data
      const batchDone = new Promise<void>((resolve) => {
        const unsub = wsService.on(
          "scrape_batch_complete",
          (msg: WSMessage) => {
            const d = msg.data as any;
            if (d.comparison_id === comparisonId) {
              unsub();
              resolve();
            }
          },
        );
        // Safety timeout in case WS fails
        setTimeout(() => {
          unsub();
          resolve();
        }, 120_000);
      });
      await refreshComparison(comparisonId);
      await batchDone;
      await fetchComparison(comparisonId);
      api
        .getComparisonPriceHistory(comparisonId, 30)
        .then(setPriceHistory)
        .catch(() => {});
    } catch {
      // silent
    }
    setRefreshing(false);
  }, [comparisonId]);

  const products = useMemo(() => {
    const raw = currentComparison?.products ?? [];
    return [...raw].sort((a, b) => {
      const pa = a.latest_snapshot?.price;
      const pb = b.latest_snapshot?.price;
      const hasA = pa != null && pa > 0;
      const hasB = pb != null && pb > 0;
      if (hasA && hasB) return pa - pb;
      if (hasA) return -1;
      if (hasB) return 1;
      const nameA = a.site.replace(/^www\./, "").toLowerCase();
      const nameB = b.site.replace(/^www\./, "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [currentComparison?.products]);

  const bestPriceId = useMemo(() => {
    let best: string | null = null;
    let min = Infinity;
    for (const p of products) {
      const price = p.latest_snapshot?.price;
      if (price != null && price > 0 && price < min) {
        min = price;
        best = p.id;
      }
    }
    return best;
  }, [products]);

  const bestPrice = useMemo(() => {
    if (!bestPriceId) return null;
    const p = products.find((x) => x.id === bestPriceId);
    return p?.latest_snapshot?.price ?? null;
  }, [bestPriceId, products]);

  const allCardOffers = useMemo(() => {
    const map = new Map<string, { product: Product; offers: CardOffer[] }>();
    for (const p of products) {
      const offers = p.latest_snapshot?.card_offers ?? [];
      if (offers.length > 0) {
        map.set(p.id, { product: p, offers });
      }
    }
    return map;
  }, [products]);

  const allTimeLow = useMemo(() => {
    if (priceHistory.length === 0) return bestPrice;
    return Math.min(...priceHistory.map((h) => h.best_price));
  }, [priceHistory, bestPrice]);

  const chartData = useMemo(() => {
    if (priceHistory.length < 2) return null;
    const raw = priceHistory;
    const step = Math.max(1, Math.floor(raw.length / 30));
    const sampled = raw.filter(
      (_, i) => i % step === 0 || i === raw.length - 1,
    );

    const labelStep = Math.max(1, Math.floor(sampled.length / 5));
    return sampled.map((h, i) => {
      const d = new Date(h.ts);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      return {
        value: h.best_price,
        label: i % labelStep === 0 || i === sampled.length - 1 ? label : "",
        dataPointText: "",
        date: label,
      };
    });
  }, [priceHistory]);

  const scrollToChart = () => {
    if (chartY > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ y: chartY - 20, animated: true });
    }
  };

  const handleShare = async () => {
    if (!currentComparison) return;
    const lines = products
      .map((p) => {
        const snap = p.latest_snapshot;
        const price =
          snap?.price != null
            ? `\u20B9${snap.price.toLocaleString("en-IN")}`
            : "N/A";
        return `${p.site}: ${price}`;
      })
      .join("\n");
    await Share.share({
      message: `Pricey \u2014 ${currentComparison.name}\n\n${lines}`,
    });
  };

  const handleSetAlert = () => {
    if (!currentComparison) return;
    navigation.navigate("SetAlert", {
      comparisonId: currentComparison.id,
      comparisonName: currentComparison.name,
      currentBestPrice: bestPrice ?? undefined,
      alertId: existingAlert?.id,
      alertTargetPrice: existingAlert?.target_price,
      alertChannels: existingAlert?.channels,
    });
  };

  const handleRename = async () => {
    const trimmed = renameTo.trim();
    if (!trimmed || !currentComparison) return;
    setRenaming(true);
    try {
      await updateComparison(comparisonId, { name: trimmed });
      await fetchComparison(comparisonId);
      setShowRenameModal(false);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to rename");
    }
    setRenaming(false);
  };

  const handleAddURL = async () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    setAddingUrl(true);
    try {
      await addURLsToComparison(comparisonId, [trimmed]);
      setNewUrl("");
      setShowAddModal(false);
      // Data will auto-refresh via the scrape_batch_complete WS listener
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add URL");
    }
    setAddingUrl(false);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Comparison",
      `Are you sure you want to delete \"${currentComparison?.name}\"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteComparison(comparisonId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const existingAlert = useMemo(() => {
    return alerts.find((a) => a.comparison_id === comparisonId);
  }, [alerts, comparisonId]);

  if (!currentComparison) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={C.green500} />
      </View>
    );
  }

  /* ── helpers ──────────────────────────────────────────── */

  const fmt = (n: number | null | undefined) =>
    n != null ? `\u20B9${n.toLocaleString("en-IN")}` : "\u2014";

  const siteName = (p: Product) => {
    try {
      const hostname = new URL(p.url).hostname;
      return hostname.replace(/^www\./, "").substring(0, 20);
    } catch {
      return p.site.replace(/^www\./, "").substring(0, 20);
    }
  };

  const isBest = (p: Product) => p.id === bestPriceId;

  /* ── matrix rows ─────────────────────────────────────── */

  const renderLabelCell = (label: string) => (
    <View style={s.labelCell}>
      <Text style={s.labelText}>{label}</Text>
    </View>
  );

  const renderSiteHeader = (p: Product) => (
    <View key={p.id} style={[s.colCell, isBest(p) && s.bestCol]}>
      <Text
        style={[s.siteNameText, isBest(p) && s.bestSiteText]}
        numberOfLines={1}
      >
        {siteName(p)}
      </Text>
      {p.scrape_status === "pending" && (
        <ActivityIndicator
          size="small"
          color={C.green500}
          style={{ marginTop: 4 }}
        />
      )}
      {p.scrape_status === "failed" && <Text style={s.failedChip}>FAILED</Text>}
    </View>
  );

  const renderPriceRow = () => (
    <View style={s.matrixRow}>
      {renderLabelCell("Price")}
      {products.map((p) => {
        const snap = p.latest_snapshot;
        const best = isBest(p);
        return (
          <View key={p.id} style={[s.colCell, best && s.bestCol]}>
            <Text style={[s.priceText, best && s.bestPriceText]}>
              {fmt(snap?.price)}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const renderAvailabilityRow = () => (
    <View style={s.matrixRow}>
      {renderLabelCell("Availability")}
      {products.map((p) => {
        const a = p.latest_snapshot?.availability;
        if (!a) {
          return (
            <View key={p.id} style={[s.colCell, isBest(p) && s.bestCol]}>
              <Text style={s.cellTextMuted}>{"\u2014"}</Text>
            </View>
          );
        }
        const aLower = a.toLowerCase();
        const inStock =
          aLower.includes("in stock") ||
          aLower.includes("in_stock") ||
          aLower.includes("available");
        return (
          <View key={p.id} style={[s.colCell, isBest(p) && s.bestCol]}>
            <View style={s.availRow}>
              <View
                style={[
                  s.dot,
                  { backgroundColor: inStock ? C.green500 : C.red },
                ]}
              />
              <Text
                style={[s.cellText, !inStock && { color: C.red }]}
                numberOfLines={2}
              >
                {a.replace(/_/g, " ")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderDeliveryRow = () => (
    <View style={s.matrixRow}>
      {renderLabelCell("Delivery")}
      {products.map((p) => {
        const snap = p.latest_snapshot;
        const info = snap?.delivery_info;
        const days = snap?.delivery_days;
        const text =
          info || (days != null ? `${days} day${days > 1 ? "s" : ""}` : null);
        return (
          <View key={p.id} style={[s.colCell, isBest(p) && s.bestCol]}>
            <Text style={s.cellText} numberOfLines={2}>
              {text ?? "\u2014"}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const renderShippingRow = () => (
    <View style={s.matrixRow}>
      {renderLabelCell("Shipping")}
      {products.map((p) => {
        const cost = p.latest_snapshot?.shipping_cost;
        const free = cost === 0;
        return (
          <View key={p.id} style={[s.colCell, isBest(p) && s.bestCol]}>
            <View style={[s.shippingPill, free && s.freePill]}>
              <Text style={[s.shippingText, free && s.freeText]}>
                {cost == null ? "\u2014" : free ? "FREE" : fmt(cost)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderRatingRow = () => (
    <View style={s.matrixRow}>
      {renderLabelCell("Rating")}
      {products.map((p) => {
        const r = p.latest_snapshot?.rating;
        const rc = p.latest_snapshot?.review_count;
        return (
          <View key={p.id} style={[s.colCell, isBest(p) && s.bestCol]}>
            {r != null ? (
              <View>
                <Text style={s.ratingText}>
                  {"\u2605"} {r.toFixed(1)}
                </Text>
                {rc != null && (
                  <Text style={s.reviewCount}>
                    {rc.toLocaleString("en-IN")} reviews
                  </Text>
                )}
              </View>
            ) : (
              <Text style={s.cellTextMuted}>{"\u2014"}</Text>
            )}
          </View>
        );
      })}
    </View>
  );

  const renderCardOffersRow = () => {
    if (allCardOffers.size === 0) return null;
    return (
      <View style={s.matrixRow}>
        {renderLabelCell("Card Offers")}
        {products.map((p) => {
          const entry = allCardOffers.get(p.id);
          return (
            <View
              key={p.id}
              style={[s.colCell, isBest(p) && s.bestCol, { minHeight: 60 }]}
            >
              {entry ? (
                entry.offers.slice(0, 3).map((o, i) => (
                  <View key={i} style={s.offerChip}>
                    <Text style={s.offerText} numberOfLines={1}>
                      {o.bank} · {o.type || "Cash"} · {o.amount}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={s.cellTextMuted}>{"\u2014"}</Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  /* ── main render ────────────────────────────────────── */

  return (
    <ScrollView
      ref={scrollRef}
      style={s.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.green500}
        />
      }
    >
      {/* Header with inline actions */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{currentComparison.name}</Text>
          <Text style={s.meta}>
            {products.length} retailer{products.length !== 1 ? "s" : ""}{" "}
            {"\u00B7"}{" "}
            {new Date(currentComparison.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={onRefresh}
            activeOpacity={0.7}
          >
            <Text style={s.headerBtnIcon}>{"\u21BB"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.addUrlBtn}
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
          >
            <Text style={s.addUrlBtnText}>{"\uFF0B"}</Text>
          </TouchableOpacity>
          <View>
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => setShowMenu(!showMenu)}
              activeOpacity={0.7}
            >
              <Text style={s.headerBtnIcon}>{"\u22EF"}</Text>
            </TouchableOpacity>
            {showMenu && (
              <View style={s.dropdownMenu}>
                <TouchableOpacity
                  style={s.dropdownItem}
                  onPress={() => {
                    setShowMenu(false);
                    setRenameTo(currentComparison.name);
                    setShowRenameModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.dropdownText}>Edit</Text>
                </TouchableOpacity>
                <View style={s.dropdownDivider} />
                <TouchableOpacity
                  style={s.dropdownItem}
                  onPress={() => {
                    setShowMenu(false);
                    handleShare();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.dropdownText}>Share</Text>
                </TouchableOpacity>
                <View style={s.dropdownDivider} />
                <TouchableOpacity
                  style={s.dropdownItem}
                  onPress={() => {
                    setShowMenu(false);
                    handleDelete();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.dropdownText, { color: C.red }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Summary */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>CURRENT BEST</Text>
          <Text style={s.summaryPrice}>
            {bestPrice != null ? fmt(bestPrice) : "\u2014"}
          </Text>
          {bestPriceId && (
            <Text style={s.summarySite}>
              {siteName(products.find((p) => p.id === bestPriceId)!)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.summaryCard, s.summaryCardAlt]}
          onPress={scrollToChart}
          activeOpacity={0.7}
        >
          <Text style={s.summaryLabel}>ALL-TIME LOW</Text>
          <Text style={[s.summaryPrice, { color: C.textPrimary }]}>
            {allTimeLow != null ? fmt(allTimeLow) : "\u2014"}
          </Text>
          <Text style={s.summaryMeta}>
            since{" "}
            {new Date(currentComparison.created_at).toLocaleDateString(
              "en-IN",
              { month: "short", day: "numeric" },
            )}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Alert status */}
      <TouchableOpacity
        style={s.alertBanner}
        onPress={handleSetAlert}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.alertBannerTitle}>
            {existingAlert
              ? `Alert set at \u20B9${existingAlert.target_price.toLocaleString("en-IN")}`
              : "No price alert set"}
          </Text>
          <Text style={s.alertBannerSub}>
            {existingAlert
              ? existingAlert.is_active
                ? "Active \u2022 Tap to edit"
                : "Paused \u2022 Tap to edit"
              : "Tap to set a price drop alert"}
          </Text>
        </View>
        <View
          style={[
            s.alertDot,
            existingAlert?.is_active ? s.alertDotActive : s.alertDotInactive,
          ]}
        />
      </TouchableOpacity>

      {/* Matrix table */}
      <View style={s.tableCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Site header row */}
            <View style={s.matrixRow}>
              <View style={s.labelCell}>
                <Text style={s.labelText}>Site</Text>
              </View>
              {products.map(renderSiteHeader)}
            </View>

            {renderPriceRow()}
            {renderAvailabilityRow()}
            {renderDeliveryRow()}
            {renderShippingRow()}
            {renderRatingRow()}
            {renderCardOffersRow()}

            {/* Buy buttons row */}
            <View style={[s.matrixRow, { borderBottomWidth: 0 }]}>
              <View style={s.labelCell} />
              {products.map((p) => {
                const best = isBest(p);
                return (
                  <View key={p.id} style={[s.colCell, best && s.bestCol]}>
                    {best ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(p.url)}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={[C.greenGradientStart, C.greenGradientEnd]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={s.buyBtnGreen}
                        >
                          <Text style={s.buyBtnGreenText}>Buy</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={s.buyBtnOutline}
                        onPress={() => Linking.openURL(p.url)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.buyBtnOutlineText}>Buy</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Price History Chart */}
      {chartData && (
        <View
          ref={chartRef}
          onLayout={(e) => setChartY(e.nativeEvent.layout.y)}
          style={s.chartSection}
        >
          <Text style={s.chartTitle}>PRICE TREND</Text>
          <Text style={s.chartSubtitle}>
            Best price across all sources · last 30 days
          </Text>
          <LineChart
            data={chartData}
            width={SCREEN_WIDTH - 80}
            height={180}
            spacing={(SCREEN_WIDTH - 120) / Math.max(chartData.length - 1, 1)}
            color="#059669"
            thickness={2}
            hideDataPoints
            hideRules
            yAxisColor="transparent"
            xAxisColor={C.border}
            yAxisTextStyle={{ color: C.textMuted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: C.textMuted, fontSize: 9 }}
            curved
            areaChart
            startFillColor="rgba(5, 150, 105, 0.15)"
            endFillColor="rgba(5, 150, 105, 0.01)"
            startOpacity={0.3}
            endOpacity={0}
            yAxisLabelPrefix="₹"
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
                      ₹{item.value.toLocaleString("en-IN")}
                    </Text>
                    <Text style={s.tooltipDate}>{item.date ?? ""}</Text>
                  </View>
                );
              },
            }}
          />
        </View>
      )}

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Rename Comparison</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Comparison name..."
              placeholderTextColor={C.textPlaceholder}
              value={renameTo}
              onChangeText={setRenameTo}
              autoFocus
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRename}
                disabled={renaming}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[C.greenGradientStart, C.greenGradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.modalAdd}
                >
                  {renaming ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <Text style={s.modalAddText}>Save</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add URL Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Add Product URL</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Paste product URL..."
              placeholderTextColor={C.textPlaceholder}
              value={newUrl}
              onChangeText={setNewUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => {
                  setShowAddModal(false);
                  setNewUrl("");
                }}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddURL}
                disabled={addingUrl}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[C.greenGradientStart, C.greenGradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.modalAdd}
                >
                  {addingUrl ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <Text style={s.modalAddText}>Add</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ── styles ─────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  meta: { fontSize: 13, color: C.textMuted, marginTop: 6 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.borderAccent,
  },
  headerBtnIcon: { fontSize: 18, color: C.textPrimary },
  addUrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.green600,
    justifyContent: "center",
    alignItems: "center",
  },
  addUrlBtnText: {
    fontSize: 20,
    fontWeight: "600",
    color: C.white,
    lineHeight: 22,
    includeFontPadding: false,
  },
  dropdownMenu: {
    position: "absolute",
    top: 42,
    right: 0,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    ...C.shadowMd,
    minWidth: 150,
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  dropdownIcon: { fontSize: 16 },
  dropdownText: { fontSize: 14, fontWeight: "600", color: C.textPrimary },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },

  /* Summary */
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 24,
    marginVertical: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: C.greenLight,
    borderRadius: R.md,
    padding: 16,
    alignItems: "center",
  },
  summaryCardAlt: {
    backgroundColor: C.surfaceAlt,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  summaryPrice: { fontSize: 22, fontWeight: "800", color: C.green700 },
  summarySite: { fontSize: 12, color: C.green600, marginTop: 2 },
  summaryMeta: { fontSize: 11, color: C.textMuted, marginTop: 2 },

  /* Matrix table */
  tableCard: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    marginHorizontal: 24,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: C.border,
    ...C.shadowMd,
    overflow: "hidden",
  },
  matrixRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderNav,
  },
  labelCell: {
    width: LABEL_WIDTH,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  labelText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colCell: {
    width: COL_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  bestCol: { backgroundColor: "rgba(5,150,105,0.08)" },

  siteNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textPrimary,
    textAlign: "center",
  },
  bestSiteText: { color: C.green700, fontWeight: "800" },
  failedChip: {
    fontSize: 9,
    fontWeight: "700",
    color: C.red,
    backgroundColor: C.redBg,
    borderRadius: R.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },

  priceText: { fontSize: 15, fontWeight: "700", color: C.textPrimary },
  bestPriceText: { color: C.green700, fontSize: 17 },
  cellText: { fontSize: 13, color: C.textBody, textAlign: "center" },
  cellTextMuted: {
    fontSize: 13,
    color: C.textPlaceholder,
    textAlign: "center",
  },

  availRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  shippingPill: {
    backgroundColor: C.surfaceMuted,
    borderRadius: R.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  freePill: { backgroundColor: C.greenLight },
  shippingText: { fontSize: 11, fontWeight: "600", color: C.textBody },
  freeText: { color: C.green700 },

  ratingText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.star,
    textAlign: "center",
  },
  reviewCount: {
    fontSize: 10,
    color: C.textMuted,
    textAlign: "center",
    marginTop: 2,
  },

  offerChip: {
    backgroundColor: C.surfaceAlt,
    borderRadius: R.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 4,
  },
  offerText: { fontSize: 10, color: C.textBody },

  /* Buy buttons */
  buyBtnGreen: {
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  buyBtnGreenText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.white,
    textAlign: "center",
  },
  buyBtnOutline: {
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderColor: C.textPrimary,
  },
  buyBtnOutlineText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textPrimary,
    textAlign: "center",
  },

  /* Alert banner */
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginBottom: 8,
    marginTop: 8,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderAccent,
  },
  alertBannerTitle: { fontSize: 14, fontWeight: "700", color: C.textPrimary },
  alertBannerSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  alertDot: { width: 10, height: 10, borderRadius: 5 },
  alertDotActive: { backgroundColor: C.green500 },
  alertDotInactive: { backgroundColor: C.surfaceMuted },

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
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: C.surfaceAlt,
    borderRadius: R.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: C.textPrimary,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    gap: 12,
  },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: C.textMuted },
  modalAdd: {
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalAddText: { fontSize: 14, fontWeight: "700", color: C.white },

  /* Price chart */
  chartSection: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  chartTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  chartSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 12,
  },
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
