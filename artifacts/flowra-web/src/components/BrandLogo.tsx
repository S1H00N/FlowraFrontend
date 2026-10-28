import { cn } from "@/lib/utils";

export default function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}flowit-logo.svg`}
      alt="Flowit"
      width={1102}
      height={350}
      className={cn(
        "block h-8 w-auto shrink-0 mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180",
        className,
      )}
    />
  );
}
