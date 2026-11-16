// مكوّنات واجهة صغيرة مشتركة.
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { C, S } from "./theme";

export function Btn({ title, onPress, variant, disabled, style }) {
    const vStyle = variant === "secondary" ? S.btnSecondary : variant === "ghost" ? S.btnGhost : variant === "danger" ? S.btnDanger : null;
    const tStyle = variant === "secondary" ? S.btnSecondaryText : variant === "ghost" ? S.btnGhostText : variant === "danger" ? { color: "#fff" } : null;
    return (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={disabled}
            style={[S.btn, vStyle, disabled && { opacity: 0.5 }, style]}>
            <Text style={[S.btnText, tStyle]}>{title}</Text>
        </TouchableOpacity>
    );
}

// وسم الاتجاه ذهاب/إياب
export function DirTag({ direction }) {
    const back = direction === "إياب";
    return (
        <Text style={[S.tag, { backgroundColor: back ? C.back : C.go, color: back ? C.backText : C.goText }]}>
            {direction}
        </Text>
    );
}

export function Pill({ text, bg, color }) {
    return <Text style={[S.tag, { backgroundColor: bg, color }]}>{text}</Text>;
}

export function Divider() {
    return <View style={{ height: 1, backgroundColor: "#2a3850", marginVertical: 12 }} />;
}
