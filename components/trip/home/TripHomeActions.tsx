"use client";

import InstallPrompt from "@/components/mobile/InstallPrompt";

type Props = {
  trip?: unknown;
};

export default function TripHomeActions({ trip: _trip }: Props) {
  return (
    <div className="space-y-4">
      <InstallPrompt />
    </div>
  );
}
