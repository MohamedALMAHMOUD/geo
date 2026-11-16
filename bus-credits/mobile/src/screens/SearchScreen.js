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
    const [itin, setItin] = useState(null);
    const [favIds, setFavIds] = useState(new Set());
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    async function search() {
        setErr(""); setBusy(true); setItin(null);
        try {
            const [{ itineraries }, favRes] = await Promise.all([
                api("/plan", { method: "POST", body: { from, to } }),
                api("/favorites").catch(() => ({ favorites: [] }))
            ]);
            setFavIds(new Set((favRes.favorites || []).map((f) => f.id)));
            setItin(itineraries[0] || null);
            if (!itineraries.length) setErr("لا يوجد مسار بين هذين المكانين عبر الشبكة الحالية.");
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    async function toggleFav(lineId) {
        const isFav = favIds.has(lineId);
        try {
            if (isFav) await api("/favorites/" + lineId, { method: "DELETE" });
            else await api("/favorites", { method: "POST", body: { lineId } });
            setFavIds((prev) => { const n = new Set(prev); isFav ? n.delete(lineId) : n.add(lineId); return n; });
        } catch {}
    }

    return (
        <ScrollView style={S.screen} contentContainerStyle={S.content}>
            <Text style={S.h1}>🧭 خطّط رحلتك</Text>
            <View style={S.card}>
                <PlaceField title="من (نقطة الانطلاق)" text={fromText} setText={setFromText} place={from} setPlace={setFrom} />
                <PlaceField title="إلى (الوجهة)" text={toText} setText={setToText} place={to} setPlace={setTo} />
                {!!err && <Text style={S.msgErr}>{err}</Text>}
                <Btn title={busy ? "جارٍ التخطيط..." : "خطّط الرحلة"} onPress={search} disabled={busy || !from || !to} />
            </View>

            {itin && (
                <View style={S.card}>
                    <Text style={[S.text, { fontWeight: "800", fontSize: 16 }]}>
                        ⏱️ ~{itin.totalMin} دقيقة • 🔁 {itin.transfers} تبديل • 💳 {itin.fareCredits} كريدت
                    </Text>
                    <Divider />
                    {itin.legs.map((l, i) => {
                        if (l.type === "walk") return (
                            <Text key={i} style={[S.text, { paddingVertical: 6 }]}>🚶 مشي: <Text style={{ fontWeight: "700" }}>{l.fromName}</Text> ← <Text style={{ fontWeight: "700" }}>{l.toName}</Text> <Text style={S.muted}>(~{l.min} د)</Text></Text>
                        );
                        if (l.type === "transfer") return (
                            <Text key={i} style={[{ color: "#f59e0b", paddingVertical: 6, textAlign: "right", writingDirection: "rtl" }]}>🔁 تبديل في <Text style={{ fontWeight: "700" }}>{l.atName}</Text> (~{l.min} د)</Text>
                        );
                        return (
                            <View key={i} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#2a3850" }}>
                                <View style={[S.row, { justifyContent: "space-between" }]}>
                                    <Text style={[S.text, { fontWeight: "700", flex: 1 }]}>🚌 {l.lineName}</Text>
                                    <TouchableOpacity onPress={() => toggleFav(l.lineId)}>
                                        <Text style={{ fontSize: 20 }}>{favIds.has(l.lineId) ? "⭐" : "☆"}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={[S.row, { gap: 6, marginVertical: 4 }]}>
                                    <DirTag direction={l.direction} />
                                    <Text style={S.muted}>{l.min} د • {l.stops} محطات</Text>
                                </View>
                                <Text style={S.text}>اركب من <Text style={{ fontWeight: "700" }}>{l.boardName}</Text> وانزل في <Text style={{ fontWeight: "700" }}>{l.alightName}</Text></Text>
                            </View>
                        );
                    })}
                </View>
            )}
        </ScrollView>
    );
}
