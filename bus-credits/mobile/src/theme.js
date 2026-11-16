// ألوان وأنماط مشتركة (ثيم داكن).
import { StyleSheet } from "react-native";

export const C = {
    bg: "#0f172a",
    card: "#1e293b",
    card2: "#334155",
    text: "#e2e8f0",
    muted: "#94a3b8",
    accent: "#22c55e",
    accent2: "#3b82f6",
    danger: "#ef4444",
    border: "#243049",
    go: "#0c4a6e",
    goText: "#bae6fd",
    back: "#4c1d95",
    backText: "#ddd6fe"
};

export const S = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16 },
    h1: { color: C.text, fontSize: 22, fontWeight: "800", marginBottom: 12, textAlign: "right", writingDirection: "rtl" },
    card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
    label: { color: C.muted, fontSize: 13, marginBottom: 6, marginTop: 10, textAlign: "right", writingDirection: "rtl" },
    input: {
        backgroundColor: "#0b1220", color: C.text, borderRadius: 10, borderWidth: 1, borderColor: "#3b4a63",
        paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, textAlign: "right", writingDirection: "rtl"
    },
    btn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 12 },
    btnText: { color: "#04210f", fontWeight: "700", fontSize: 16 },
    btnSecondary: { backgroundColor: C.accent2 },
    btnSecondaryText: { color: "#061634" },
    btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3b4a63" },
    btnGhostText: { color: C.text },
    btnDanger: { backgroundColor: C.danger },
    muted: { color: C.muted, textAlign: "right", writingDirection: "rtl" },
    text: { color: C.text, textAlign: "right", writingDirection: "rtl" },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, fontWeight: "700", overflow: "hidden" },
    balance: { fontSize: 40, fontWeight: "900", color: C.accent, textAlign: "right" },
    msgOk: { backgroundColor: "#064e3b", color: "#a7f3d0", padding: 10, borderRadius: 10, marginTop: 10, textAlign: "right", writingDirection: "rtl" },
    msgErr: { backgroundColor: "#7f1d1d", color: "#fecaca", padding: 10, borderRadius: 10, marginTop: 10, textAlign: "right", writingDirection: "rtl" }
});
