

export type FetchOptions = RequestInit & {
    signal?: AbortSignal,
    concurrency?: number,
}