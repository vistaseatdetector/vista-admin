"use client";

import Background from "@/components/ui/Background";

export default function BackgroundTestPage() {
  return (
    <div className="min-h-screen relative">
      <Background src="/images/dashboard/bg-church4.jpeg" />
      <div className="relative z-10 p-8">
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Background Test</h1>
          <p className="text-white/70 mb-4">
            This page tests if the church background image loads correctly.
          </p>
          <p className="text-white/60 text-sm">
            You should see a church background image behind this text.
          </p>
        </div>
      </div>
    </div>
  );
}