# Overlap Detection with 20% Tolerance

## Overview

The zone detection system has been enhanced to allow for more robust people counting by implementing an overlap-based detection method with a 20% tolerance. This means that a person will be counted as being "in a zone" even if up to 20% of their detected bounding box extends outside the zone boundaries.

## How It Works

### Previous Logic (Center Point Detection)
- **Method**: `center_in_zone()`
- **Requirement**: The center point of a person's bounding box must be within the zone
- **Issue**: People at zone edges might not be counted if their center point is outside the zone

### New Logic (Overlap Detection with Tolerance)
- **Method**: `person_in_zone_with_tolerance()`
- **Requirement**: At least 80% of a person's bounding box must overlap with the zone
- **Tolerance**: Up to 20% of the person can be outside the zone boundaries
- **Benefit**: More reliable counting for people at zone edges

## Technical Implementation

### Zone Class Enhancement
The `Zone` class now includes a new method:

```python
def person_in_zone_with_tolerance(self, x1: float, y1: float, x2: float, y2: float, tolerance: float = 0.2) -> bool:
    """Check if at least (1-tolerance) of a person's bounding box overlaps with this zone.
    
    Args:
        x1, y1, x2, y2: Person's bounding box coordinates
        tolerance: Fraction of person that can be outside the zone (default 0.2 = 20%)
    
    Returns:
        True if at least 80% of the person is within the zone
    """
```

### Calculation Method
1. **Calculate intersection area** between person's bounding box and zone rectangle
2. **Calculate person's total area** from their bounding box
3. **Compute overlap ratio** = intersection_area / person_area
4. **Check requirement** = overlap_ratio >= (1.0 - tolerance)
5. **Return result** = True if at least 80% overlaps

### Detection Process Update
The zone detection logic in `process_detections()` method now uses:

```python
# Old logic
if zone.center_in_zone(x1, y1, x2, y2):

# New logic  
if zone.person_in_zone_with_tolerance(x1, y1, x2, y2, tolerance=0.2):
```

## Benefits

1. **Reduced Missed Counts**: People partially outside zones are still counted
2. **Edge Case Handling**: Better detection for people entering/exiting zones
3. **Robust Tracking**: More reliable in scenarios where people are at doorway edges
4. **Flexible Configuration**: Tolerance can be adjusted if needed

## Use Cases

This enhancement is particularly beneficial for:
- **Doorway Detection**: People entering/exiting through doors often have parts of their body outside the detection zone
- **Narrow Zones**: Small detection areas where center-point detection might miss people
- **Camera Positioning**: Non-perfect camera angles where zone boundaries don't perfectly align with physical boundaries

## Testing

Use the test script to verify the overlap detection:

```bash
cd python-backend
python3 test_overlap_detection.py
```

The test will:
1. Check service health
2. Capture a webcam frame
3. Configure a test zone covering 60% of the frame
4. Test detection with the new overlap logic
5. Provide a summary of the enhancement

## Configuration

The tolerance is currently set to 20% (0.2) but can be adjusted by modifying the tolerance parameter in the `person_in_zone_with_tolerance()` method call within the `process_detections()` method.

- **Higher tolerance** (e.g., 0.3 = 30%): More lenient, counts people with less overlap
- **Lower tolerance** (e.g., 0.1 = 10%): More strict, requires more overlap to count

## Backward Compatibility

The original `center_in_zone()` method is still available for reference, but the system now uses the new overlap-based detection by default. This change is transparent to the API users and doesn't affect the existing endpoints or response formats.