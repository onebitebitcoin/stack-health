import { create } from 'zustand'

interface UiState {
  commentOpen: boolean
  setCommentOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  commentOpen: false,
  setCommentOpen: (open) => set({ commentOpen: open }),
}))
