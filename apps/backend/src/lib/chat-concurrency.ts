/**
 * Per-instance semaphore for chat requests.
 * Caps concurrent in-flight chat tool-loop calls per backend instance.
 *
 * @derives(master-plan §G)
 */

const MAX_CONCURRENT = parseInt(process.env.CHAT_MAX_CONCURRENT ?? '50', 10);
let inFlight = 0;

export function tryAcquireChatSlot(): boolean {
  if (inFlight >= MAX_CONCURRENT) return false;
  inFlight++;
  return true;
}

export function releaseChatSlot(): void {
  if (inFlight > 0) inFlight--;
}

export function getChatInFlight(): number {
  return inFlight;
}
