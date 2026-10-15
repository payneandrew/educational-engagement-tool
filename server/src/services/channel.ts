/** A channel = one document as seen by one group. Every sequence number and every SSE stream is per-channel. */
export const channelKey = (documentId: string, groupId: string) => `${documentId}:${groupId}`
