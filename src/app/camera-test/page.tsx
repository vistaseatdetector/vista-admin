"use client";

import { useState, useEffect, useCallback } from "react";
import CameraManager from "@/lib/camera-manager";
import OptimizedCamera from "@/components/OptimizedCamera";

export default function CameraDiagnosticPage() {
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [activeStreams, setActiveStreams] = useState<string[]>([]);
  const [showTest, setShowTest] = useState(false);
  const cameraManager = CameraManager.getInstance();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDiagnostics(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const checkCameraPermissions = async () => {
    try {
      addLog("🔍 Checking camera permissions...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      addLog("✅ Camera permission granted");
      stream.getTracks().forEach(track => track.stop());
      addLog("🛑 Test stream stopped");
    } catch (error) {
      addLog(`❌ Camera permission error: ${error}`);
    }
  };

  const listDevices = async () => {
    try {
      addLog("📱 Enumerating media devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      addLog(`📹 Found ${videoDevices.length} video devices:`);
      videoDevices.forEach((device, index) => {
        addLog(`  ${index}: ${device.label || 'Unknown device'} (${device.deviceId})`);
      });
    } catch (error) {
      addLog(`❌ Device enumeration error: ${error}`);
    }
  };

  const checkManagerStatus = useCallback(() => {
    const streamCount = cameraManager.getActiveStreamCount();
    const streams = cameraManager.listActiveStreams();
    addLog(`📊 Camera Manager Status:`);
    addLog(`  - Active streams: ${streamCount}`);
    streams.forEach(stream => {
      addLog(`  - ${stream}`);
    });
    setActiveStreams(streams);
  }, [cameraManager]);

  const releaseAllStreams = () => {
    addLog("🔄 Releasing all streams...");
    cameraManager.releaseAllStreams();
    checkManagerStatus();
  };

  const clearLogs = () => {
    setDiagnostics([]);
  };

  useEffect(() => {
    addLog("🚀 Camera Diagnostic Tool Loaded");
    checkManagerStatus();
  }, [checkManagerStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Camera Diagnostic Tool</h1>
          <p className="text-white/70">Debug camera glitchiness and stream conflicts</p>
        </div>

        {/* Control Panel */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Diagnostic Controls</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={checkCameraPermissions}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 rounded-lg transition-colors"
            >
              Check Permissions
            </button>
            <button
              onClick={listDevices}
              className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-200 rounded-lg transition-colors"
            >
              List Devices
            </button>
            <button
              onClick={checkManagerStatus}
              className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-200 rounded-lg transition-colors"
            >
              Manager Status
            </button>
            <button
              onClick={releaseAllStreams}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 rounded-lg transition-colors"
            >
              Release All
            </button>
          </div>
          
          <div className="mt-4 flex gap-4">
            <button
              onClick={() => setShowTest(!showTest)}
              className="px-6 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-200 rounded-lg transition-colors"
            >
              {showTest ? 'Hide' : 'Show'} Camera Test
            </button>
            <button
              onClick={clearLogs}
              className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 text-gray-200 rounded-lg transition-colors"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Camera Test */}
        {showTest && (
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Camera Test</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-3">Webcam 1 (webcam:0)</h3>
                <OptimizedCamera
                  cameraSource="webcam:0"
                  isLarge={false}
                  onError={(error) => addLog(`❌ Webcam 1 error: ${error.message}`)}
                  onStatusChange={(active) => addLog(`📹 Webcam 1 ${active ? 'started' : 'stopped'}`)}
                />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-3">Webcam 2 (webcam:1)</h3>
                <OptimizedCamera
                  cameraSource="webcam:1"
                  isLarge={false}
                  onError={(error) => addLog(`❌ Webcam 2 error: ${error.message}`)}
                  onStatusChange={(active) => addLog(`📹 Webcam 2 ${active ? 'started' : 'stopped'}`)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Active Streams Display */}
        {activeStreams.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Active Streams</h2>
            <div className="space-y-2">
              {activeStreams.map((stream, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-white">{stream}</span>
                  <button
                    onClick={() => {
                      cameraManager.releaseStream(stream);
                      checkManagerStatus();
                      addLog(`🛑 Released stream: ${stream}`);
                    }}
                    className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 rounded text-sm transition-colors"
                  >
                    Release
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diagnostic Log */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Diagnostic Log</h2>
          <div className="bg-black/30 rounded-lg p-4 max-h-96 overflow-y-auto">
            {diagnostics.length === 0 ? (
              <p className="text-white/50">No logs yet. Run some diagnostics to see output.</p>
            ) : (
              <div className="space-y-1 font-mono text-sm">
                {diagnostics.map((log, index) => (
                  <div key={index} className="text-white/90">{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center">
          <a
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-lg transition-colors"
          >
            ← Back to App
          </a>
        </div>
      </div>
    </div>
  );
}