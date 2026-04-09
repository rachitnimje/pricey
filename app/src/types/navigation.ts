import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

export type RootStackParamList = {
  Tabs: undefined;
  ComparisonResult: { comparisonId: string };
  SetAlert: {
    comparisonId: string;
    comparisonName: string;
    currentBestPrice?: number;
    alertId?: string;
    alertTargetPrice?: number;
    alertChannels?: string[];
  };
  PriceHistory: { productId: string; productName: string };
  Profile: undefined;
  Settings: undefined;
};

export type TabParamList = {
  Home: undefined;
  Saved: undefined;
  Alerts: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<
  TabParamList,
  T
>;
