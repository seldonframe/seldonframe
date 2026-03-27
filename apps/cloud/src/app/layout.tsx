export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#0b1020", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
