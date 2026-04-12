/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { ThreeMFData } from "../lib/threemf";
import type { Dither3DConfig } from "../lib/config";
import type { PipelineResult, LayerColorData } from "../lib/pipeline";
export type { ThreeMFData };
import { defaultConfig } from "../lib/config";
import { FILAMENT_COLORS } from "../constants";

// ── State shape ─────────────────────────────────────────────────────────────

export interface AppState {
  meshData: ThreeMFData | null;
  rawFileData: ArrayBuffer | null;
  config: Dither3DConfig;
  processedHex: string[] | null;
  result: PipelineResult | null;
  layerColorData: LayerColorData | null;
  status: "idle" | "loading" | "processing" | "ready" | "error";
  error: string | null;
  outputBytes: Uint8Array | null;
  inputFilename: string | null;
  filamentColors: string[];
  progress: { stage: string; done: number; total: number } | null;
  previewMode: 'input' | 'output';
  autoApply: boolean;
  manualApplyCount: number;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: "UPLOAD_START" }
  | { type: "UPLOAD_SUCCESS"; meshData: ThreeMFData; rawFileData: ArrayBuffer }
  | { type: "UPLOAD_ERROR"; error: string }
  | { type: "UPDATE_CONFIG"; config: Dither3DConfig }
  | { type: "PROCESS_START" }
  | {
      type: "PROCESS_SUCCESS";
      result: PipelineResult;
      outputBytes: Uint8Array;
      layerColorData: LayerColorData;
    }
  | { type: "PROCESS_ERROR"; error: string }
  | { type: "RESET" }
  | { type: "SET_INPUT_FILENAME"; filename: string }
  | { type: "SET_FILAMENT_COLORS"; colors: string[] }
  | { type: "SET_PROGRESS"; progress: { stage: string; done: number; total: number } | null }
  | { type: "SET_PREVIEW_MODE"; mode: "input" | "output" }
  | { type: "TOGGLE_AUTO_APPLY" }
  | { type: "MANUAL_APPLY" };

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
  inputFilename: null,
  filamentColors: [...FILAMENT_COLORS],
  progress: null,
  previewMode: 'output',
  autoApply: true,
  manualApplyCount: 0,
};

// ── Reducer ─────────────────────────────────────────────────────────────────

export { initialState };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "UPLOAD_START":
      return { ...state, status: "loading", error: null, previewMode: 'input' as const };

    case "UPLOAD_SUCCESS": {
      const uploadedLH = action.meshData.layerHeight;
      const newConfig = uploadedLH !== undefined && uploadedLH >= 0.04 && uploadedLH <= 0.2
        ? { ...state.config, layerHeightMm: uploadedLH }
        : state.config;
      return {
        ...state,
        status: "ready",
        meshData: action.meshData,
        rawFileData: action.rawFileData,
        config: newConfig,
        error: null,
        // Clear previous processing results
        processedHex: null,
        result: null,
        layerColorData: null,
        outputBytes: null,
        inputFilename: null,
        previewMode: 'input' as const,
      };
    }

    case "UPLOAD_ERROR":
      return { ...state, status: "error", error: action.error };

    case "UPDATE_CONFIG":
      return { ...state, config: action.config };

    case "PROCESS_START":
      return { ...state, status: "processing", error: null, progress: { stage: "Initializing", done: 0, total: 0 } };

    case "PROCESS_SUCCESS":
      return {
        ...state,
        status: "ready",
        result: action.result,
        outputBytes: action.outputBytes,
        layerColorData: action.layerColorData,
        error: null,
        progress: null,
        previewMode: 'output' as const,
      };

    case "PROCESS_ERROR":
      return { ...state, status: "error", error: action.error, progress: null };

    case "RESET":
      return initialState;

    case "SET_INPUT_FILENAME":
      return { ...state, inputFilename: action.filename };

    case "SET_FILAMENT_COLORS":
      return { ...state, filamentColors: action.colors };

    case "SET_PROGRESS":
      return { ...state, progress: action.progress };

    case "SET_PREVIEW_MODE":
      return { ...state, previewMode: action.mode };

    case "TOGGLE_AUTO_APPLY":
      return { ...state, autoApply: !state.autoApply };

    case "MANUAL_APPLY":
      return { ...state, manualApplyCount: state.manualApplyCount + 1 };

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
