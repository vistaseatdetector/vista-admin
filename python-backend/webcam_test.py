#!/usr/bin/env python3
"""
Webcam Detection Script for Vista Integration
Finds available webcam devices on your system
"""

import cv2
import sys
from pathlib import Path

def test_webcam_devices():
    """Test available webcam devices (0-4)"""
    available_devices = []
    
    print("🔍 Scanning for webcam devices...")
    
    for device_id in range(5):  # Test devices 0-4
        try:
            cap = cv2.VideoCapture(device_id)
            
            # Try to read a frame
            ret, frame = cap.read()
            
            if ret and frame is not None:
                height, width = frame.shape[:2]
                print(f"✅ Device {device_id}: Available ({width}x{height})")
                available_devices.append({
                    'device_id': device_id,
                    'resolution': f"{width}x{height}",
                    'url': f"webcam:{device_id}"
                })
            else:
                print(f"❌ Device {device_id}: Not available")
            
            cap.release()
            
        except Exception as e:
            print(f"❌ Device {device_id}: Error - {e}")
    
    return available_devices

def show_webcam_preview(device_id=0, duration=5):
    """Show a preview window for the specified webcam device"""
    try:
        print(f"\n📹 Opening preview for device {device_id}...")
        print(f"   Preview will show for {duration} seconds")
        print("   Press 'q' to quit early")
        
        cap = cv2.VideoCapture(device_id)
        
        # Check if camera opened successfully
        if not cap.isOpened():
            print(f"❌ Could not open device {device_id}")
            return False
        
        import time
        start_time = time.time()
        frame_count = 0
        
        while True:
            ret, frame = cap.read()
            
            if not ret:
                print("❌ Failed to grab frame")
                break
            
            frame_count += 1
            
            # Add overlay text
            cv2.putText(frame, f"Vista Webcam Test - Device {device_id}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, f"Frame: {frame_count}", 
                       (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, "Press 'q' to quit", 
                       (10, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            cv2.imshow(f'Vista Webcam Preview - Device {device_id}', frame)
            
            # Check for quit conditions
            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("👋 Preview closed by user")
                break
            
            if time.time() - start_time > duration:
                print(f"⏰ Preview completed ({duration}s)")
                break
        
        cap.release()
        cv2.destroyAllWindows()
        return True
        
    except Exception as e:
        print(f"❌ Preview error: {e}")
        return False

def main():
    print("🎯 Vista Webcam Detection & Test Tool")
    print("=" * 40)
    
    # Check if OpenCV is available
    try:
        print(f"📦 OpenCV version: {cv2.__version__}")
    except Exception as e:
        print("❌ OpenCV not found. Install with: pip install opencv-python")
        sys.exit(1)
    
    # Find available devices
    devices = test_webcam_devices()
    
    if not devices:
        print("\n❌ No webcam devices found!")
        print("   Make sure your webcam is connected and not being used by another app")
        return
    
    print(f"\n🎉 Found {len(devices)} available webcam device(s):")
    for device in devices:
        print(f"   • Device {device['device_id']}: {device['resolution']} (Use: {device['url']})")
    
    # Ask user if they want to preview
    print("\n" + "=" * 40)
    try:
        choice = input("Would you like to test a webcam preview? (y/N): ").lower()
        if choice in ['y', 'yes']:
            if len(devices) == 1:
                device_id = devices[0]['device_id']
                print(f"Testing device {device_id}...")
            else:
                device_input = input(f"Which device to test? (0-{len(devices)-1}): ")
                device_id = int(device_input)
            
            show_webcam_preview(device_id, duration=10)
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n✅ Test complete!")
    print("💡 To use in Vista:")
    print("   1. Go to http://localhost:3000/app/org/[your-org]/vista")
    print("   2. Click 'Use Built-in Webcam' or 'Use USB Camera'")
    print("   3. Or manually enter the webcam URL from above")

if __name__ == "__main__":
    main()