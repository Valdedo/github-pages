import { create } from 'zustand';
import type { Document, Article, AppSettings } from '../types';

interface AppState {
  currentDocument: Document | null;
  articles: Article[];
  settings: AppSettings | null;
  isProcessing: boolean;
  uploadProgress: number;

  setCurrentDocument: (doc: Document | null) => void;
  setArticles: (articles: Article[]) => void;
  updateArticle: (id: number, data: Partial<Article>) => void;
  setSettings: (settings: AppSettings) => void;
  setProcessing: (v: boolean) => void;
  setUploadProgress: (v: number) => void;
}

export const useStore = create<AppState>((set) => ({
  currentDocument: null,
  articles: [],
  settings: null,
  isProcessing: false,
  uploadProgress: 0,

  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  setArticles: (articles) => set({ articles }),
  updateArticle: (id, data) =>
    set((state) => ({
      articles: state.articles.map((a) => (a.id === id ? { ...a, ...data } : a)),
    })),
  setSettings: (settings) => set({ settings }),
  setProcessing: (v) => set({ isProcessing: v }),
  setUploadProgress: (v) => set({ uploadProgress: v }),
}));
