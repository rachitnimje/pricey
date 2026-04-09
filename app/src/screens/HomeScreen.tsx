import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppStore } from "../store/appStore";
import { wsService } from "../services/websocket";
import { WSMessage } from "../types";
import { C, R } from "../theme";

interface Props {
  navigation: any;
}

export default function HomeScreen({ navigation }: Props) {
  const [urls, setUrls] = useState("");
  const [name, setName] = useState("");
  const [isComparing, setIsComparing] = useState(false);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
    status: string;
  } | null>(null);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const howAnim = useRef(new Animated.Value(0)).current;
  const { createComparison } = useAppStore();

  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(howAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start();

    wsService.connect();
    const unsubProgress = wsService.on("scrape_progress", (msg: WSMessage) => {
      const data = msg.data as any;
      setProgress({
        index: 0,
        total: data.total,
        status: "scraping",
      });
    });
    let completed = 0;
    const unsubComplete = wsService.on("scrape_complete", (msg: WSMessage) => {
      const data = msg.data as any;
      completed++;
      setProgress((prev) => ({
        index: completed,
        total: data.total ?? prev?.total ?? 0,
        status: "scraping",
      }));
    });
    const unsubBatch = wsService.on("scrape_batch_complete", () => {
      setProgress(null);
      completed = 0;
    });
    return () => {
      unsubProgress();
      unsubComplete();
      unsubBatch();
    };
  }, []);

  const handleCompare = async () => {
    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urlList.length === 0) {
      Alert.alert("Error", "Please enter at least one product URL");
      return;
    }
    if (urlList.length > 10) {
      Alert.alert("Error", "Maximum 10 URLs per comparison");
      return;
    }
    setIsComparing(true);
    setProgress(null);
    try {
      const comp = await createComparison(name || "Comparison", urlList);
      navigation.navigate("ComparisonResult", { comparisonId: comp.id });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create comparison");
    } finally {
      setIsComparing(false);
    }
  };

  const urlCount = urls.split("\n").filter((u) => u.trim().length > 0).length;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Decorative watermark */}
      <Text style={s.watermark}>{"\u20B9"}</Text>

      {/* Hero */}
      <Animated.View
        style={[
          s.hero,
          {
            opacity: heroAnim,
            transform: [
              {
                translateY: heroAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={s.heading}>
          Compare{"\n"}
          <Text style={s.headingAccent}>Smarter.</Text>
        </Text>
        <Text style={s.subtitle}>
          Drop product links below and we{"\u2019"}ll find you the best deal
          across retailers.
        </Text>
      </Animated.View>

      {/* Form */}
      <Animated.View
        style={[
          s.formCard,
          {
            opacity: formAnim,
            transform: [
              {
                translateY: formAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Step 1 — Name */}
        <View style={s.inputGroup}>
          <View style={s.stepRow}>
            <View style={s.stepBadge}>
              <Text style={s.stepNum}>1</Text>
            </View>
            <Text style={s.inputLabel}>NAME YOUR COMPARISON</Text>
          </View>
          <View style={s.inputBox}>
            <TextInput
              style={s.textInput}
              placeholder="e.g., iPhone 15 Deals"
              placeholderTextColor={C.textPlaceholder}
              value={name}
              onChangeText={setName}
            />
          </View>
        </View>

        {/* Step 2 — URLs */}
        <View style={s.inputGroup}>
          <View style={s.stepRow}>
            <View style={s.stepBadge}>
              <Text style={s.stepNum}>2</Text>
            </View>
            <Text style={s.inputLabel}>PASTE PRODUCT URLS</Text>
            {urlCount > 0 && (
              <View style={s.urlCountPill}>
                <Text style={s.urlCountText}>{urlCount}/10</Text>
              </View>
            )}
          </View>
          <View style={[s.inputBox, s.urlInputBox]}>
            <TextInput
              style={[s.textInput, s.urlTextInput]}
              placeholder={
                "Paste Amazon, Flipkart, or any\ne-commerce URLs here\u2026"
              }
              placeholderTextColor={C.textPlaceholder}
              value={urls}
              onChangeText={setUrls}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={handleCompare}
          disabled={isComparing}
          activeOpacity={0.85}
          style={{ opacity: isComparing ? 0.6 : 1 }}
        >
          <LinearGradient
            colors={[C.greenGradientStart, C.greenGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.ctaButton}
          >
            {isComparing ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <>
                <Text style={s.ctaText}>Compare Prices</Text>
                <View style={s.ctaArrow}>
                  <Text style={s.ctaArrowText}>{"\u203A"}</Text>
                </View>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* How It Works */}
      <Animated.View
        style={[
          s.howSection,
          {
            opacity: howAnim,
            transform: [
              {
                translateY: howAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={s.howDivider}>
          <View style={s.dividerLine} />
          <Text style={s.howHeading}>HOW IT WORKS</Text>
          <View style={s.dividerLine} />
        </View>

        <View style={s.stepsRow}>
          {[
            { num: "1", title: "Paste", desc: "Add URLs from any retailer" },
            { num: "2", title: "Scan", desc: "We scrape prices in real-time" },
            { num: "3", title: "Alert", desc: "Never miss a price drop" },
          ].map((step, i) => (
            <View key={i} style={s.stepCard}>
              <View style={s.stepCardCircle}>
                <Text style={s.stepCardCircleText}>{step.num}</Text>
              </View>
              <Text style={s.stepCardTitle}>{step.title}</Text>
              <Text style={s.stepCardDesc}>{step.desc}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },

  /* Decorative ₹ watermark */
  watermark: {
    position: "absolute",
    top: -30,
    right: -15,
    fontSize: 220,
    fontWeight: "900",
    color: "rgba(5,150,105,0.03)",
    lineHeight: 220,
  },

  /* Hero */
  hero: { marginBottom: 28, gap: 12 },
  tagPill: {
    alignSelf: "flex-start",
    backgroundColor: C.greenLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "800",
    color: C.green700,
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: 38,
    fontWeight: "900",
    color: C.textPrimary,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  headingAccent: { color: C.green600 },
  subtitle: { fontSize: 15, color: C.textMuted, lineHeight: 22, maxWidth: 290 },

  /* Form card */
  formCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    ...C.shadowMd,
    gap: 16,
    marginBottom: 36,
  },
  inputGroup: { gap: 8 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.green600,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNum: { fontSize: 11, fontWeight: "800", color: C.white },
  inputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textBody,
    letterSpacing: 0.8,
    flex: 1,
  },
  urlCountPill: {
    backgroundColor: C.greenLight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  urlCountText: { fontSize: 10, fontWeight: "700", color: C.green700 },
  inputBox: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  urlInputBox: { minHeight: 100 },
  textInput: {
    fontSize: 15,
    fontWeight: "600",
    color: C.textPrimary,
    padding: 0,
  },
  urlTextInput: { fontSize: 14, fontWeight: "500", minHeight: 72 },

  /* Progress */
  progressSection: { gap: 6 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: { fontSize: 12, fontWeight: "600", color: C.green700 },
  progressCount: { fontSize: 12, fontWeight: "700", color: C.textBody },
  progressTrack: {
    height: 6,
    backgroundColor: C.surfaceAlt,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: C.green500,
    borderRadius: 3,
  },

  /* CTA */
  ctaButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 12,
  },
  ctaText: { fontSize: 16, fontWeight: "700", color: C.white },
  ctaArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  ctaArrowText: {
    fontSize: 20,
    color: C.white,
    fontWeight: "600",
    lineHeight: 22,
    includeFontPadding: false,
  },

  /* How It Works */
  howSection: { gap: 16 },
  howDivider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.borderAccent },
  howHeading: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 2,
  },
  stepsRow: { flexDirection: "row", gap: 10 },
  stepCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  stepCardCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.greenLight,
    justifyContent: "center",
    alignItems: "center",
  },
  stepCardCircleText: { fontSize: 14, fontWeight: "800", color: C.green700 },
  stepCardTitle: { fontSize: 13, fontWeight: "700", color: C.textPrimary },
  stepCardDesc: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 15,
  },
});
