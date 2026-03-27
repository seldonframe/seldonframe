export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="crm-page flex items-center justify-center">
      <div className="crm-card w-full max-w-md p-6">{children}</div>
    </div>
  );
}
