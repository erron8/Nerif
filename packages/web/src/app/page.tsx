export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0f1218",
        color: "#f5f7fb",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <section style={{ width: "min(720px, calc(100% - 48px))" }}>
        <p style={{ margin: 0, color: "#8ea0b8", fontSize: 14 }}>
          Nerif dashboard
        </p>
        <h1 style={{ margin: "12px 0", fontSize: 44, lineHeight: 1.05 }}>
          Coming soon.
        </h1>
        <p style={{ margin: 0, color: "#cad3e1", fontSize: 18, lineHeight: 1.6 }}>
          The Telegram bot is the source of truth for v1. This package exists so
          the dashboard can grow from the shared core schema without a rewrite.
        </p>
      </section>
    </main>
  );
}
