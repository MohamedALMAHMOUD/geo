import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { C, S } from "../theme";
import { Btn, DirTag, Pill } from "../components";
import { api } from "../api";

export default function NearbyScreen() {
    const [pos, setPos] = useState(null);
    const [buses, setBuses] = useState([]);
    const [filter, setFilter] = useState("all");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const timer = useRef(null);

    async function locateAndTrack() {
        setErr(""); setLoading(true);
        let p = { lat: 33.5138, lng: 36.2765 };
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === "granted") {
                const loc = await Location.getCurrentPositionAsync({});
                p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            } else setErr("تعذّر الوصول للموقع، نعرض موقعًا افتراضيًا في دمشق.");
        } catch { setErr("تعذّر تحديد الموقع، نعرض موقعًا افتراضيًا."); }
        setPos(p); setLoading(false);
        fetchBuses(p);
        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(() => fetchBuses(p), 3000);
    }

    async function fetchBuses(p) {
        try { const { buses } = await api(`/buses/near?lat=${p.lat}&lng=${p.lng}&radiusKm=8`); setBuses(buses); }
        catch {}
    }

    useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

    const shown = filter === "all" ? buses : buses.filter((b) => b.direction === filter);

    return (
        <ScrollView style={S.screen} contentContainerStyle={S.content}>
            <Text style={S.h1}>🧭 الباصات القريبة مني</Text>
            <View style={S.card}>
                <Text style={S.muted}>عرض الباصات القريبة في الاتجاهين (ذهاب/إياب) مع المسافة والوقت المقدّر.</Text>
                <Btn title={loading ? "..." : "📍 تحديد موقعي وتتبّع الباصات"} onPress={locateAndTrack} disabled={loading} />
                {!!err && <Text style={S.msgErr}>{err}</Text>}
            </View>

            {pos && (
                <View style={[S.row, { gap: 6, marginBottom: 10 }]}>
                    {["all", "ذهاب", "إياب"].map((d) => (
                        <TouchableOpacity key={d} onPress={() => setFilter(d)}
                            style={[S.btn, { flex: 1, marginTop: 0, paddingVertical: 8, backgroundColor: filter === d ? C.accent2 : "#0b1220", borderWidth: 1, borderColor: filter === d ? C.accent2 : "#3b4a63" }]}>
                            <Text style={{ color: filter === d ? "#061634" : C.text, fontWeight: "700" }}>{d === "all" ? "الكل" : d}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {pos && shown.length === 0 && <View style={S.card}><Text style={S.muted}>لا توجد باصات قريبة حاليًا.</Text></View>}

            {shown.map((b) => (
                <View key={b.id} style={[S.card, { marginBottom: 10 }]}>
                    <View style={[S.row, { justifyContent: "space-between" }]}>
                        <View style={{ flex: 1 }}>
                            <View style={[S.row, { gap: 6 }]}>
                                <Text style={{ fontSize: 18 }}>🚌</Text>
                                <Text style={[S.text, { fontWeight: "700" }]}>{b.label}</Text>
                                <DirTag direction={b.direction} />
                                {b.approaching && <Pill text="يقترب" bg="#064e3b" color="#6ee7b7" />}
                            </View>
                            <Text style={[S.muted, { marginTop: 4 }]}>{b.lineName}</Text>
                        </View>
                        <View>
                            <Text style={[S.text, { fontWeight: "700", textAlign: "left" }]}>{b.distanceMeters} م</Text>
                            <Text style={[S.muted, { textAlign: "left" }]}>~{b.etaMin} دقيقة</Text>
                        </View>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
