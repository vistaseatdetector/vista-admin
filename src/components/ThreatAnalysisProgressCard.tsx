"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useDetectionContext } from "@/contexts/DetectionContext";

interface Props {
  cameraSource: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

type Stage =
  | "idle"
  | "detected"
  | "captured"
  | "sent"
  | "analyzing"
  | "false_positive"
  | "threat_confirmed"
  | "error";

export default function ThreatAnalysisProgressCard({ cameraSource, videoRef }: Props) {
  const detectionContext = useDetectionContext();
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string>("No suspicious activity detected");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [visionLabel, setVisionLabel] = useState<string | null>(null);
  const [visionConf, setVisionConf] = useState<number | null>(null);
  const busyRef = useRef(false);
  const lastRunAtRef = useRef<number>(0);
  // Keep progress from regressing until a reason is filled
  const [progressFloor, setProgressFloor] = useState<number>(0);
  const reasonRef = useRef<string | null>(null);
  useEffect(() => { reasonRef.current = reason; }, [reason]);

  // Map stage → progress percent
  const progressBase = useMemo(() => {
    // Keep a visual buffer so the bar never looks "complete" until we have a final result.
    switch (stage) {
      case "idle":
        return 0;
      case "detected":
        return 25;
      case "captured":
        return 45;
      case "sent":
        return 65;
      case "analyzing":
        return 90; // stop short of full until result arrives
      case "false_positive":
      case "threat_confirmed":
        // Only mark complete once we have the ChatGPT summary
        return reason ? 100 : 90;
      case "error":
        return 100; // treat error as terminal
      default:
        return 0;
    }
  }, [stage, reason]);
  const progress = useMemo(() => {
    // Do not allow the progress bar to regress until we have a reason
    if (!reason) return Math.max(progressBase, progressFloor);
    return progressBase;
  }, [progressBase, progressFloor, reason]);

  // Raise the floor as we advance stages (until reason is available)
  useEffect(() => {
    if (!reason) {
      setProgressFloor((prev) => Math.max(prev, progressBase));
    }
  }, [progressBase, reason]);

  const captureScreenshot = useCallback((): string | null => {
    const v = videoRef?.current;
    if (!v || v.videoWidth === 0 || v.videoHeight === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!dataUrl || dataUrl === "data:,") return null;
    return dataUrl;
  }, [videoRef]);

  const runAnalysisPipeline = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // 1) Screenshot capture
      setStage("detected");
      setMessage("Result: Pending…");
      const img = captureScreenshot();
      if (!img) {
        setStage("error");
        setMessage("Failed to capture screenshot from video stream");
        return;
      }
      setStage("captured");
      setMessage("Result: Pending…");

      // 2) Send to detection API (single detect) – server will run LLM if needed
      setStage("sent");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      // Include same threshold settings used elsewhere so the server re-detects consistently
      let extra: any = {};
      let peopleConf = 0.25;
      try {
        const raw = localStorage.getItem('threatSettings');
        if (raw) {
          const s = JSON.parse(raw);
          if (typeof s.people_conf === 'number') peopleConf = s.people_conf;
          if (typeof s.suspicious_conf === 'number') extra.suspicious_conf = s.suspicious_conf;
          if (typeof s.threat_conf === 'number') extra.threat_conf = s.threat_conf;
          if (typeof s.suspicious_iou === 'number') extra.suspicious_iou = s.suspicious_iou;
          if (typeof s.threat_iou === 'number') extra.threat_iou = s.threat_iou;
          // Ensure the analysis call runs the LLM exactly once for the track
          extra.llm_enabled = true;
        }
        // Provide a stable stream id for ByteTrack association on the backend
        extra.stream_id = cameraSource || 'webcam:0';
      } catch {}

      const res = await fetch("/api/detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect", image_data: img, confidence: peopleConf, ...extra }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Detection API error: ${res.status} ${text}`);
      }

      // 3) Waiting for OpenAI analysis
      setStage("analyzing");
      setMessage("Result: Pending…");
      const result = await res.json();
      // Propagate raw result first so overlays update immediately
      try {
        detectionContext.updateDetectionResults(cameraSource, { ...result, timestamp: Date.now() });
      } catch {}

      // 4) Final result
      const isFalsePositive: boolean | undefined = result.llm_is_false_positive;
      const hasThreat: boolean | undefined = result.has_threat;
      const conf: number | undefined = result.llm_confidence;
      setConfidence(typeof conf === "number" ? conf : null);
      // Prefer LLM reason; if missing but an error was reported, show that so the user has an explanation
      let reasonText = typeof result.llm_reason === "string"
        ? result.llm_reason
        : (typeof result.llm_error === "string" ? `LLM unavailable: ${result.llm_error}` : null);
      // Fallback: if no reason from backend, provide a concise default so the bar can complete
      if (!reasonText) {
        if (isFalsePositive === true || !hasThreat) {
          reasonText = "No suspicious object seen in the screenshot";
        } else {
          reasonText = visionLabel ? `Detected ${visionLabel}` : "Suspicious object detected";
        }
      }
      setReason(reasonText);
      setModel(typeof result.llm_model === "string" ? result.llm_model : null);
      // Capture what the vision model flagged (best threat label)
      try {
        if (Array.isArray(result.threats) && result.threats.length > 0) {
          const best = [...result.threats].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
          setVisionLabel(typeof best.label === 'string' ? best.label : null);
          setVisionConf(typeof best.confidence === 'number' ? best.confidence : null);
        } else {
          setVisionLabel(null);
          setVisionConf(null);
        }
      } catch {}

      // Prefer the LLM verdict when present to avoid contradictions with overlay state
      if (isFalsePositive === true) {
        setStage("false_positive");
        setMessage(`Result: False Positive${reasonText ? ` – ${reasonText}` : ""}`);
        // Propagate verdict so overlays can gray out boxes
        try {
          detectionContext.updateDetectionResults(cameraSource, { ...result, llm_is_false_positive: true, timestamp: Date.now() });
        } catch {}
      } else if (isFalsePositive === false) {
        setStage("threat_confirmed");
        setMessage(`Result: Threat Confirmed${reasonText ? ` – ${reasonText}` : ""}`);
        // Ensure subscribers see the LLM verdict (in case backend omitted field)
        try {
          detectionContext.updateDetectionResults(cameraSource, { ...result, llm_is_false_positive: false, timestamp: Date.now() });
        } catch {}
      } else if (hasThreat) {
        setStage("threat_confirmed");
        setMessage(`Result: Threat Confirmed${reasonText ? ` – ${reasonText}` : ""}`);
      } else {
        setStage("false_positive");
        setMessage(`Result: No Threat Detected${reasonText ? ` – ${reasonText}` : ""}`);
      }
    } catch (e: any) {
      console.error("Threat analysis pipeline error:", e);
      setStage("error");
      const errMsg = e?.message || "timeout";
      setMessage(`Result: Pending… (${errMsg})`);
      // Provide a fallback reason so progress can complete and reset
      setReason(`Analysis unavailable: ${errMsg}`);
    } finally {
      lastRunAtRef.current = Date.now();
      // Release busy flag, but do not reset the progress/stage until a reason is present
      busyRef.current = false;
    }
  }, [captureScreenshot]);

  // Once we have a reason ("What ChatGPT sees"), schedule a reset and clear the floor
  useEffect(() => {
    if (reason) {
      const t = setTimeout(() => {
        setStage("idle");
        setMessage("No suspicious activity detected");
        setConfidence(null);
        setReason(null);
        setModel(null);
        setVisionLabel(null);
        setVisionConf(null);
        setProgressFloor(0);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [reason]);

  // Subscribe to detection updates to auto-trigger when suspicious is detected
  useEffect(() => {
    const unsubscribe = detectionContext.subscribeToDetections(cameraSource, (state) => {
      const r = state.result;
      if (!r) return;
      // Start only when a yellow/red box is actually visible (ignore gray/LLM-FP boxes)
      const visible = Array.isArray(r.threats)
        ? r.threats.some((t: any) => !t?.llm_false_positive)
        : false;
      const suspiciousVisible = (!!visible) || (!!r.has_threat && r.llm_is_false_positive !== true);
      const now = Date.now();
      // Cooldown to prevent spamming the pipeline
      if (suspiciousVisible && !busyRef.current && now - lastRunAtRef.current > 4000) {
        runAnalysisPipeline();
      }
    });
    return unsubscribe;
  }, [cameraSource, detectionContext, runAnalysisPipeline]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">Threat Analysis</h3>
        <span className="text-xs text-white/60">{model ? `Model: ${model}` : ""}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-400 via-blue-400 to-green-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status and details */}
      <div className="mt-3 text-sm text-white/80">
        {message}
        {confidence !== null && (
          <span className="ml-2 text-white/60">(conf {Math.round(confidence * 100)}%)</span>
        )}
      </div>

      {/* LLM insight and vision flag summary */}
      <div className="mt-2 text-xs text-white/70">
        <div>
          <span className="text-white/80">What ChatGPT sees:</span>{" "}
          {stage === "analyzing" && !reason && (
            <span className="text-white/60">Analyzing image content…</span>
          )}
          {reason && (
            <span className="text-white/70">{reason}</span>
          )}
          {!reason && stage !== "analyzing" && (
            <span className="text-white/50">No description yet</span>
          )}
        </div>
        {visionLabel && (
          <div className="mt-1 text-white/60">
            Vision flagged: <span className="text-white/80">{visionLabel}</span>{" "}
            {visionConf != null && <span>({Math.round(visionConf * 100)}%)</span>}
          </div>
        )}
      </div>

      {/* Step hints */}
      <div className="mt-3 grid grid-cols-5 gap-2 text-[11px] text-white/60">
        <span className={`${progress >= 20 ? "text-white" : ""}`}>Suspicious</span>
        <span className={`${progress >= 40 ? "text-white" : ""}`}>Screenshot</span>
        <span className={`${progress >= 60 ? "text-white" : ""}`}>Sent</span>
        <span className={`${progress >= 80 ? "text-white" : ""}`}>Analyzing</span>
        <span className={`${progress >= 100 ? "text-white" : ""}`}>Result</span>
      </div>
    </div>
  );
}
