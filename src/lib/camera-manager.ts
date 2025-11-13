"use client";

/**
 * Camera Manager - Singleton to prevent multiple camera access conflicts
 */
class CameraManager {
  private static instance: CameraManager;
  private activeStreams: Map<string, MediaStream> = new Map();
  private pendingRequests: Map<string, Promise<MediaStream>> = new Map();

  static getInstance(): CameraManager {
    if (!CameraManager.instance) {
      CameraManager.instance = new CameraManager();
    }
    return CameraManager.instance;
  }

  async getStream(cameraSource: string): Promise<MediaStream> {
    // If we already have this stream, return it
    const existingStream = this.activeStreams.get(cameraSource);
    if (existingStream && existingStream.active) {
      console.log('📹 CAMERA-MANAGER: Reusing existing stream for', cameraSource);
      return existingStream;
    }

    // If there's a pending request for this source, return that promise
    const pendingRequest = this.pendingRequests.get(cameraSource);
    if (pendingRequest) {
      console.log('⏳ CAMERA-MANAGER: Waiting for pending request for', cameraSource);
      return pendingRequest;
    }

    // Create new stream
    const streamPromise = this.createNewStream(cameraSource);
    this.pendingRequests.set(cameraSource, streamPromise);

    try {
      const stream = await streamPromise;
      this.activeStreams.set(cameraSource, stream);
      this.pendingRequests.delete(cameraSource);
      
      // Clean up when stream ends
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log('📹 CAMERA-MANAGER: Stream ended for', cameraSource);
          this.activeStreams.delete(cameraSource);
        });
      });

      return stream;
    } catch (error) {
      this.pendingRequests.delete(cameraSource);
      throw error;
    }
  }

  private async createNewStream(cameraSource: string): Promise<MediaStream> {
    console.log('📹 CAMERA-MANAGER: Creating new stream for', cameraSource);

    let constraints: MediaStreamConstraints;

    if (cameraSource?.startsWith('webcam:')) {
      const deviceId = cameraSource.split(':')[1] || '0';
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      constraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        }
      };
      
      if (deviceId !== '0' && videoDevices[parseInt(deviceId)]) {
        (constraints.video as MediaTrackConstraints).deviceId = { 
          exact: videoDevices[parseInt(deviceId)].deviceId 
        };
      }
    } else {
      // Default webcam constraints
      constraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        }
      };
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('✅ CAMERA-MANAGER: Stream created successfully for', cameraSource);
    return stream;
  }

  releaseStream(cameraSource: string): void {
    const stream = this.activeStreams.get(cameraSource);
    if (stream) {
      console.log('🛑 CAMERA-MANAGER: Releasing stream for', cameraSource);
      stream.getTracks().forEach(track => track.stop());
      this.activeStreams.delete(cameraSource);
    }
  }

  releaseAllStreams(): void {
    console.log('🛑 CAMERA-MANAGER: Releasing all streams');
    this.activeStreams.forEach((stream) => {
      stream.getTracks().forEach(track => track.stop());
    });
    this.activeStreams.clear();
    this.pendingRequests.clear();
  }

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  listActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }
}

export default CameraManager;