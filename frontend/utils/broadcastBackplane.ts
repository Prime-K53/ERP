type BroadcastEvent = {
  type: string;
  payload?: unknown;
  source: string;
  timestamp: string;
};

const CHANNEL_NAME = 'primeerp:cross-tab';
let channel: BroadcastChannel | null = null;

const getChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
};

export const broadcastBackplane = {
  emit(eventType: string, payload?: unknown): void {
    const ch = getChannel();
    if (!ch) return;
    ch.postMessage({
      type: eventType,
      payload,
      source: `tab-${Date.now()}`,
      timestamp: new Date().toISOString(),
    } as BroadcastEvent);
  },

  on(eventType: string, handler: (payload: unknown) => void): () => void {
    const ch = getChannel();
    if (!ch) return () => {};
    const listener = (event: MessageEvent<BroadcastEvent>) => {
      if (event.data?.type === eventType) {
        handler(event.data.payload);
      }
    };
    ch.addEventListener('message', listener);
    return () => ch.removeEventListener('message', listener);
  },

  supabaseChannel(topic: string) {
    return { topic, isSupabaseRealtime: true };
  },
};
