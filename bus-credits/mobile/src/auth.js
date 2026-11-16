// سياق المصادقة (تسجيل الدخول / المستخدم الحالي).
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, loadToken, saveToken, setToken } from "./api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        (async () => {
            const t = await loadToken();
            if (t) {
                setToken(t);
                try { const { user } = await api("/me"); setUser(user); }
                catch { await saveToken(null); }
            }
            setReady(true);
        })();
    }, []);

    async function login(phone, pin) {
        const { token, user } = await api("/auth/login", { method: "POST", body: { phone, pin } });
        await saveToken(token); setUser(user); return user;
    }
    async function register(phone, pin, name) {
        const { token, user } = await api("/auth/register", { method: "POST", body: { phone, pin, name, role: "client" } });
        await saveToken(token); setUser(user); return user;
    }
    async function logout() { await saveToken(null); setUser(null); }

    return (
        <AuthCtx.Provider value={{ user, ready, login, register, logout }}>
            {children}
        </AuthCtx.Provider>
    );
}
