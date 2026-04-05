import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { ThreeMFData } from "../lib/threemf";
import type { FullSpectrumConfig } from "../lib/config";
import type { PipelineResult, LayerColorData } from "../lib/pipeline";
export type { ThreeMFData };
import { defaultConfig } from "../lib/config";

// ── State shape ─────────────────────────────────────────────────────────────

export interface AppState {
  meshData: ThreeMFData | null;
  rawFileData: ArrayBuffer | null;
  config: FullSpectrumConfig;
  processedHex: string[] | null;
  result: PipelineResult | null;
  layerColorData: LayerColorData | null;
  status: "idle" | "loading" | "processing" | "ready" | "error";
  error: string | null;
  outputBytes: Uint8Array | null;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: "UPLOAD_START" }
  | { type: "UPLOAD_SUCCESS"; meshData: ThreeMFData; rawFileData: ArrayBuffer }
  | { type: "UPLOAD_ERROR"; error: string }
  | { type: "UPDATE_CONFIG"; config: FullSpectrumConfig }
  | { type: "PROCESS_START" }
  | {
      type: "PROCESS_SUCCESS";
      result: PipelineResult;
      outputBytes: Uint8Array;
      layerColorData: LayerColorData;
    }
  | { type: "PROCESS_ERROR"; error: string }
  | { type: "RESET" };

// ── Initial state ───────────────────────────────────────────────────────────

const initialState: AppState = {
  meshData: null,
  rawFileData: null,
  config: defaultConfig(0.1),
  processedHex: null,
  result: null,
  layerColorData: null,
  status: "idle",
  error: null,
  outputBytes: null,
};

// ── Reducer ─────────────────────────────────────────────────────────────────

export { initialState };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "UPLOAD_START":
      return { ...state, status: "loading", error: null };

    case "UPLOAD_SUCCESS":
      return {
        ...state,
        status: "ready",
        meshData: action.meshData,
        rawFileData: action.rawFileData,
        error: null,
        // Clear previous processing results
        processedHex: null,
        result: null,
        layerColorData: null,
        outputBytes: null,
      };

    case "UPLOAD_ERROR":
      return { ...state, status: "error", error: action.error };

    case "UPDATE_CONFIG":
      return { ...state, config: action.config };

    case "PROCESS_START":
      return { ...state, status: "processing", error: null };

    case "PROCESS_SUCCESS":
      return {
        ...state,
        status: "ready",
        result: action.result,
        outputBytes: action.outputBytes,
        layerColorData: action.layerColorData,
        error: null,
      };

    case "PROCESS_ERROR":
      return { ...state, status: "error", error: action.error };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ── Contexts ────────────────────────────────────────────────────────────────

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<AppAction> | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useAppDispatch must be used within AppProvider");
  return ctx;
}
