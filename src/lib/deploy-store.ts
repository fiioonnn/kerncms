"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";

/*
 * Simulated publish pipeline for the UI. Later this is fed by the real
 * commit + build webhook from the hosting provider.
 */

export const deploySteps = [
  "Änderungen ins Repository übernehmen",
  "Website bauen",
  "Dateien hochladen",
  "Live schalten",
];

export type DeployState = {
  status: "idle" | "running" | "success" | "failed";
  step: number;
  changes: number;
};

const idle: DeployState = { status: "idle", step: 0, changes: 0 };
let state: DeployState = idle;
const listeners = new Set<() => void>();

function set(next: DeployState) {
  state = next;
  listeners.forEach((l) => l());
}

export function startDeploy(changes = 1) {
  if (state.status === "running") return;
  set({ status: "running", step: 0, changes });
  const tick = (step: number) => {
    if (step < deploySteps.length) {
      set({ status: "running", step, changes });
      setTimeout(() => tick(step + 1), step === 1 ? 2200 : 1100);
    } else {
      set({ status: "success", step: deploySteps.length, changes });
      toast.success("Website ist live", { description: `${changes} Änderungen sind jetzt öffentlich sichtbar.` });
      setTimeout(() => set(idle), 6000);
    }
  };
  tick(0);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeploy() {
  return useSyncExternalStore(subscribe, () => state, () => idle);
}
