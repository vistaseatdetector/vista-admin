// Debug script to test the occupancy API
// Run this in your browser console on the dashboard page

async function testOccupancyAPI() {
  const orgSlug = 'st-mark'; // Update this to match your org
  const locationId = 'd390ff78-5706-4adb-81ab-cb44a2750a16'; // Update this to match your location
  
  console.log('🔍 Testing occupancy API...');
  console.log('Org slug:', orgSlug);
  console.log('Location ID:', locationId);
  
  try {
    const url = `/api/org/${orgSlug}/occupancy?location_id=${locationId}`;
    console.log('📡 Fetching URL:', url);
    
    const response = await fetch(url);
    console.log('📈 Response status:', response.status);
    console.log('📈 Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ API Response:', data);
    console.log('📊 Latest data:', data.latest);
    console.log('📈 History points:', data.history?.length);
    
    if (data.latest) {
      console.log('🏢 People count:', data.latest.people_count);
      console.log('💺 Open seats:', data.latest.open_seats);
      console.log('⏰ Observed at:', data.latest.observed_at);
    } else {
      console.log('⚠️ No latest data found');
    }
    
  } catch (error) {
    console.error('💥 Network/JS Error:', error);
  }
}

// Run the test
testOccupancyAPI();