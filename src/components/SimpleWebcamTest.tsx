"use client";

import { useState, useRef, useCallback } from "react";

export default function SimpleWebcamTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>("Ready to test");
  const [isLoading, setIsLoading] = useState(false);

  const testWebcam = useCallback(async () => {
    console.log("SimpleWebcamTest: Button clicked!");
    setIsLoading(true);
    setStatus("Requesting camera access...");

    try {
      console.log("SimpleWebcamTest: Requesting getUserMedia");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      
      console.log("SimpleWebcamTest: Got stream", stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStatus("Camera active!");
      } else {
        setStatus("Video element not found");
      }
    } catch (error) {
      console.error("SimpleWebcamTest: Error", error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="p-4 bg-slate-800 rounded-lg">
      <h3 className="text-white font-bold mb-4">Simple Webcam Test</h3>
      <div className="mb-4">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-40 bg-black rounded"
        />
      </div>
      <div className="text-white mb-4">Status: {status}</div>
      <button
        onClick={testWebcam}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Testing..." : "Test Webcam"}
      </button>
    </div>
  );
}