import Image from "next/image";

type Props = React.PropsWithChildren<{
  bgSrc?: string;
  overlayClassName?: string;
}>;

export default function AuthBackground({
  children,
  bgSrc = "/images/church-entrance.jpg",
  overlayClassName,
}: Props) {
  return (
    <div className="relative min-h-dvh">
      <Image
        src={bgSrc}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Dim + tint overlay so white text/logos pop */}
      <div className={`absolute inset-0 bg-black/50 ${overlayClassName || ""}`} />
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
