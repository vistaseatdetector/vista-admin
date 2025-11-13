# Camera Feed Blinking - Diagnosis and Fixes

## Problem
The main camera feed on the overview tab blinks black every few seconds.

## Root Cause Analysis
Based on investigation, the blinking is caused by:

1. **Excessive Detection Polling**: Detection requests every ~300ms overloading the camera stream
2. **Stream Management Conflicts**: Multiple stream instances competing for camera access
3. **No Request Queuing**: Overlapping detection requests causing interference

## Implemented Fixes

### 1. Reduced Detection Frame Rate
- Changed from 2 FPS to 1 FPS on overview page
- Minimum 1000ms intervals between detection polls
- Added 2-second initial delay before starting detection

### 2. Request Queuing
- Added `requestInProgress` flag to prevent overlapping requests
- Longer timeout intervals when requests are in progress
- Reset flag after each request completes

### 3. Stream Stabilization
- Added video element CSS properties for hardware acceleration
- Prevented unnecessary stream restarts
- Added video event handlers for monitoring

### 4. Conservative Polling
- Minimum 1.2 seconds between detection requests
- Reduced heartbeat frequency (every 30 polls instead of 10)
- Added request timeout and abort controllers

## Testing

To test if detection is causing the blinking:

1. **Disable Detection Temporarily**:
   ```tsx
   <WebcamStreamWithDetection 
     enableDetection={false}  // Set to false
     // ... other props
   />
   ```

2. **Monitor Detection Frequency**:
   ```bash
   cd python-backend
   python3 test_detection_timing.py
   ```

3. **Check Service Logs**:
   ```bash
   tail -f enhanced_service.log | grep "POST /api/detection"
   ```

## Alternative Solutions

If blinking persists:

1. **Use Separate Camera Instances**:
   - One for display only (no detection)
   - One for detection only (hidden)

2. **Backend-Only Detection**:
   - Stream detection runs entirely on backend
   - Frontend only displays results, no frame capture

3. **Reduce Video Quality**:
   - Lower resolution to reduce processing load
   - Use different frameRate constraints

## Expected Results

After implementing these fixes:
- ✅ Camera feed should be stable without black frames
- ✅ Detection still works but less frequently
- ✅ Reduced CPU/bandwidth usage
- ✅ Better user experience on overview page

## Monitoring

Watch for these indicators:
- No black frames in video feed
- Detection requests < 1 per second
- Stable video playback
- Consistent frame rate