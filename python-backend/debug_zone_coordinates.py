#!/usr/bin/env python3

"""
Debug script to check zone coordinate system vs detection positions
"""

import requests
import json
import time
from datetime import datetime

def check_zone_detection():
    """Check if zone detection coordinates are working"""
    
    print("🔍 Zone Detection Debug Tool")
    print("=" * 50)
    
    # Get current zones
    print("📍 Current Zone Configuration:")
    zones_response = requests.get("http://127.0.0.1:8001/zones/webcam:0")
    if zones_response.status_code == 200:
        zones_data = zones_response.json()
        print(f"Camera: {zones_data['camera_id']}")
        print(f"Zones Count: {zones_data['zones_count']}")
        for zone in zones_data['zones']:
            width = zone['x2'] - zone['x1']
            height = zone['y2'] - zone['y1']
            print(f"  Zone: {zone['name']} ({zone['id']})")
            print(f"  Coordinates: ({zone['x1']}, {zone['y1']}) to ({zone['x2']}, {zone['y2']})")
            print(f"  Size: {width} x {height} pixels")
    else:
        print("❌ Failed to get zones")
        return
    
    print()
    
    # Get current occupancy
    print("📊 Current Detection Status:")
    occupancy_response = requests.get("http://127.0.0.1:8001/occupancy")
    if occupancy_response.status_code == 200:
        occ_data = occupancy_response.json()
        print(f"Current Occupancy: {occ_data['current_occupancy']}")
        print(f"Live Occupancy: {occ_data['live_occupancy']}")
        print(f"Total Entries: {occ_data['total_entries']}")
        print(f"Total Exits: {occ_data['total_exits']}")
        print(f"Active Tracks: {occ_data['active_tracks']}")
    else:
        print("❌ Failed to get occupancy")
    
    print()
    
    # Monitor for coordinate information
    print("🎯 Monitoring Detection Coordinates...")
    print("Looking for people positions in the logs...")
    print("Zone covers: (4, 2) to (530, 388) in 1280x720 frame")
    print("Expected person bbox should overlap with zone area")
    print()
    print("Press Ctrl+C to stop monitoring")
    
    try:
        while True:
            # Check occupancy every few seconds
            occ_response = requests.get("http://127.0.0.1:8001/occupancy")
            if occ_response.status_code == 200:
                occ_data = occ_response.json()
                timestamp = datetime.now().strftime("%H:%M:%S")
                print(f"[{timestamp}] Active Tracks: {occ_data['active_tracks']} | Live Occupancy: {occ_data['live_occupancy']} | Persistent: {occ_data['current_occupancy']}")
            
            time.sleep(3)
    except KeyboardInterrupt:
        print("\n✅ Monitoring stopped")

if __name__ == "__main__":
    check_zone_detection()