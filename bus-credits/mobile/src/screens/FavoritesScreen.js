import React, { useCallback, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { C, S } from "../theme";
import { Divider } from "../components";
import { api } from "../api";

export default function FavoritesScreen() {
    const [favs, setFavs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const load = useCallback(async () => {
        setLoading(true); setErr("");
        try { const { favorites } = await api("/favorites"); setFavs(favorites); }
        catch (e) { setErr(e.message); } finally { setLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    async function remove(id) {
        try { await api("/favorites/" + id, { method: "DELETE" }); setFavs((p) => p.filter((f) => f.id !== id)); }
        catch {}
    }

    return (
        <ScrollView style={S.screen} contentContainerStyle={S.content}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.text} />}>
            <Text style={S.h1}>⭐ خطوطي المفضّلة</Text>
            {!!err && <Text style={S.msgErr}>{err}</Text>}
            {favs.length === 0 && !loading && (
                <View style={S.card}>
                    <Text style={S.muted}>لا توجد خطوط مفضّلة بعد.</Text>
                    <Text style={[S.muted, { marginTop: 6 }]}>من شاشة «ابحث» أضف أي خط بالنجمة ⭐ ليظهر هنا.</Text>
                </View>
            )}
            {favs.map((f) => (
                <View key={f.id} style={S.card}>
                    <View style={[S.row, { justifyContent: "space-between" }]}>
                        <Text style={[S.text, { fontWeight: "700", flex: 1 }]}>{f.name}</Text>
                        <TouchableOpacity onPress={() => remove(f.id)}>
                            <Text style={{ fontSize: 22 }}>⭐</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={[S.muted, { marginTop: 4 }]}>{f.priceCredits} كريدت للرحلة</Text>
                    {f.stops && f.stops.length > 0 && (
                        <>
                            <Divider />
                            <Text style={S.muted}>المحطات:</Text>
                            <Text style={[S.text, { marginTop: 4 }]}>
                                {f.stops.map((s) => s.name).join("  ←  ")}
                            </Text>
                        </>
                    )}
                    <TouchableOpacity onPress={() => remove(f.id)}
                        style={[S.btn, S.btnDanger, { marginTop: 12 }]}>
                        <Text style={{ color: "#fff", fontWeight: "700" }}>إزالة من المفضّلة</Text>
                    </TouchableOpacity>
                </View>
            ))}
        </ScrollView>
    );
}
