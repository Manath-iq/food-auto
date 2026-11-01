import { useCallback, useEffect, useRef, useState } from "react";
import { recipes as initialRecipes } from "./data.ts";
import { emptyState } from "./domain.ts";
import type { AppState, Recipe, TelegramUser, AiProposal } from "./types.ts";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": window.Telegram?.WebApp.initData || "",
      ...options.headers,
    },
    signal: AbortSignal.timeout(path === "/api/ai" ? 65000 : 20000),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    const e = new Error(
      data.error || "Не удалось связаться с сервером.",
    ) as Error & { status: number };
    e.status = response.status;
    throw e;
  }
  return data as T;
}
const cacheRead = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
export function useKitchen() {
  const [state, setState] = useState<AppState>(emptyState);
  const [catalog, setCatalog] = useState<Recipe[]>(initialRecipes);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<
    "loading" | "local" | "saved" | "saving" | "error" | "conflict"
  >("loading");
  const [error, setError] = useState("");
  const [botUsername, setBotUsername] = useState("food_autotest_bot");
  const [retry, setRetry] = useState(0);
  const revision = useRef(0),
    key = useRef("kitchen-demo"),
    latest = useRef(state),
    dirty = useRef(false),
    blocked = useRef(false),
    chain = useRef(Promise.resolve());
  latest.current = state;
  useEffect(() => {
    let cancelled = false;
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    if (tg?.initData && tg.isVersionAtLeast?.("8.0") && !tg.isFullscreen) {
      try {
        tg.requestFullscreen?.();
      } catch {
        // Older or unsupported Telegram clients keep the expanded view.
        tg.expand();
      }
    }
    api<{ recipes: Recipe[]; botUsername: string }>("/api/catalog")
      .then((d) => {
        if (!cancelled) {
          if (d.recipes.length) setCatalog(d.recipes);
          if (d.botUsername) setBotUsername(d.botUsername);
        }
      })
      .catch(() => {});
    if (!tg?.initData) {
      const local = cacheRead(key.current);
      if (local?.state) setState(local.state);
      setStatus("local");
      setReady(true);
      return;
    }
    api<{ state: AppState; revision: number; user: TelegramUser }>("/api/state")
      .then((d) => {
        if (cancelled) return;
        setUser(d.user);
        key.current = `kitchen-user-${d.user.id}`;
        revision.current = d.revision;
        const local = cacheRead(key.current);
        if (local?.dirty) {
          setState(local.state);
          dirty.current = true;
          if (local.revision !== d.revision) {
            blocked.current = true;
            setStatus("conflict");
            setError(
              "Есть изменения на другом устройстве. Скачайте копию своих изменений и загрузите серверную версию.",
            );
          } else setStatus("saving");
        } else {
          setState(d.state);
          setStatus("saved");
        }
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setStatus("error");
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const update = useCallback((fn: (current: AppState) => AppState) => {
    dirty.current = true;
    setState((current) => fn(current));
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred("light");
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        key.current,
        JSON.stringify({
          state,
          revision: revision.current,
          dirty: dirty.current,
        }),
      );
    } catch {
      setError(
        "Память устройства заполнена. Не закрывайте приложение до сохранения на сервере.",
      );
    }
    if (!user || !dirty.current || blocked.current) return;
    setStatus("saving");
    const timer = setTimeout(() => {
      chain.current = chain.current.then(async () => {
        if (blocked.current) return;
        try {
          const d = await api<{ revision: number }>("/api/state", {
            method: "PUT",
            body: JSON.stringify({ state, revision: revision.current }),
          });
          revision.current = d.revision;
          if (latest.current === state) {
            dirty.current = false;
            setStatus("saved");
            setError("");
          }
          try {
            localStorage.setItem(
              key.current,
              JSON.stringify({
                state: latest.current,
                revision: revision.current,
                dirty: dirty.current,
              }),
            );
          } catch {}
        } catch (e) {
          const err = e as Error & { status?: number };
          setError(err.message);
          if (err.status === 409) {
            blocked.current = true;
            setStatus("conflict");
          } else setStatus("error");
        }
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [state, ready, user, retry]);
  useEffect(() => {
    const refresh = () => {
      if (!user || dirty.current || document.visibilityState === "hidden")
        return;
      api<{ state: AppState; revision: number }>("/api/state")
        .then((d) => {
          if (!dirty.current && d.revision > revision.current) {
            revision.current = d.revision;
            setState(d.state);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [user]);
  return {
    state,
    update,
    catalog,
    user,
    ready,
    status,
    error,
    botUsername,
    retry: () => setRetry((n) => n + 1),
    ask: (prompt: string) =>
      api<AiProposal>("/api/ai", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    reload: async () => {
      await chain.current;
      const d = await api<{ state: AppState; revision: number }>("/api/state");
      revision.current = d.revision;
      blocked.current = false;
      dirty.current = false;
      setError("");
      setStatus("saved");
      setState(d.state);
    },
  };
}
