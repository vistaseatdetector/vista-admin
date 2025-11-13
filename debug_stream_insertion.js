// Debug script to test stream insertion
// Run this in the browser console (F12) while on the Vista page

async function debugStreamInsertion() {
    console.log("🔍 Debugging stream insertion...");
    
    // Check if we have access to the Supabase client
    if (typeof supabase === 'undefined') {
        console.error("❌ Supabase client not available");
        return;
    }
    
    try {
        // Check current user
        const { data: user, error: userError } = await supabase.auth.getUser();
        console.log("👤 Current user:", user?.user?.email || "Not logged in");
        
        if (userError) {
            console.error("❌ User error:", userError);
            return;
        }
        
        // Get current org info
        const currentPath = window.location.pathname;
        const orgSlug = currentPath.split('/')[3]; // /app/org/[slug]/vista
        console.log("🏢 Org slug:", orgSlug);
        
        // Check org exists
        const { data: org, error: orgError } = await supabase
            .from('orgs')
            .select('id, name')
            .eq('slug', orgSlug)
            .single();
            
        if (orgError) {
            console.error("❌ Org error:", orgError);
            return;
        }
        
        console.log("✅ Org found:", org);
        
        // Check locations
        const { data: locations, error: locError } = await supabase
            .from('locations')
            .select('id, name')
            .eq('org_id', org.id);
            
        if (locError) {
            console.error("❌ Locations error:", locError);
        } else {
            console.log("📍 Available locations:", locations);
        }
        
        // Check if streams table exists by trying to query it
        const { data: existingStreams, error: streamError } = await supabase
            .from('streams')
            .select('*')
            .eq('org_id', org.id);
            
        if (streamError) {
            console.error("❌ Streams table error:", streamError);
            console.log("💡 This might mean the streams table doesn't exist");
        } else {
            console.log("✅ Streams table accessible, existing streams:", existingStreams);
        }
        
        // Try to insert a test stream
        if (locations && locations.length > 0) {
            console.log("🧪 Attempting to insert test stream...");
            
            const testStream = {
                org_id: org.id,
                name: "Test Webcam",
                url: "webcam:0", 
                location_id: locations[0].id,
                kind: "camera",
                enabled: true
            };
            
            const { data: insertResult, error: insertError } = await supabase
                .from('streams')
                .insert(testStream)
                .select();
                
            if (insertError) {
                console.error("❌ Insert error:", insertError);
                console.log("Error details:", {
                    message: insertError.message,
                    details: insertError.details,
                    hint: insertError.hint,
                    code: insertError.code
                });
            } else {
                console.log("✅ Stream inserted successfully:", insertResult);
            }
        } else {
            console.warn("⚠️ No locations available for testing");
        }
        
    } catch (error) {
        console.error("❌ Unexpected error:", error);
    }
}

// Run the debug function
debugStreamInsertion();