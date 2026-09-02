import Image, { type ImageProps } from "next/image";

const logoAssets = {
  mark: {
    src: "/brand/anonresume-mark.png",
    width: 1128,
    height: 1128,
  },
  wordmark: {
    src: "/brand/anonresume-wordmark.png",
    width: 1448,
    height: 223,
  },
  lockup: {
    src: "/brand/anonresume-lockup.png",
    width: 1680,
    height: 440,
  },
} as const;

export type AnonResumeLogoVariant = keyof typeof logoAssets;

type AnonResumeLogoProps = Omit<
  ImageProps,
  "alt" | "height" | "src" | "width"
> & {
  alt?: string;
  variant?: AnonResumeLogoVariant;
};

export function AnonResumeLogo({
  alt = "AnonResume",
  variant = "lockup",
  ...imageProps
}: AnonResumeLogoProps) {
  const asset = logoAssets[variant];

  return (
    <Image
      {...imageProps}
      alt={alt}
      data-brand-logo="true"
      height={asset.height}
      src={asset.src}
      unoptimized
      width={asset.width}
    />
  );
}
