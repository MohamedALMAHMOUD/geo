// عميل الـ API مع إدارة الجلسة (التوكن).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";

let token = null;
export function setToken(t) { token = t; }
export function getToken() { return token; }

export async function loadToken() {
    token = await AsyncStorage.getItem("bc_token");
    return token;
}
export async function saveToken(t) {
    token = t;
    if (t) await AsyncStorage.setItem("bc_token", t);
    else await AsyncStorage.removeItem("bc_token");
}

export async function api(path, { method = "GET", body } = {}) {
    let res;
    try {
        res = await fetch(API_BASE + "/api" + path, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: "Bearer " + token } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (e) {
        throw new Error("تعذّر الاتصال بالخادم. تحقّق من عنوان الخادم والشبكة.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || "حدث خطأ");
    return data;
}
