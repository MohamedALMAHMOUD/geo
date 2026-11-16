import React, { useState } from "react";
import { Text, TextInput, View, ScrollView } from "react-native";
import { S } from "../theme";
import { Btn } from "../components";
import { useAuth } from "../auth";

export default function LoginScreen() {
    const { login, register } = useAuth();
    const [mode, setMode] = useState("login");
    const [phone, setPhone] = useState("");
    const [pin, setPin] = useState("");
    const [name, setName] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit() {
        setErr(""); setBusy(true);
        try {
            if (mode === "login") await login(phone.trim(), pin.trim());
            else await register(phone.trim(), pin.trim(), name.trim());
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    return (
        <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 60 }]}>
            <Text style={[S.h1, { textAlign: "center", fontSize: 30 }]}>🚌 رصيد الباص</Text>
            <View style={S.card}>
                <Text style={[S.text, { fontWeight: "700", fontSize: 16, marginBottom: 6 }]}>
                    {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب (زبون)"}
                </Text>
                <Text style={S.label}>رقم الهاتف</Text>
                <TextInput style={S.input} value={phone} onChangeText={setPhone}
                    keyboardType="phone-pad" placeholder="09xxxxxxxx" placeholderTextColor="#64748b" />
                <Text style={S.label}>الرمز السري</Text>
                <TextInput style={S.input} value={pin} onChangeText={setPin}
                    secureTextEntry keyboardType="number-pad" placeholder="••••" placeholderTextColor="#64748b" />
                {mode === "register" && (
                    <>
                        <Text style={S.label}>الاسم</Text>
                        <TextInput style={S.input} value={name} onChangeText={setName}
                            placeholder="اسمك" placeholderTextColor="#64748b" />
                    </>
                )}
                {!!err && <Text style={S.msgErr}>{err}</Text>}
                <Btn title={busy ? "..." : (mode === "login" ? "دخول" : "إنشاء الحساب")} onPress={submit} disabled={busy} />
                <Btn title={mode === "login" ? "ليس لديك حساب؟ أنشئ حسابًا" : "لديك حساب؟ سجّل الدخول"}
                    variant="ghost" onPress={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }} />
            </View>
            <Text style={[S.muted, { textAlign: "center" }]}>تجربة: 0940000002 / 1234</Text>
        </ScrollView>
    );
}
