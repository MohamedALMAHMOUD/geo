import React from "react";
import { ActivityIndicator, I18nManager, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { AuthProvider, useAuth } from "./src/auth";
import { C } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import SearchScreen from "./src/screens/SearchScreen";
import FavoritesScreen from "./src/screens/FavoritesScreen";
import WalletScreen from "./src/screens/WalletScreen";
import NearbyScreen from "./src/screens/NearbyScreen";

// فرض الاتجاه من اليمين لليسار (RTL)
try { I18nManager.allowRTL(true); I18nManager.forceRTL(true); } catch {}

const Tab = createBottomTabNavigator();

const navTheme = {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: C.bg, card: C.card, text: C.text, border: C.border, primary: C.accent }
};

function LogoutButton() {
    const { logout } = useAuth();
    return (
        <TouchableOpacity onPress={logout} style={{ paddingHorizontal: 14 }}>
            <Text style={{ color: C.text, fontWeight: "700" }}>خروج</Text>
        </TouchableOpacity>
    );
}

const ICONS = { الرحلة: "🧭", المفضّلة: "⭐", رصيدي: "🎫", القريب: "🚌" };

function Tabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerStyle: { backgroundColor: C.card },
                headerTitleStyle: { color: C.text },
                headerTintColor: C.text,
                headerRight: () => <LogoutButton />,
                tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border, height: 62, paddingBottom: 8, paddingTop: 6 },
                tabBarActiveTintColor: C.accent,
                tabBarInactiveTintColor: C.muted,
                tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{ICONS[route.name] || "•"}</Text>
            })}
        >
            <Tab.Screen name="الرحلة" component={SearchScreen} />
            <Tab.Screen name="المفضّلة" component={FavoritesScreen} />
            <Tab.Screen name="رصيدي" component={WalletScreen} />
            <Tab.Screen name="القريب" component={NearbyScreen} />
        </Tab.Navigator>
    );
}

function Root() {
    const { user, ready } = useAuth();
    if (!ready) {
        return (
            <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={C.accent} size="large" />
            </View>
        );
    }
    return (
        <NavigationContainer theme={navTheme}>
            {user ? <Tabs /> : <LoginScreen />}
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <StatusBar style="light" />
            <Root />
        </AuthProvider>
    );
}
