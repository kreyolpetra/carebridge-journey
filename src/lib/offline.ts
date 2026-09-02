import { useSyncExternalStore } from "react";

type Listener = () => void;

let online = true;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function setNetworkOnline(value: boolean) {
  online = value;
  emit();
}

export function isNetworkOnline() {
  return online;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNetworkOnline() {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => true,
  );
}
