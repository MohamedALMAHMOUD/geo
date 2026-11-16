import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { C, S } from "../theme";
import { Btn, DirTag, Divider } from "../components";
import { api } from "../api";

function PlaceField({ title, text, setText, place, setPlace }) {
    const [cands, setCands] = useState([]);
    const [loading, setLoading] = useState(false);

    async function doGeocode() {
        if (!text.trim()) return;
        setLoading(true);
        try {
            const { results } = await api("/geocode?q=" + encodeURIComponent(text.trim()));
            if (results.length === 1) { setPlace(results[0]); setCands([]); }
            else setCands(results);
        } catch { setCands([]); } finally { setLoading(false); }
    }

    async function useMyLocation() {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;
            const pos = await Location.getCurrentPositionAsync({});
            setPlace({ name: "موقعي الحالي", lat: pos.coords.latitude, lng: pos.coords.longitude });
            setText("موقعي الحالي"); setCands([]);
        } catch {}
    }

    return (
        <View style={{ marginBottom: 10 }}>
            <Text style={S.label}>{title}</Text>
            <View style={[S.row, { gap: 8 }]}>
                <TextInput style={[S.input, { flex: 1 }]} value={text}
                    onChangeText={(t) => { setText(t); setPlace(null); }}
                    onSubmitEditing={doGeocode} placeholder="اكتب اسم المكان..." placeholderTextColor="#64748b" />
                <TouchableOpacity onPress={doGeocode} style={[S.btn, { marginTop: 0, paddingHorizontal: 14, backgroundColor: C.accent2 }]}>
                    {loading ? <ActivityIndicator color="#061634" /> : <Text style={S.btnSecondaryText}>بحث</Text>}
                </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={useMyLocation}>
                <Text style={[S.muted, { marginTop: 6, color: C.accent2 }]}>📍 استخدام موقعي الحالي</Text>
            </TouchableOpacity>
            {place && <Text style={[S.text, { marginTop: 6 }]}>✓ {place.name}</Text>}
            {cands.map((c, i) => (
                <TouchableOpacity key={i} onPress={() => { setPlace(c); setText(c.name); setCands([]); }}
                    style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#2a3850" }}>
                    <Text style={S.text}>📍 {c.name}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export default function SearchScreen() {
    const [fromText, setFromText] = useState("");
    const [toText, setToText] = useState("");
    const [from, setFrom] = useState(null);
    const [to, setTo] = useState(null);
    const [routes, setRoutes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    async function search() {
        setErr(""); setBusy(true); setRoutes(null);
        try {
            const data = await api("/search-routes", { method: "POST", body: { from, to } });
            setRoutes(data.routes);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    async function toggleFav(r) {
        try {
            if (r.isFavorite) await api("/favorites/" + r.lineId, { method: "DELETE" });
            else await api("/favorites", { method: "POST", body: { lineId: r.lineId } });
            setRoutes((prev) => prev.map((x) => x.lineId === r.lineId ? { ...x, isFavorite: !x.isFavorite } : x));
        } catch {}
    }

    return (
        <ScrollView style={S.screen} contentContainerStyle={S.content}>
            <Text style={S.h1}>🔎 ابحث عن خط</Text>
            <View style={S.card}>
                <PlaceField title="من (نقطة الانطلاق)" text={fromText} setText={setFromText} place={from} setPlace={setFrom} />
                <PlaceField title="إلى (الوجهة)" text={toText} setText={setToText} place={to} setPlace={setTo} />
                {!!err && <Text style={S.msgErr}>{err}</Text>}
                <Btn title={busy ? "جارٍ البحث..." : "ابحث عن الخطوط"} onPress={search} disabled={busy || !from || !to} />
            </View>

            {routes && routes.length === 0 && (
                <View style={S.card}><Text style={S.muted}>لا يوجد خط مباشر بين هذين المكانين. جرّب نقطة أقرب.</Text></View>
            )}

            {routes && routes.map((r) => (
                <View key={r.lineId} style={S.card}>
                    <View style={[S.row, { justifyContent: "space-between" }]}>
                        <Text style={[S.text, { fontWeight: "700", flex: 1 }]}>{r.lineName}</Text>
                        <TouchableOpacity onPress={() => toggleFav(r)}>
                            <Text style={{ fontSize: 22 }}>{r.isFavorite ? "⭐" : "☆"}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={[S.row, { marginTop: 6, gap: 6 }]}>
                        <DirTag direction={r.direction} />
                        <Text style={S.muted}>{r.priceCredits} كريدت • ~{r.rideMin} دقيقة</Text>
                    </View>
                    <Divider />
                    <Text style={S.text}>🚏 اركب من: <Text style={{ fontWeight: "700" }}>{r.board.name}</Text>  (مشي {r.walkFromMeters} م)</Text>
                    <Text style={[S.text, { marginTop: 4 }]}>🏁 انزل في: <Text style={{ fontWeight: "700" }}>{r.alight.name}</Text>  (مشي {r.walkToMeters} م)</Text>
                    <Text style={[S.muted, { marginTop: 4 }]}>عدد المحطات بينهما: {r.stopsBetween}</Text>
                </View>
            ))}
        </ScrollView>
    );
}
