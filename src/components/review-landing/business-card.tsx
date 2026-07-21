"use client";

import Image from "next/image";

type BusinessCardProps = {
  logoSrc?: string;
  businessName: string;
  branchName: string;
};

export function BusinessCard({
  logoSrc = "/myfng-logo.png",
  businessName,
  branchName,
}: BusinessCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-[#2563EB]/10 ring-1 ring-[#2563EB]/15 sm:size-16">
        <Image
          src={logoSrc}
          alt={businessName}
          fill
          className="object-contain p-1.5"
          sizes="64px"
          priority
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">
          {businessName}
        </p>
        <p className="mt-0.5 truncate text-sm text-slate-500">{branchName}</p>
      </div>
    </div>
  );
}
