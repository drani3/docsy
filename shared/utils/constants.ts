export const FREE_LIMITS = {
  QUESTIONS_PER_MONTH: 100,
  DOCUMENTS: 5,
  MAX_FILE_SIZE_MB: 10,
} as const

export const PRO_LIMITS = {
  QUESTIONS_PER_MONTH: 1000,
  DOCUMENTS: 100,
  MAX_FILE_SIZE_MB: 50,
} as const

export const CHUNK_SIZE = 1000
export const CHUNK_OVERLAP = 200
export const TOP_K_RESULTS = 5
