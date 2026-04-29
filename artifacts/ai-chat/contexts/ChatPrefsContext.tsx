import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BUILTIN_MODELS,
  DEFAULT_MODEL,
  type ModelOption,
} from "@/lib/openrouter";

const MODEL_KEY = "@ai-chat/model";
const CUSTOM_MODELS_KEY = "@ai-chat/custom-models";
const REASONING_KEY = "@ai-chat/reasoning";
const TOOLS_KEY = "@ai-chat/tools";

type ChatPrefsContextValue = {
  isLoaded: boolean;
  model: string;
  setModel: (id: string) => void;
  reasoning: boolean;
  setReasoning: (v: boolean) => void;
  toolsEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  customModels: ModelOption[];
  allModels: ModelOption[];
  addCustomModel: (id: string, label?: string) => void;
  removeCustomModel: (id: string) => void;
};

const ChatPrefsContext = createContext<ChatPrefsContextValue | undefined>(
  undefined,
);

export function ChatPrefsProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [model, setModelState] = useState<string>(DEFAULT_MODEL);
  const [reasoning, setReasoningState] = useState<boolean>(false);
  const [toolsEnabled, setToolsEnabledState] = useState<boolean>(true);
  const [customModels, setCustomModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [m, r, t, c] = await Promise.all([
          AsyncStorage.getItem(MODEL_KEY),
          AsyncStorage.getItem(REASONING_KEY),
          AsyncStorage.getItem(TOOLS_KEY),
          AsyncStorage.getItem(CUSTOM_MODELS_KEY),
        ]);
        if (m) setModelState(m);
        if (r) setReasoningState(r === "1");
        if (t !== null) setToolsEnabledState(t === "1");
        if (c) {
          const parsed = JSON.parse(c) as ModelOption[];
          if (Array.isArray(parsed)) setCustomModels(parsed);
        }
      } catch {
        // ignore
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const setModel = useCallback((id: string) => {
    setModelState(id);
    AsyncStorage.setItem(MODEL_KEY, id).catch(() => {});
  }, []);

  const setReasoning = useCallback((v: boolean) => {
    setReasoningState(v);
    AsyncStorage.setItem(REASONING_KEY, v ? "1" : "0").catch(() => {});
  }, []);

  const setToolsEnabled = useCallback((v: boolean) => {
    setToolsEnabledState(v);
    AsyncStorage.setItem(TOOLS_KEY, v ? "1" : "0").catch(() => {});
  }, []);

  const persistCustom = useCallback((next: ModelOption[]) => {
    setCustomModels(next);
    AsyncStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const addCustomModel = useCallback(
    (rawId: string, rawLabel?: string) => {
      const id = rawId.trim();
      if (!id) return;
      const isDuplicate =
        BUILTIN_MODELS.some((m) => m.id === id) ||
        customModels.some((m) => m.id === id);
      if (isDuplicate) {
        setModel(id);
        return;
      }
      const label = (rawLabel?.trim() || id.split("/").pop() || id).slice(0, 40);
      const next = [...customModels, { id, label, hint: "Kustom", builtIn: false }];
      persistCustom(next);
      setModel(id);
    },
    [customModels, persistCustom, setModel],
  );

  const removeCustomModel = useCallback(
    (id: string) => {
      const next = customModels.filter((m) => m.id !== id);
      persistCustom(next);
      if (model === id) setModel(DEFAULT_MODEL);
    },
    [customModels, model, persistCustom, setModel],
  );

  const allModels = useMemo(
    () => [...BUILTIN_MODELS, ...customModels],
    [customModels],
  );

  return (
    <ChatPrefsContext.Provider
      value={{
        isLoaded,
        model,
        setModel,
        reasoning,
        setReasoning,
        toolsEnabled,
        setToolsEnabled,
        customModels,
        allModels,
        addCustomModel,
        removeCustomModel,
      }}
    >
      {children}
    </ChatPrefsContext.Provider>
  );
}

export function useChatPrefs() {
  const ctx = useContext(ChatPrefsContext);
  if (!ctx) throw new Error("useChatPrefs must be used within ChatPrefsProvider");
  return ctx;
}
