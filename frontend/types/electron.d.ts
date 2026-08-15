declare global {
  interface Window {
    Buffer: any;
    module?: { exports: Record<string, unknown> };
    getApiUrl?: (path: string) => Promise<string>;
    API_BASE_URL?: string;
    BASE_URL?: string;
    BACKEND_ORIGIN?: string;
  }
}

export {};
