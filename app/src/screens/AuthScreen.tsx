import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../store/authStore";
import { C, R } from "../theme";

export default function AuthScreen() {
  const { signInWithGoogle, isLoading, error, clearError } = useAuthStore();

  return (
    <View style={s.container}>
      <View style={s.hero}>
        <View style={s.logoCircle}>
          <Text style={s.logoEmoji}>{"\uD83D\uDCB0"}</Text>
        </View>
        <Text style={s.appName}>Pricey</Text>
        <Text style={s.tagline}>
          Compare prices across stores.{"\n"}Save money, effortlessly.
        </Text>
      </View>

      <View style={s.bottom}>
        {error ? (
          <TouchableOpacity onPress={clearError} style={s.errorBanner}>
            <Text style={s.errorText}>{error}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={s.googleBtn}
          onPress={signInWithGoogle}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={C.textPrimary} />
          ) : (
            <>
              <Text style={s.googleIcon}>G</Text>
              <Text style={s.googleText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.terms}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "space-between",
  },

  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.greenLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  logoEmoji: { fontSize: 36 },
  appName: {
    fontSize: 36,
    fontWeight: "800",
    color: C.green900,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: C.textMuted,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 24,
  },

  bottom: { paddingHorizontal: 24, paddingBottom: 48 },
  errorBanner: {
    backgroundColor: C.redBg,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 16,
    alignItems: "center",
  },
  errorText: { fontSize: 13, color: C.red, fontWeight: "600" },

  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderRadius: R.pill,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: C.borderAccent,
    gap: 10,
  },
  googleIcon: { fontSize: 18, fontWeight: "700", color: C.textPrimary },
  googleText: { fontSize: 15, fontWeight: "600", color: C.textPrimary },

  terms: {
    fontSize: 11,
    color: C.textPlaceholder,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 16,
  },
});
