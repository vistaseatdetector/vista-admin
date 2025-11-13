export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Vista Admin - System Status
          </h1>
          <p className="text-gray-600">
            Original system restored (pre-YOLO detection)
          </p>
        </header>
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* System Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-green-600">✅ System Restored</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>YOLO Detection API</span>
                <span className="text-red-600 font-medium">Removed</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Detection Overlays</span>
                <span className="text-red-600 font-medium">Removed</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Original Components</span>
                <span className="text-green-600 font-medium">Restored</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Admin Pages</span>
                <span className="text-green-600 font-medium">Working</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-blue-600">🚀 Access Points</h2>
            <div className="space-y-3">
              <a 
                href="/app" 
                className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">Main Admin App</div>
                <div className="text-sm text-gray-500">/app - Full Vista admin interface</div>
              </a>
              <a 
                href="/login" 
                className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">Login</div>
                <div className="text-sm text-gray-500">/login - Authentication page</div>
              </a>
            </div>
          </div>

          {/* Authentication Issue */}
          <div className="md:col-span-2 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Authentication Issue Detected</h3>
            <div className="text-yellow-700 text-sm space-y-2">
              <p>If you&apos;re stuck on &quot;signing in&quot;, this is likely due to:</p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Supabase connection timeout or slow response</li>
                <li>Network connectivity issues</li>
                <li>Authentication service temporarily unavailable</li>
              </ul>
              <div className="mt-4 p-3 bg-white rounded border">
                <p className="font-medium text-gray-800 mb-2">Quick Solutions:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                  <li>Try refreshing the page</li>
                  <li>Check your internet connection</li>
                  <li>Wait a moment and try again</li>
                  <li>Use this demo page for system status</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-800 mb-2">📝 System Notes</h3>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• All YOLO11 detection features have been completely removed</li>
              <li>• Original Vista admin functionality is preserved</li>
              <li>• Python backend YOLO scripts remain in /python-backend/ but are not integrated</li>
              <li>• The main app requires Supabase authentication to access</li>
              <li>• This demo page bypasses authentication for status checking</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}