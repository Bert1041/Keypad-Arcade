export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareRequest {
  /** Message text; must already contain the link — some apps drop a separate url field. */
  text: string;
  /** Optional image. Its absence or rejection never blocks sharing the text. */
  image?: Blob;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Share with the richest method the browser supports, falling back step by step:
 * native sheet with image → native sheet with text → copy to clipboard.
 */
export async function shareRun({ text, image }: ShareRequest): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    const file = image ? new File([image], 'score.png', { type: 'image/png' }) : null;
    const withImage =
      file && navigator.canShare?.({ files: [file] }) ? { text, files: [file] } : null;
    try {
      await navigator.share(withImage ?? { text });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      // Some browsers advertise file sharing and then refuse it; retry with text alone.
      if (withImage) {
        try {
          await navigator.share({ text });
          return 'shared';
        } catch (retryError) {
          if (isAbort(retryError)) return 'cancelled';
        }
      }
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
