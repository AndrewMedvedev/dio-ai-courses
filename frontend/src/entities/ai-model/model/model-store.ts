import { create } from "zustand";
import type { ApiError, ValidationErrors } from "@/shared/api";
import { getErrorMessage } from "@/shared/lib/errors";
import {
  createModel as createModelApi,
  deleteModel as deleteModelApi,
  fetchModelsPage,
} from "../api/ai-model-api";
import type { AiModel, AiModelPayload, AiModelsPage } from "./types";

interface ModelForm {
  name: string;
  description: string;
  context: string;
}

interface ModelData {
  items: AiModel[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  isLoading: boolean;
  isCreating: boolean;
  deletingUid: string | null;
  error: string;
  notice: string;
  validationErrors: ValidationErrors;
  selectedModel: AiModel | null;
  createForm: ModelForm;
}

interface ModelState extends ModelData {
  setPage: (page: number) => void;
  setSelectedModel: (selectedModel: AiModel | null) => void;
  setNotice: (notice: string) => void;
  clearMessages: () => void;
  updateCreateField: (field: keyof ModelForm, value: string) => void;
  resetCreateForm: () => void;
  fetchModels: (page?: number, size?: number) => Promise<AiModelsPage>;
  createModel: (payload: AiModelPayload) => Promise<AiModel | null>;
  deleteModel: (uid: string) => Promise<boolean | null>;
  reset: () => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  getErrorMessage(error, fallback) ?? fallback;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

const initialState: ModelData = {
  items: [],
  page: DEFAULT_PAGE,
  size: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  isLoading: false,
  isCreating: false,
  deletingUid: null,
  error: "",
  notice: "",
  validationErrors: {},
  selectedModel: null,
  createForm: {
    name: "",
    description: "",
    context: "",
  },
};

export const useModelStore = create<ModelState>((set, get) => ({
  ...initialState,

  setPage: (page) => set({ page }),

  setSelectedModel: (selectedModel) => set({ selectedModel }),

  setNotice: (notice) => set({ notice }),

  clearMessages: () => set({ error: "", notice: "" }),

  updateCreateField: (field, value) =>
    set((state) => ({
      createForm: { ...state.createForm, [field]: value },
      validationErrors: { ...state.validationErrors, [field]: "", form: "" },
    })),

  resetCreateForm: () =>
    set({
      createForm: initialState.createForm,
      validationErrors: {},
    }),

  fetchModels: async (page = get().page, size = get().size) => {
    set({ isLoading: true, error: "" });

    try {
      const response = await fetchModelsPage({ page, size });
      set({
        items: response.items || [],
        page: response.page || page,
        size: response.size || size,
        total: response.total_items ?? response.total ?? 0,
        totalPages: response.total_pages || 1,
        isLoading: false,
        error: "",
      });
      return response;
    } catch (error) {
      set({
        items: [],
        total: 0,
        totalPages: 1,
        isLoading: false,
        error: errorMessage(error, "Не удалось загрузить AI-модели."),
      });
      throw error;
    }
  },

  createModel: async (payload) => {
    const name = payload?.name?.trim();

    if (!name) {
      set({ validationErrors: { name: "Укажите название модели." } });
      return null;
    }

    set({ isCreating: true, error: "", notice: "", validationErrors: {} });

    try {
      const model = await createModelApi({ ...payload, name });
      set({
        createForm: initialState.createForm,
        isCreating: false,
        notice: "AI-модель создана.",
        validationErrors: {},
      });
      await get().fetchModels(1, get().size);
      return model;
    } catch (error) {
      set({
        isCreating: false,
        validationErrors: (error as ApiError | null)?.validationErrors || {},
        error: errorMessage(error, "Не удалось создать AI-модель."),
      });
      throw error;
    }
  },

  deleteModel: async (uid) => {
    if (!uid || get().deletingUid) return null;

    set({ deletingUid: uid, error: "", notice: "" });

    try {
      await deleteModelApi(uid);
      set({
        items: get().items.filter((item) => item.uid !== uid),
        deletingUid: null,
        selectedModel: null,
        notice: "AI-модель удалена.",
      });
      await get().fetchModels(get().page, get().size);
      return true;
    } catch (error) {
      if ((error as ApiError | null)?.status === 404) {
        set({
          items: get().items.filter((item) => item.uid !== uid),
          deletingUid: null,
          selectedModel: null,
          notice: "AI-модель уже была удалена.",
        });
        return true;
      }

      set({
        deletingUid: null,
        error: errorMessage(error, "Не удалось удалить AI-модель."),
      });
      throw error;
    }
  },

  reset: () => set(initialState),
}));
