"use client";

export default function Background({

  src = "/images/dashboard/bg-church4.jpeg",
  alt = "Background",
  overlay = true,
}: {
  src?: string;
  alt?: string;
  overlay?: boolean;
}) {
  return (
    <div className="fixed inset-0 -z-10">
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        onError={() => console.log("Background image failed to load:", src)}
      />
      {overlay && (
        <div className="absolute inset-0 bg-black/30" />
      )}
      {/* optional dark wash for contrast */}
    </div>
  );
}

