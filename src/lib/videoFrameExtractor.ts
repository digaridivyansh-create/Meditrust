export interface SampledVideoFrame {
  timestamp: string;
  seconds: number;
  base64: string;
  mimeType: 'image/jpeg';
  previewDataUrl: string;
}

export interface VideoExtractionResult {
  durationSec: number;
  frames: SampledVideoFrame[];
}

function formatTimestamp(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Extracts evenly spaced key frames from a short medicine pack or unboxing video in the browser.
 * Strictly caps frame count & resolution so uploads stay fast and bounded.
 */
export async function extractVideoKeyFrames(
  file: File,
  maxFrames = 5
): Promise<VideoExtractionResult> {
  if (!file.type.startsWith('video/')) {
    throw new Error('Unsupported video format. Please upload MP4, WebM, or MOV.');
  }
  if (file.size > 35 * 1024 * 1024) {
    throw new Error('Video exceeds 35 MB limit. Please upload a shorter clip (under 60 seconds).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Could not decode this video file in your browser. Try MP4 (H.264) or WebM.'));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const count = Math.min(maxFrames, Math.max(2, Math.ceil(duration / 3)));
    const targetTimes: number[] = [];
    for (let i = 0; i < count; i++) {
      const ratio = count === 1 ? 0 : i / (count - 1);
      const t = Math.min(Math.max(0.05, ratio * Math.max(0.1, duration - 0.1)), Math.max(0.05, duration - 0.05));
      targetTimes.push(Number(t.toFixed(2)));
    }

    const canvas = document.createElement('canvas');
    const maxDim = 960;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    canvas.width = Math.max(160, Math.round(vw * scale));
    canvas.height = Math.max(120, Math.round(vh * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas unavailable for video frame sampling.');
    }

    const frames: SampledVideoFrame[] = [];
    for (const sec of targetTimes) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = sec;
      });

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const previewDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = previewDataUrl.split(',')[1] || '';
      if (base64) {
        frames.push({
          timestamp: formatTimestamp(sec),
          seconds: sec,
          base64,
          mimeType: 'image/jpeg',
          previewDataUrl,
        });
      }
    }

    if (frames.length === 0) {
      throw new Error('No video frames could be sampled from this clip.');
    }

    return {
      durationSec: Number(duration.toFixed(1)),
      frames,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
