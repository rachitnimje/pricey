import React, { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "./src/store/authStore";
import { api } from "./src/services/api";
import { wsService } from "./src/services/websocket";
import { RootStackParamList, TabParamList } from "./src/types/navigation";
import { WSMessage } from "./src/types";
import { C } from "./src/theme";

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {}

// Screens
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import SavedScreen from "./src/screens/SavedScreen";
import AlertsScreen from "./src/screens/AlertsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ComparisonResultScreen from "./src/screens/ComparisonResultScreen";
import SetAlertScreen from "./src/screens/SetAlertScreen";
import PriceHistoryScreen from "./src/screens/PriceHistoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator<TabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const HomeStackNav = createNativeStackNavigator();
const SavedStackNav = createNativeStackNavigator();
const AlertsStackNav = createNativeStackNavigator();

const DrawerContext = React.createContext<() => void>(() => {});

// ---------------------------------------------------------------------------
// Sidebar drawer (light theme — pure RN Modal + Animated)
// ---------------------------------------------------------------------------

function SidebarDrawer({
  visible,
  onClose,
  navigation,
}: {
  visible: boolean;
  onClose: () => void;
  navigation: any;
}) {
  const { user, logout } = useAuthStore();
  const slideAnim = useRef(new Animated.Value(-320)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -320,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={sidebarStyles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          sidebarStyles.panel,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={sidebarStyles.header}>
            <Text style={sidebarStyles.menuTitle}>Menu</Text>
          </View>
          <TouchableOpacity
            style={sidebarStyles.item}
            onPress={() => {
              onClose();
              navigation.navigate("Settings");
            }}
            activeOpacity={0.7}
          >
            <Text style={sidebarStyles.itemIcon}>{"\u2699"}</Text>
            <Text style={sidebarStyles.itemLabel}>SETTINGS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={sidebarStyles.item}
            onPress={() => {
              onClose();
              navigation.navigate("Profile");
            }}
            activeOpacity={0.7}
          >
            <Text style={sidebarStyles.itemIcon}>{"\uD83D\uDC64"}</Text>
            <Text style={sidebarStyles.itemLabel}>MY ACCOUNT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={sidebarStyles.item}
            onPress={() => {
              onClose();
              logout();
            }}
            activeOpacity={0.7}
          >
            <Text style={sidebarStyles.itemIcon}>{"\uD83D\uDEAA"}</Text>
            <Text style={[sidebarStyles.itemLabel, { color: C.red }]}>
              SIGN OUT
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const sidebarStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 320,
    backgroundColor: C.white,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    ...C.shadowMd,
  },
  header: {
    padding: 32,
    paddingBottom: 16,
    borderBottomWidth: 0,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: C.textPrimary,
    marginTop: 24,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
    borderRadius: 9999,
    marginHorizontal: 8,
  },
  itemIcon: { fontSize: 16, color: "#52525B" },
  itemLabel: {
    color: "#52525B",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function TopBar({
  showBack,
  onBackPress,
}: {
  showBack?: boolean;
  onBackPress?: () => void;
}) {
  const openDrawer = React.useContext(DrawerContext);
  const insets = useSafeAreaInsets();
  return (
    <View style={[topBarStyles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity
        onPress={showBack ? onBackPress : openDrawer}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
        style={topBarStyles.iconBtn}
      >
        <Text style={topBarStyles.navIcon}>
          {showBack ? "\u2039" : "\u2261"}
        </Text>
      </TouchableOpacity>
      <Text style={topBarStyles.logoText}>Pricey</Text>
    </View>
  );
}

const topBarStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceGlass,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  navIcon: {
    fontSize: 26,
    color: C.green600,
    lineHeight: 28,
    textAlign: "center",
    includeFontPadding: false,
  },
  logoText: {
    fontSize: 22,
    fontWeight: "700",
    color: C.green900,
    letterSpacing: -0.6,
  },
});

// ---------------------------------------------------------------------------
// Custom Bottom Tab Bar with pill active state
// ---------------------------------------------------------------------------

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const tabs = [
    { name: "Home", label: "COMPARE", icon: "\uD83D\uDD0D", iconSize: 16 },
    { name: "Saved", label: "SAVED", icon: "\uD83D\uDCE6", iconSize: 14 },
    { name: "Alerts", label: "ALERTS", icon: "\uD83D\uDD14", iconSize: 16 },
  ];

  return (
    <View
      style={[
        tabBarStyles.container,
        { paddingBottom: Math.max(insets.bottom, 24) },
      ]}
    >
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;
        const tab = tabs[index];
        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.7}
            style={[tabBarStyles.tab, isFocused && tabBarStyles.tabActive]}
          >
            <Text
              style={[
                tabBarStyles.tabIcon,
                isFocused && tabBarStyles.tabIconActive,
              ]}
            >
              {tab.icon}
            </Text>
            <Text
              style={[
                tabBarStyles.tabLabel,
                isFocused && tabBarStyles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 32,
    gap: 20,
    backgroundColor: C.surfaceGlass,
    borderTopWidth: 1,
    borderTopColor: C.borderNav,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    ...C.shadowGlow,
  },
  tab: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  tabActive: {
    backgroundColor: C.greenLight,
    borderRadius: 9999,
  },
  tabIcon: { fontSize: 16, color: C.textPlaceholder, marginBottom: 4 },
  tabIconActive: { color: C.green600 },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.textPlaceholder,
  },
  tabLabelActive: {
    color: C.green600,
    fontWeight: "500",
    letterSpacing: 1.1,
    fontSize: 11,
  },
});

// ---------------------------------------------------------------------------
// Inner screen options (shared by all tab stacks)
// ---------------------------------------------------------------------------

const innerScreenOptions = ({ navigation }: any) => {
  const isRoot = navigation.getState().index === 0;
  return {
    header: () => (
      <TopBar showBack={!isRoot} onBackPress={() => navigation.goBack()} />
    ),
    contentStyle: { backgroundColor: C.bg },
  };
};

function HomeTabStack() {
  return (
    <HomeStackNav.Navigator screenOptions={innerScreenOptions}>
      <HomeStackNav.Screen name="HomeMain" component={HomeScreen} />
      <HomeStackNav.Screen
        name="ComparisonResult"
        component={ComparisonResultScreen}
      />
      <HomeStackNav.Screen name="SetAlert" component={SetAlertScreen} />
      <HomeStackNav.Screen name="PriceHistory" component={PriceHistoryScreen} />
    </HomeStackNav.Navigator>
  );
}

function SavedTabStack() {
  return (
    <SavedStackNav.Navigator screenOptions={innerScreenOptions}>
      <SavedStackNav.Screen name="SavedMain" component={SavedScreen} />
      <SavedStackNav.Screen
        name="ComparisonResult"
        component={ComparisonResultScreen}
      />
      <SavedStackNav.Screen name="SetAlert" component={SetAlertScreen} />
      <SavedStackNav.Screen
        name="PriceHistory"
        component={PriceHistoryScreen}
      />
    </SavedStackNav.Navigator>
  );
}

function AlertsTabStack() {
  return (
    <AlertsStackNav.Navigator screenOptions={innerScreenOptions}>
      <AlertsStackNav.Screen name="AlertsMain" component={AlertsScreen} />
      <AlertsStackNav.Screen name="SetAlert" component={SetAlertScreen} />
    </AlertsStackNav.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeTabStack} />
      <Tab.Screen name="Saved" component={SavedTabStack} />
      <Tab.Screen name="Alerts" component={AlertsTabStack} />
    </Tab.Navigator>
  );
}

function AppNavigator({ navigationRef }: { navigationRef: any }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = React.useCallback(() => setDrawerOpen(true), []);

  return (
    <DrawerContext.Provider value={openDrawer}>
      <SidebarDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        navigation={navigationRef}
      />
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <RootStack.Screen name="Tabs" component={TabNavigator} />
        <RootStack.Screen
          name="Profile"
          component={ProfileScreen}
          options={({ navigation }) => ({
            headerShown: true,
            header: () => (
              <TopBar
                showBack={navigation.canGoBack()}
                onBackPress={() => navigation.goBack()}
              />
            ),
          })}
        />
        <RootStack.Screen
          name="Settings"
          component={SettingsScreen}
          options={({ navigation }) => ({
            headerShown: true,
            header: () => (
              <TopBar
                showBack={navigation.canGoBack()}
                onBackPress={() => navigation.goBack()}
              />
            ),
          })}
        />
      </RootStack.Navigator>
    </DrawerContext.Provider>
  );
}

async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return null;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

export default function App() {
  const { isAuthenticated, isLoading, init } = useAuthStore();
  const navigationRef = useNavigationContainerRef();
  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null,
  );

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        api.updateFCMToken(token).catch(() => {});
      }
    });

    try {
      notificationListener.current =
        Notifications.addNotificationReceivedListener(() => {});
    } catch {}

    const unsubAlert = wsService.on("alert_triggered", (msg: WSMessage) => {
      const data = msg.data as any;
      Alert.alert(
        data.title || "Price Drop!",
        data.body || `Price dropped to \u20B9${data.price}`,
      );
    });

    return () => {
      notificationListener.current?.remove();
      unsubAlert();
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.green500} />
          <StatusBar style="dark" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="dark" />
        {isAuthenticated ? (
          <AppNavigator navigationRef={navigationRef} />
        ) : (
          <AuthScreen />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
