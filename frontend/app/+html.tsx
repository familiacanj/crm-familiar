// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <link rel="preconnect" href="https://iougyvryqotidbhloazg.supabase.co" />
        <link rel="preconnect" href="https://crm-familiar.vercel.app" />
        <link rel="dns-prefetch" href="https://iougyvryqotidbhloazg.supabase.co" />
        <link rel="dns-prefetch" href="https://crm-familiar.vercel.app" />
        <meta name="description" content="Organização financeira para a sua família" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CRM Familiar" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:title" content="CRM Familiar" />
        <meta property="og:description" content="Organização financeira para a sua família" />
        <meta property="og:image" content="https://crm-familiar-web.vercel.app/pwa-icon.png" />
        <meta property="og:image:secure_url" content="https://crm-familiar-web.vercel.app/pwa-icon.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="Ícone do CRM Familiar" />
        <meta property="og:url" content="https://crm-familiar-web.vercel.app/" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CRM Familiar" />
        <meta name="twitter:description" content="Organização financeira para a sua família" />
        <meta name="twitter:image" content="https://crm-familiar-web.vercel.app/pwa-icon.png" />
        <meta name="theme-color" content="#3B825C" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CRM Família" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", function () {
                  navigator.serviceWorker
                    .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
                    .then(function (registration) { return registration.update(); })
                    .catch(function () {});
                });
              }
            `,
          }}
        />
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
