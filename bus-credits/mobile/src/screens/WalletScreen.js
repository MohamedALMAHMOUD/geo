import React, { useCallback, useRef, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { C, S } from "../theme";
import { Btn, Divider } from "../components";
import { api } from "../api";

export default function WalletScreen() {
    const [balance, setBalance] = useState(0);
    const [lines, setLines] = useState([]);
    const [lineId, setLineId] = useState(null);
    const [amount, setAmount] = useState("140");
    const [rc, setRc] = useState(null);
    const [instr, setInstr] = useState(null);
    const [msg, setMsg] = useState(null);
    const [loading, setLoading] = useState(false);
    const [ticket, setTicket] = useState(null);      // { id, payload, status }
    const ticketPoll = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const w = await api("/wallet"); setBalance(w.balanceCredits);
            const { lines } = await api("/lines"); setLines(lines);
            if (!lineId && lines[0]) setLineId(lines[0].id);
        } catch {} finally { setLoading(false); }
    }, [lineId]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    function note(text, ok = true) { setMsg({ text, ok }); }

    async function requestRecharge() {
        setMsg(null); setInstr(null); setRc(null);
        try {
            const d = await api("/recharge", { method: "POST", body: { lineId, amountCredits: Number(amount) } });
            setRc(d.recharge); setInstr(d.instructions);
        } catch (e) { note(e.message, false); }
    }
    async function simulate() {
        try { await api(`/recharge/${rc.id}/simulate-transfer`, { method: "POST" }); note("تمت محاكاة التحويل. اضغط «تحقّق وأضف الرصيد»."); }
        catch (e) { note(e.message, false); }
    }
    async function verify() {
        try {
            const d = await api(`/recharge/${rc.id}/verify`, { method: "POST" });
            note("تم تأكيد الشحن ✅ الرصيد: " + d.balanceCredits); setInstr(null); setRc(null); load();
        } catch (e) { note(e.message + " — يمكن للناقل التأكيد يدويًا.", false); }
    }
    async function takeTrip() {
        try { const d = await api("/trip", { method: "POST", body: { lineId } }); note("تمت الرحلة 🚌 الرصيد: " + d.balanceCredits); load(); }
        catch (e) { note(e.message, false); }
    }

    async function createTicket() {
        setMsg(null);
        try {
            const { ticket: t, qrPayload } = await api("/ticket/create", { method: "POST", body: { lineId } });
            setTicket({ id: t.id, payload: qrPayload, status: "active" });
            if (ticketPoll.current) clearInterval(ticketPoll.current);
            ticketPoll.current = setInterval(async () => {
                try {
                    const { ticket: tt } = await api("/ticket/" + t.id);
                    if (tt.status !== "active") {
                        setTicket((prev) => prev ? { ...prev, status: tt.status } : prev);
                        clearInterval(ticketPoll.current); load();
                    }
                } catch { clearInterval(ticketPoll.current); }
            }, 3000);
        } catch (e) { note(e.message, false); }
    }

    return (
        <ScrollView style={S.screen} contentContainerStyle={S.content}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.text} />}>
            <Text style={S.h1}>💳 رصيدي</Text>
            <View style={S.card}>
                <Text style={S.balance}>{balance} <Text style={{ fontSize: 14, color: C.muted }}>كريدت</Text></Text>
                <Text style={[S.muted, { marginTop: 6 }]}>١ كريدت = ١ ل.س جديدة = ١٠٠ قديمة • الرحلة ٣٥ كريدت</Text>
            </View>

            <View style={S.card}>
                <Text style={[S.text, { fontWeight: "700", marginBottom: 6 }]}>اختر الخط</Text>
                {lines.map((l) => (
                    <TouchableOpacity key={l.id} onPress={() => setLineId(l.id)}
                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2a3850", flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 18 }}>{lineId === l.id ? "🔘" : "⚪"}</Text>
                        <Text style={[S.text, { flex: 1 }]}>{l.name}</Text>
                    </TouchableOpacity>
                ))}

                <Text style={S.label}>المبلغ (كريدت)</Text>
                <TextInput style={S.input} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
                <Btn title="طلب الشحن" onPress={requestRecharge} disabled={!lineId} />

                {instr && (
                    <View style={{ backgroundColor: "#0b1220", borderWidth: 1, borderColor: "#3b4a63", borderStyle: "dashed", borderRadius: 10, padding: 12, marginTop: 10 }}>
                        <Text style={[S.text, { fontWeight: "700" }]}>تعليمات الدفع عبر شام كاش</Text>
                        <Text style={[S.text, { marginTop: 4 }]}>الحساب: {instr.chamcashAccount}</Text>
                        <Text style={S.text}>المبلغ: {instr.amountCredits} ل.س</Text>
                        <Text style={S.text}>الرقم المرجعي: {instr.reference}</Text>
                        <Btn title="١) محاكاة التحويل (شام كاش)" variant="ghost" onPress={simulate} />
                        <Btn title="٢) تحقّق وأضف الرصيد" onPress={verify} />
                        <Text style={[S.muted, { marginTop: 6, fontSize: 12 }]}>في الواقع تتم الخطوة ١ داخل تطبيق شام كاش.</Text>
                    </View>
                )}
                {msg && <Text style={msg.ok ? S.msgOk : S.msgErr}>{msg.text}</Text>}
            </View>

            <View style={S.card}>
                <Text style={[S.text, { fontWeight: "700", marginBottom: 6 }]}>🎫 تذكرتي (QR)</Text>
                <Text style={S.muted}>أنشئ تذكرة واعرض رمز QR للسائق أو مرّره أمام جهاز التدقيق.</Text>
                <Btn title="إنشاء تذكرة QR" onPress={createTicket} disabled={!lineId} />
                {ticket && (
                    <View style={{ alignItems: "center", marginTop: 12 }}>
                        <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12 }}>
                            <QRCode value={ticket.payload} size={190} />
                        </View>
                        <Text style={[S.muted, { marginTop: 8, direction: "ltr" }]}>{ticket.payload}</Text>
                        {ticket.status === "active" && <Text style={{ color: "#f59e0b", fontWeight: "700", marginTop: 6 }}>⏳ بانتظار التدقيق… اعرض الرمز للسائق</Text>}
                        {ticket.status === "used" && <Text style={{ color: C.accent, fontWeight: "700", marginTop: 6 }}>✅ تم التحقق وخُصمت الأجرة</Text>}
                        {ticket.status === "expired" && <Text style={{ color: C.danger, fontWeight: "700", marginTop: 6 }}>⌛ انتهت صلاحية التذكرة</Text>}
                    </View>
                )}
            </View>

            <View style={S.card}>
                <Text style={[S.text, { fontWeight: "700", marginBottom: 6 }]}>ركوب رحلة</Text>
                <Text style={S.muted}>يُخصم سعر الرحلة من الخط المختار أعلاه.</Text>
                <Btn title="تأكيد الرحلة" variant="secondary" onPress={takeTrip} disabled={!lineId} />
            </View>
        </ScrollView>
    );
}
