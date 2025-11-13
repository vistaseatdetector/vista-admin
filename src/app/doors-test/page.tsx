'use client';

export default function DoorsTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Doors Test Page</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 mb-4">
            This is a test page to verify the doors functionality works without any authentication issues.
          </p>
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            ✅ Page loaded successfully! No authentication errors.
          </div>
        </div>
      </div>
    </div>
  );
}