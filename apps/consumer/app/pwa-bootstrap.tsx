"use client";

import { useEffect } from "react";

export function PwaBootstrap() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const hostname = window.location.hostname;
    const isLocalPreview = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

    if (process.env.NODE_ENV !== "production" || isLocalPreview) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });

      if ("caches" in window) {
        void caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("nuudl-"))
            .forEach((key) => {
              void caches.delete(key);
            });
        });
      }

      return;
    }

    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
